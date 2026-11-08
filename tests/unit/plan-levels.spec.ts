import { describe, expect, it } from 'vitest'

import { planLevelsOf } from '../../shared/domain/plan-levels'

describe('planLevelsOf', () => {
  it('两条都填：上涨 / 下降百分比与盈亏比一起给出', () => {
    // 5.00 → 6.50 是 +30%，5.00 → 4.60 是 -8%，
    // 盈亏比 = (6.50 - 5.00) / (5.00 - 4.60) = 1.50 / 0.40 = 3.75
    expect(planLevelsOf('5.00', '4.60', '6.50')).toEqual({
      upside: '+30.00%',
      downside: '-8.00%',
      riskReward: '3.75',
    })
  })

  it('买入价带厘位时按厘算，不先折到分', () => {
    // 4.389 → 5.000 是 +13.92%，4.389 → 4.200 是 -4.31%，盈亏比 3.23
    expect(planLevelsOf('4.389', '4.20', '5.00')).toEqual({
      upside: '+13.92%',
      downside: '-4.31%',
      riskReward: '3.23',
    })
  })

  it('只填止盈：只出上涨百分比，盈亏比缺一边不出', () => {
    expect(planLevelsOf('5.00', '', '6.50')).toEqual({
      upside: '+30.00%',
      downside: null,
      riskReward: null,
    })
  })

  it('只填止损：只出下降百分比', () => {
    expect(planLevelsOf('5.00', '4.60', '')).toEqual({
      upside: null,
      downside: '-8.00%',
      riskReward: null,
    })
  })

  it('不填 / 不是数字 / 带负号：当没填，且不牵连另一边', () => {
    expect(planLevelsOf('5.00', '破 4.6 就走', '6.50')).toEqual({
      upside: '+30.00%',
      downside: null,
      riskReward: null,
    })
    expect(planLevelsOf('5.00', '4.60', '破 6.5 就走')).toEqual({
      upside: null,
      downside: '-8.00%',
      riskReward: null,
    })
    expect(planLevelsOf('5.00', '-4.60', '6.50').riskReward).toBeNull()
    expect(planLevelsOf('5.00', '4.6元', '6.5元').downside).toBeNull()
  })

  it('止损在成本之上（保本 / 移动止损）：百分比照给，但盈亏比不成立', () => {
    expect(planLevelsOf('5.00', '5.10', '6.50')).toEqual({
      upside: '+30.00%',
      downside: '+2.00%',
      riskReward: null,
    })
  })

  it('止盈不高于成本：没有「赚多少」可除，盈亏比不成立', () => {
    expect(planLevelsOf('5.00', '4.60', '5.00')).toEqual({
      upside: '0.00%',
      downside: '-8.00%',
      riskReward: null,
    })
    expect(planLevelsOf('5.00', '4.60', '4.80').riskReward).toBeNull()
  })

  it('买入价为空 / 为 0：三个数字都不出', () => {
    const empty = { upside: null, downside: null, riskReward: null }
    expect(planLevelsOf('', '4.60', '6.50')).toEqual(empty)
    expect(planLevelsOf('0.00', '4.60', '6.50')).toEqual(empty)
  })

  it('允许前导 + 与尾随小数点（输入过程中的中间态）', () => {
    expect(planLevelsOf('+5.00', '4.6', '+6.5')).toEqual({
      upside: '+30.00%',
      downside: '-8.00%',
      riskReward: '3.75',
    })
    // 「4.」「6.」是敲「4.60」「6.00」路上的中间态，按 4 / 6 算，不闪成空
    expect(planLevelsOf('5.00', '4.', '6.')).toEqual({
      upside: '+20.00%',
      downside: '-20.00%',
      riskReward: '1.00',
    })
  })

  it('超出安全整数范围的数字当没填，不折成 Infinity 之类的值', () => {
    expect(planLevelsOf('5.00', '99999999999999999999', '6.50').downside).toBeNull()
  })
})
