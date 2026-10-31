import { ftypBrands, isHeicSignature } from '../../shared/domain/image-signature'

/**
 * 图片字节签名识别。
 *
 * 只看文件头，不信 data URI 或文件名里声明的 MIME —— 用户在文件框里改个后缀
 * 就能把任意文件塞进工作空间，落盘前必须按真实内容判断。
 */

export type ImageMime =
  | 'image/png'
  | 'image/jpeg'
  | 'image/gif'
  | 'image/webp'
  | 'image/heic'

/** Chromium 能直接显示的格式；HEIC 要走转码。 */
export const DISPLAYABLE_IMAGE_MIMES: ReadonlySet<ImageMime> = new Set<ImageMime>([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
])

export { ftypBrands }

function isHello(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.length < offset + text.length) return false
  for (let index = 0; index < text.length; index += 1) {
    if (bytes[offset + index] !== text.charCodeAt(index)) return false
  }
  return true
}

export function sniffImage(bytes: Buffer): ImageMime | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (isHello(bytes, 0, 'GIF87a') || isHello(bytes, 0, 'GIF89a')) return 'image/gif'
  if (isHello(bytes, 0, 'RIFF') && isHello(bytes, 8, 'WEBP')) return 'image/webp'
  if (isHeicSignature(bytes)) return 'image/heic'
  return null
}

export function isHeic(mime: string): boolean {
  return mime === 'image/heic'
}
