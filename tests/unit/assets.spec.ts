import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

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
const PNG_BYTES = Buffer.from(PNG_1X1, 'base64')
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00])
const HEIC_BYTES = readFileSync(resolve(__dirname, '../../fixtures/heic/flat-64.heic'))
const MOTION_BYTES = Buffer.from('fake-motion')

function pngUri(): string {
  return `data:image/png;base64,${PNG_1X1}`
}

describe('workspace assets', () => {
  it('saves an image and its thumbnail in the source layout', () => {
    const directory = workspace()
    const saved = saveImage(directory, '2026-01-01', 'img-1', {
      display: { ext: 'png', bytes: PNG_BYTES },
      thumb: { ext: 'jpg', bytes: JPEG_BYTES },
    })
    expect(saved.filePath).toBe('key_events/2026-01-01/img-1.png')
    expect(saved.thumbPath).toBe('key_events/2026-01-01/thumb_img-1.jpg')
    expect(saved.originalPath).toBe('')
    expect(saved.motionPath).toBe('')
    expect(existsSync(join(assetsRoot(directory), saved.filePath))).toBe(true)
    expect(existsSync(join(assetsRoot(directory), saved.thumbPath))).toBe(true)

    removeImageFiles(directory, saved)
    expect(existsSync(join(assetsRoot(directory), saved.filePath))).toBe(false)
    expect(existsSync(join(assetsRoot(directory), saved.thumbPath))).toBe(false)
  })

  it('keeps the HEIC original and the live photo motion beside the display copy', () => {
    const directory = workspace()
    const saved = saveImage(directory, '2026-01-01', 'live-1', {
      display: { ext: 'jpg', bytes: JPEG_BYTES },
      thumb: { ext: 'jpg', bytes: JPEG_BYTES },
      original: { ext: 'heic', bytes: HEIC_BYTES },
      motion: { ext: 'mov', bytes: MOTION_BYTES },
    })
    expect(saved.filePath).toBe('key_events/2026-01-01/live-1.jpg')
    expect(saved.originalPath).toBe('key_events/2026-01-01/live-1.heic')
    expect(saved.motionPath).toBe('key_events/2026-01-01/live-1.mov')
    for (const path of [saved.filePath, saved.thumbPath, saved.originalPath, saved.motionPath]) {
      expect(existsSync(join(assetsRoot(directory), path))).toBe(true)
    }

    removeImageFiles(directory, saved)
    for (const path of [saved.filePath, saved.thumbPath, saved.originalPath, saved.motionPath]) {
      expect(existsSync(join(assetsRoot(directory), path))).toBe(false)
    }
  })

  it('rejects unsupported formats and mismatched bytes', () => {
    const directory = workspace()
    // 扩展名说 png，字节是空的 —— 按内容判断，不信扩展名
    expect(() =>
      saveImage(directory, '2026-01-01', 'x', {
        display: { ext: 'png', bytes: Buffer.from('not-an-image') },
        thumb: { ext: 'jpg', bytes: JPEG_BYTES },
      }),
    ).toThrow('图片不是可解码的图片')
    expect(() =>
      saveImage(directory, '2026-01-01', 'x', {
        display: { ext: 'bmp', bytes: PNG_BYTES },
        thumb: { ext: 'jpg', bytes: JPEG_BYTES },
      }),
    ).toThrow('图片只支持 JPEG / PNG / GIF / WebP / HEIC')
    expect(() =>
      saveImage(directory, '2026-01-01', 'x', {
        display: { ext: 'png', bytes: PNG_BYTES },
        thumb: { ext: 'jpg', bytes: PNG_BYTES },
      }),
    ).toThrow('缩略图必须是 JPEG')
    // 原图只留 HEIC，别的格式没有"保留原图"的意义
    expect(() =>
      saveImage(directory, '2026-01-01', 'x', {
        display: { ext: 'png', bytes: PNG_BYTES },
        thumb: { ext: 'jpg', bytes: JPEG_BYTES },
        original: { ext: 'png', bytes: PNG_BYTES },
      }),
    ).toThrow('只能保留 HEIC / HEIF 原图')
    expect(() =>
      saveImage(directory, '2026-01-01', 'x', {
        display: { ext: 'png', bytes: PNG_BYTES },
        thumb: { ext: 'jpg', bytes: JPEG_BYTES },
        motion: { ext: 'avi', bytes: MOTION_BYTES },
      }),
    ).toThrow('实况视频只支持 MOV / MP4 / M4V / WebM')
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
