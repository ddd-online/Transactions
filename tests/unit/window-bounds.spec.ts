import { describe, expect, it } from 'vitest'

import { fitWindowBounds } from '../../shared/domain/window-bounds'

describe('fitWindowBounds', () => {
  it('把超出工作区右侧的窗口拉回屏内', () => {
    const fitted = fitWindowBounds(
      { width: 1405, height: 1029, x: 380, y: 287 },
      { x: 0, y: 0, width: 1706, height: 960 },
    )
    expect(fitted.width).toBe(1405)
    expect(fitted.x).toBe(293)
    expect(fitted.x + fitted.width).toBeLessThanOrEqual(1698)
  })

  it('宽度超过工作区时缩到工作区减边距', () => {
    const fitted = fitWindowBounds(
      { width: 2400, height: 1600, x: 0, y: 0 },
      { x: 0, y: 0, width: 1706, height: 960 },
    )
    expect(fitted.width).toBe(1690)
    expect(fitted.height).toBe(944)
    expect(fitted.x).toBe(8)
    expect(fitted.y).toBe(8)
  })

  it('没有保存位置时居中', () => {
    const fitted = fitWindowBounds(
      { width: 1200, height: 800, x: null, y: null },
      { x: 0, y: 0, width: 1706, height: 960 },
    )
    expect(fitted.x).toBe(253)
    expect(fitted.y).toBe(80)
  })
})
