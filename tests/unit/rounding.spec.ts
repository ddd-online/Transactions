import { describe, expect, it } from 'vitest'

import { roundHalfAwayFromZero } from '../../shared/domain/rounding'

describe('roundHalfAwayFromZero', () => {
  // `f64::round` 的口径：半值**远离零**（0.5 → 1、-0.5 → -1），不是朝 +∞
  const cases: Array<[number, number]> = [
    [0, 0],
    [0.4, 0],
    [0.5, 1],
    [1.4, 1],
    [1.5, 2],
    [2.5, 3],
    [100.5, 101],
    [-0.5, -1],
    [-0.6, -1],
    [-1.4, -1],
    [-1.5, -2],
    [-2.5, -3],
    [-100.5, -101],
  ]

  it.each(cases)('round(%f) = %i', (value, expected) => {
    expect(roundHalfAwayFromZero(value)).toBe(expected)
  })

  it('与 Math.round 只在负半值上不同（这就是它存在的理由）', () => {
    // Math.round 是朝 +∞ 的：负半值会被舍成 -0，而 f64::round 舍成 -1
    expect(roundHalfAwayFromZero(-0.5)).toBe(-1)
    expect(Math.round(-0.5) === 0).toBe(true)
    // 正数上两者一致（费用 / 金额这些恒为正的量不受影响）
    expect(roundHalfAwayFromZero(2.5)).toBe(Math.round(2.5))
  })

  it('已经是整数时原样返回', () => {
    for (const value of [0, 1, -1, 42, -42]) {
      expect(roundHalfAwayFromZero(value)).toBe(value)
    }
  })
})
