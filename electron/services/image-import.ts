import { AppError } from '../../shared/errors'
import { decodeDataUri, type AssetFile } from './assets'
import { decodeHeic } from './heic-decode'
import { DISPLAYABLE_IMAGE_MIMES, isHeic, sniffImage } from './image-sniff'
import { downscaleRgba } from './image-resize'

/**
 * 事件图片入库前的准备：把各种来源（含 HEIC / 实况）收敛成一组可落盘的字节。
 *
 * HEIC 走不了渲染层 canvas（Chromium 没有 HEVC 解码器），所以展示图与缩略图
 * 都在这里由主进程转码成 JPEG，原图原样保留；其它格式沿用渲染层给的缩略图。
 */

/** 主进程 JPEG 编码器；抽成接口是为了单测能绕过 Electron。 */
export interface ImageCodec {
  encodeJpeg(rgba: Uint8ClampedArray, width: number, height: number, quality: number): Buffer
}

export interface EventImagePayload {
  /** 展示图 data URI；HEIC 时就是原图字节 */
  dataUri: string
  /** 渲染层用 canvas 生成的缩略图；HEIC 时为空（主进程生成） */
  thumbDataUri?: string
  /** 实况照片的动态部分 data URI */
  motionDataUri?: string
}

export interface PreparedEventImage {
  display: AssetFile
  thumb: AssetFile
  original?: AssetFile
  motion?: AssetFile
}

const DISPLAY_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

const MOTION_EXTENSIONS: Record<string, string> = {
  'video/quicktime': 'mov',
  'video/mp4': 'mp4',
  'video/x-m4v': 'm4v',
  'video/webm': 'webm',
}

/** 原图转码质量：高于渲染层缩略图，尽量接近原图的观感。 */
const DISPLAY_JPEG_QUALITY = 92
const THUMB_MAX_WIDTH = 300
const THUMB_JPEG_QUALITY = 75

const NOT_DECODABLE = '图片不是可解码的图片（支持 JPEG / PNG / GIF / WebP / HEIC）'

export async function prepareEventImage(
  payload: EventImagePayload,
  codec: ImageCodec,
): Promise<PreparedEventImage> {
  const source = decodeDataUri(payload.dataUri)
  const mime = sniffImage(source.bytes)
  if (!mime) {
    throw new AppError(NOT_DECODABLE, { status: 400 })
  }

  const prepared: PreparedEventImage = isHeic(mime)
    ? await transcodeHeic(source.bytes, codec)
    : keepOriginalFormat(source.bytes, mime, payload.thumbDataUri)

  if (payload.motionDataUri) {
    const motion = decodeDataUri(payload.motionDataUri)
    const extension = MOTION_EXTENSIONS[motion.mime]
    if (!extension) {
      throw new AppError('实况视频只支持 MOV / MP4 / M4V / WebM', { status: 400 })
    }
    prepared.motion = { ext: extension, bytes: motion.bytes }
  }

  return prepared
}

function keepOriginalFormat(
  bytes: Buffer,
  mime: Exclude<ReturnType<typeof sniffImage>, null>,
  thumbDataUri: string | undefined,
): PreparedEventImage {
  const extension = DISPLAYABLE_IMAGE_MIMES.has(mime) ? DISPLAY_EXTENSIONS[mime] : undefined
  if (!extension) {
    throw new AppError(NOT_DECODABLE, { status: 400 })
  }
  if (!thumbDataUri) {
    throw new AppError('缺少缩略图', { status: 400 })
  }
  const thumb = decodeDataUri(thumbDataUri)
  if (sniffImage(thumb.bytes) !== 'image/jpeg') {
    throw new AppError('缩略图必须是 JPEG', { status: 400 })
  }
  return {
    display: { ext: extension, bytes },
    thumb: { ext: 'jpg', bytes: thumb.bytes },
  }
}

async function transcodeHeic(bytes: Buffer, codec: ImageCodec): Promise<PreparedEventImage> {
  // 渲染层按字节判断 HEIC，正常情况下不会带缩略图；万一带了也忽略 ——
  // Chromium 画不出 HEIC，那份缩略图字节没有意义。
  const decoded = await decodeHeic(bytes)
  const thumbnail = downscaleRgba(decoded.rgba, decoded.width, decoded.height, THUMB_MAX_WIDTH)
  return {
    display: {
      ext: 'jpg',
      bytes: codec.encodeJpeg(decoded.rgba, decoded.width, decoded.height, DISPLAY_JPEG_QUALITY),
    },
    thumb: {
      ext: 'jpg',
      bytes: codec.encodeJpeg(thumbnail.rgba, thumbnail.width, thumbnail.height, THUMB_JPEG_QUALITY),
    },
    original: { ext: 'heic', bytes },
  }
}
