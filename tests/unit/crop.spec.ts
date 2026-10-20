import { describe, expect, it } from 'vitest'

import { CROP_VIEWPORT, coverScale, cropRect, maxOffset } from '../../shared/domain/crop'

describe('crop geometry', () => {
  // 横图：铺满时是**高度**说了算（宽度溢出）。
  it('cover scale fills the shorter side', () => {
    const wide: readonly [number, number] = [400, 200]
    expect(coverScale(wide)).toBe(CROP_VIEWPORT / 200)
    const tall: readonly [number, number] = [200, 400]
    expect(coverScale(tall)).toBe(CROP_VIEWPORT / 200)
    // 退化输入不抛错、也不产生 Infinity
    expect(coverScale([0, 0])).toBe(1)
  })

  // 居中、铺满时取的是正中间那块方图 —— 裁剪框必须完整落在源图内。
  it('centered crop takes the middle square', () => {
    const natural: readonly [number, number] = [400, 200]
    const scale = coverScale(natural)
    const rect = cropRect(natural, [0, 0], scale)
    expect(Math.abs(rect.size - 200), '取到的应是 200px 见方').toBeLessThan(1e-9)
    expect(Math.abs(rect.x - 100), 'x 应贴着左右的等分处').toBeLessThan(1e-9)
    expect(Math.abs(rect.y)).toBeLessThan(1e-9)
    expect(rect.x + rect.size).toBeLessThanOrEqual(natural[0] + 1e-9)
  })

  // 位移被夹在溢出量之内：**图像任何时候都盖满视口**，不会露出底色。
  it('offset is clamped to the overflow', () => {
    const natural: readonly [number, number] = [400, 200]
    const scale = coverScale(natural)
    // 往右拖 10000px：最多只能拖到左边缘贴住视口（100px 溢出的一半 = 50px）
    const right = cropRect(natural, [10000, 0], scale)
    expect(Math.abs(right.x - 0)).toBeLessThan(1e-9)
    const left = cropRect(natural, [-10000, 0], scale)
    expect(Math.abs(left.x + left.size - natural[0])).toBeLessThan(1e-9)
  })

  // 放大后允许的位移变大（可以去看图的四角），但裁剪框仍然在源图内。
  it('zooming in allows larger offsets and stays inside', () => {
    const natural: readonly [number, number] = [400, 200]
    const scale = coverScale(natural) * 4
    const [limitX] = maxOffset(natural, scale)
    expect(limitX).toBeGreaterThan(0)
    for (const probe of [-limitX, 0, limitX]) {
      const rect = cropRect(natural, [probe, 0], scale)
      expect(rect.x, '裁剪框越过了左边界').toBeGreaterThanOrEqual(-1e-9)
      expect(rect.x + rect.size, '裁剪框越过了右边界').toBeLessThanOrEqual(natural[0] + 1e-9)
    }
  })
})
