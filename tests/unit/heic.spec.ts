import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { decodeHeic } from '../../electron/services/heic-decode'
import { downscaleRgba } from '../../electron/services/image-resize'
import {
  prepareEventImage,
  type ImageCodec,
  type PreparedEventImage,
} from '../../electron/services/image-import'
import { ftypBrands, sniffImage } from '../../electron/services/image-sniff'

const fixture = (name: string): Buffer => readFileSync(resolve(__dirname, '../../fixtures/heic', name))

const FLAT = fixture('flat-64.heic')
const GRADIENT = fixture('gradient-512.heic')
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00])
const toUri = (mime: string, bytes: Buffer): string => `data:${mime};base64,${bytes.toString('base64')}`

const fakeCodec: ImageCodec = {
  encodeJpeg: (rgba, width, height) => {
    // 真实的 JPEG 编码在 Electron 主进程里；这里只要证明"传进来的是像素"就够。
    expect(rgba.length).toBe(width * height * 4)
    return JPEG_BYTES
  },
}

function pixelAt(image: { width: number; rgba: Uint8ClampedArray }, x: number, y: number): number[] {
  const offset = (y * image.width + x) * 4
  return [image.rgba[offset], image.rgba[offset + 1], image.rgba[offset + 2]]
}

describe('image sniffing', () => {
  it('recognises HEIC by its ftyp brands', () => {
    expect(ftypBrands(FLAT)).toContain('heic')
    expect(sniffImage(FLAT)).toBe('image/heic')
    expect(sniffImage(GRADIENT)).toBe('image/heic')
  })

  it('keeps recognising the formats Chromium renders on its own', () => {
    expect(sniffImage(PNG_1X1)).toBe('image/png')
    expect(sniffImage(JPEG_BYTES)).toBe('image/jpeg')
    expect(sniffImage(Buffer.from('<html>not an image</html>'))).toBeNull()
  })

  it('treats AVIF as unsupported instead of feeding it to the HEIC decoder', () => {
    const avif = Buffer.alloc(32)
    avif.writeUInt32BE(24, 0)
    avif.write('ftyp', 4, 'latin1')
    avif.write('avif', 8, 'latin1')
    avif.write('mif1', 12, 'latin1')
    expect(sniffImage(avif)).toBeNull()
  })
})

describe('HEIC decoding', () => {
  it('decodes flat-64.heic to the synthetic colour it was encoded from', async () => {
    const decoded = await decodeHeic(FLAT)
    expect([decoded.width, decoded.height]).toEqual([64, 64])
    const [r, g, b] = pixelAt(decoded, 32, 32)
    // HEVC 是有损的：只要求接近 RGB(200, 30, 60)
    expect(Math.abs(r - 200)).toBeLessThanOrEqual(6)
    expect(Math.abs(g - 30)).toBeLessThanOrEqual(6)
    expect(Math.abs(b - 60)).toBeLessThanOrEqual(6)
  })

  it('decodes the 512×512 gradient', async () => {
    const decoded = await decodeHeic(GRADIENT)
    expect([decoded.width, decoded.height]).toEqual([512, 512])
    expect(pixelAt(decoded, 4, 4)[2]).toBeGreaterThan(100)
    expect(pixelAt(decoded, 4, 4)[2]).toBeLessThan(160)
  })

  it('refuses bytes that are not HEIC', async () => {
    await expect(decodeHeic(PNG_1X1)).rejects.toThrow('HEIC 图片无法解码')
  })
})

describe('downscaleRgba', () => {
  it('averages boxes and keeps the aspect ratio', () => {
    const source = new Uint8ClampedArray(4 * 2 * 4)
    // 4×2：左半黑、右半白
    for (let y = 0; y < 2; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        const offset = (y * 4 + x) * 4
        source[offset] = x < 2 ? 0 : 255
        source[offset + 1] = x < 2 ? 0 : 255
        source[offset + 2] = x < 2 ? 0 : 255
        source[offset + 3] = 255
      }
    }
    const scaled = downscaleRgba(source, 4, 2, 2)
    expect([scaled.width, scaled.height]).toEqual([2, 1])
    expect(pixelAt(scaled as never, 0, 0)).toEqual([0, 0, 0])
    expect(pixelAt(scaled as never, 1, 0)).toEqual([255, 255, 255])
  })

  it('returns the source untouched when it is already narrow enough', () => {
    const source = new Uint8ClampedArray(2 * 2 * 4)
    const scaled = downscaleRgba(source, 2, 2, 300)
    expect(scaled.rgba).toBe(source)
    expect([scaled.width, scaled.height]).toEqual([2, 2])
  })
})

describe('prepareEventImage', () => {
  it('transcodes HEIC into a JPEG display copy and keeps the original bytes', async () => {
    const prepared: PreparedEventImage = await prepareEventImage(
      { dataUri: toUri('image/heic', FLAT) },
      fakeCodec,
    )
    expect(prepared.display).toEqual({ ext: 'jpg', bytes: JPEG_BYTES })
    expect(prepared.thumb.ext).toBe('jpg')
    expect(prepared.original).toEqual({ ext: 'heic', bytes: FLAT })
    expect(prepared.motion).toBeUndefined()
  })

  it('keeps the renderer thumbnail for formats Chromium can draw', async () => {
    const prepared = await prepareEventImage(
      { dataUri: toUri('image/png', PNG_1X1), thumbDataUri: toUri('image/jpeg', JPEG_BYTES) },
      fakeCodec,
    )
    expect(prepared.display).toEqual({ ext: 'png', bytes: PNG_1X1 })
    expect(prepared.thumb.bytes).toEqual(JPEG_BYTES)
    expect(prepared.original).toBeUndefined()
  })

  it('stores the live photo motion next to the still', async () => {
    const motion = Buffer.from('fake-mp4-bytes')
    const prepared = await prepareEventImage(
      {
        dataUri: toUri('image/heic', FLAT),
        motionDataUri: toUri('video/mp4', motion),
      },
      fakeCodec,
    )
    expect(prepared.motion).toEqual({ ext: 'mp4', bytes: motion })
  })

  it('reports what is wrong instead of guessing', async () => {
    await expect(
      prepareEventImage({ dataUri: toUri('image/png', PNG_1X1) }, fakeCodec),
    ).rejects.toThrow('缺少缩略图')
    // 渲染层按字节判断 HEIC，不会带缩略图；即使带了也忽略，仍按转码处理
    const withThumb = await prepareEventImage(
      { dataUri: toUri('image/heic', FLAT), thumbDataUri: toUri('image/jpeg', JPEG_BYTES) },
      fakeCodec,
    )
    expect(withThumb.display.ext).toBe('jpg')
    await expect(
      prepareEventImage(
        {
          dataUri: toUri('image/png', PNG_1X1),
          thumbDataUri: toUri('image/jpeg', JPEG_BYTES),
          motionDataUri: toUri('video/x-msvideo', Buffer.from('avi')),
        },
        fakeCodec,
      ),
    ).rejects.toThrow('实况视频只支持 MOV / MP4 / M4V / WebM')
    await expect(
      prepareEventImage({ dataUri: toUri('text/plain', Buffer.from('hi')) }, fakeCodec),
    ).rejects.toThrow('图片不是可解码的图片')
  })
})
