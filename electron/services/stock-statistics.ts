/**
 * 股票统计读层：逐笔结算统计 / 分组统计 / 筛选（月区间、最近 N 笔、标签）。
 *
 * 逐条移植自旧版 `tr-service/src/stock_statistics.rs`。模块文档里的口径一条不改：
 *
 * **时间轴 = 建仓时间。** 一轮的锚点是它**首次建仓**的委托时间（`round.openedAt`）：排序、
 * 月份区间与「最近 N 笔」的日期、资金事件（追加本金 / 支取）的插值时点、明细表与曲线上的
 * 日期，用的都是它。清仓时间仍带在点上（`closedAt`），只是不再决定顺序 —— 后建仓的一轮可能
 * 先清仓，按清仓排会把两轮的先后关系颠倒。
 *
 * 统计口径：
 * * 胜率 = 盈利笔数 ÷ 总笔数（**平局计入总笔数**，不计胜负）；
 * * 平均盈利 / 平均亏损分别只按盈利笔与亏损笔求和取平均，亏损金额取正数；
 * * 盈亏比 = 平均盈利 ÷ 平均亏损（**无亏损样本时为 `null`**）；
 * * 期望值 = 累计盈亏 ÷ 总笔数；
 * * 最大回撤按每轮**建仓时点**的总资产曲线（当时本金 + 累计已结算盈亏 + 累计利息归本 −
 *   当时累计支取）从高点跌落的幅度计算；本金追加 / 支取按记录日期参与时序，占本金比例使用
 *   **当时的本金**；
 * * 带筛选（月份区间 / 最近 N 笔 / 标签）时**区间内从 1 起重新编号**，累计盈亏、胜率、
 *   平均盈亏、回撤全部按筛选集合独立重算；
 * * 标签先过滤轮次，使「最近 N 笔」取该标签内的最近 N 笔。
 *
 * 统计策略只决定"入选的这批结算怎么切成点"，上面每一条口径都不变：
 * * 逐笔累计（默认）：第 i 个点 = 第 1..=i 笔的累计值，`points` 是一条完整的递进曲线；
 * * 分组统计：每 N 笔一组、组间互不重叠，每个组点是**该组自己**的统计；组点放在 `groups` 里，
 *   而 `points` **照旧算出来**（顶部合计与「明细」分栏读的都是它）。最后一组不足 N 笔时按
 *   实际笔数收尾，不做补齐。
 *
 * 0 手的标记成交（清仓"只归档"那一笔）不算成交：笔数与金额都不该被它带偏。
 */

import { daysInMonth } from '../../shared/domain/calendar'
import {
  STOCK_EVENT_ADD_PRINCIPAL,
  STOCK_EVENT_INTEREST_PRINCIPAL,
  STOCK_EVENT_WITHDRAW,
} from '../../shared/domain/consts'
import {
  type StatisticsFilter,
  createStatisticsFilter,
  defaultStatisticsFilter,
  validateFilter,
} from '../../shared/domain/statistics'
import { AppError } from '../../shared/errors'
import type {
  StockStatisticsDto,
  StockStatisticsPointDto,
} from '../../shared/types/stock-statistics'
import type { Db } from '../db/driver'
import { listAllFundRecords } from '../db/dao/stock-fund'
import {
  type StockTradeRound,
  listTradeHistories,
  listTradeRoundsByStock,
  listTradesByRound,
} from '../db/dao/stock-trade'
import { logError } from '../logging'
import { getOrCreateAccount, getTradeTags, unixToDate } from './stock-account'
import { ensureTradeHistoryBackfill, percentOf, roundPnl } from './stock-history'

/** 把非 `AppError` 的异常折成旧版的 `Database` 错误（500），并记日志。 */
function databaseFailure(message: string, error: unknown): AppError {
  if (error instanceof AppError) return error
  logError(`${message}, err: ${String(error)}`)
  return new AppError(message, { status: 500 })
}

/** Rust `f64::round`：四舍五入、远离零。JS `Math.round` 对负数半值朝 +∞，不能直接用。 */
function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value)
}

/** 字符串比较：与 Rust 的 `str::cmp`（按字节）在 ASCII 上一致。 */
function compareText(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

/** 一条已归档的完整结算（一次「建仓 → 清仓」轮次）及其盈亏。 */
export interface SettleEvent {
  round: StockTradeRound
  stockName: string
  pnl: number
  pnlRate: number
  tradeCount: number
}

/** 结算统计时序中的一步：资金事件或一笔结算。 */
interface StatAction {
  date: string
  /** 0 = 资金事件，1 = 结算事件（**同日资金先于结算**） */
  order: number
  flowIndex: number | null
  eventIndex: number
}

/** 一笔本金追加 / 支取 / 利息归本；`withdraw` 与 `interest` 都记为正数金额。 */
interface CapitalFlow {
  date: string
  add: number
  withdraw: number
  /** 利息归本（只增加总资产，不改本金口径） */
  interest: number
  createdAt: number
  id: string
}

/**
 * 分组口径下一组的累加器（逐笔累计口径不用它）。
 *
 * 与逐笔累计唯一的差别是**起点**：组的累计盈亏从 0 起步，回撤只看组内那条曲线的峰谷。
 * 组内每笔的算法与全量那条完全一致（平局计入笔数、盈亏分别求和、回撤取峰值回落）。
 */
export class GroupAcc {
  /** 组内笔数（末组可能不足 `groupSize`） */
  count = 0
  win = 0
  loss = 0
  winSum = 0
  lossSum = 0
  /** 组内盈亏合计（平局记 0，但仍计入 `count`） */
  pnl = 0
  /** 组内累计盈亏曲线的当前值 / 峰值 / 最大回落，都从 0 起步 */
  cum = 0
  peak = 0
  drawdown = 0

  /** 收一笔结算（调用顺序必须与结算时序一致）。 */
  push(pnl: number): void {
    this.count += 1
    this.pnl += pnl
    if (pnl > 0) {
      this.win += 1
      this.winSum += pnl
    } else if (pnl < 0) {
      this.loss += 1
      this.lossSum += -pnl
    }
    this.cum += pnl
    if (this.cum > this.peak) this.peak = this.cum
    const drawdown = this.peak - this.cum
    if (drawdown > this.drawdown) this.drawdown = drawdown
  }

  /**
   * 收尾成一个统计点：`anchor` 是本组**最后一笔**的结算事件，`sequence` 是该笔在入选集合
   * 里的序号，`principalAt` 是那时的本金（回撤率的分母）。
   */
  finish(anchor: SettleEvent, sequence: number, principalAt: number): StockStatisticsPointDto {
    const point: StockStatisticsPointDto = {
      sequence,
      span: this.count,
      openedAt: anchor.round.openedAt,
      closedAt: anchor.round.closedAt,
      stockCode: anchor.round.stockCode,
      stockName: anchor.stockName,
      stockRoundNo: anchor.round.roundNo,
      tag: anchor.round.tag,
      pnl: anchor.pnl,
      pnlRate: anchor.pnlRate,
      tradeCount: anchor.tradeCount,
      totalPnl: this.pnl,
      winCount: this.win,
      lossCount: this.loss,
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
      pnlRatio: null,
      expectancy: 0,
      maxDrawdown: this.drawdown,
      maxDrawdownPct: 0,
    }
    if (this.count > 0) {
      point.winRate = percentOf(this.win, this.count)
      // 期望值 = 组内盈亏合计 ÷ 组内笔数（与全量的"累计盈亏 ÷ 总笔数"同一条式子）
      point.expectancy = roundHalfAwayFromZero(this.pnl / this.count)
    }
    if (this.win > 0) {
      point.avgWin = roundHalfAwayFromZero(this.winSum / this.win)
    }
    if (this.loss > 0) {
      point.avgLoss = roundHalfAwayFromZero(this.lossSum / this.loss)
      point.pnlRatio = point.avgWin > 0 ? point.avgWin / point.avgLoss : 0
    }
    if (principalAt > 0) point.maxDrawdownPct = percentOf(this.drawdown, principalAt)
    return point
  }
}

// ---------------------------------------------------------------- 入口

/** 全量逐笔结算统计（自第 1 笔起累计口径）。 */
export function getStatistics(db: Db, ledgerId: string): StockStatisticsDto {
  return getStatisticsFor(db, ledgerId, defaultStatisticsFilter())
}

/**
 * 筛选统计：时间范围（含首尾整月）与最近 N 笔二选一，两者均可与交易标签叠加；
 * 统计口径（逐笔累计 / 分组统计）见 `shared/domain/statistics`。
 *
 * 自洽规则由 `validateFilter` 判（错误折成 400），这里只做"数据库相关"的两件 ——
 * 标签必须存在、月份区间要能解析成日。
 */
export function getStatisticsFor(
  db: Db,
  ledgerId: string,
  filter: StatisticsFilter,
): StockStatisticsDto {
  try {
    validateFilter(filter)
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : String(error), { status: 400 })
  }

  // 旧版用的是**原始** `filter.tag`（不 trim）：空白标签不会在这里被当成"不限"
  const tag = filter.tag
  try {
    if (tag !== '') {
      const availableTags = getTradeTags(db, ledgerId)
      if (!availableTags.includes(tag)) throw new AppError('无效的交易标签', { status: 400 })
    }
    const [fromDay, toDay] = normalizeStatisticsMonthRange(filter.startMonth, filter.endMonth)
    return statistics(db, ledgerId, filter, fromDay, toDay)
  } catch (error) {
    throw databaseFailure('读取股票统计失败', error)
  }
}

/**
 * 四个裸字段形状的适配器（**与 wire 请求同形**）。固定逐笔累计口径；要分组口径用
 * {@link getStatisticsFor} 收一个 `StatisticsFilter`。
 *
 * `recent === 0` 是"不限"；**负数要原样交给判据**（它才管得了"必须为正整数"这条）。
 */
export function getStatisticsRange(
  db: Db,
  ledgerId: string,
  startMonth: string,
  endMonth: string,
  recent: number,
  tag: string,
): StockStatisticsDto {
  return getStatisticsFor(
    db,
    ledgerId,
    createStatisticsFilter(startMonth, endMonth, recent !== 0 ? recent : null, tag),
  )
}

// ---------------------------------------------------------------- 实现

function statistics(
  db: Db,
  ledgerId: string,
  filter: StatisticsFilter,
  fromDay: string,
  toDay: string,
): StockStatisticsDto {
  const recent = filter.recent ?? 0
  const tag = filter.tag
  const strategy = filter.strategy
  const groupSize = filter.groupSize ?? 0

  ensureTradeHistoryBackfill(db, ledgerId)
  const histories = listTradeHistories(db, ledgerId)

  const events: SettleEvent[] = []
  for (const history of histories) {
    const rounds = listTradeRoundsByStock(db, ledgerId, history.stockCode)
    for (const round of rounds) {
      // 0 手的标记成交（清仓"只归档"那一笔）不算成交：笔数与金额都不该被它带偏
      const trades = listTradesByRound(db, round.id).filter((trade) => trade.shares > 0)
      const { pnl, pnlRate } = roundPnl(trades)
      events.push({
        stockName: history.stockName,
        round,
        pnl,
        pnlRate,
        tradeCount: trades.length,
      })
    }
  }
  if (tag !== '') {
    for (let index = events.length - 1; index >= 0; index -= 1) {
      if (events[index].round.tag !== tag) events.splice(index, 1)
    }
  }

  // 稳定排序：**建仓时间** → 清仓时间 → createdAt → id
  // （后两档是同值兜底；「同日建仓」时先清仓的排前面，读起来仍是那一批的先后）
  events.sort((left, right) => {
    return (
      left.round.openedAt - right.round.openedAt ||
      left.round.closedAt - right.round.closedAt ||
      left.round.createdAt - right.round.createdAt ||
      compareText(left.round.id, right.round.id)
    )
  })

  const account = getOrCreateAccount(db, ledgerId)
  const flows = listCapitalFlows(db, ledgerId)
  // 初始本金 = 当前本金 − 全部「追加本金」；本金追加/支取按记录日期参与时序重放
  let initialPrincipal = account.principal
  for (const flow of flows) initialPrincipal -= flow.add

  const totalEvents = events.length
  let includedTotal = 0
  events.forEach((event, index) => {
    const date = unixToDate(event.round.openedAt)
    if (includeStatisticsEvent(date, index, totalEvents, fromDay, toDay, recent)) {
      includedTotal += 1
    }
  })

  const result: StockStatisticsDto = {
    principal: account.principal,
    roundCount: includedTotal,
    points: [],
    groups: [],
  }
  if (includedTotal === 0) return result

  const useWindow = fromDay !== '' || recent > 0 || tag !== ''
  const grouped = strategy === 'grouped'
  // 分组口径的组点（逐笔累计口径下始终为空）；groupSize 已由 validateFilter 保证 >= 2
  const groups: StockStatisticsPointDto[] = []
  let groupAcc = new GroupAcc()

  // 资金事件与结算事件按日期合成同一条时序，保证本金追加/支取在正确时点影响总资产峰值与回撤
  // （结算事件落在**建仓日**上）
  const actions: StatAction[] = []
  flows.forEach((flow, index) => {
    actions.push({ date: flow.date, order: 0, flowIndex: index, eventIndex: 0 })
  })
  events.forEach((event, index) => {
    actions.push({
      date: unixToDate(event.round.openedAt),
      order: 1,
      flowIndex: null,
      eventIndex: index,
    })
  })
  // 稳定排序：date → order（同日资金先于结算）
  actions.sort(
    (left, right) => compareText(left.date, right.date) || left.order - right.order,
  )

  let totalCount = 0
  let winCount = 0
  let lossCount = 0
  let winSum = 0
  let lossSum = 0 // 亏损金额合计（正数）
  let cumPnl = 0
  let principalAt = initialPrincipal
  let withdrawnAt = 0
  // 累计利息归本：进总资产，但不进本金口径（最大回撤率的分母保持"投入本金"）
  let interestAt = 0
  // 总资产曲线：从「初始本金」起步（principalAt + interestAt + cumPnl − withdrawnAt）
  let equity = principalAt + interestAt + cumPnl - withdrawnAt
  let peakEquity = equity
  let maxDrawdown = 0

  let windowCount = 0 // 区间内笔数（区间内从 1 重新编号）
  let windowWinCount = 0
  let windowLossCount = 0
  let windowWinSum = 0
  let windowLossSum = 0 // 区间内亏损金额合计（正数）
  let windowCumPnl = 0
  let windowPeakPnl = 0
  let windowMaxDrawdown = 0

  for (const action of actions) {
    if (action.flowIndex !== null) {
      const flow = flows[action.flowIndex]
      principalAt += flow.add
      withdrawnAt += flow.withdraw
      interestAt += flow.interest
      equity = principalAt + interestAt + cumPnl - withdrawnAt
      if (equity > peakEquity) peakEquity = equity
      const drawdown = peakEquity - equity
      if (drawdown > maxDrawdown) maxDrawdown = drawdown
      continue
    }

    const event = events[action.eventIndex]
    const date = unixToDate(event.round.openedAt)
    if (!includeStatisticsEvent(date, action.eventIndex, totalEvents, fromDay, toDay, recent)) {
      continue
    }

    totalCount += 1
    windowCount += 1
    cumPnl += event.pnl
    windowCumPnl += event.pnl
    if (event.pnl > 0) {
      winCount += 1
      winSum += event.pnl
      windowWinCount += 1
      windowWinSum += event.pnl
    } else if (event.pnl < 0) {
      lossCount += 1
      lossSum += -event.pnl
      windowLossCount += 1
      windowLossSum += -event.pnl
    }
    // 区间回撤曲线：从 0 起步逐笔累计区间盈亏，追踪该曲线峰值的最大回落
    if (windowCumPnl > windowPeakPnl) windowPeakPnl = windowCumPnl
    const windowDrawdown = windowPeakPnl - windowCumPnl
    if (windowDrawdown > windowMaxDrawdown) windowMaxDrawdown = windowDrawdown
    // 当时总资产 = 当时本金 + 累计利息归本 + 累计已结算盈亏 − 当时累计支取（全量口径）
    equity = principalAt + interestAt + cumPnl - withdrawnAt
    if (equity > peakEquity) peakEquity = equity
    const drawdown = peakEquity - equity
    if (drawdown > maxDrawdown) maxDrawdown = drawdown

    const stats: {
      sequence: number
      statCount: number
      total: number
      wins: number
      losses: number
      winAmountSum: number
      lossAmountSum: number
      drawdown: number
    } = useWindow
      ? {
          sequence: windowCount,
          statCount: windowCount,
          total: windowCumPnl,
          wins: windowWinCount,
          losses: windowLossCount,
          winAmountSum: windowWinSum,
          lossAmountSum: windowLossSum,
          drawdown: windowMaxDrawdown,
        }
      : {
          sequence: totalCount,
          statCount: totalCount,
          total: cumPnl,
          wins: winCount,
          losses: lossCount,
          winAmountSum: winSum,
          lossAmountSum: lossSum,
          drawdown: maxDrawdown,
        }

    const point: StockStatisticsPointDto = {
      sequence: stats.sequence,
      // 累计口径下"本点覆盖 1..=sequence 笔"（区间内重新编号后同样成立）
      span: stats.sequence,
      openedAt: event.round.openedAt,
      closedAt: event.round.closedAt,
      stockCode: event.round.stockCode,
      stockName: event.stockName,
      stockRoundNo: event.round.roundNo,
      tag: event.round.tag,
      pnl: event.pnl,
      pnlRate: event.pnlRate,
      tradeCount: event.tradeCount,
      totalPnl: stats.total,
      winCount: stats.wins,
      lossCount: stats.losses,
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
      pnlRatio: null,
      expectancy: 0,
      maxDrawdown: stats.drawdown,
      maxDrawdownPct: 0,
    }
    if (stats.statCount > 0) point.winRate = percentOf(stats.wins, stats.statCount)
    if (stats.wins > 0) point.avgWin = roundHalfAwayFromZero(stats.winAmountSum / stats.wins)
    if (stats.losses > 0) {
      point.avgLoss = roundHalfAwayFromZero(stats.lossAmountSum / stats.losses)
      point.pnlRatio = point.avgWin > 0 ? point.avgWin / point.avgLoss : 0
    }
    if (stats.statCount > 0) {
      // 期望值 = 胜率 × 平均盈利 − 亏损率 × 平均亏损 = 累计盈亏 ÷ 总笔数
      point.expectancy = roundHalfAwayFromZero(stats.total / stats.statCount)
    }
    if (principalAt > 0) point.maxDrawdownPct = percentOf(stats.drawdown, principalAt)
    result.points.push(point)

    // 分组口径：每 groupSize 笔收一组，最后一组不足也收（不做补齐）。
    // 分组**不改**上面那条逐笔累计序列，只额外产出 groups。
    if (grouped) {
      groupAcc.push(event.pnl)
      if (windowCount % groupSize === 0 || windowCount === includedTotal) {
        groups.push(groupAcc.finish(event, windowCount, principalAt))
        groupAcc = new GroupAcc()
      }
    }
  }
  result.groups = groups
  return result
}

// ---------------------------------------------------------------- 资金时序

/** 返回账本全部「追加本金 / 支取 / 利息归本」记录，按日期升序（同日按创建时间、再按 ID）。 */
function listCapitalFlows(db: Db, ledgerId: string): CapitalFlow[] {
  const flows: CapitalFlow[] = []
  for (const record of listAllFundRecords(db, ledgerId)) {
    switch (record.eventType) {
      case STOCK_EVENT_ADD_PRINCIPAL:
        flows.push({
          date: record.recordDate,
          add: record.amountChange,
          withdraw: 0,
          interest: 0,
          createdAt: record.createdAt,
          id: record.id,
        })
        break
      case STOCK_EVENT_WITHDRAW:
        flows.push({
          date: record.recordDate,
          add: 0,
          // amountChange 为负数，取反得到正数支取额
          withdraw: -record.amountChange,
          interest: 0,
          createdAt: record.createdAt,
          id: record.id,
        })
        break
      case STOCK_EVENT_INTEREST_PRINCIPAL:
        flows.push({
          date: record.recordDate,
          add: 0,
          withdraw: 0,
          // amountChange 为正数
          interest: record.amountChange,
          createdAt: record.createdAt,
          id: record.id,
        })
        break
      default:
        break
    }
  }
  flows.sort(
    (left, right) =>
      compareText(left.date, right.date) ||
      left.createdAt - right.createdAt ||
      compareText(left.id, right.id),
  )
  return flows
}

// ---------------------------------------------------------------- 筛选与月份

/**
 * 判断某笔结算是否落入当前筛选：
 * `recent > 0` 时取排序后最近 N 笔；`fromDay` 非空时按**建仓日期**区间（含首尾日）判断。
 */
export function includeStatisticsEvent(
  date: string,
  index: number,
  total: number,
  fromDay: string,
  toDay: string,
  recent: number,
): boolean {
  if (recent > 0) return index >= total - recent
  if (fromDay !== '') return date >= fromDay && date <= toDay
  return true
}

/**
 * 校验起止月份（`YYYY-MM`）并返回首尾两天的日期边界。
 *
 * 两端必须同时提供、格式必须是严格 `YYYY-MM`、`end_month` 不能早于 `start_month`；
 * 返回 `[当月 1 日, 末月最后一天]`（两端都空则返回两个空串 = 不限）。
 */
export function normalizeStatisticsMonthRange(
  startMonth: string,
  endMonth: string,
): [string, string] {
  if (startMonth === '' && endMonth === '') return ['', '']
  if (startMonth === '' || endMonth === '') {
    throw new AppError('start_month 与 end_month 需同时提供（格式 YYYY-MM）', { status: 400 })
  }
  const start = parseStrictMonth(startMonth)
  if (start === null) throw new AppError('start_month 格式应为 YYYY-MM', { status: 400 })
  const end = parseStrictMonth(endMonth)
  if (end === null) throw new AppError('end_month 格式应为 YYYY-MM', { status: 400 })
  if (start.year > end.year || (start.year === end.year && start.month > end.month)) {
    throw new AppError('end_month 不能早于 start_month', { status: 400 })
  }
  const lastDay = daysInMonth(end.year, end.month)
  return [
    `${String(start.year).padStart(4, '0')}-${String(start.month).padStart(2, '0')}-01`,
    `${String(end.year).padStart(4, '0')}-${String(end.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  ]
}

/** 严格解析 `YYYY-MM`，返回 `{ year, month }`；格式或取值非法时返回 `null`。 */
function parseStrictMonth(raw: string): { year: number; month: number } | null {
  if (!/^[0-9]{4}-[0-9]{2}$/.test(raw)) return null
  const year = Number(raw.slice(0, 4))
  const month = Number(raw.slice(5, 7))
  if (!Number.isInteger(year) || !Number.isInteger(month)) return null
  if (month < 1 || month > 12) return null
  return { year, month }
}
