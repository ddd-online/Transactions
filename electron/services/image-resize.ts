/**
 * RGBA 位图缩小（面积平均 / box filter）。
 *
 * 只给 HEIC 转码用：Chromium 不能解码 HEIC，缩略图也就没法像其它格式那样
 * 在渲染层用 canvas 生成，只能在主进程从解码出来的像素里缩一份。
 */

export interface RgbaImage {
  width: number
  height: number
  rgba: Uint8ClampedArray
}

export function downscaleRgba(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  maxWidth: number,
): RgbaImage {
  const targetWidth = Math.min(maxWidth, width)
  if (targetWidth >= width) {
    return { width, height, rgba: source }
  }
  const ratio = width / targetWidth
  const targetHeight = Math.max(1, Math.round(height / ratio))
  const output = new Uint8ClampedArray(targetWidth * targetHeight * 4)

  for (let y = 0; y < targetHeight; y += 1) {
    const sourceYStart = Math.floor(y * ratio)
    const sourceYEnd = Math.min(height, Math.max(sourceYStart + 1, Math.floor((y + 1) * ratio)))
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceXStart = Math.floor(x * ratio)
      const sourceXEnd = Math.min(width, Math.max(sourceXStart + 1, Math.floor((x + 1) * ratio)))
      const sums = [0, 0, 0, 0]
      let count = 0
      for (let sourceY = sourceYStart; sourceY < sourceYEnd; sourceY += 1) {
        let offset = (sourceY * width + sourceXStart) * 4
        for (let sourceX = sourceXStart; sourceX < sourceXEnd; sourceX += 1) {
          sums[0] += source[offset]
          sums[1] += source[offset + 1]
          sums[2] += source[offset + 2]
          sums[3] += source[offset + 3]
          offset += 4
          count += 1
        }
      }
      const target = (y * targetWidth + x) * 4
      output[target] = Math.round(sums[0] / count)
      output[target + 1] = Math.round(sums[1] / count)
      output[target + 2] = Math.round(sums[2] / count)
      output[target + 3] = Math.round(sums[3] / count)
    }
  }

  return { width: targetWidth, height: targetHeight, rgba: output }
}
