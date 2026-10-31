import libheif from 'libheif-js/wasm-bundle'

import { AppError } from '../../shared/errors'

/**
 * HEIC/HEIF 解码（libheif 的 wasm 构建，纯 JS，不需要系统里的 HEVC 解码器 ——
 * Windows 相册能开 HEIC 靠的是「HEIF 图像扩展」，Chromium 自己没有 HEVC 解码器）。
 *
 * 解码是同步阻塞的：一张 1200 万像素的照片约 1 秒，只在导入图片时发生一次。
 */

export interface DecodedHeic {
  width: number
  height: number
  /** RGBA，每像素 4 字节 */
  rgba: Uint8ClampedArray
}

/** 4 字节 RGBA 一像素；再大就是几百 MB 的内存，直接拒绝而不是把进程拖死。 */
const MAX_PIXELS = 64_000_000

export async function decodeHeic(bytes: Buffer): Promise<DecodedHeic> {
  const decoder = new libheif.HeifDecoder()
  const images = decoder.decode(bytes)
  const image = images[0]
  if (!image) {
    throw new AppError('HEIC 图片无法解码', { status: 400 })
  }

  try {
    const width = image.get_width()
    const height = image.get_height()
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new AppError('HEIC 图片尺寸无效', { status: 400 })
    }
    if (width * height > MAX_PIXELS) {
      throw new AppError(`HEIC 图片过大（${width}×${height}）`, { status: 400 })
    }

    const data = new Uint8ClampedArray(width * height * 4)
    const result = await new Promise<{ data: Uint8ClampedArray } | null>((resolve) => {
      // 包装层的回调是异步的（内部 setTimeout），失败时回调 null 而不是抛错。
      image.display({ data, width, height }, resolve)
    })
    if (!result) {
      throw new AppError('HEIC 图片无法解码', { status: 400 })
    }
    return { width, height, rgba: result.data }
  } finally {
    image.free()
  }
}
