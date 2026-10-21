/**
 * 股票持仓 + 账户总览服务。
 *
 * 逐条移植自既有实现 的 `get_overview` / `list_positions` /
 * `update_position_review` / `update_position_tag` 及其辅助函数（`trades_by_code` /
 * `has_open_round` / `compute_held_market_value` / `round_flows_of` / `fetch_held_quotes` /
 * `round_opened_on` / `flow_of` / `effective_position_tag`）。
 *
 * 行情源作为参数注入（{@link StockQuoteFetcher}），服务层**不自己创建** adapter：
 * 生产端用 `stock-quote` 的腾讯实现，测试注入确定性 stub。因为 Node 的网络 API 是异步的，
 * 读入口（{@link getOverview} / {@link listPositions}）返回 `Promise`（既有是同步）。
 *
 * 四条口径不能改：
 * * **可用现金** = 本金 + 累计利息归本 + Σ卖出净盈亏 − 累计支取 − 持仓成本
 *   （与资金链一致；Σ卖出净盈亏**含**未清仓轮次里已减仓的部分）；
 * * **已实现盈亏**只算已清仓（归档）轮次的 `settledPnl`；未清仓轮次里减仓的部分留在浮动盈亏，
 *   否则「已实现 + 浮动」会把同一笔算两遍；
 * * **浮动盈亏** = Σ（持仓市值 + **本轮**资金变动），本轮资金变动由 `roundFlow` 给出；
 * * **行情缺失**按持仓成本计入市值，并计入 `quoteFailedCount`，绝不让总资产因外部接口失真。
 *
 * 一处切片边界：每日复盘的 DAO 还没随本切片移植，`dayReviews` 按既有 DAO 的同一条 SQL
 * （表 / 列 / `round_id = ''` / 日期倒序）就地读取，等每日复盘切片落地后再收进 DAO。
 */

import { STOCK_TAG_ANALYSIS } from '../../shared/domain/consts'
import type { RoundFee, StockTrade } from '../../shared/domain/models'
import {
  type RoundFlow,
  amountOf,
  currentRoundFee,
  currentRoundTrades,
  roundFlow,
  settledPnl,
} from '../../shared/domain/stock'
import { AppError } from '../../shared/errors'
import type {
  StockDayReviewDto,
  StockOverviewDto,
  StockPositionDto,
  StockQuoteDto,
} from '../../shared/types/stock-position'
import type { Db } from '../db/driver'
import {
  type StockPosition,
  getPosition,
  listAllTradesAsc,
  listPositions as listPositionRows,
  listTradesAsc,
  updatePosition,
} from '../db/dao/stock-trade'
import { logError } from '../logging'
import { getAccountSummary, getTradeTags, unixToDate } from './stock-account'
import type { StockQuoteFetcher } from './stock-quote'

/** 复盘 / 每日复盘正文上限（Unicode 码点）。 */
const REVIEW_MAX_CHARS = 500

/** 把非 `AppError` 的异常折成既有的 `Database` 错误（500），并记日志。 */
function databaseFailure(message: string, error: unknown): AppError {
  if (error instanceof AppError) return error
  logError(`${message}, err: ${String(error)}`)
  return new AppError(message, { status: 500 })
}

/** `f64::round`：四舍五入、远离零。JS `Math.round` 对负数半值朝 +∞，不能直接用。 */
function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value)
}

/**
 * 占比百分比：`round(part / whole * 10000) / 100`（保留两位小数）。
 *
 * `whole <= 0` 时返回 `0`（防除零）；调用点仍各自保留 `whole > 0` 守卫。
 */
function percentOf(part: number, whole: number): number {
  if (whole <= 0) return 0
  return roundHalfAwayFromZero((part / whole) * 10_000) / 100
}

// ---------------------------------------------------------------- 成交流派生

/** 整个账本按股票分组的成交（时间升序）—— 本轮资金与本轮费率的共同输入（一次查询）。 */
function tradesByCode(db: Db, ledgerId: string): Map<string, StockTrade[]> {
  const byCode = new Map<string, StockTrade[]>()
  for (const trade of listAllTradesAsc(db, ledgerId)) {
    const trades = byCode.get(trade.stockCode)
    if (trades) trades.push(trade)
    else byCode.set(trade.stockCode, [trade])
  }
  return byCode
}

/** 从分组结果折出本轮资金口径。 */
function roundFlowsOf(byCode: Map<string, StockTrade[]>): Map<string, RoundFlow> {
  const flows = new Map<string, RoundFlow>()
  for (const [code, trades] of byCode) flows.set(code, roundFlow(trades))
  return flows
}

/** 从分组结果折出**本轮的费用设置**（建仓时定下的那份；没记录 = `undefined`）。 */
function roundFeesOf(byCode: Map<string, StockTrade[]>): Map<string, RoundFee> {
  const fees = new Map<string, RoundFee>()
  for (const [code, trades] of byCode) {
    const fee = currentRoundFee(trades)
    if (fee !== null) fees.set(code, fee)
  }
  return fees
}

/** 这只票有没有**未归档的本轮**（`currentRoundTrades` 非空）。 */
function hasOpenRound(byCode: Map<string, StockTrade[]>, stockCode: string): boolean {
  const trades = byCode.get(stockCode)
  return trades !== undefined && currentRoundTrades(trades).length > 0
}

/** 同上，但按股票单独查一次库（给只有 `db` 的调用点用）。 */
function stockHasOpenRound(db: Db, ledgerId: string, stockCode: string): boolean {
  return currentRoundTrades(listTradesAsc(db, ledgerId, stockCode)).length > 0
}

/** 本轮建仓日（本地 `YYYY-MM-DD`）：本轮**首笔成交**的日期。没有未归档轮次时为空串。 */
function roundOpenedOn(byCode: Map<string, StockTrade[]>, stockCode: string): string {
  const trades = byCode.get(stockCode)
  if (!trades) return ''
  const first = currentRoundTrades(trades)[0]
  return first ? unixToDate(first.tradeTime) : ''
}

/**
 * 某持仓的本轮资金口径；查不到成交（异常数据）时退回剩余成本，
 * 让浮动盈亏退回"市值 − 持仓成本"的老口径而不是凭空变成市值。
 */
function flowOf(flows: Map<string, RoundFlow>, position: StockPosition): RoundFlow {
  return (
    flows.get(position.stockCode) ?? {
      buyCost: position.totalCost,
      cashFlow: -position.totalCost,
    }
  )
}

/** 持仓行上那一列标签的**生效值**：空串（没设过）按默认标签「分析」。 */
function effectivePositionTag(raw: string): string {
  const tag = raw.trim()
  return tag === '' ? STOCK_TAG_ANALYSIS : tag
}

// ---------------------------------------------------------------- 行情

/**
 * 为要显示的持仓请求行情（调用方已经筛过"哪几条要显示"）；一条都没有时不发请求。
 *
 * 这里**不**按 `quantity > 0` 过滤：减仓减到 0 手但本轮未归档的票也在持仓列表里，
 * 现价 / 涨跌幅照常给它（市值按 0 股算是 0）。
 */
async function fetchHeldQuotes(
  fetcher: StockQuoteFetcher,
  held: readonly StockPosition[],
): Promise<Map<string, StockQuoteDto>> {
  if (held.length === 0) return new Map()
  try {
    return await fetcher.fetchQuotes(held.map((position) => position.stockCode))
  } catch (error) {
    // 行情端口本该"失败返回空映射"；这里再兜一层，外部数据永远不阻塞持仓页。
    logError(`查询股票行情失败: ${String(error)}`)
    return new Map()
  }
}

/**
 * 汇总持仓市值与浮动盈亏（单位：分）。
 *
 * 行情可用的股票按最新价计价；缺失的按持仓成本计入，避免总资产在行情失败时失真，
 * 并返回失败数量供界面提示。0 手但本轮没归档的票市值是 0，盈亏就是本轮资金变动。
 */
function computeHeldMarketValue(
  held: readonly StockPosition[],
  quotes: Map<string, StockQuoteDto>,
  flows: Map<string, RoundFlow>,
): { marketValue: number; unrealizedPnl: number; quoteFailedCount: number } {
  let marketValue = 0
  let unrealizedPnl = 0
  let quoteFailedCount = 0
  for (const position of held) {
    const flow = flowOf(flows, position)
    if (position.quantity <= 0) {
      unrealizedPnl += flow.cashFlow
      continue
    }
    const quote = quotes.get(position.stockCode)
    let value: number
    if (quote && quote.latestPrice > 0) {
      // 最新价是**厘**/股，市值是**分**：折这一次的口径在 `amountOf`
      value = amountOf(quote.latestPrice, position.quantity)
    } else {
      quoteFailedCount += 1
      value = position.totalCost
    }
    marketValue += value
    unrealizedPnl += value + flow.cashFlow
  }
  return { marketValue, unrealizedPnl, quoteFailedCount }
}

// ---------------------------------------------------------------- 持仓每日复盘

interface DayReviewRow {
  stock_code: string
  review_date: string
  review: string
}

/**
 * 当前轮（`round_id = ''`）的每日复盘：一次取全账本，按股票分组（避免逐股查库）。
 *
 * SQL 与既有 `StockDao::list_unattached_day_reviews` 逐字一致；见文件头的切片边界说明。
 */
function dayReviewsByCode(db: Db, ledgerId: string): Map<string, StockDayReviewDto[]> {
  const rows = db
    .prepare(
      "SELECT stock_code, review_date, review FROM stock_day_review " +
        "WHERE ledger_id = ? AND round_id = '' ORDER BY stock_code ASC, review_date DESC",
    )
    .all(ledgerId) as unknown as DayReviewRow[]
  const grouped = new Map<string, StockDayReviewDto[]>()
  for (const row of rows) {
    const reviews = grouped.get(row.stock_code)
    const item: StockDayReviewDto = { date: row.review_date, review: row.review }
    if (reviews) reviews.push(item)
    else grouped.set(row.stock_code, [item])
  }
  return grouped
}

// ---------------------------------------------------------------- 账户总览

/**
 * 账户总览（可用现金公式见模块头注释）。
 *
 * `fetcher` 由调用方注入（生产 adapter 在边界选择，测试用 stub）。
 */
export async function getOverview(
  db: Db,
  ledgerId: string,
  fetcher: StockQuoteFetcher,
): Promise<StockOverviewDto> {
  try {
    // 现金口径与「本金类写入」的回读完全一致（同一套汇总 SQL）。
    const summary = getAccountSummary(db, ledgerId)

    // 未清仓的持仓行（还有股数，或 0 手但本轮没归档）；已归档的整行不再请求行情
    const positions = listPositionRows(db, ledgerId)
    const byCode = tradesByCode(db, ledgerId)
    const heldPositions = positions.filter(
      (position) => position.quantity > 0 || hasOpenRound(byCode, position.stockCode),
    )

    // 已实现盈亏 = 已清仓（归档）轮次的盈亏合计 —— 与交易历史页同一口径
    let realizedPnl = 0
    for (const trades of byCode.values()) realizedPnl += settledPnl(trades)

    // 持仓市值与浮动盈亏：最新价 × 股数 + 本轮资金变动；行情缺失按成本计入并计数
    const quotes = await fetchHeldQuotes(fetcher, heldPositions)
    const flows = roundFlowsOf(byCode)
    const { marketValue, unrealizedPnl, quoteFailedCount } = computeHeldMarketValue(
      heldPositions,
      quotes,
      flows,
    )

    // 总资产 = 可用现金 + 持仓市值（行情全部缺失时市值 = 成本）
    const totalAssets = summary.availableCash + marketValue

    // 总盈亏（已实现 + 浮动）占本金百分比，本金为 0 时按 0 处理（防除零）
    const totalPnlPercent =
      summary.principal > 0 ? percentOf(realizedPnl + unrealizedPnl, summary.principal) : 0

    // 仓位 = 还压在股票上的资金 ÷ 账户资金（都不含浮动）：
    //   分子 = 账户资金 − 可用现金（净投入；卖出回款已超过买入支出时按 0，不显示负仓位）
    //   分母 = 本金 + 已实现盈亏 + 利息归本 − 累计支取
    // 分母 ≤ 0（钱都取走了）时没有比例可言 ⇒ null（界面显示 —）。
    const capitalBase =
      summary.principal + realizedPnl + summary.interestTotal - summary.withdrawnTotal
    let positionRatio: number | null = null
    if (capitalBase > 0) {
      const invested = Math.max(capitalBase - summary.availableCash, 0)
      positionRatio = roundHalfAwayFromZero((invested / capitalBase) * 10_000) / 100
    }

    return {
      principal: summary.principal,
      availableCash: summary.availableCash,
      positionMarketValue: marketValue,
      withdrawnTotal: summary.withdrawnTotal,
      interestTotal: summary.interestTotal,
      totalAssets,
      realizedPnl,
      unrealizedPnl,
      quoteFailedCount,
      totalPnlPercent,
      positionRatio,
    }
  } catch (error) {
    throw databaseFailure('读取股票账户总览失败', error)
  }
}

// ---------------------------------------------------------------- 持仓列表

/** 持仓 DTO 的"干"部分：服务层再回填本轮字段与行情。 */
function positionDto(position: StockPosition): StockPositionDto {
  return {
    id: position.id,
    ledgerId: position.ledgerId,
    stockCode: position.stockCode,
    stockName: position.stockName,
    quantity: position.quantity,
    totalCost: position.totalCost,
    roundCashFlow: 0,
    realizedPnl: position.realizedPnl,
    review: position.review,
    // 库里存的是原始值（空串 = 没设过）；生效值由 `listPositions` 回填
    tag: position.tag,
    roundOpenedDate: '',
    dayReviews: [],
  }
}

/**
 * 持仓列表（未清仓的股票，挂载行情）。
 *
 * 「未清仓」= **还有持仓，或者本轮还没归档**：减仓减到 0 手时这一轮仍在（0 手、成本 0），
 * 只有清仓才把它归档出去。判据只看成交（`currentRoundTrades` 非空），不需要额外的列。
 */
export async function listPositions(
  db: Db,
  ledgerId: string,
  fetcher: StockQuoteFetcher,
): Promise<StockPositionDto[]> {
  try {
    const positions = listPositionRows(db, ledgerId)
    const byCode = tradesByCode(db, ledgerId)
    const held = positions.filter(
      (position) => position.quantity > 0 || hasOpenRound(byCode, position.stockCode),
    )
    const quotes = await fetchHeldQuotes(fetcher, held)
    const flows = roundFlowsOf(byCode)
    const roundFees = roundFeesOf(byCode)
    // 当前轮（`round_id = ''`）的每日复盘：一次取全账本，按股票分组
    const dayReviews = dayReviewsByCode(db, ledgerId)

    return held.map((position) => {
      const item = positionDto(position)
      item.roundCashFlow = flowOf(flows, position).cashFlow
      // 本轮建仓日 = 本轮首笔成交的本地日期（每日复盘可写区间的下界）
      item.roundOpenedDate = roundOpenedOn(byCode, position.stockCode)
      item.dayReviews = dayReviews.get(position.stockCode) ?? []
      // 本轮建仓时定下的费用设置；没有记录（老数据）⇒ 省略 = 沿用系统配置
      const roundFee = roundFees.get(position.stockCode)
      if (roundFee) item.roundFee = roundFee
      // 本轮标签：库里存空串 = 没设过 ⇒ 按默认「分析」显示
      item.tag = effectivePositionTag(position.tag)
      const quote = quotes.get(position.stockCode)
      if (quote && quote.latestPrice > 0) {
        item.latestPrice = quote.latestPrice
        item.prevClose = quote.prevClose
        item.quoteTime = quote.quoteTime
      }
      return item
    })
  } catch (error) {
    throw databaseFailure('读取股票持仓失败', error)
  }
}

// ---------------------------------------------------------------- 持仓复盘 / 标签

/** 取持仓；不存在时按既有文案报 404。 */
function requirePosition(db: Db, ledgerId: string, stockCode: string): StockPosition {
  try {
    return getPosition(db, ledgerId, stockCode)
  } catch (error) {
    if (error instanceof AppError && error.status === 404) {
      throw new AppError('持仓不存在', { status: 404 })
    }
    throw databaseFailure('读取持仓失败', error)
  }
}

/**
 * 保存持仓中的「本轮复盘」（500 字以内，空串清空）。
 *
 * 持仓期间还没有轮次记录，复盘先落在持仓上，清仓归档时带入该轮次，形成同一份记录。
 */
export function updatePositionReview(
  db: Db,
  ledgerId: string,
  stockCode: string,
  review: string,
): StockPositionDto {
  if (ledgerId === '') throw new AppError('ledger_id is required', { status: 400 })
  if (stockCode === '') throw new AppError('stock_code is required', { status: 400 })
  const trimmed = review.trim()
  if (Array.from(trimmed).length > REVIEW_MAX_CHARS) {
    throw new AppError('交易复盘不能超过 500 字', { status: 400 })
  }

  const position = requirePosition(db, ledgerId, stockCode)
  // 0 手但本轮还没归档（减仓减到 0）时仍可写本轮复盘 —— 与持仓列表"还在列表里"同一口径
  if (position.quantity <= 0 && !stockHasOpenRound(db, ledgerId, stockCode)) {
    throw new AppError('该股票已清仓，请在「交易历史」中编辑本轮复盘', { status: 404 })
  }
  position.review = trimmed
  try {
    updatePosition(db, position)
  } catch (error) {
    throw databaseFailure('保存持仓复盘失败', error)
  }
  return positionDto(position)
}

/**
 * 保存持仓中的「本轮交易标签」（必须是本账本可用标签之一；空串 = 回到默认「分析」）。
 *
 * 与 {@link updatePositionReview} 同一个形状：**持仓期间**标签先写在持仓行上，清仓时随轮次归档，
 * 归档后由持仓侧清空，下一轮不继承。
 */
export function updatePositionTag(
  db: Db,
  ledgerId: string,
  stockCode: string,
  tag: string,
): StockPositionDto {
  if (ledgerId === '') throw new AppError('ledger_id is required', { status: 400 })
  if (stockCode === '') throw new AppError('stock_code is required', { status: 400 })
  const trimmed = tag.trim()
  // 空 = 回到默认（与 `updateRoundTag` 同一口径）；非空必须是本账本可用标签之一
  let effective = STOCK_TAG_ANALYSIS
  if (trimmed !== '') {
    const available = getTradeTags(db, ledgerId)
    if (!available.includes(trimmed)) {
      throw new AppError('无效的交易标签', { status: 400 })
    }
    effective = trimmed
  }

  const position = requirePosition(db, ledgerId, stockCode)
  // 0 手但本轮还没归档（减仓减到 0）时仍可改标签 —— 与持仓列表"还在列表里"同一口径
  if (position.quantity <= 0 && !stockHasOpenRound(db, ledgerId, stockCode)) {
    throw new AppError('该股票已清仓，请在「交易历史」中改本轮标签', { status: 404 })
  }
  position.tag = effective
  try {
    updatePosition(db, position)
  } catch (error) {
    throw databaseFailure('保存持仓标签失败', error)
  }
  const dto = positionDto(position)
  dto.tag = effectivePositionTag(position.tag)
  return dto
}
