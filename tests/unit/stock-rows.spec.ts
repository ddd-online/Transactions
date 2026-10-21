import { describe, expect, it } from 'vitest'

import {
  type StockTradeDto,
  type StockTradeImpactDto,
  type StockTradeImpactRoundDto,
} from '../../shared/domain/stock-dto'
import { groupTrades, impactSummary, removedRoundsText } from '../../shared/domain/stock-rows'
import { SHARES_PER_LOT } from '../../shared/domain/stock'

/** 一条成交（对应 测试里的 `fill`，其余字段留 0 / null）。 */
function fill(
  id: string,
  orderId: string,
  orderSeq: number,
  shares: number,
  price: number,
): StockTradeDto {
  return {
    id,
    orderId,
    orderSeq,
    shares,
    price,
    lots: Math.trunc(shares / SHARES_PER_LOT),
    amount: shares * price,
    tradeType: 'open',
    tradeTime: 1_700_000_000 + orderSeq,
    fee: 0,
    commission: 0,
    stampDuty: 0,
    transferFee: 0,
    realizedPnl: null,
  }
}

/** 一个失效轮次（对应 的 `StockTradeImpactRoundDto::default()` + 覆盖字段）。 */
function impactRound(
  roundNo: number,
  overrides: Partial<StockTradeImpactRoundDto> = {},
): StockTradeImpactRoundDto {
  return { roundNo, hasReview: false, dayReviewCount: 0, ...overrides }
}

describe('groupTrades', () => {
  it('a single fill is not grouped', () => {
    const rows = groupTrades([fill('t1', 'o1', 0, 100, 1234)])
    expect(rows.length).toBe(1)
    const row = rows[0]
    expect(row.isGroup).toBe(false)
    expect(row.isChild).toBe(false)
    expect(row.key, '单笔的键是成交 id').toBe('t1')
    expect(row.price, '单笔价格就是成交价').toBe(1234)
    expect(row.trades.length).toBe(1)
    expect(row.amount).toBe(123_400)
    expect(row.realizedPnl).toBeNull()
  })

  // 一次委托多笔成交：合并成父行，价格是**成交额 / 股数**的加权均价（四舍五入）。
  it('multiple fills of one order merge into a weighted average row', () => {
    const a = fill('t1', 'o1', 1, 100, 1234)
    a.fee = 5
    a.commission = 5
    a.stampDuty = 0
    a.transferFee = 0
    a.realizedPnl = 10
    const b = fill('t2', 'o1', 0, 300, 1250)
    b.fee = 7
    b.commission = 6
    b.stampDuty = 1
    b.transferFee = 0
    b.realizedPnl = 20

    const rows = groupTrades([a, b])
    expect(rows.length, '同一个 orderId 只出一行').toBe(1)
    const row = rows[0]
    expect(row.isGroup).toBe(true)
    expect(row.key).toBe('order-o1')
    expect(row.trades.length).toBe(2)
    expect(row.trades[0].id, '组内按 orderSeq 升序（b 的 seq 更小）').toBe('t2')
    expect(row.trades[1].id).toBe('t1')
    expect(row.lots, '手数也是求和').toBe(4)
    expect(row.amount).toBe(100 * 1234 + 300 * 1250)
    expect(row.fee).toBe(12)
    expect(row.commission).toBe(11)
    expect(row.stampDuty).toBe(1)
    expect(row.transferFee).toBe(0)
    expect(row.price, '加权均价').toBe(Math.round((100 * 1234 + 300 * 1250) / 400))
    expect(row.realizedPnl, '已实现盈亏求和').toBe(30)
    expect(row.tradeTime, '取组内 seq 最小的那笔').toBe(1_700_000_000)
  })

  // 分组的顺序 = 首次出现的顺序（页面按成交列表的既有顺序渲染）。
  it('groups keep their first appearance order', () => {
    const rows = groupTrades([
      fill('t1', 'o1', 0, 100, 1000),
      fill('t2', 'o2', 0, 100, 2000),
      fill('t3', 'o1', 1, 100, 1000),
    ])
    const keys = rows.map((row) => row.key)
    expect(keys, 'o1 有两笔（合并行），o2 只有一笔（单笔行键是成交 id）').toEqual([
      'order-o1',
      't2',
    ])
  })

  // 没有委托号（历史数据）时按成交 id 各自成行。
  it('fills without an order id stay apart', () => {
    const rows = groupTrades([fill('t1', '', 0, 100, 1000), fill('t2', '', 0, 200, 1000)])
    expect(rows.length).toBe(2)
    expect(rows.every((row) => !row.isGroup)).toBe(true)
    expect(rows[0].key).toBe('t1')
    expect(rows[1].key).toBe('t2')
  })

  // 只有卖出才有已实现盈亏：全为空 → `null`（页面据此不画那一列）。
  it('realized pnl stays null unless some fill has it', () => {
    const rows = groupTrades([fill('t1', 'o1', 0, 100, 1000)])
    expect(rows[0].realizedPnl).toBeNull()
  })

  it('an empty list yields no rows', () => {
    expect(groupTrades([]).length).toBe(0)
  })
})

describe('impact copy', () => {
  // 影响预览的两段文案：没有失效轮次、有失效轮次（本轮复盘或每日复盘任一存在就要提示会丢）。
  it('removed rounds copy says whether a review is lost', () => {
    expect(removedRoundsText([])).toBe('不会影响任何一轮的复盘。')
    const plain: StockTradeImpactRoundDto[] = [impactRound(3)]
    expect(removedRoundsText(plain)).toBe('第 3 轮不再成立。')
    const withReview: StockTradeImpactRoundDto[] = [
      impactRound(3),
      impactRound(5, { hasReview: true }),
    ]
    expect(removedRoundsText(withReview)).toBe(
      '第 3、5 轮不再成立，该轮复盘（含每日复盘）会一并丢失。',
    )
    // 只有每日复盘、没写本轮复盘：同样要说会丢
    const withDayReview: StockTradeImpactRoundDto[] = [impactRound(2, { dayReviewCount: 3 })]
    expect(removedRoundsText(withDayReview)).toBe(
      '第 2 轮不再成立，该轮复盘（含每日复盘）会一并丢失。',
    )
  })

  it('impact summary mentions the position after and the rounds', () => {
    const impact: StockTradeImpactDto = {
      stockName: '贵州茅台',
      positionAfter: 250,
      removedRounds: [impactRound(2)],
    }
    const summary = impactSummary(impact)
    expect(summary.startsWith('贵州茅台 变动后持仓 2 手'), summary).toBe(true)
    expect(summary).toContain('持仓、资金记录、轮次与统计都会按新数据重算。')
    expect(summary.endsWith('第 2 轮不再成立。'), summary).toBe(true)
  })
})
