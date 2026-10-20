import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  allowedDownloadHost,
  parseReleasePayload,
  UpdaterService,
  type UpdateFetch,
} from '../../electron/services/updater'

const directories: string[] = []

function tempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), 'tr-updater-test-'))
  directories.push(directory)
  return directory
}

afterEach(() => {
  vi.useRealTimers()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function jsonFetch(payload: unknown, status = 200): UpdateFetch {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => payload,
    text: async () => JSON.stringify(payload),
    body: null,
  })
}

function bytesFetch(bytes: Uint8Array): UpdateFetch {
  return async () => ({
    ok: true,
    status: 200,
    headers: { get: (name) => (name === 'content-length' ? String(bytes.length) : null) },
    json: async () => ({}),
    text: async () => '',
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes)
        controller.close()
      },
    }),
  })
}

const release = {
  tag_name: 'v1.1.0',
  prerelease: false,
  body: '更新说明',
  assets: [
    { browser_download_url: 'https://github.com/x/a.zip', digest: 'sha256:aa' },
    { browser_download_url: 'https://github.com/x/Transactions-1.1.0.exe', digest: 'sha256:bb' },
  ],
}

describe('updater release parsing', () => {
  it('picks the first exe asset and compares versions', () => {
    const parsed = parseReleasePayload(release, '1.0.0')
    expect(parsed).toMatchObject({
      hasUpdate: true,
      latestVersion: '1.1.0',
      downloadUrl: 'https://github.com/x/Transactions-1.1.0.exe',
      digest: 'sha256:bb',
      body: '更新说明',
    })
    expect(parseReleasePayload(release, '1.1.0')).toBeNull()
    expect(parseReleasePayload({ ...release, prerelease: true }, '1.0.0')).toBeNull()
    expect(parseReleasePayload({ ...release, tag_name: '' }, '1.0.0')).toBeNull()
  })

  it('keeps an update without exe assets so the UI can explain it', () => {
    const parsed = parseReleasePayload({ ...release, assets: [] }, '1.0.0')
    expect(parsed?.hasUpdate).toBe(true)
    expect(parsed?.downloadUrl).toBe('')
  })

  it('allows only GitHub download hosts', () => {
    expect(allowedDownloadHost('https://github.com/a/b.exe')).toBe(true)
    expect(allowedDownloadHost('https://objects.githubusercontent.com/a.exe')).toBe(true)
    expect(allowedDownloadHost('https://example.com/a.exe')).toBe(false)
    expect(allowedDownloadHost('not a url')).toBe(false)
  })
})

describe('updater state machine', () => {
  it('moves checking → available and no-update correctly', async () => {
    const service = new UpdaterService({ fetchImpl: jsonFetch(release) })
    expect(service.snapshot().status).toBe('idle')
    const available = await service.check('1.0.0')
    expect(available).toMatchObject({ status: 'available', latestVersion: '1.1.0' })

    const latest = new UpdaterService({ fetchImpl: jsonFetch({ ...release, tag_name: 'v1.0.0' }) })
    expect((await latest.check('1.0.0')).status).toBe('no-update')
  })

  it('reports check failures as failed, not no-update', async () => {
    const service = new UpdaterService({
      fetchImpl: async () => {
        throw new Error('offline')
      },
    })
    const snapshot = await service.check('1.0.0')
    expect(snapshot.status).toBe('failed')
    expect(snapshot.error).toContain('offline')
  })

  it('downloads, verifies and emits complete', async () => {
    const bytes = Buffer.from('installer-bytes')
    const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`
    const events: string[] = []
    const directory = tempDir()
    const service = new UpdaterService({
      fetchImpl: bytesFetch(bytes),
      tempDir: directory,
      onEvent: (event) => events.push(event),
    })
    await service.check('1.0.0')
    const snapshot = await service.download(
      'https://github.com/x/Transactions-1.1.0.exe',
      digest,
    )
    expect(snapshot.status).toBe('downloaded')
    expect(events).toContain('update:download-complete')
    expect(existsSync(join(directory, 'Transactions-1.1.0.exe'))).toBe(true)
  })

  it('rejects a digest mismatch and leaves no file', async () => {
    const service = new UpdaterService({
      fetchImpl: bytesFetch(Buffer.from('bytes')),
      tempDir: tempDir(),
    })
    await service.check('1.0.0')
    const snapshot = await service.download(
      'https://github.com/x/Transactions-1.1.0.exe',
      `sha256:${'0'.repeat(64)}`,
    )
    expect(snapshot.status).toBe('failed')
    expect(snapshot.error).toContain('SHA256')
    expect(existsSync(join(tempDir(), 'Transactions-1.1.0.exe'))).toBe(false)
  })

  it('rejects non-GitHub download hosts', async () => {
    const service = new UpdaterService({ fetchImpl: bytesFetch(Buffer.from('x')) })
    await service.check('1.0.0')
    const snapshot = await service.download('https://example.com/x.exe', '')
    expect(snapshot.status).toBe('failed')
    expect(snapshot.error).toBe('下载地址不在白名单内')
  })

  it('installs the downloaded file and quits', async () => {
    vi.useFakeTimers()
    const bytes = Buffer.from('installer')
    const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`
    const spawned: string[] = []
    let quits = 0
    const service = new UpdaterService({
      fetchImpl: bytesFetch(bytes),
      tempDir: tempDir(),
      spawnInstaller: (path) => spawned.push(path),
      quit: () => {
        quits += 1
      },
    })
    await service.check('1.0.0')
    await service.download('https://github.com/x/a.exe', digest)
    expect(service.install().ok).toBe(true)
    expect(spawned).toHaveLength(1)
    vi.runAllTimers()
    expect(quits).toBe(1)
  })

  it('reports a missing installer', () => {
    const service = new UpdaterService({})
    expect(service.install()).toEqual({ ok: false, error: '安装文件不存在' })
  })
})

