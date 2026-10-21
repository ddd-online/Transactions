import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, extname, join, relative, resolve, sep } from 'node:path'

import { AppError } from '../../shared/errors'

/**
 * 工作空间资产：`<workspace>/data/assets`。
 *
 * 关键事件图片布局（与既有一致）：
 *   key_events/<YYYY-MM-DD>/<uuid>.<ext>       原图
 *   key_events/<YYYY-MM-DD>/thumb_<uuid>.jpg   缩略图
 *
 * 缩略图由**渲染层 canvas** 生成（宽 300 / JPEG q75），主进程只做格式/路径校验与落盘。
 */

export const WORKSPACE_ICON_STEM = 'workspace-icon'
const WORKSPACE_ICON_EXTENSIONS = ['.png', '.jpg', '.webp', '.gif'] as const

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
}

export function assetsRoot(workspaceDir: string): string {
  return join(workspaceDir, 'data', 'assets')
}

export function resolveAsset(workspaceDir: string, relativePath: string): string {
  const root = resolve(assetsRoot(workspaceDir))
  const candidate = resolve(root, relativePath)
  const rel = relative(root, candidate)
  if (rel.length === 0 || rel === '..' || rel.startsWith(`..${sep}`) || resolve(root, rel) === root) {
    throw new AppError('非法资产路径', { status: 400 })
  }
  return candidate
}

function decodeDataUri(raw: string): { mime: string; bytes: Buffer } {
  const comma = raw.indexOf(',')
  if (comma < 0) throw new AppError('无效的图片数据（缺少 data URI 分隔符）', { status: 400 })
  const header = raw.slice(0, comma)
  const payload = raw.slice(comma + 1)
  const colon = header.indexOf(':')
  const semicolon = header.indexOf(';')
  const mime = header.slice(colon >= 0 ? colon + 1 : 0, semicolon >= 0 ? semicolon : undefined)
  let bytes: Buffer
  try {
    bytes = Buffer.from(payload, 'base64')
  } catch {
    throw new AppError('无效的图片数据（base64 解码失败）', { status: 400 })
  }
  if (bytes.length === 0) throw new AppError('无效的图片数据（内容为空）', { status: 400 })
  return { mime, bytes }
}

function sniffImage(bytes: Buffer): string | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (bytes.length >= 6 && bytes.subarray(0, 6).toString('ascii') === 'GIF87a') return 'image/gif'
  if (bytes.length >= 6 && bytes.subarray(0, 6).toString('ascii') === 'GIF89a') return 'image/gif'
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp'
  }
  return null
}

function requireImage(bytes: Buffer, message: string): string {
  const mime = sniffImage(bytes)
  if (!mime || !MIME_EXTENSIONS[mime]) {
    throw new AppError(message, { status: 400 })
  }
  return mime
}

export function workspaceIconRelative(workspaceDir: string): string {
  const root = assetsRoot(workspaceDir)
  for (const extension of WORKSPACE_ICON_EXTENSIONS) {
    const name = `${WORKSPACE_ICON_STEM}${extension}`
    if (existsSync(join(root, name))) return name
  }
  return ''
}

export function removeWorkspaceIcon(workspaceDir: string): void {
  const root = assetsRoot(workspaceDir)
  for (const extension of WORKSPACE_ICON_EXTENSIONS) {
    rmSync(join(root, `${WORKSPACE_ICON_STEM}${extension}`), { force: true })
  }
}

/** 保存工作空间图标，返回相对 `data/assets` 的路径；只允许 PNG/JPEG/WebP/GIF。 */
export function saveWorkspaceIcon(workspaceDir: string, dataUri: string): string {
  const { mime, bytes } = decodeDataUri(dataUri)
  const extension = MIME_EXTENSIONS[mime]
  if (!extension) {
    throw new AppError('图标只支持 PNG / JPEG / WebP / GIF', { status: 400 })
  }
  requireImage(bytes, '图标不是可解码的图片')
  const root = assetsRoot(workspaceDir)
  mkdirSync(root, { recursive: true })
  removeWorkspaceIcon(workspaceDir)
  const name = `${WORKSPACE_ICON_STEM}${extension}`
  writeFileSync(join(root, name), bytes)
  return name
}

/** 保存关键事件图片与缩略图，返回相对 `data/assets` 的两个路径。 */
export function saveImage(
  workspaceDir: string,
  eventDate: string,
  imageId: string,
  dataUri: string,
  thumbDataUri: string,
): { filePath: string; thumbPath: string } {
  const { mime, bytes } = decodeDataUri(dataUri)
  const extension = MIME_EXTENSIONS[mime]
  if (!extension) {
    throw new AppError('图片只支持 JPEG / PNG / GIF / WebP', { status: 400 })
  }
  requireImage(bytes, '图片不是可解码的图片')

  const thumb = decodeDataUri(thumbDataUri)
  if (thumb.mime !== 'image/jpeg') {
    throw new AppError('缩略图必须是 JPEG', { status: 400 })
  }
  requireImage(thumb.bytes, '缩略图不是可解码的图片')

  const directory = join(assetsRoot(workspaceDir), 'key_events', eventDate)
  mkdirSync(directory, { recursive: true })
  const originalName = `${imageId}${extension}`
  const thumbName = `thumb_${imageId}.jpg`
  writeFileSync(join(directory, originalName), bytes)
  writeFileSync(join(directory, thumbName), thumb.bytes)

  return {
    filePath: `key_events/${eventDate}/${originalName}`,
    thumbPath: `key_events/${eventDate}/${thumbName}`,
  }
}

/** 删除原图与缩略图；文件不存在不算失败。 */
export function removeImageFiles(
  workspaceDir: string,
  filePath: string,
  thumbPath: string,
): void {
  for (const relativePath of [filePath, thumbPath]) {
    if (!relativePath) continue
    try {
      rmSync(resolveAsset(workspaceDir, relativePath), { force: true })
    } catch {
      // 手工清理过/路径异常都只忽略（与既有行为一致）
    }
  }
}

export function assetFileName(relativePath: string): string {
  return basename(relativePath)
}

export function assetExtension(relativePath: string): string {
  return extname(relativePath)
}
