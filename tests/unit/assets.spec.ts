import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  assetsRoot,
  removeImageFiles,
  removeWorkspaceIcon,
  resolveAsset,
  saveImage,
  saveWorkspaceIcon,
  workspaceIconRelative,
} from '../../electron/services/assets'
import { AppError } from '../../shared/errors'

const directories: string[] = []

function workspace(): string {
  const directory = mkdtempSync(join(tmpdir(), 'tr-assets-test-'))
  directories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const JPEG_1X1 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00]).toString('base64')

function pngUri(): string {
  return `data:image/png;base64,${PNG_1X1}`
}

function jpegUri(): string {
  return `data:image/jpeg;base64,${JPEG_1X1}`
}

describe('workspace assets', () => {
  it('saves an image and its thumbnail in the legacy layout', () => {
    const directory = workspace()
    const saved = saveImage(directory, '2026-01-01', 'img-1', pngUri(), jpegUri())
    expect(saved.filePath).toBe('key_events/2026-01-01/img-1.png')
    expect(saved.thumbPath).toBe('key_events/2026-01-01/thumb_img-1.jpg')
    expect(existsSync(join(assetsRoot(directory), saved.filePath))).toBe(true)
    expect(existsSync(join(assetsRoot(directory), saved.thumbPath))).toBe(true)

    removeImageFiles(directory, saved.filePath, saved.thumbPath)
    expect(existsSync(join(assetsRoot(directory), saved.filePath))).toBe(false)
    expect(existsSync(join(assetsRoot(directory), saved.thumbPath))).toBe(false)
  })

  it('rejects unsupported mime types and bad image bytes', () => {
    const directory = workspace()
    expect(() => saveImage(directory, '2026-01-01', 'x', 'data:text/plain;base64,QQ==', jpegUri())).toThrow(
      '图片只支持 JPEG / PNG / GIF / WebP',
    )
    expect(() =>
      saveImage(directory, '2026-01-01', 'x', 'data:image/png;base64,QQ==', jpegUri()),
    ).toThrow('图片不是可解码的图片')
    expect(() => saveImage(directory, '2026-01-01', 'x', pngUri(), pngUri())).toThrow(
      '缩略图必须是 JPEG',
    )
  })

  it('saves, finds and removes the workspace icon', () => {
    const directory = workspace()
    expect(workspaceIconRelative(directory)).toBe('')
    const name = saveWorkspaceIcon(directory, pngUri())
    expect(name).toBe('workspace-icon.png')
    expect(workspaceIconRelative(directory)).toBe(name)
    removeWorkspaceIcon(directory)
    expect(workspaceIconRelative(directory)).toBe('')
  })

  it('rejects path traversal when resolving assets', () => {
    const directory = workspace()
    expect(() => resolveAsset(directory, '../secret.txt')).toThrow(AppError)
    expect(() => resolveAsset(directory, 'a/../../secret.txt')).toThrow(AppError)
    expect(resolveAsset(directory, 'key_events/a.png')).toContain('key_events')
  })
})
