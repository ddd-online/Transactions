import { describe, expect, it } from 'vitest'

import {
  STOCK_TRADE_ADD,
  STOCK_TRADE_CLOSE,
  STOCK_TRADE_OPEN,
  STOCK_TRADE_REDUCE,
  type RoundFee,
  type StockTrade,
} from '../../shared/domain/models'
import {
  SHARES_PER_LOT,
  amountOf,
  amountOfLots,
  currentRoundFee,
  currentRoundTrades,
  floatingPnlRate,
  isBuy,
  isSell,
  nextRoundNo,
  quoteChangePercent,
  roundFlow,
  settledPnl,
  sharesOf,
  type RoundFlow,
} from '../../shared/domain/stock'

/** `StockTrade::default()` 的 TS 版：全空 / 0，可空字段为 null。 */
function emptyTrade(): StockTrade {
  return {
    id: '',
    ledgerId: '',
    stockCode: '',
    stockName: '',
    tradeType: '',
    roundId: '',
    orderId: '',
    orderSeq: 0,
    price: 0,
    lots: 0,
    shares: 0,
    amount: 0,
    fee: 0,
    commission: 0,
    stampDuty: 0,
    transferFee: 0,
    realizedPnl: null,
    tradeTime: 0,
    roundFee: null,
    remark: '',
    createdAt: 0,
  }
}

function trade(tradeType: string, shares: number): StockTrade {
  return { ...emptyTrade(), tradeType, shares }
}

/** 带金额与费用的成交（资金口径用）。 */
function moneyTrade(tradeType: string, shares: number, amount: number, fee: number): StockTrade {
  return { ...trade(tradeType, shares), amount, fee }
}

const ZERO_FLOW: RoundFlow = { buyCost: 0, cashFlow: 0 }

describe('directions', () => {
  it('classifies buy and sell trade types', () => {
    expect(isBuy(STOCK_TRADE_OPEN)).toBe(true)
    expect(isBuy(STOCK_TRADE_ADD)).toBe(true)
    expect(isBuy(STOCK_TRADE_REDUCE)).toBe(false)
    expect(isBuy(STOCK_TRADE_CLOSE)).toBe(false)
    expect(isSell(STOCK_TRADE_REDUCE)).toBe(true)
    expect(isSell(STOCK_TRADE_CLOSE)).toBe(true)
    expect(isSell(STOCK_TRADE_OPEN)).toBe(false)
    expect(isSell(STOCK_TRADE_ADD)).toBe(false)
    expect(isBuy('whatever')).toBe(false)
    expect(isSell('whatever')).toBe(false)
  })
})

describe('round flow', () => {
  it('a buy takes money out of cash and adds to the buy cost', () => {
    const flow = roundFlow([moneyTrade(STOCK_TRADE_OPEN, 100, 1_000_000, 500)])
    expect(flow.buyCost, '买入成本 = 成交额 + 费用').toBe(1_000_500)
    expect(flow.cashFlow, '买入是负数').toBe(-1_000_500)
  })

  it('a sell only moves the cash flow and keeps the buy cost', () => {
    const flow = roundFlow([
      moneyTrade(STOCK_TRADE_OPEN, 100, 1_000_000, 500),
      moneyTrade(STOCK_TRADE_CLOSE, 100, 1_100_000, 600),
    ])
    // 清仓把轮次收尾 → 当前轮为空（见 currentRoundTrades 的口径）
    expect(flow, '清仓之后当前轮没有成交').toEqual(ZERO_FLOW)
  })

  it('a partial round mixes both directions', () => {
    // 减仓（没清完）留一轮里：买入成本保留，卖出只加现金。
    const flow = roundFlow([
      moneyTrade(STOCK_TRADE_OPEN, 200, 2_000_000, 1_000),
      moneyTrade(STOCK_TRADE_REDUCE, 100, 1_200_000, 700),
    ])
    expect(flow.buyCost).toBe(2_001_000)
    expect(flow.cashFlow).toBe(-2_001_000 + (1_200_000 - 700))
  })

  it('an empty round has a zero flow', () => {
    expect(roundFlow([])).toEqual(ZERO_FLOW)
  })
})

describe('current round fee', () => {
  it('the round fee comes from the opening trade', () => {
    const snapshot: RoundFee = {
      commissionRate: 0.00005,
      minCommission: 0,
      stampDutyRate: 0,
      transferFeeRate: 0,
    }
    const opening: StockTrade = { ...trade(STOCK_TRADE_OPEN, 100), roundFee: snapshot }
    // 加仓那一笔也写着同一份（服务层写入时原样带上），取首笔即可
    const adding: StockTrade = { ...trade(STOCK_TRADE_ADD, 100), roundFee: snapshot }
    expect(currentRoundFee([opening, adding])).toEqual(snapshot)
    // 没有记录（老数据）→ null，调用方按系统配置处理
    expect(currentRoundFee([trade(STOCK_TRADE_OPEN, 100)])).toBeNull()
    expect(currentRoundFee([])).toBeNull()
  })

  it('a closed round does not leak its fee', () => {
    const snapshot: RoundFee = {
      commissionRate: 0.0003,
      minCommission: 500,
      stampDutyRate: 0.0005,
      transferFeeRate: 0.00001,
    }
    const closed: StockTrade[] = [
      { ...trade(STOCK_TRADE_OPEN, 100), roundFee: snapshot },
      trade(STOCK_TRADE_CLOSE, 100),
    ]
    expect(currentRoundFee(closed)).toBeNull()
  })
})

describe('round numbers', () => {
  it('start from one after the completed ones', () => {
    expect(nextRoundNo(0, 0)).toBe(1)
    expect(nextRoundNo(3, 0)).toBe(4)
    expect(nextRoundNo(3, 1), '重放时按序号往后排').toBe(5)
  })
})

describe('current round trades', () => {
  it('open and add stay in the current round', () => {
    const round = currentRoundTrades([
      trade(STOCK_TRADE_OPEN, 100),
      trade(STOCK_TRADE_ADD, 50),
    ])
    expect(round.length).toBe(2)
    expect(round[1].shares).toBe(50)
  })

  it('a partial reduce is still part of the round', () => {
    // 减仓没减到 0：仍算这一轮的成交（这正是"减仓不算新轮次"那条口径）。
    const round = currentRoundTrades([
      trade(STOCK_TRADE_OPEN, 100),
      trade(STOCK_TRADE_REDUCE, 40),
    ])
    expect(round.length).toBe(2)
  })

  it('a reduce to zero is still part of the round', () => {
    // 减到 0 手也仍算这一轮的成交 —— 它**不**归档，那一轮继续挂在持仓上（0 手）。
    const round = currentRoundTrades([
      trade(STOCK_TRADE_OPEN, 100),
      trade(STOCK_TRADE_REDUCE, 100),
    ])
    expect(round.length, '减到 0 手不结束本轮').toBe(2)

    // 减到 0 之后再买：还是这一轮（不是新的一轮）
    const afterAdding = currentRoundTrades([
      trade(STOCK_TRADE_OPEN, 100),
      trade(STOCK_TRADE_REDUCE, 100),
      trade(STOCK_TRADE_ADD, 50),
    ])
    expect(afterAdding.length).toBe(3)
    expect(afterAdding[0].shares, '建仓那笔仍在（本轮没有重开）').toBe(100)
  })

  it('a full close clears the round and does not keep the close itself', () => {
    // 清仓把轮次收尾：结果清空，**清仓那笔本身也不留下**。
    const round = currentRoundTrades([
      trade(STOCK_TRADE_OPEN, 100),
      trade(STOCK_TRADE_CLOSE, 100),
    ])
    expect(round).toHaveLength(0)
  })

  it('the next open starts a new round', () => {
    // 清仓之后的新建仓才是新的一轮。
    const round = currentRoundTrades([
      trade(STOCK_TRADE_OPEN, 100),
      trade(STOCK_TRADE_CLOSE, 100),
      trade(STOCK_TRADE_OPEN, 200),
      trade(STOCK_TRADE_ADD, 100),
    ])
    expect(round.length).toBe(2)
    expect(round[0].shares, '只留清仓之后那两笔').toBe(200)
  })

  it('an over reduce stays in the round', () => {
    // 超出持仓的减仓（数据订正/回滚可能造出来）同样留在本轮：结束这一轮只能靠清仓。
    const round = currentRoundTrades([
      trade(STOCK_TRADE_OPEN, 100),
      trade(STOCK_TRADE_REDUCE, 300),
    ])
    expect(round.length, '超量减仓也不结束本轮').toBe(2)
  })

  it('only a close ends the round', () => {
    // 只有清仓收尾：一轮里"减到 0 → 加仓 → 清仓"，清仓之后的结果为空。
    const round = currentRoundTrades([
      trade(STOCK_TRADE_OPEN, 100),
      trade(STOCK_TRADE_REDUCE, 100),
      trade(STOCK_TRADE_ADD, 100),
      trade(STOCK_TRADE_CLOSE, 100),
    ])
    expect(round, '清仓之后本轮为空').toHaveLength(0)
  })

  it('unknown trade types are ignored', () => {
    const round = currentRoundTrades([trade('whatever', 100), trade(STOCK_TRADE_OPEN, 100)])
    expect(round.length).toBe(1)
  })

  it('an empty stream has no current round', () => {
    expect(currentRoundTrades([])).toHaveLength(0)
  })

  it('returns copies so callers cannot mutate the input', () => {
    const source = trade(STOCK_TRADE_OPEN, 100)
    const round = currentRoundTrades([source])
    expect(round[0]).not.toBe(source)
    expect(round[0]).toEqual(source)
  })
})

describe('settled pnl', () => {
  it('counts only closed rounds', () => {
    const trades = [
      moneyTrade(STOCK_TRADE_OPEN, 200, 100_000, 500),
      moneyTrade(STOCK_TRADE_CLOSE, 200, 120_000, 600),
      // 第二轮还没清仓：减仓的回款先落在浮动盈亏里，不能算成已实现
      moneyTrade(STOCK_TRADE_OPEN, 400, 200_000, 500),
      moneyTrade(STOCK_TRADE_REDUCE, 200, 90_000, 500),
    ]
    expect(settledPnl(trades)).toBe(120_000 - 600 - (100_000 + 500))
  })

  it('counts a round archived after reducing to zero', () => {
    // 减仓减到 0 手、再用 0 手清仓"只归档"：这一轮照样算已结算。
    const trades = [
      moneyTrade(STOCK_TRADE_OPEN, 200, 100_000, 500),
      moneyTrade(STOCK_TRADE_REDUCE, 200, 90_000, 500),
      moneyTrade(STOCK_TRADE_CLOSE, 0, 0, 0),
    ]
    expect(settledPnl(trades)).toBe(90_000 - 500 - (100_000 + 500))
  })

  it('is zero without a closed round', () => {
    expect(settledPnl([])).toBe(0)
    expect(
      settledPnl([
        moneyTrade(STOCK_TRADE_OPEN, 100, 50_000, 500),
        moneyTrade(STOCK_TRADE_REDUCE, 100, 60_000, 500),
      ]),
      '买过又减过、但没清仓的轮次还没有结算',
    ).toBe(0)
  })
})

describe('lots and amounts', () => {
  it('a lot is a hundred shares', () => {
    expect(SHARES_PER_LOT).toBe(100)
    expect(sharesOf(0)).toBe(0)
    expect(sharesOf(1)).toBe(100)
    expect(sharesOf(3)).toBe(300)
    expect(sharesOf(-2), '允许负数（回滚/订正路径会用到）').toBe(-200)
  })

  it('the amount is price times shares', () => {
    // 贵州茅台 1700.00 元/股 = 1,700,000 厘/股，1 手 = 100 股 → 17,000,000 分 = 170,000.00 元
    expect(amountOf(1_700_000, sharesOf(1))).toBe(17_000_000)
    expect(amountOf(1_700_000, sharesOf(10))).toBe(170_000_000)
    expect(amountOf(0, sharesOf(5))).toBe(0)
    expect(amountOf(1_700_000, 0)).toBe(0)
  })

  it('a fund price with milli digits lands on whole cents', () => {
    // 沪深300ETF 4.389 元/份 = 4389 厘 → 1 手（100 份）= 438.90 元 = 43,890 分
    expect(amountOfLots(4_389, 1)).toBe(43_890)
    expect(amountOfLots(4_389, 3)).toBe(131_670)
    // 零股要四舍五入到分：3.053 元/份 × 7 份 = 21.371 元 → 21.37 元
    expect(amountOf(3_053, 7)).toBe(2_137)
    // 恰好半数（…5 厘·股）向上进：0.0005 元 = 5 厘，1 份 → 0.5 分 → 1 分
    expect(amountOf(5, 1)).toBe(1)
    expect(amountOf(4, 1)).toBe(0)
  })

  it('the two amount entries agree', () => {
    // 两个入口给同一个答案（amountOfLots 就是"先折股再乘"的糖）。
    const cases: Array<[number, number]> = [
      [1_700_000, 1],
      [1_700_000, 10],
      [4_389, 3],
      [0, 7],
    ]
    for (const [priceMilli, lots] of cases) {
      expect(
        amountOfLots(priceMilli, lots),
        `priceMilli=${priceMilli} lots=${lots}`,
      ).toBe(amountOf(priceMilli, sharesOf(lots)))
    }
  })

  it('the arithmetic stays in integer cents', () => {
    // 分到分的整数运算：不引入浮点（金额恒为整数分是硬契约）。
    // 36.61 元/股 = 36,610 厘 × 200 股 = 7322.00 元
    expect(amountOfLots(36_610, 2)).toBe(732_200)
  })
})

describe('floating pnl rate', () => {
  it('divides by the net invested capital', () => {
    // 用户真实数据（博敏电子 603936，2026-10-08）：市值 3790.00 + 本轮资金变动 −4808.28
    // = 浮动盈亏 −1018.28，率按净投入算 −21.18%。
    expect(floatingPnlRate(-101_828, -480_828)).toBe(-21.18)
    // 老分母（本轮买入总额 16776.16 分，正数）算出来只有 −6.07%：同一个 −1018.28，
    // 亏损率被摊薄三倍多 —— 两个分母给出的数必须不是一个量级。
    const buyCost = 1_677_616
    expect(Math.round((-101_828 / buyCost) * 10_000) / 100).toBe(-6.07)
  })

  it('keeps the sign of a profit', () => {
    // 净投入 500.00，浮动盈亏 +100.00 → +20%
    expect(floatingPnlRate(10_000, -50_000)).toBe(20)
    // 四舍五入到两位小数（与 round_pnl 的盈亏率同一口径）
    const rate = floatingPnlRate(1, -3)
    expect(rate).not.toBeNull()
    expect(Math.abs((rate as number) - 33.33)).toBeLessThan(1e-9)
  })

  it('is null when the round took out more than it put in', () => {
    // 卖出回款已超过买入支出（净投入 ≤ 0）时没有可算的比率：界面显示 `—`。
    expect(floatingPnlRate(10_000, 0)).toBeNull()
    expect(floatingPnlRate(10_000, 50_000)).toBeNull()
  })
})

describe('quote change percent', () => {
  it('换算成两位小数的涨跌幅', () => {
    // 1500.00 → 1550.00 是 +3.33%
    expect(quoteChangePercent(155_000, 150_000)).toBe(3.33)
    expect(quoteChangePercent(145_000, 150_000)).toBe(-3.33)
    expect(quoteChangePercent(150_000, 150_000)).toBe(0)
  })

  it('与浮动盈亏率同一取整口径（四舍五入、远离零）', () => {
    // 0.05% 正好落在半值上：Math.round 会把负数拉向 +∞，这里要和正数对称。
    expect(quoteChangePercent(100_005, 100_000)).toBe(0.01)
    expect(quoteChangePercent(99_995, 100_000)).toBe(-0.01)
  })

  it('昨收非正或非有限值时没有可算的比率', () => {
    expect(quoteChangePercent(100_000, 0)).toBeNull()
    expect(quoteChangePercent(100_000, -1)).toBeNull()
    expect(quoteChangePercent(100_000, Number.NaN)).toBeNull()
  })
})
