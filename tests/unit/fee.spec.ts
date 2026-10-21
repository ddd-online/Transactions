import { describe, expect, it } from 'vitest'

import {
  allocateByAmount,
  allocateOrderFee,
  computeCommission,
  computeOrderFee,
  instrumentLabel,
  instrumentOf,
  isFund,
  isShanghai,
  isValidStockCode,
  marketPrefix,
  roundToCents,
  type Instrument,
} from '../../shared/domain/fee'
import type { StockFeeSetting } from '../../shared/domain/models'

function setting(): StockFeeSetting {
  return {
    id: 'fee-setting',
    ledgerId: 'ledger',
    commissionRate: 0.0002354,
    minCommission: 500,
    stampDutyRate: 0.0005,
    transferFeeRate: 0.00001,
    createdAt: 0,
    updatedAt: 0,
  }
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

describe('fee', () => {
  it('commission_respects_minimum', () => {
    // 小额：按费率算出的佣金低于最低佣金，取最低佣金 5 元
    expect(computeCommission(10_000, setting())).toBe(500)
    // 大额：100 万元 × 万2.354 = 235.4 元 → 23540 分
    expect(computeCommission(100_000_000, setting())).toBe(23_540)
  })

  it('buy_fee_charges_transfer_only_in_shanghai', () => {
    const s = setting()
    // 单笔委托（一笔成交）
    const sh = computeOrderFee([100_000_000], 'shanghaiStock', s, true)
    expect(sh.commission).toBe(23_540)
    expect(sh.stampDuty).toBe(0)
    expect(sh.transferFee).toBe(1_000)
    expect(sh.total).toBe(24_540)

    const sz = computeOrderFee([100_000_000], 'shenzhenStock', s, true)
    expect(sz.transferFee).toBe(0)
    expect(sz.total).toBe(23_540)
  })

  it('sell_fee_charges_stamp_duty', () => {
    const s = setting()
    const sh = computeOrderFee([100_000_000], 'shanghaiStock', s, false)
    expect(sh.commission).toBe(23_540)
    expect(sh.stampDuty).toBe(50_000)
    expect(sh.transferFee).toBe(1_000)
    expect(sh.total).toBe(74_540)
  })

  // 场内基金（ETF / LOF / REITs）：**只有佣金** —— 免印花税、免过户费，买卖都一样。
  //
  // 沪市的基金最容易写错：它"在沪市"，但过户费与市场无关（只对沪市**股票**收）。
  it('a_fund_is_charged_commission_only', () => {
    const s = setting()
    for (const instrument of ['shanghaiFund', 'shenzhenFund'] as const) {
      const buy = computeOrderFee([100_000_000], instrument, s, true)
      expect(buy.commission, `${instrument} 买入佣金照收`).toBe(23_540)
      expect(buy.stampDuty, `${instrument} 买入无印花税`).toBe(0)
      expect(buy.transferFee, `${instrument} 买入无过户费`).toBe(0)
      expect(buy.total).toBe(23_540)

      const sell = computeOrderFee([100_000_000], instrument, s, false)
      expect(sell.stampDuty, `${instrument} 卖出也免印花税`).toBe(0)
      expect(sell.transferFee, `${instrument} 卖出也免过户费`).toBe(0)
      expect(sell.total, `${instrument} 卖出只有佣金`).toBe(23_540)
    }

    // 最低佣金照收：小额委托仍是 5.00 元（基金不豁免佣金门槛）
    const small = computeOrderFee([100_000], 'shanghaiFund', s, false)
    expect(small.commission).toBe(500)
    expect(small.total).toBe(500)
  })

  // 逐笔口径在基金上同样成立：多笔成交的分摊之和 == 委托级合计（此时就只有佣金）。
  it('a_fund_order_splits_commission_across_fills', () => {
    const s = setting()
    const amounts = [3_000_000, 3_000_000]
    const order = computeOrderFee(amounts, 'shenzhenFund', s, false)
    expect(order.stampDuty).toBe(0)
    expect(order.transferFee).toBe(0)
    const allocated = allocateOrderFee(order, amounts, 'shenzhenFund', s, false)
    expect(sum(allocated.map((fee) => fee.total))).toBe(order.total)
    expect(allocated.every((fee) => fee.stampDuty === 0)).toBe(true)
    expect(allocated.every((fee) => fee.transferFee === 0)).toBe(true)
  })

  // 用户报的例子：一次委托两笔成交（各 1 手），印花税与过户费**逐笔**取整再相加。
  //
  // 36.61×100 = 3661.00 元、36.67×100 = 3667.00 元（共 7328.00），卖出、沪市。
  it('per_fill_rounding_matches_the_documented_example', () => {
    const s = setting()
    const fills = [366_100, 366_700]
    const fee = computeOrderFee(fills, 'shanghaiStock', s, false)

    // 佣金：7328.00 × 0.02354% = 1.725 元 → 低于最低佣金 → 5.00（一次委托只收一次）
    expect(fee.commission).toBe(500)
    // 印花税：1.8305 → 1.83；1.8335 → 1.83 ⇒ 3.66
    //（若先求和再取整：7328 × 0.05% = 3.664 → 3.66，这次恰好一样）
    expect(fee.stampDuty).toBe(366)
    // 过户费：0.03661 → 0.04；0.03667 → 0.04 ⇒ **0.08**
    //（先求和再取整只有 0.07328 → 0.07 —— 这正是本次修掉的一分钱）
    expect(fee.transferFee).toBe(8)
    expect(fee.total, '5.00 + 3.66 + 0.08').toBe(874)

    // 逐笔分摊之和必须与委托级合计一致（否则资金记录与各笔成交会对不上账）
    const allocated = allocateOrderFee(fee, fills, 'shanghaiStock', s, false)
    expect(allocated.length).toBe(2)
    expect(sum(allocated.map((fill) => fill.commission))).toBe(500)
    expect(sum(allocated.map((fill) => fill.stampDuty))).toBe(366)
    expect(sum(allocated.map((fill) => fill.transferFee))).toBe(8)
    expect(sum(allocated.map((fill) => fill.total))).toBe(fee.total)
    // 两笔成交额几乎相同 → 过户费各 0.04
    expect(allocated[0].transferFee).toBe(4)
    expect(allocated[1].transferFee).toBe(4)

    // 预计到手 = 7328.00 - 8.74 = 7319.26
    const net = sum(fills) - fee.total
    expect(net).toBe(731_926)
  })

  // 对比"先求和再取整"：证明两条口径确实会差（否则上面那条单测就白写了）。
  it('whole_order_rounding_would_lose_a_cent_on_transfer_fee', () => {
    const s = setting()
    const fills = [366_100, 366_700]
    const perFill = computeOrderFee(fills, 'shanghaiStock', s, false).transferFee
    const wholeOrder = roundToCents(sum(fills), s.transferFeeRate)
    expect(perFill).toBe(8)
    expect(wholeOrder).toBe(7)
  })

  it('order_fee_is_charged_once_per_order_not_per_fill', () => {
    const s = setting()
    // 三笔小额成交：每笔单独计费都会触发 5 元最低佣金
    const amounts = [1_000_000, 1_000_000, 1_000_000]
    const orderFee = computeOrderFee(amounts, 'shanghaiStock', s, true)
    const allocated = allocateOrderFee(orderFee, amounts, 'shanghaiStock', s, true)

    expect(allocated.length).toBe(3)
    // 委托级佣金 = 300 万 × 万2.354 = 706 分，高于最低佣金 500 分
    expect(orderFee.commission).toBe(706)
    expect(sum(allocated.map((fill) => fill.commission)), '分摊之和必须等于委托级费用').toBe(
      orderFee.commission,
    )
    expect(sum(allocated.map((fill) => fill.total))).toBe(orderFee.total)
    // 单笔分摊额低于"按笔单独计收"的最低佣金 → 证明最低佣金只在委托级收一次
    expect(computeCommission(1_000_000, s)).toBe(500)
    expect(allocated[0].commission).toBeLessThan(500)
    expect(orderFee.commission, '按笔计收会是 1500 分，按委托计收只有 706 分').toBeLessThan(1_500)
  })

  it('order_fee_allocation_puts_rounding_remainder_on_last_fill', () => {
    const s = setting()
    const amounts = [30_000_000, 30_000_000, 40_000_000]
    const orderFee = computeOrderFee(amounts, 'shanghaiStock', s, true)
    const allocated = allocateOrderFee(orderFee, amounts, 'shanghaiStock', s, true)

    // 100 万 × 万2.354 = 235.4 元 = 23540 分，前两笔各 7062 分，末笔吃余数
    expect(orderFee.commission).toBe(23_540)
    expect(allocated[0].commission).toBe(7_062)
    expect(allocated[1].commission).toBe(7_062)
    expect(allocated[2].commission).toBe(23_540 - 7_062 - 7_062)
    expect(sum(allocated.map((fill) => fill.stampDuty))).toBe(orderFee.stampDuty)
    expect(sum(allocated.map((fill) => fill.transferFee))).toBe(orderFee.transferFee)
  })

  it('allocate_by_amount_puts_remainder_on_last_item', () => {
    expect(allocateByAmount(100, [1, 1, 1])).toEqual([33, 33, 34])
    expect(allocateByAmount(10, [0, 0])).toEqual([0, 10])
    expect(allocateByAmount(7, [])).toEqual([])
    expect(allocateByAmount(5, [3])).toEqual([5])
  })

  it('instruments_and_code_checks', () => {
    // 股票：沪 60/68、深 00/30
    expect(instrumentOf('600519')).toBe('shanghaiStock')
    expect(instrumentOf('688981')).toBe('shanghaiStock')
    expect(instrumentOf('000001')).toBe('shenzhenStock')
    expect(instrumentOf('300750')).toBe('shenzhenStock')
    // 场内基金：沪 5[0-8]（ETF / LOF / 封闭式基金 / REITs）、深 1[5-8]
    for (const code of ['510300', '588000', '501050', '508000', '161725', '159915', '180101']) {
      const instrument = instrumentOf(code)
      if (instrument === null) throw new Error(`${code} 应被认作场内基金`)
      expect(isFund(instrument), `${code} 应当是场内基金`).toBe(true)
      expect(instrumentLabel(instrument)).toBe('场内基金')
    }
    expect(instrumentOf('510300')).toBe('shanghaiFund')
    expect(instrumentOf('159915')).toBe('shenzhenFund')
    // 不支持：位数不对 / 非数字 / 北交所 / 可转债 / 港美股
    for (const code of ['12345', '60051a', '830799', '113050', '123456', '00700', 'AAPL']) {
      expect(instrumentOf(code), `${code} 不该被认作支持的品种`).toBeNull()
      expect(isValidStockCode(code), `${code} 不该通过代码校验`).toBe(false)
    }
    expect(isValidStockCode('600519')).toBe(true)
    expect(isValidStockCode('000001')).toBe(true)
    expect(isValidStockCode('300750')).toBe(true)
    expect(isValidStockCode('510300'), 'ETF 必须能填进下单弹窗').toBe(true)
    expect(isValidStockCode('159915')).toBe(true)

    // 市场前缀：沪市（股票与基金）sh，深市 sz
    expect(marketPrefix('600519')).toBe('sh')
    expect(marketPrefix('000001')).toBe('sz')
    expect(marketPrefix('510300')).toBe('sh')
    expect(marketPrefix('588000')).toBe('sh')
    expect(marketPrefix('159915')).toBe('sz')
    expect(marketPrefix('161725')).toBe('sz')
    // 非法代码回落到 sz（与从前一致，调用方会先校验）
    expect(marketPrefix('113050')).toBe('sz')

    // 品种本身也带市场前缀（`Instrument::market_prefix`）
    const fund: Instrument = 'shanghaiFund'
    expect(marketPrefix(fund)).toBe('sh')
  })

  // `is_shanghai` 是过户费的判据，但**基金即使在上海也不收** —— 两个问题别混成一个。
  it('shanghai_market_and_transfer_fee_are_not_the_same_question', () => {
    const s = setting()
    expect(isShanghai('shanghaiFund')).toBe(true)
    expect(isFund('shanghaiFund')).toBe(true)
    expect(
      computeOrderFee([100_000_000], 'shanghaiFund', s, false).transferFee,
      '沪市场内基金不收过户费',
    ).toBe(0)
    expect(isShanghai('shanghaiStock')).toBe(true)
    expect(isFund('shanghaiStock')).toBe(false)
    expect(
      computeOrderFee([100_000_000], 'shanghaiStock', s, false).transferFee,
      '沪市股票收过户费',
    ).toBe(1_000)
  })
})
