/**
 * 股票交易历史读层：集合列表 / 单股详情 / 总览，以及存量交易的「建仓 → 清仓」回填。
 *
 * 逐条移植自既有实现 的历史与详情段
 * （`ensure_trade_history_backfill` / `ensure_stock_history_backfill` /
 * `derive_trade_cycles` / `list_trade_histories` / `build_history_dto` /
 * `get_trade_history_detail` / `get_trade_history_summary` / `attach_history_quotes` /
 * `round_pnl` / `percent_of`）。
 *
 * 口径不能改：
 *
 * * **回填只归档已经结束的轮次**：只有清仓结束一轮；减仓减到 0 手不算（那一轮还挂在持仓上）；
 *   在建轮次保持未挂接，清仓时再归档。回填幂等：每次只处理 `round_id` 为空的交易。
 * * **列表顺序**：DAO 先按 `updated_at DESC, created_at DESC` 取出，再按 `lastClosedAt` 倒序
 *   **稳定排序**（同值时保持 DAO 顺序）。
 * * **盈亏**：买入成本 = Σ(成交额 + 费用)，卖出净额 = Σ(成交额 − 费用)，盈亏 = 卖出净额 −
 *   买入成本；盈亏率 = 盈亏 ÷ 买入成本（%）。
 * * **0 手的标记成交**（清仓时"只归档"那一笔）在详情里不算成交（不进列表、不计 `tradeCount`），
 *   但集合列表与总览沿用既有的 `round_pnl` 全量口径（那笔金额 / 费用为 0）。
 * * 金额恒为整数分，价格恒为整数厘；百分比是百分数（`12.5` = 12.5%）。
 *
 * 行情源作为参数注入（{@link StockQuoteFetcher}），与持仓服务同一套端口；因为 Node 的网络
 * API 是异步的，{@link listTradeHistories} 返回 `Promise`（既有是同步）。
 *
 * 每日复盘的 DAO 尚未随本切片移植：`list_day_reviews_by_stock` 按既有 DAO 的同一条 SQL
 * （表 / 列 / `round_id` 分组 / 日期倒序）就地读取，等每日复盘切片落地后再收进 DAO。
 */

import { randomUUID } from 'node:crypto'

import {
  STOCK_TAG_ANALYSIS,
  STOCK_TRADE_ADD,
  STOCK_TRADE_CLOSE,
  STOCK_TRADE_OPEN,
  STOCK_TRADE_REDUCE,
} from '../../shared/domain/consts'
import type { StockTrade } from '../../shared/domain/models'
import { nextRoundNo } from '../../shared/domain/stock'
import { AppError } from '../../shared/errors'
import type {
  StockTradeDto,
  StockTradeHistoryDetailDto,
  StockTradeHistoryDto,
  StockTradeHistorySummaryDto,
  StockTradeRoundDto,
} from '../../shared/types/stock-history'
import type { StockDayReviewDto, StockQuoteDto } from '../../shared/types/stock-position'
import type { Db } from '../db/driver'
import {
  type StockTradeHistory,
  countTradeRounds,
  createTradeHistory,
  createTradeRound,
  getTradeHistory,
  listTradeHistories as listTradeHistoryRows,
  listTradeRoundsByStock,
  listTradeStocks,
  listTradesAsc,
  listTradesByRound,
  updateTradesRoundId,
} from '../db/dao/stock-trade'
import { logError } from '../logging'
import type { StockQuoteFetcher } from './stock-quote'

/** 把非 `AppError` 的异常折成既有的 `Database` 错误（500），并记日志。 */
function databaseFailure(message: string, error: unknown): AppError {
  if (error instanceof AppError) return error
  logError(`${message}, err: ${String(error)}`)
  return new AppError(message, { status: 500 })
}

/** 既有 DAO 以 404 表示"查无此行"。 */
function isNotFound(error: unknown): boolean {
  return error instanceof AppError && error.status === 404
}

/** `f64::round`：四舍五入、远离零。JS `Math.round` 对负数半值朝 +∞，不能直接用。 */
function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value)
}

/**
 * 占比百分比：`round(part / whole * 10000) / 100`（保留两位小数）。
 *
 * `whole <= 0` 时返回 `0`（既有 `percent_of` 的防除零分支）；调用点仍各自保留
 * `whole > 0` 守卫。
 */
export function percentOf(part: number, whole: number): number {
  if (whole <= 0) return 0
  return roundHalfAwayFromZero((part / whole) * 10_000) / 100
}

/** 一轮的盈亏、盈亏率（%）与买入成本（分）。 */
export interface RoundPnl {
  /** 盈亏（分） */
  pnl: number
  /** 盈亏率（%）；买入成本为 0 时为 0 */
  pnlRate: number
  /** 买入成本（分，含费用） */
  buyCost: number
}

/**
 * 由一轮交易推导本轮盈亏与盈亏率（既有 `dto::round_pnl`）。
 *
 * 买入成本 = Σ(成交金额 + 费用)；卖出净额 = Σ(成交金额 − 费用)；盈亏 = 卖出净额 − 买入成本。
 * 盈亏率按买入成本计算，四舍五入到小数点后两位。
 */
export function roundPnl(trades: readonly StockTrade[]): RoundPnl {
  let pnl = 0
  let buyCost = 0
  for (const trade of trades) {
    switch (trade.tradeType) {
      case STOCK_TRADE_OPEN:
      case STOCK_TRADE_ADD:
        buyCost += trade.amount + trade.fee
        break
      case STOCK_TRADE_REDUCE:
      case STOCK_TRADE_CLOSE:
        pnl += trade.amount - trade.fee
        break
      default:
        break
    }
  }
  pnl -= buyCost
  const pnlRate = buyCost > 0 ? roundHalfAwayFromZero((pnl / buyCost) * 10_000) / 100 : 0
  return { pnl, pnlRate, buyCost }
}

// ---------------------------------------------------------------- 历史回填

/** 一轮「建仓 → 清仓」的原始交易。 */
export interface TradeCycle {
  ids: string[]
  openedAt: number
  closedAt: number
}

/**
 * 把按时间升序的交易流切分为**已经结束的**轮次（既有 `derive_trade_cycles`）：
 *
 * * 建仓 / 加仓 / 减仓：开一轮（若还没有当前轮）并收进当前轮 —— 减仓**不**结束一轮；
 * * 清仓：若还没有当前轮则先开一轮，收进清仓这笔并记下 `closedAt`，然后结束当前轮；
 * * 其它类型忽略；
 * * 只返回 `closedAt > 0` 的轮次 —— 在建轮次保持未挂接。
 */
export function deriveTradeCycles(trades: readonly StockTrade[]): TradeCycle[] {
  const pending: TradeCycle[] = []
  let current: number | null = null
  const start = (at: number): void => {
    if (current === null) {
      pending.push({ ids: [], openedAt: at, closedAt: 0 })
      current = pending.length - 1
    }
  }
  for (const trade of trades) {
    switch (trade.tradeType) {
      case STOCK_TRADE_OPEN:
      case STOCK_TRADE_ADD:
      case STOCK_TRADE_REDUCE:
        start(trade.tradeTime)
        if (current !== null) pending[current].ids.push(trade.id)
        break
      case STOCK_TRADE_CLOSE:
        start(trade.tradeTime)
        if (current !== null) {
          pending[current].ids.push(trade.id)
          pending[current].closedAt = trade.tradeTime
        }
        current = null
        break
      default:
        break
    }
  }
  return pending.filter((cycle) => cycle.closedAt > 0)
}

/**
 * 为有交易记录但尚无历史集合的股票补齐历史（幂等）。
 *
 * 与既有一致：逐只股票调用 {@link ensureStockHistoryBackfill}，第一处失败即向上抛。
 */
export function ensureTradeHistoryBackfill(db: Db, ledgerId: string): void {
  try {
    for (const stockCode of listTradeStocks(db, ledgerId)) {
      ensureStockHistoryBackfill(db, ledgerId, stockCode)
    }
  } catch (error) {
    throw databaseFailure('回填交易历史失败', error)
  }
}

/**
 * 把某只股票尚未挂接轮次的存量交易按「建仓 → 清仓」切分并归档（旧
 * `ensure_stock_history_backfill`）。
 *
 * 幂等：每次只处理 `roundId === ''` 的交易；全部挂接后直接返回。尚无完整轮次（在建）时
 * **不建历史集合**。轮次号从该历史集合已有轮次数继续。
 */
export function ensureStockHistoryBackfill(db: Db, ledgerId: string, stockCode: string): void {
  try {
    const trades = listTradesAsc(db, ledgerId, stockCode)
    const unattached = trades.filter((trade) => trade.roundId === '')
    if (unattached.length === 0) return

    const cycles = deriveTradeCycles(unattached)
    let history: StockTradeHistory
    try {
      history = getTradeHistory(db, ledgerId, stockCode)
    } catch (error) {
      if (!isNotFound(error)) throw error
      if (cycles.length === 0) return // 尚无完整轮次（在建），不建历史集合
      history = {
        id: randomUUID(),
        ledgerId,
        stockCode,
        stockName: unattached[0].stockName,
        createdAt: 0,
        updatedAt: 0,
      }
      createTradeHistory(db, history)
    }
    if (cycles.length === 0) return

    const count = countTradeRounds(db, history.id)
    cycles.forEach((cycle, index) => {
      const round = {
        id: randomUUID(),
        ledgerId,
        stockCode,
        historyId: history.id,
        roundNo: nextRoundNo(count, index),
        openedAt: cycle.openedAt,
        closedAt: cycle.closedAt,
        tag: STOCK_TAG_ANALYSIS,
        review: '',
        createdAt: 0,
      }
      createTradeRound(db, round)
      updateTradesRoundId(db, round.id, cycle.ids)
    })
  } catch (error) {
    throw databaseFailure('回填交易历史失败', error)
  }
}

// ---------------------------------------------------------------- DTO 映射

function tradeDto(trade: StockTrade): StockTradeDto {
  const dto: StockTradeDto = {
    id: trade.id,
    ledgerId: trade.ledgerId,
    stockCode: trade.stockCode,
    stockName: trade.stockName,
    tradeType: trade.tradeType,
    roundId: trade.roundId,
    orderId: trade.orderId,
    orderSeq: trade.orderSeq,
    price: trade.price,
    lots: trade.lots,
    shares: trade.shares,
    amount: trade.amount,
    fee: trade.fee,
    commission: trade.commission,
    stampDuty: trade.stampDuty,
    transferFee: trade.transferFee,
    realizedPnl: trade.realizedPnl,
    tradeTime: trade.tradeTime,
    remark: trade.remark,
  }
  if (trade.roundFee) dto.roundFee = trade.roundFee
  return dto
}

/** 某股**全部轮次**的每日复盘，按 `roundId` 分组（当前轮 `round_id = ''` 不在此列）。 */
function dayReviewsByRound(
  db: Db,
  ledgerId: string,
  stockCode: string,
): Map<string, StockDayReviewDto[]> {
  const rows = db
    .prepare(
      'SELECT round_id, review_date, review FROM stock_day_review ' +
        'WHERE ledger_id = ? AND stock_code = ? ORDER BY round_id ASC, review_date DESC',
    )
    .all(ledgerId, stockCode) as unknown as Array<{
    round_id: string
    review_date: string
    review: string
  }>

  const grouped = new Map<string, StockDayReviewDto[]>()
  for (const row of rows) {
    // 当前轮的行（`round_id = ''`）不属于任何已归档轮次
    if (row.round_id === '') continue
    const item: StockDayReviewDto = { date: row.review_date, review: row.review }
    const reviews = grouped.get(row.round_id)
    if (reviews) reviews.push(item)
    else grouped.set(row.round_id, [item])
  }
  return grouped
}

/** 汇总单只股票的轮次数、累计盈亏与最近清仓时间（既有 `build_history_dto`）。 */
function buildHistoryDto(db: Db, history: StockTradeHistory): StockTradeHistoryDto {
  const rounds = listTradeRoundsByStock(db, history.ledgerId, history.stockCode)
  const item: StockTradeHistoryDto = {
    id: history.id,
    ledgerId: history.ledgerId,
    stockCode: history.stockCode,
    stockName: history.stockName,
    roundCount: rounds.length,
    totalPnl: 0,
    totalPnlRate: 0,
    lastClosedAt: 0,
    createdAt: history.createdAt,
    updatedAt: history.updatedAt,
  }
  let totalPnl = 0
  let totalBuyCost = 0
  for (const round of rounds) {
    // 列表口径沿用既有：不过滤 0 手的归档标记成交（那笔金额 / 费用为 0）
    const { pnl, buyCost } = roundPnl(listTradesByRound(db, round.id))
    totalPnl += pnl
    totalBuyCost += buyCost
    if (round.closedAt > item.lastClosedAt) item.lastClosedAt = round.closedAt
  }
  item.totalPnl = totalPnl
  if (totalBuyCost > 0) item.totalPnlRate = percentOf(totalPnl, totalBuyCost)
  return item
}

/** 为要显示的历史集合请求行情；行情缺失时省略 `latestPrice`（既有 `attach_history_quotes`）。 */
async function attachHistoryQuotes(
  fetcher: StockQuoteFetcher,
  items: StockTradeHistoryDto[],
): Promise<void> {
  if (items.length === 0) return
  let quotes: Map<string, StockQuoteDto>
  try {
    quotes = await fetcher.fetchQuotes(items.map((item) => item.stockCode))
  } catch (error) {
    // 行情端口本该"失败返回空映射"；这里再兜一层，外部数据永远不阻塞历史页。
    logError(`查询股票行情失败: ${String(error)}`)
    return
  }
  for (const item of items) {
    const quote = quotes.get(item.stockCode)
    if (quote && quote.latestPrice > 0) item.latestPrice = quote.latestPrice
  }
}

// ---------------------------------------------------------------- 读层

/**
 * 交易历史集合列表（左栏）。
 *
 * 先补回填，再按 DAO 的 `updated_at DESC, created_at DESC` 取出，最后按 `lastClosedAt`
 * **倒序稳定排序**（同值保持 DAO 顺序）。`fetcher` 由调用方注入。
 */
export async function listTradeHistories(
  db: Db,
  ledgerId: string,
  fetcher: StockQuoteFetcher,
): Promise<StockTradeHistoryDto[]> {
  try {
    ensureTradeHistoryBackfill(db, ledgerId)
    const items = listTradeHistoryRows(db, ledgerId).map((history) => buildHistoryDto(db, history))
    await attachHistoryQuotes(fetcher, items)
    // JS 的 `Array#sort` 是稳定排序：同值时保持 DAO 顺序（与 的稳定排序一致）
    items.sort((left, right) => right.lastClosedAt - left.lastClosedAt)
    return items
  } catch (error) {
    throw databaseFailure('读取交易历史失败', error)
  }
}

/**
 * 单只股票的交易历史详情（右栏）：全部轮次 + 每轮交易 + 每轮每日复盘 + 汇总盈亏。
 *
 * 0 手的标记成交（清仓"只归档"那一笔）不进列表，也不计 `tradeCount`。
 */
export function getTradeHistoryDetail(
  db: Db,
  ledgerId: string,
  stockCode: string,
): StockTradeHistoryDetailDto {
  try {
    let history: StockTradeHistory
    try {
      history = getTradeHistory(db, ledgerId, stockCode)
    } catch (error) {
      if (isNotFound(error)) throw new AppError('该股票暂无交易历史', { status: 404 })
      throw error
    }

    const rounds = listTradeRoundsByStock(db, ledgerId, stockCode)
    const dayByRound = dayReviewsByRound(db, ledgerId, stockCode)

    const detail: StockTradeHistoryDetailDto = {
      id: history.id,
      ledgerId: history.ledgerId,
      stockCode: history.stockCode,
      stockName: history.stockName,
      roundCount: 0,
      totalPnl: 0,
      totalPnlRate: 0,
      winCount: 0,
      lossCount: 0,
      lastClosedAt: 0,
      rounds: [],
    }
    let totalPnl = 0
    let totalBuyCost = 0
    for (const round of rounds) {
      const trades = listTradesByRound(db, round.id).filter((trade) => trade.shares > 0)
      const { pnl, pnlRate, buyCost } = roundPnl(trades)
      totalPnl += pnl
      totalBuyCost += buyCost
      if (round.closedAt > detail.lastClosedAt) detail.lastClosedAt = round.closedAt
      if (pnl > 0) detail.winCount += 1
      else if (pnl < 0) detail.lossCount += 1

      const roundDto: StockTradeRoundDto = {
        id: round.id,
        historyId: round.historyId,
        roundNo: round.roundNo,
        openedAt: round.openedAt,
        closedAt: round.closedAt,
        tag: round.tag,
        review: round.review,
        pnl,
        pnlRate,
        tradeCount: trades.length,
        dayReviews: dayByRound.get(round.id) ?? [],
        trades: trades.map(tradeDto),
      }
      detail.rounds.push(roundDto)
    }
    detail.roundCount = rounds.length
    detail.totalPnl = totalPnl
    if (totalBuyCost > 0) detail.totalPnlRate = percentOf(totalPnl, totalBuyCost)
    return detail
  } catch (error) {
    throw databaseFailure('读取交易历史详情失败', error)
  }
}

/**
 * 汇总该账本全部已清仓股票：总盈亏、胜负轮次与总轮次（既有 `get_trade_history_summary`）。
 *
 * 与集合列表同一套回填与轮次口径；盈亏率的分母是全部轮次的买入成本合计。
 */
export function getTradeHistorySummary(db: Db, ledgerId: string): StockTradeHistorySummaryDto {
  try {
    ensureTradeHistoryBackfill(db, ledgerId)
    const histories = listTradeHistoryRows(db, ledgerId)

    const summary: StockTradeHistorySummaryDto = {
      stockCount: 0,
      roundCount: 0,
      winCount: 0,
      lossCount: 0,
      totalPnl: 0,
      totalPnlRate: 0,
    }
    let totalBuyCost = 0
    for (const history of histories) {
      summary.stockCount += 1
      const rounds = listTradeRoundsByStock(db, ledgerId, history.stockCode)
      for (const round of rounds) {
        // 总览沿用既有的全量 `round_pnl`（不过滤 0 手标记成交）
        const { pnl, buyCost } = roundPnl(listTradesByRound(db, round.id))
        summary.roundCount += 1
        summary.totalPnl += pnl
        totalBuyCost += buyCost
        if (pnl > 0) summary.winCount += 1
        else if (pnl < 0) summary.lossCount += 1
      }
    }
    if (totalBuyCost > 0) summary.totalPnlRate = percentOf(summary.totalPnl, totalBuyCost)
    return summary
  } catch (error) {
    throw databaseFailure('读取交易历史汇总失败', error)
  }
}
