import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, extname, join, relative, resolve, sep } from 'node:path'

import { AppError } from '../../shared/errors'
import { DISPLAYABLE_IMAGE_MIMES, sniffImage } from './image-sniff'

/**
 * 工作空间资产：`<workspace>/data/assets`。
 *
 * 关键事件图片布局（与既有一致）：
 *   key_events/<YYYY-MM-DD>/<uuid>.<ext>            展示图（Chromium 能直接显示的格式）
 *   key_events/<YYYY-MM-DD>/thumb_<uuid>.jpg        缩略图
 *   key_events/<YYYY-MM-DD>/<uuid>.heic             HEIC/HEIF 原图（展示图是转码副本时保留）
 *   key_events/<YYYY-MM-DD>/<uuid>.mov              实况照片的动态部分
 *
 * 缩略图由渲染层 canvas 生成（宽 300 / JPEG q75）；HEIC 源图的展示图与缩略图
 * 由主进程转码生成（Chromium 不能解码 HEIC），主进程只做格式/路径校验与落盘。
 */

export const WORKSPACE_ICON_STEM = 'workspace-icon'
const WORKSPACE_ICON_EXTENSIONS = ['.png', '.jpg', '.webp', '.gif'] as const

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
}

const DISPLAY_EXTENSIONS = new Set(['png', 'jpg', 'webp', 'gif'])
const ORIGINAL_EXTENSIONS = new Set(['heic', 'heif'])
const MOTION_EXTENSIONS = new Set(['mov', 'mp4', 'm4v', 'webm'])

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

export interface DecodedDataUri {
  mime: string
  bytes: Buffer
}

export function decodeDataUri(raw: string): DecodedDataUri {
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

/** 已经过格式校验、准备落盘的一份文件。 */
export interface AssetFile {
  /** 不带点的小写扩展名，如 `jpg` / `heic` / `mov` */
  ext: string
  bytes: Buffer
}

export interface SaveImageFiles {
  /** 展示图：Chromium 能直接渲染的格式（HEIC 由调用方转码成 JPEG 后再传进来） */
  display: AssetFile
  /** 缩略图：固定 JPEG */
  thumb: AssetFile
  /** HEIC/HEIF 原图；展示图是转码副本时保留 */
  original?: AssetFile
  /** 实况照片的动态部分 */
  motion?: AssetFile
}

export interface SavedImagePaths {
  filePath: string
  thumbPath: string
  originalPath: string
  motionPath: string
}

/** 保存关键事件图片与缩略图（以及可选的原图 / 实况视频），返回相对 `data/assets` 的路径。 */
export function saveImage(
  workspaceDir: string,
  eventDate: string,
  imageId: string,
  files: SaveImageFiles,
): SavedImagePaths {
  const displayExtension = files.display.ext.toLowerCase()
  if (!DISPLAY_EXTENSIONS.has(displayExtension)) {
    throw new AppError('图片只支持 JPEG / PNG / GIF / WebP / HEIC', { status: 400 })
  }
  const displayMime = sniffImage(files.display.bytes)
  if (!displayMime || !DISPLAYABLE_IMAGE_MIMES.has(displayMime)) {
    throw new AppError('图片不是可解码的图片', { status: 400 })
  }

  if (files.thumb.ext.toLowerCase() !== 'jpg' || sniffImage(files.thumb.bytes) !== 'image/jpeg') {
    throw new AppError('缩略图必须是 JPEG', { status: 400 })
  }

  let originalExtension = ''
  if (files.original) {
    originalExtension = files.original.ext.toLowerCase()
    if (!ORIGINAL_EXTENSIONS.has(originalExtension) || sniffImage(files.original.bytes) !== 'image/heic') {
      throw new AppError('只能保留 HEIC / HEIF 原图', { status: 400 })
    }
  }

  let motionExtension = ''
  if (files.motion) {
    motionExtension = files.motion.ext.toLowerCase()
    if (!MOTION_EXTENSIONS.has(motionExtension) || files.motion.bytes.length === 0) {
      throw new AppError('实况视频只支持 MOV / MP4 / M4V / WebM', { status: 400 })
    }
  }

  const directory = join(assetsRoot(workspaceDir), 'key_events', eventDate)
  mkdirSync(directory, { recursive: true })

  const displayName = `${imageId}.${displayExtension}`
  const thumbName = `thumb_${imageId}.jpg`
  writeFileSync(join(directory, displayName), files.display.bytes)
  writeFileSync(join(directory, thumbName), files.thumb.bytes)

  const paths: SavedImagePaths = {
    filePath: `key_events/${eventDate}/${displayName}`,
    thumbPath: `key_events/${eventDate}/${thumbName}`,
    originalPath: '',
    motionPath: '',
  }

  if (files.original && originalExtension) {
    const name = `${imageId}.${originalExtension}`
    writeFileSync(join(directory, name), files.original.bytes)
    paths.originalPath = `key_events/${eventDate}/${name}`
  }
  if (files.motion && motionExtension) {
    const name = `${imageId}.${motionExtension}`
    writeFileSync(join(directory, name), files.motion.bytes)
    paths.motionPath = `key_events/${eventDate}/${name}`
  }

  return paths
}

/** 删除一张图片的全部文件；文件不存在不算失败。 */
export function removeImageFiles(
  workspaceDir: string,
  image: { filePath: string; thumbPath: string; originalPath?: string; motionPath?: string },
): void {
  for (const relativePath of [
    image.filePath,
    image.thumbPath,
    image.originalPath ?? '',
    image.motionPath ?? '',
  ]) {
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
