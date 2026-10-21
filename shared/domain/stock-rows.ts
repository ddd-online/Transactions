/**
 * 成交流水的渲染行：按委托分组、算出父行的汇总（含**加权均价**）。
 *
 * 股票行转换。它是一条有取值的规则：
 *
 * * **分组键** = `orderId`，为空时回落到单笔自己的 `id`（历史数据里可能没有委托号）；
 * * 组内按 `orderSeq` 升序（同一次委托的多笔成交有先后）；
 * * 单笔成交不合并（`isGroup = false`，键就是成交 id、价格就是成交价）；
 *   多笔合并成父行（键 `order-{orderId}`，价格是**成交额除股数**的四舍五入）；
 * * 父行的数量 / 金额 / 各项费用是子行之和；`realizedPnl` 全为空则保持 `null`。
 *
 * 前两条从前只活在页面的渲染路径里，改错了要靠截图发现。
 */

import { type StockTradeDto, type StockTradeImpactDto, type StockTradeImpactRoundDto } from './stock-dto'
import { lotsOf } from './format'

/** 一条渲染行：委托内的多笔成交聚合成父行 + 子行。 */
export interface TradeRow {
  /** 行键：单笔 = 成交 id；合并行 = `order-{orderId}` */
  key: string
  /** 是不是"合并了多笔成交"的父行 */
  isGroup: boolean
  /** 是不是父行下面的子行（由列表拼装时置位） */
  isChild: boolean
  /** 组内的成交（单笔就是它自己） */
  trades: StockTradeDto[]
  tradeType: string
  /** 单笔 = 成交价；合并行 = 加权均价（成交额 / 股数，四舍五入到分） */
  price: number
  lots: number
  amount: number
  fee: number
  commission: number
  stampDuty: number
  transferFee: number
  tradeTime: number
  /** 已实现盈亏：组内全为空则 `null` */
  realizedPnl: number | null
}

/** Rust `f64::round`：四舍五入、远离零。JS `Math.round` 对负数半值朝 +∞，不能直接用。 */
function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value)
}

/** 按 `orderId` 分组（键 = `orderId || id`，组内按 `orderSeq` 升序）。 */
export function groupTrades(trades: readonly StockTradeDto[]): TradeRow[] {
  const groups: { key: string; items: StockTradeDto[] }[] = []
  for (const trade of trades) {
    const key = trade.orderId.length === 0 ? trade.id : trade.orderId
    const existing = groups.find((group) => group.key === key)
    if (existing !== undefined) {
      existing.items.push({ ...trade })
    } else {
      groups.push({ key, items: [{ ...trade }] })
    }
  }

  return groups.map(({ key, items }) => {
    // JS 的 `Array#sort` 与 Rust 的 `sort_by_key` 都是稳定排序：`orderSeq` 相同时保持输入顺序
    items.sort((left, right) => left.orderSeq - right.orderSeq)
    const first = items[0]
    const shares = items.reduce((total, trade) => total + trade.shares, 0)
    const amount = items.reduce((total, trade) => total + trade.amount, 0)
    const fee = items.reduce((total, trade) => total + trade.fee, 0)
    const commission = items.reduce((total, trade) => total + trade.commission, 0)
    const stampDuty = items.reduce((total, trade) => total + trade.stampDuty, 0)
    const transferFee = items.reduce((total, trade) => total + trade.transferFee, 0)
    const lots = items.reduce((total, trade) => total + trade.lots, 0)
    const pnlValues = items
      .map((trade) => trade.realizedPnl)
      .filter((value): value is number => value !== null)
    const realizedPnl =
      pnlValues.length === 0 ? null : pnlValues.reduce((total, value) => total + value, 0)
    const price = shares > 0 ? roundHalfAwayFromZero(amount / shares) : 0
    const single = items.length === 1
    return {
      key: single ? first.id : `order-${key}`,
      isGroup: !single,
      isChild: false,
      trades: items,
      tradeType: first.tradeType,
      price: single ? first.price : price,
      lots,
      amount,
      fee,
      commission,
      stampDuty,
      transferFee,
      tradeTime: first.tradeTime,
      realizedPnl,
    }
  })
}

/**
 * 「失效轮次」段落固定文案（改动即影响界面）。
 *
 * 两个调用点共用同一份文案：编辑/删除成交的影响预演（{@link impactSummary}）与
 * 回滚确认框（回滚清仓/减仓会让轮次不再成立，该轮的复盘与标签随之丢失）。
 *
 * 轮次上的「每日复盘」同样随轮次消失（服务层删轮次时一起删），所以只要这一轮有本轮复盘
 * **或**任何一篇每日复盘，就要说"复盘（含每日复盘）会丢"。
 */
export function removedRoundsText(removedRounds: readonly StockTradeImpactRoundDto[]): string {
  if (removedRounds.length === 0) {
    return '不会影响任何一轮的复盘。'
  }
  const numbers = removedRounds.map((round) => String(round.roundNo)).join('、')
  const losesReview = removedRounds.some(
    (round) => round.hasReview || round.dayReviewCount > 0,
  )
  if (losesReview) {
    return `第 ${numbers} 轮不再成立，该轮复盘（含每日复盘）会一并丢失。`
  }
  return `第 ${numbers} 轮不再成立。`
}

/** 编辑成交时的确认弹窗摘要。 */
export function impactSummary(impact: StockTradeImpactDto): string {
  const position = `${impact.stockName} 变动后持仓 ${lotsOf(impact.positionAfter)} 手`
  return `${position}\n持仓、资金记录、轮次与统计都会按新数据重算。\n${removedRoundsText(impact.removedRounds)}`
}
