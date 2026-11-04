/**
 * 描线动画的开关：一是「减少动态」，二是「看得清」。
 *
 * 620ms 的 `pathIn` 是给十几条能顺着读的曲线定的。采样点上百之后同一段时长里要画完
 * 几百段折线，看到的只是面积在闪，代价是每帧重绘整块画布 —— 所以过 120 个点就直接画完。
 * 这两个判据都不依赖浏览器：`shouldAnimateDraw` 在没有 `window` 的环境里按"允许"算，
 * 于是这里能直接断言阈值本身。
 */

import { describe, expect, it } from 'vitest'

import { CHART_DRAW_MAX_POINTS, shouldAnimateDraw } from '../../src/theme/motion'

describe('chart draw animation', () => {
  it('稀疏的曲线照常描线', () => {
    expect(shouldAnimateDraw(2)).toBe(true)
    expect(shouldAnimateDraw(CHART_DRAW_MAX_POINTS)).toBe(true)
  })

  it('密过阈值就直接画完', () => {
    expect(shouldAnimateDraw(CHART_DRAW_MAX_POINTS + 1)).toBe(false)
    expect(shouldAnimateDraw(400)).toBe(false)
  })

  it('阈值落在「能看清」的范围内：一次描线里每 5ms 不超过一个采样', () => {
    // 620ms 画完 120 个点 ≈ 每 5.2ms 一个采样，眼睛还跟得上；再多就只是面积在闪。
    expect(CHART_DRAW_MAX_POINTS / 620).toBeLessThanOrEqual(0.2)
  })
})
