/**
 * 方形裁剪的纯几何：拖拽改位移、按钮改缩放，按"视口里看到什么"反解出源图上的那块矩形。
 *
 * 弹窗本身只负责把指针事件喂进来、把 {@link CropRect} 交给 canvas 去裁 ——
 * 几何留在这里，是为了能在单测里断言。
 */

/** 裁剪视口的边长（CSS px）。最窄一档弹窗（400px）减去内边距后仍有余量。 */
export const CROP_VIEWPORT = 260

/** 源图上要取走的那一块（源图像素：左上角 + 边长）。 */
export interface CropRect {
  x: number
  y: number
  size: number
}

/** 源图的像素尺寸 `[宽, 高]`。 */
export type NaturalSize = readonly [width: number, height: number]

/** 图像中心相对视口中心的位移 `[x, y]`（CSS px，正 = 往右下）。 */
export type CropOffset = readonly [x: number, y: number]

/**
 * "刚好铺满视口"的比例（cover）：源图像素 → CSS px。
 *
 * 取两个方向的**较大**者：小的那边铺满时，大的那边正好溢出 —— 溢出部分就是可拖动范围。
 * 退化输入（任一边 `<= 0`）返回 1，不产生 `Infinity`。
 */
export function coverScale(natural: NaturalSize): number {
  if (natural[0] <= 0 || natural[1] <= 0) {
    return 1
  }
  return Math.max(CROP_VIEWPORT / natural[0], CROP_VIEWPORT / natural[1])
}

/**
 * 位移的合法范围（±，CSS px）。
 *
 * 上限 = 溢出量的一半：再多拖一点，图的那条边就会离开视口边缘、露出底色。
 */
export function maxOffset(natural: NaturalSize, scale: number): readonly [number, number] {
  return [
    Math.max((natural[0] * scale - CROP_VIEWPORT) / 2, 0),
    Math.max((natural[1] * scale - CROP_VIEWPORT) / 2, 0),
  ]
}

/**
 * 按"视口里看到什么"反解出源图上的裁剪框。
 *
 * `offset`：图像中心相对视口中心的位移（CSS px，正 = 往右下）；
 * `scale`：源图像素 → CSS px 的比例（= {@link coverScale} × 用户缩放）。
 *
 * 视口在图像坐标系里的起点 = `(视口边长 - 图像显示边长) / 2 + 位移`，
 * 但那个值是**负的**（图像比视口大），所以取反再除以比例才是源图坐标。
 */
export function cropRect(natural: NaturalSize, offset: CropOffset, scale: number): CropRect {
  const [limitX, limitY] = maxOffset(natural, scale)
  const dx = Math.min(Math.max(offset[0], -limitX), limitX)
  const dy = Math.min(Math.max(offset[1], -limitY), limitY)
  const left = (CROP_VIEWPORT - natural[0] * scale) / 2 + dx
  const top = (CROP_VIEWPORT - natural[1] * scale) / 2 + dy
  return {
    x: -left / scale,
    y: -top / scale,
    size: CROP_VIEWPORT / scale,
  }
}
