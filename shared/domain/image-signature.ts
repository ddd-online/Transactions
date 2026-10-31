/**
 * ISOBMFF `ftyp` 品牌识别（主进程与渲染进程共用，只吃字节、不依赖 Buffer）。
 *
 * HEIC / HEIF 都是「ftyp + HEVC 编码的静态图」；Chromium 解不了这类图，
 * 所以两边都得在动手前先认出它。
 */

/** HEIF 的 ftyp 品牌；`mif1` / `msf1` 是通用 HEIF，实际编码通常仍是 HEVC。 */
const HEIF_BRANDS = new Set([
  'heic',
  'heix',
  'heim',
  'heis',
  'hevc',
  'hevx',
  'hevm',
  'hevs',
  'mif1',
  'msf1',
  'mif2',
])

/** AVIF 也长着 ftyp，但 Chromium 能直接显示；不把它当 HEIC 处理。 */
const AVIF_BRANDS = new Set(['avif', 'avis'])

function brandAt(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3])
}

/** 读出 ftyp box 里的全部品牌（major brand + compatible brands）。 */
export function ftypBrands(bytes: Uint8Array): string[] {
  if (bytes.length < 16) return []
  if (brandAt(bytes, 4) !== 'ftyp') return []
  const declared = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0)
  const end = Math.min(bytes.length, declared > 8 ? declared : bytes.length)
  const brands: string[] = []
  for (let offset = 8; offset + 4 <= end; offset += 4) {
    brands.push(brandAt(bytes, offset))
  }
  return brands
}

export function isHeicSignature(bytes: Uint8Array): boolean {
  const brands = ftypBrands(bytes)
  if (brands.length === 0) return false
  if (brands.some((brand) => AVIF_BRANDS.has(brand))) return false
  return brands.some((brand) => HEIF_BRANDS.has(brand))
}
