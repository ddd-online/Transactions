import { nativeImage } from 'electron'

import { AppError } from '../../shared/errors'

/**
 * 主进程里的 JPEG 编码（Electron 原生 `nativeImage`，比纯 JS 编码器快一个量级）。
 *
 * `createFromBitmap` 收的是 Chromium 位图格式：Windows / Linux 上是 BGRA。
 * HEIC 解码得到的是 RGBA，所以这里要换一次通道顺序。
 */
export function encodeJpeg(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  quality: number,
): Buffer {
  const bgra = Buffer.allocUnsafe(width * height * 4)
  for (let offset = 0; offset < rgba.length; offset += 4) {
    bgra[offset] = rgba[offset + 2]
    bgra[offset + 1] = rgba[offset + 1]
    bgra[offset + 2] = rgba[offset]
    bgra[offset + 3] = 255
  }
  const image = nativeImage.createFromBitmap(bgra, { width, height })
  if (image.isEmpty()) {
    throw new AppError('HEIC 图片转码失败', { status: 500 })
  }
  return image.toJPEG(quality)
}
