/**
 * 股票统计读层：逐笔结算统计 / 分组统计 / 筛选（月区间、最近 N 笔、标签）。
 *
 * **时间轴 = 清仓时间。** 一轮的盈亏在**清仓**时才落地，所以排序、月份区间与
 * 「最近 N 笔」的日期都取 `round.closedAt`；`openedAt` 仍带在点上供明细展示，不再
 * 决定顺序。后建仓先清仓时，按清仓排才是真实的兑现先后。
 *
 * **回撤是现金流中性的策略回撤。** 曲线只看累计已实现盈亏（从 0 起步），追加本金 / 支取 /
 * 利息归本都不进入曲线，也不会重置峰值。回撤金额 = 盈亏曲线峰值 − 当前值；回撤率 =
 * 最大回撤 ÷（**本窗口第一笔结算时的本金** + 产生该回撤时的盈亏峰值）。本金按追加记录日期
 * 推进，但一个窗口只在起点取一次，窗口内追加不会稀释已经发生的回撤；分组口径用每组第一笔
 * 结算时的本金。带筛选时曲线改为「区间累计盈亏（从 0 起步）」，分母同样用窗口起点的本金。
 *
 * 统计口径：
 * * 胜率 = 盈利笔数 ÷ 总笔数（**平局计入总笔数**，不计胜负；`tieCount` 单独带出供展示）；
 * * 平均盈利 / 平均亏损分别只按盈利笔与亏损笔求和取平均，亏损金额取正数；
 * * 盈亏比 = 平均盈利 ÷ 平均亏损（直接用原始合计相除，**任一侧无样本时为 `null`**）；
 * * 期望值 = 累计盈亏 ÷ 总笔数；
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
import { STOCK_EVENT_ADD_PRINCIPAL } from '../../shared/domain/consts'
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

/** 字符串比较：与 的 `str::cmp`（按字节）在 ASCII 上一致。 */
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
  /** 产生最大回落时的曲线峰值（回撤率的分母要配这一档峰值） */
  drawdownPeak = 0

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
    if (drawdown > this.drawdown) {
      this.drawdown = drawdown
      this.drawdownPeak = this.peak
    }
  }

  /**
   * 收尾成一个统计点：`anchor` 是本组**最后一笔**的结算事件，`sequence` 是该笔在入选集合
   * 里的序号，`base` 是本组第一笔结算时的本金（回撤率分母的基数）。
   */
  finish(anchor: SettleEvent, sequence: number, base: number): StockStatisticsPointDto {
    const point: StockStatisticsPointDto = {
      sequence,
      span: this.count,
      openedAt: anchor.round.openedAt,
      closedAt: anchor.round.closedAt,
      roundId: anchor.round.id,
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
      tieCount: this.count - this.win - this.loss,
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
    }
    // 任一侧没有样本时没有"平均盈利 ÷ 平均亏损"可言（不是 0）
    if (this.win > 0 && this.loss > 0) {
      point.pnlRatio = this.winSum / this.win / (this.lossSum / this.loss)
    }
    const denominator = base + this.drawdownPeak
    if (denominator > 0) point.maxDrawdownPct = percentOf(this.drawdown, denominator)
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

  // 既有用的是**原始** `filter.tag`（不 trim）：空白标签不会在这里被当成"不限"
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

/** 一笔「追加本金」；回撤率的分母基数按记录日期推进。 */
interface PrincipalAdd {
  date: string
  amount: number
  createdAt: number
  id: string
}

/** 按日期升序返回追加本金记录（同日按创建时间、再按 ID）。 */
function listPrincipalAdds(db: Db, ledgerId: string): PrincipalAdd[] {
  const adds: PrincipalAdd[] = []
  for (const record of listAllFundRecords(db, ledgerId)) {
    if (record.eventType !== STOCK_EVENT_ADD_PRINCIPAL) continue
    adds.push({
      date: record.recordDate,
      amount: record.amountChange,
      createdAt: record.createdAt,
      id: record.id,
    })
  }
  adds.sort(
    (left, right) =>
      compareText(left.date, right.date) ||
      left.createdAt - right.createdAt ||
      compareText(left.id, right.id),
  )
  return adds
}

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

  // 结算顺序：**清仓时间** → 建仓时间 → createdAt → id（后三档只是同值兜底）。
  // 已实现盈亏在清仓时才落地；按建仓时间排会把这笔盈亏提前到建仓那天（前视）。
  events.sort((left, right) => {
    return (
      left.round.closedAt - right.round.closedAt ||
      left.round.openedAt - right.round.openedAt ||
      left.round.createdAt - right.round.createdAt ||
      compareText(left.round.id, right.round.id)
    )
  })

  const account = getOrCreateAccount(db, ledgerId)
  // 本金只用来给回撤率定标：曲线本身是现金流中性的（追加 / 支取 / 利息都不进入）。
  // 基数取「本窗口第一笔结算时的本金」：窗口开始后追加本金不会稀释已经发生的回撤。
  const adds = listPrincipalAdds(db, ledgerId)
  let initialPrincipal = account.principal
  for (const add of adds) initialPrincipal -= add.amount
  let addIndex = 0
  let principalAt = initialPrincipal
  let windowBase: number | null = null
  let groupBase = 0

  const totalEvents = events.length
  let includedTotal = 0
  events.forEach((event, index) => {
    const date = unixToDate(event.round.closedAt)
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

  let totalCount = 0
  let winCount = 0
  let lossCount = 0
  let winSum = 0
  let lossSum = 0 // 亏损金额合计（正数）
  // 全量曲线：初始本金 + 累计已实现盈亏；峰值从 0 盈亏起步
  let cumPnl = 0
  let peakPnl = 0
  let maxDrawdown = 0
  let drawdownPeak = 0

  let windowCount = 0 // 区间内笔数（区间内从 1 重新编号）
  let windowWinCount = 0
  let windowLossCount = 0
  let windowWinSum = 0
  let windowLossSum = 0 // 区间内亏损金额合计（正数）
  let windowCumPnl = 0
  let windowPeakPnl = 0
  let windowMaxDrawdown = 0
  let windowDrawdownPeak = 0

  for (const [index, event] of events.entries()) {
    const date = unixToDate(event.round.closedAt)
    // 结算按清仓日排序；本金追加按记录日期推进，只影响回撤率的分母
    while (addIndex < adds.length && adds[addIndex].date <= date) {
      principalAt += adds[addIndex].amount
      addIndex += 1
    }
    if (!includeStatisticsEvent(date, index, totalEvents, fromDay, toDay, recent)) {
      continue
    }
    if (windowBase === null) windowBase = principalAt

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
    // 全量回撤：从初始本金 + 盈亏峰值回落；记录产生最大回落时的峰值，回撤率配它做分母
    if (cumPnl > peakPnl) peakPnl = cumPnl
    const drawdown = peakPnl - cumPnl
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown
      drawdownPeak = peakPnl
    }
    // 区间回撤曲线：从 0 起步逐笔累计区间盈亏，口径与上面一致
    if (windowCumPnl > windowPeakPnl) windowPeakPnl = windowCumPnl
    const windowDrawdown = windowPeakPnl - windowCumPnl
    if (windowDrawdown > windowMaxDrawdown) {
      windowMaxDrawdown = windowDrawdown
      windowDrawdownPeak = windowPeakPnl
    }

    const statCount = useWindow ? windowCount : totalCount
    const wins = useWindow ? windowWinCount : winCount
    const losses = useWindow ? windowLossCount : lossCount
    const winAmountSum = useWindow ? windowWinSum : winSum
    const lossAmountSum = useWindow ? windowLossSum : lossSum
    const total = useWindow ? windowCumPnl : cumPnl
    const drawdownTotal = useWindow ? windowMaxDrawdown : maxDrawdown
    const peakAtDrawdown = useWindow ? windowDrawdownPeak : drawdownPeak

    const point: StockStatisticsPointDto = {
      sequence: statCount,
      // 累计口径下"本点覆盖 1..=sequence 笔"（区间内重新编号后同样成立）
      span: statCount,
      openedAt: event.round.openedAt,
      closedAt: event.round.closedAt,
      roundId: event.round.id,
      stockCode: event.round.stockCode,
      stockName: event.stockName,
      stockRoundNo: event.round.roundNo,
      tag: event.round.tag,
      pnl: event.pnl,
      pnlRate: event.pnlRate,
      tradeCount: event.tradeCount,
      totalPnl: total,
      winCount: wins,
      lossCount: losses,
      tieCount: statCount - wins - losses,
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
      pnlRatio: null,
      expectancy: 0,
      maxDrawdown: drawdownTotal,
      maxDrawdownPct: 0,
    }
    if (statCount > 0) point.winRate = percentOf(wins, statCount)
    if (wins > 0) point.avgWin = roundHalfAwayFromZero(winAmountSum / wins)
    if (losses > 0) point.avgLoss = roundHalfAwayFromZero(lossAmountSum / losses)
    // 任一侧没有样本时没有"平均盈利 ÷ 平均亏损"可言（不是 0）
    if (wins > 0 && losses > 0) {
      point.pnlRatio = winAmountSum / wins / (lossAmountSum / losses)
    }
    if (statCount > 0) {
      // 期望值 = 胜率 × 平均盈利 − 亏损率 × 平均亏损 = 累计盈亏 ÷ 总笔数
      point.expectancy = roundHalfAwayFromZero(total / statCount)
    }
    const base = windowBase ?? principalAt
    const denominator = base + peakAtDrawdown
    if (denominator > 0) point.maxDrawdownPct = percentOf(drawdownTotal, denominator)
    result.points.push(point)

    // 分组口径：每 groupSize 笔收一组，最后一组不足也收（不做补齐）。
    // 分组**不改**上面那条逐笔累计序列，只额外产出 groups。
    if (grouped) {
      if (groupAcc.count === 0) groupBase = principalAt
      groupAcc.push(event.pnl)
      if (windowCount % groupSize === 0 || windowCount === includedTotal) {
        groups.push(groupAcc.finish(event, windowCount, groupBase))
        groupAcc = new GroupAcc()
      }
    }
  }
  result.groups = groups
  return result
}

// ---------------------------------------------------------------- 筛选与月份

/**
 * 判断某笔结算是否落入当前筛选：
 * `recent > 0` 时取排序后最近 N 笔；`fromDay` 非空时按**清仓日期**区间（含首尾日）判断。
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
