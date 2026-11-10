import { describe, expect, it } from 'vitest'

import { kellyPercent } from '../../shared/domain/kelly'

describe('kelly value', () => {
  it('按胜率与盈亏比算最佳下注比例：f* = p − (1−p)/b', () => {
    // 7 笔 6 胜、盈亏比 2/3：6/7 − (1/7) ÷ (2/3) = 64.2857…%
    expect(kellyPercent({ span: 7, winCount: 6, pnlRatio: 2 / 3 })).toBeCloseTo(64.28571, 4)
    // 胜率 60%、赔率 3：0.6 − 0.4/3 = 46.6667%
    expect(kellyPercent({ span: 5, winCount: 3, pnlRatio: 3 })).toBeCloseTo(46.66667, 4)
  })

  it('平局计入分母，与卡片上的胜率是同一个 span', () => {
    // 4 笔里 1 胜 1 负 2 平：p = 0.25，赔率 2 → 0.25 − 0.75/2 = −12.5%
    expect(kellyPercent({ span: 4, winCount: 1, pnlRatio: 2 })).toBeCloseTo(-12.5, 6)
  })

  it('没有正期望时给负数，不夹到 0', () => {
    // p = 1/3、赔率 0.5：0.3333 − 0.6667/0.5 = −100%
    expect(kellyPercent({ span: 3, winCount: 1, pnlRatio: 0.5 })).toBeCloseTo(-100, 6)
    // 差的赔率把"赢的次数不少"也压成负数：p = 0.4、赔率 0.5 → −80%
    expect(kellyPercent({ span: 5, winCount: 2, pnlRatio: 0.5 })).toBeCloseTo(-80, 6)
  })

  it('盈亏比缺失时没有答案（任一侧没有样本都不是一个百分数）', () => {
    // 没有亏损样本：赔率是无穷
    expect(kellyPercent({ span: 5, winCount: 5, pnlRatio: null })).toBeNull()
    // 没有盈利样本：公式给的是无穷负
    expect(kellyPercent({ span: 5, winCount: 0, pnlRatio: null })).toBeNull()
    // 空点：连分母都没有
    expect(kellyPercent({ span: 0, winCount: 0, pnlRatio: 2 })).toBeNull()
  })
})
