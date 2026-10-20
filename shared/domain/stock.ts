/**
 * 股票域的**换算口径**：手 ↔ 股、价格 × 股数 = 成交额（全为整数分）。
 *
 * 这条链在 Rust 版里曾散在四处各写一遍（`total_lots * 100`、`fill.lots * 100`、`lots * 100`、
 * 内联的 `price * lots * 100`）—— 而 `100` 是**A 股的每手股数**，属于那种"散在代码里、
 * 改一次要全文件找"的魔数。这里只放"手 → 股 → 金额"与"当前轮次的切法"这类能纯函数断言的算法，
 * 写入流水线与轮次推导不归这里。
 */

import {
  type RoundFee,
  type StockTrade,
  STOCK_TRADE_ADD,
  STOCK_TRADE_CLOSE,
  STOCK_TRADE_OPEN,
  STOCK_TRADE_REDUCE,
} from './models'

/** 每手股数（A 股口径）。 */
export const SHARES_PER_LOT = 100

/** 手数 → 股数。 */
export function sharesOf(lots: number): number {
  return lots * SHARES_PER_LOT
}

/**
 * 成交额（分）：单价（**厘**，每股）× 股数 → 分。
 *
 * **价格是厘、金额是分**：`amount = round(priceMilli × shares / 10)`。
 * 整手（100 股）× 整数厘一定是整数分（`4389 × 100 = 438900 → 43890 分 = 438.90 元`），
 * 只有零股才真的需要这一次四舍五入。价格恒为正，所以这里按 `+5` 做"四舍五入、远离零"。
 */
export function amountOf(priceMilli: number, shares: number): number {
  return Math.trunc((priceMilli * shares + 5) / 10)
}

/** 成交额（分）：单价（**厘**，每股）× 手数（内部按 {@link SHARES_PER_LOT} 折股）。 */
export function amountOfLots(priceMilli: number, lots: number): number {
  return amountOf(priceMilli, sharesOf(lots))
}

/**
 * 从**按时间升序**的成交流里切出"当前在建轮次"（最近一次清仓之后的那几笔）。
 *
 * 规则都是能被断言的：
 *
 * * 建仓 / 加仓：这笔属于当前轮；
 * * 减仓：**也属于当前轮** —— 减到 0 手（甚至超量减）都**不**结束这一轮：那一轮还挂在持仓列表上
 *   （0 手、成本 0），之后买的算本轮加仓。想结束这一轮只有清仓（用户口径：清仓才归档到历史）；
 * * 清仓：那一笔**不属于**它结束的那一轮 —— 实现上是"清空已收集的成交"，
 *   所以清仓那笔本身也不留在结果里；
 * * 其它成交类型忽略。
 *
 * 用途：详情区显示的"当前轮次"、`roundFlow`（浮动盈亏率的分母）与"这只票还在不在持仓列表"
 * 都读它。返回的是成交的**副本**（浅拷贝），调用方改返回值不会污染入参。
 */
export function currentRoundTrades(trades: readonly StockTrade[]): StockTrade[] {
  const result: StockTrade[] = []
  for (const trade of trades) {
    switch (trade.tradeType) {
      case STOCK_TRADE_OPEN:
      case STOCK_TRADE_ADD:
      case STOCK_TRADE_REDUCE:
        result.push({ ...trade })
        break
      case STOCK_TRADE_CLOSE:
        result.length = 0
        break
      default:
        break
    }
  }
  return result
}

/**
 * 轮次号的分配规则：已完成的轮次数 + 序号（从 0 起）+ 1。
 *
 * 从前这条 `+ 1` 写在两处（`close_round` 与重放路径），各自拼一次 —— 轮次号错一个，
 * 详情区、统计与复盘都会对不上。
 */
export function nextRoundNo(completedRounds: number, index: number): number {
  return completedRounds + index + 1
}

/** 当前轮次的**资金口径**（与界面「资金变动」列同一套算法）。 */
export interface RoundFlow {
  /** 本轮买入成本合计（成交额 + 费用） */
  buyCost: number
  /** 本轮资金变动合计：买入为 `−(成交额 + 费用)`、卖出为 `成交额 − 费用` */
  cashFlow: number
}

/** 买入方向（建仓 / 加仓）。 */
export function isBuy(tradeType: string): boolean {
  return tradeType === STOCK_TRADE_OPEN || tradeType === STOCK_TRADE_ADD
}

/** 卖出方向（减仓 / 清仓）。 */
export function isSell(tradeType: string): boolean {
  return tradeType === STOCK_TRADE_REDUCE || tradeType === STOCK_TRADE_CLOSE
}

/**
 * 把当前轮次（最近一次清仓之后）的成交折成一组金额。
 *
 * 两条口径从前只写在注释里、没有断言守着：
 *
 * * **买入**（建仓 / 加仓）：`buyCost += 成交额 + 费用`，同时 `cashFlow −= 成交额 + 费用`
 *   （钱从现金里出去）；
 * * **卖出**（减仓 / 清仓）：只 `cashFlow += 成交额 − 费用`；**`buyCost` 不回落** ——
 *   它是"这一轮为买入花了多少"，不是当前持仓成本。
 */
export function roundFlow(tradesAsc: readonly StockTrade[]): RoundFlow {
  const flow: RoundFlow = { buyCost: 0, cashFlow: 0 }
  for (const trade of currentRoundTrades(tradesAsc)) {
    if (isBuy(trade.tradeType)) {
      const cost = trade.amount + trade.fee
      flow.buyCost += cost
      flow.cashFlow -= cost
    } else if (isSell(trade.tradeType)) {
      flow.cashFlow += trade.amount - trade.fee
    }
  }
  return flow
}

/**
 * 已结算（已清仓归档）轮次的盈亏合计 —— 与交易历史的「已实现盈亏」同一口径。
 *
 * 一轮 = 一次建仓到它对应的清仓：`Σ(卖出成交额 − 费用) − Σ(买入成交额 + 费用)`；
 * 清仓之后清零，下一轮的建仓重新累计。
 *
 * **还没清仓的在建轮次不计入**：它的盈亏（含已经减掉那一部分的回款）算在浮动盈亏里
 * （{@link roundFlow} + 持仓市值），两边不能重复算 —— 否则
 * `已实现 + 浮动 ≠ 总资产 − 本金`。用户真实数据上差的正是未清仓轮次里两次减仓的 −180.95。
 */
export function settledPnl(tradesAsc: readonly StockTrade[]): number {
  let total = 0
  let buyCost = 0
  let sellNet = 0
  for (const trade of tradesAsc) {
    switch (trade.tradeType) {
      case STOCK_TRADE_OPEN:
      case STOCK_TRADE_ADD:
        buyCost += trade.amount + trade.fee
        break
      case STOCK_TRADE_REDUCE:
      case STOCK_TRADE_CLOSE:
        sellNet += trade.amount - trade.fee
        break
      default:
        continue
    }
    if (trade.tradeType === STOCK_TRADE_CLOSE) {
      total += sellNet - buyCost
      buyCost = 0
      sellNet = 0
    }
  }
  return total
}

/**
 * 当前轮次（最近一次清仓之后）**建仓时定下的费用设置**；没记录（老数据）返回 `null`
 * ⇒ 调用方按账本系统配置处理。
 *
 * 「本轮的第一笔」由 {@link currentRoundTrades} 的切分规则给出（清仓那笔本身不属于之后的部分），
 * 所以清仓之后这里不会再把上一轮的快照带出来。同一轮内每笔成交都写着同一份快照
 * （建仓时写入，加仓 / 减仓 / 清仓原样带上），因此取首笔即可。
 */
export function currentRoundFee(tradesAsc: readonly StockTrade[]): RoundFee | null {
  return currentRoundTrades(tradesAsc)[0]?.roundFee ?? null
}

/** Rust `f64::round`：四舍五入、远离零。JS `Math.round` 对负数半值朝 +∞，不能直接用。 */
function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value)
}

/**
 * 浮动盈亏率（%）= 浮动盈亏 ÷ **持仓成本** × 100。
 *
 * 持仓成本 = 本轮净投入 = `−`{@link RoundFlow.cashFlow}：买入的钱出去、卖出的钱回来，
 * "还压在这只股票上"的就是两者的净额。**不是**本轮买入总额（`buyCost`，减仓的回款不冲抵它
 * ⇒ 分母偏大、亏损率被摊薄）——用户真实数据上：市值 3790.00 + 本轮资金变动 −4808.28 = 浮动盈亏
 * −1018.28，率是 −21.18%，而按买入总额 16776.16 算出来只有 −6.07%。
 *
 * 净投入 ≤ 0（卖出回款已经超过买入支出）时没有可算的比率 ⇒ `null`（界面显示 `—`）。
 * 买入总额仍是**已结算轮次**盈亏率的分母，两者口径不同、别互换。
 */
export function floatingPnlRate(pnl: number, cashFlow: number): number | null {
  const cost = -cashFlow
  if (cost <= 0) return null
  return roundHalfAwayFromZero((pnl / cost) * 10_000) / 100
}
