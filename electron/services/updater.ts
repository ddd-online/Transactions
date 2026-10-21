import { createHash } from 'node:crypto'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { spawn } from 'node:child_process'

import {
  applyUpdateEvent,
  CANCELLED,
  defaultUpdateCheckResponse,
  defaultUpdateSnapshot,
  digestMatches,
  formatSpeed,
  isNewerVersion,
  normalizeDigest,
  type UpdateCheckResponse,
  type UpdateEvent,
  type UpdateInstallResponse,
  type UpdateSnapshot,
} from '../../shared/domain/update'
import {
  UPDATE_DOWNLOAD_COMPLETE,
  UPDATE_DOWNLOAD_ERROR,
  UPDATE_DOWNLOAD_PROGRESS,
} from '../../shared/events'

export const RELEASE_API =
  'https://api.github.com/repos/ddd-online/Transactions/releases/latest'
export const CHECK_TIMEOUT_MS = 15_000

export type UpdateFetch = (
  input: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{
  ok: boolean
  status: number
  headers: { get(name: string): string | null }
  json(): Promise<unknown>
  text(): Promise<string>
  body: ReadableStream<Uint8Array> | null
}>

export interface UpdaterOptions {
  fetchImpl?: UpdateFetch
  releaseApi?: string
  tempDir?: string
  onEvent?: (event: string, snapshot: UpdateSnapshot) => void
  quit?: () => void
  spawnInstaller?: (path: string) => void
}

/** 从 GitHub release JSON 里挑更新信息（纯函数）。 */
export function parseReleasePayload(
  payload: unknown,
  currentVersion: string,
): UpdateCheckResponse | null {
  if (typeof payload !== 'object' || payload === null) return null
  const release = payload as Record<string, unknown>
  if (release.prerelease === true) return null
  const latestVersion = String(release.tag_name ?? '')
    .trim()
    .replace(/^v/, '')
  if (!latestVersion || !isNewerVersion(latestVersion, currentVersion)) return null

  const assets = Array.isArray(release.assets) ? release.assets : []
  const asset = assets.find((item) => {
    if (typeof item !== 'object' || item === null) return false
    const url = (item as Record<string, unknown>).browser_download_url
    return typeof url === 'string' && url.endsWith('.exe')
  }) as Record<string, unknown> | undefined

  return {
    hasUpdate: true,
    latestVersion,
    downloadUrl: String(asset?.browser_download_url ?? ''),
    digest: String(asset?.digest ?? ''),
    body: String(release.body ?? ''),
  }
}

/** 下载白名单：GitHub 主站或 release 资产域名。 */
export function allowedDownloadHost(url: string): boolean {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    if (process.env.TRANSACTIONS_TEST_UPDATE_LOCAL === '1') {
      return host === '127.0.0.1' || host === 'localhost'
    }
    return host.endsWith('github.com') || host.endsWith('objects.githubusercontent.com')
  } catch {
    return false
  }
}

function errorCheck(message: string): UpdateCheckResponse {
  return {
    hasUpdate: false,
    latestVersion: '',
    downloadUrl: '',
    digest: '',
    body: '',
    error: message,
  }
}

function fileDigest(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/**
 * 更新流程的唯一状态持有者：检查 → 下载 → 校验 → 安装。
 *
 * 状态迁移只走 `applyUpdateEvent`；事件名与载荷是界面契约。
 */
export class UpdaterService {
  private snapshotValue = defaultUpdateSnapshot()
  private downloadedPath: string | null = null
  private active = false
  private cancelRequested = false
  private percent = 0
  private speed = ''
  private readonly fetchImpl: UpdateFetch
  private readonly releaseApi: string
  private readonly tempDir: string
  private readonly onEvent: (event: string, snapshot: UpdateSnapshot) => void
  private readonly quit: () => void
  private readonly spawnInstaller: (path: string) => void

  constructor(options: UpdaterOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? (fetch as unknown as UpdateFetch)
    this.releaseApi = options.releaseApi ?? RELEASE_API
    this.tempDir = options.tempDir ?? tmpdir()
    this.onEvent = options.onEvent ?? (() => {})
    this.quit = options.quit ?? (() => {})
    this.spawnInstaller =
      options.spawnInstaller ??
      ((path) => {
        const child = spawn(path, [], { detached: true, stdio: 'ignore' })
        child.unref()
      })
  }

  snapshot(): UpdateSnapshot {
    const state = this.snapshotValue
    const downloadedMissing =
      state.status === 'downloaded' &&
      (!this.downloadedPath || !existsSync(this.downloadedPath))
    if (downloadedMissing) {
      return applyUpdateEvent(state, {
        type: 'download-cancelled',
      })
    }
    if (state.status !== 'downloading') return state
    return { ...state, percent: this.percent, speed: this.speed }
  }

  private apply(event: UpdateEvent): UpdateSnapshot {
    this.snapshotValue = applyUpdateEvent(this.snapshotValue, event)
    return this.snapshot()
  }

  private emit(event: string): UpdateSnapshot {
    const snapshot = this.snapshot()
    this.onEvent(event, snapshot)
    return snapshot
  }

  /** 检查更新；失败也落状态机（`failed`），不抛。 */
  async check(currentVersion: string): Promise<UpdateSnapshot> {
    this.apply({ type: 'check-started' })
    let result: UpdateCheckResponse
    try {
      const response = await this.fetchImpl(this.releaseApi, {
        headers: {
          'User-Agent': 'Transactions-App',
          Accept: 'application/vnd.github+json',
        },
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      })
      if (!response.ok) {
        result = errorCheck(`请求 GitHub API 失败: HTTP ${response.status}`)
      } else {
        const payload = await response.json()
        const parsed = parseReleasePayload(payload, currentVersion)
        result = parsed ?? defaultUpdateCheckResponse()
      }
    } catch (error) {
      result = errorCheck(`请求 GitHub API 失败: ${error instanceof Error ? error.message : String(error)}`)
    }
    return this.apply({ type: 'check-finished', result })
  }

  /** 下载安装包（单例）；返回完成/失败后的快照。 */
  async download(url: string, digest: string): Promise<UpdateSnapshot> {
    if (this.active) return this.snapshot()
    if (!url || !allowedDownloadHost(url)) {
      return this.apply({ type: 'download-rejected', message: '下载地址不在白名单内' })
    }
    this.active = true
    this.cancelRequested = false
    this.percent = 0
    this.speed = ''
    this.apply({ type: 'download-started', url, digest })
    try {
      const path = await this.downloadAndVerify(url, digest)
      this.downloadedPath = path
      const snapshot = this.apply({ type: 'download-finished' })
      this.emit(UPDATE_DOWNLOAD_COMPLETE)
      return snapshot
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message === CANCELLED) {
        return this.apply({ type: 'download-cancelled' })
      }
      const snapshot = this.apply({ type: 'download-failed', message })
      this.emit(UPDATE_DOWNLOAD_ERROR)
      return snapshot
    } finally {
      this.active = false
    }
  }

  private async downloadAndVerify(url: string, digest: string): Promise<string> {
    mkdirSync(this.tempDir, { recursive: true })
    const fileName = basename(new URL(url).pathname) || 'transactions-update.exe'
    const target = join(this.tempDir, fileName)
    const part = `${target}.part`

    if (existsSync(target)) {
      if (digestMatches(normalizeDigest(digest), fileDigest(target))) return target
      rmSync(target, { force: true })
    }

    const response = await this.fetchImpl(url, {
      headers: { 'User-Agent': 'Transactions-App' },
    })
    if (!response.ok) throw new Error(`下载失败: HTTP ${response.status}`)
    if (!response.body) throw new Error('下载失败: 响应没有正文')

    const total = Number(response.headers.get('content-length') ?? 0)
    const reader = response.body.getReader()
    const fd = openSync(part, 'w')
    const hash = createHash('sha256')
    let downloaded = 0
    const started = Date.now()
    try {
      for (;;) {
        if (this.cancelRequested) {
          closeSync(fd)
          rmSync(part, { force: true })
          throw new Error(CANCELLED)
        }
        const { done, value } = await reader.read()
        if (done) break
        writeSync(fd, value)
        hash.update(value)
        downloaded += value.length
        this.percent = total > 0 ? Math.min(100, Math.round((downloaded * 100) / total)) : 0
        const elapsed = (Date.now() - started) / 1000
        this.speed = elapsed > 0 ? formatSpeed(downloaded / elapsed) : '0 B/s'
        if (this.snapshotValue.status === 'downloading') {
          this.emit(UPDATE_DOWNLOAD_PROGRESS)
        }
      }
    } finally {
      try {
        closeSync(fd)
      } catch {
        // 已关闭
      }
    }

    if (!digestMatches(normalizeDigest(digest), hash.digest('hex'))) {
      rmSync(part, { force: true })
      throw new Error('下载文件校验失败（SHA256 不匹配）')
    }
    renameSync(part, target)
    return target
  }

  cancel(): UpdateSnapshot {
    this.cancelRequested = true
    if (this.active) this.apply({ type: 'download-cancelled' })
    if (this.downloadedPath) {
      rmSync(this.downloadedPath, { force: true })
      rmSync(`${this.downloadedPath}.part`, { force: true })
      this.downloadedPath = null
    }
    return this.snapshot()
  }

  install(): UpdateInstallResponse {
    if (!this.downloadedPath || !existsSync(this.downloadedPath)) {
      return { ok: false, error: '安装文件不存在' }
    }
    try {
      this.spawnInstaller(this.downloadedPath)
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
    setTimeout(() => this.quit(), 600)
    return { ok: true }
  }
}


