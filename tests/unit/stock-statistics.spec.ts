import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { closeWorkspace, openWorkspace, type OpenedWorkspace } from '../../electron/db'
import {
  type StockTradeRound,
  createTrade,
  updateTradeRoundTag,
} from '../../electron/db/dao/stock-trade'
import {
  addInterestAtDate,
  addPrincipalAtDate,
  setPrincipal,
  withdrawAtDate,
} from '../../electron/services/stock-account'
import { getTradeHistoryDetail } from '../../electron/services/stock-history'
import {
  GroupAcc,
  type SettleEvent,
  getStatistics,
  getStatisticsFor,
  getStatisticsRange,
  includeStatisticsEvent,
  normalizeStatisticsMonthRange,
} from '../../electron/services/stock-statistics'
import {
  STOCK_TAG_ANALYSIS,
  STOCK_TAG_DABAN,
  STOCK_TAG_WEIPAN,
  STOCK_TAG_ZHUIZHANG,
  STOCK_TRADE_CLOSE,
  STOCK_TRADE_OPEN,
} from '../../shared/domain/consts'
import type { StockTrade } from '../../shared/domain/models'
import {
  createStatisticsFilter,
  withStrategy,
} from '../../shared/domain/statistics'
import { amountOfLots } from '../../shared/domain/stock'
import { AppError } from '../../shared/errors'

const LEDGER = 'ledger-statistics'
const CODE_A = '600000'
const NAME_A = '浦发银行'
const CODE_B = '000001'
const NAME_B = '平安银行'

const directories: string[] = []
let tradeSequence = 0

function workspaceDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'tr-stock-statistics-test-'))
  directories.push(directory)
  return directory
}

function newWorkspace(): OpenedWorkspace {
  return openWorkspace(workspaceDirectory())
}

afterEach(() => {
  closeWorkspace()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function appError(run: () => unknown): AppError {
  try {
    run()
  } catch (error) {
    expect(error).toBeInstanceOf(AppError)
    return error as AppError
  }
  throw new Error('应当抛错')
}

/** 本地某天 12:00 的 Unix 秒：统计按本地日期判月份，中午落点对任何时区都落在同一天。 */
function localNoon(year: number, month: number, day: number): number {
  return Math.trunc(new Date(year, month - 1, day, 12, 0, 0).getTime() / 1000)
}

// ---------------------------------------------------------------- 造数

function seedTrade(
  workspace: OpenedWorkspace,
  stockCode: string,
  stockName: string,
  tradeType: string,
  price: number,
  lots: number,
  at: number,
): void {
  tradeSequence += 1
  const trade: StockTrade = {
    id: `trade-${tradeSequence}`,
    ledgerId: LEDGER,
    stockCode,
    stockName,
    tradeType,
    roundId: '',
    orderId: '',
    orderSeq: 1,
    price,
    lots,
    shares: lots * 100,
    amount: amountOfLots(price, lots),
    fee: 0,
    commission: 0,
    stampDuty: 0,
    transferFee: 0,
    realizedPnl: null,
    roundFee: null,
    remark: '',
    tradeTime: at,
    createdAt: 0,
  }
  createTrade(workspace.db, trade)
}

/** 直接造一轮「建仓 → 清仓」（未挂接，统计入口会触发回填）。 */
function seedRound(
  workspace: OpenedWorkspace,
  stockCode: string,
  stockName: string,
  openMilli: number,
  closeMilli: number,
  lots: number,
  openedAt: number,
  closedAt: number,
): void {
  seedTrade(workspace, stockCode, stockName, STOCK_TRADE_OPEN, openMilli, lots, openedAt)
  seedTrade(workspace, stockCode, stockName, STOCK_TRADE_CLOSE, closeMilli, lots, closedAt)
}

/** 建仓与清仓落在同一天的干净结算（时间只用于定序）。 */
function seedCleanRoundOn(
  workspace: OpenedWorkspace,
  stockCode: string,
  stockName: string,
  openMilli: number,
  closeMilli: number,
  lots: number,
  year: number,
  month: number,
  day: number,
): void {
  const openedAt = localNoon(year, month, day)
  seedRound(workspace, stockCode, stockName, openMilli, closeMilli, lots, openedAt, openedAt + 3_600)
}

function setPrincipalCents(workspace: OpenedWorkspace, amount: number): void {
  setPrincipal(workspace.db, LEDGER, amount)
}

/** 造 6 轮带标签的干净结算（标签通过归档后的轮次写回）。 */
function seedTaggedStatRounds(workspace: OpenedWorkspace): void {
  setPrincipalCents(workspace, 10_000_000)
  seedCleanRoundOn(workspace, CODE_A, NAME_A, 10_000, 11_000, 10, 2023, 7, 1)
  seedCleanRoundOn(workspace, CODE_B, NAME_B, 8_000, 8_500, 10, 2023, 7, 2)
  seedCleanRoundOn(workspace, CODE_A, NAME_A, 20_000, 19_200, 10, 2023, 7, 3)
  seedCleanRoundOn(workspace, CODE_B, NAME_B, 8_000, 8_500, 10, 2023, 8, 1)
  seedCleanRoundOn(workspace, CODE_A, NAME_A, 10_000, 10_500, 10, 2023, 8, 2)
  seedCleanRoundOn(workspace, CODE_B, NAME_B, 20_000, 19_200, 10, 2023, 8, 5)

  // 首次统计触发存量历史回填生成轮次，再按轮设置标签
  getStatistics(workspace.db, LEDGER)
  const assignTags = (code: string, tags: readonly string[]): void => {
    const detail = getTradeHistoryDetail(workspace.db, LEDGER, code)
    expect(detail.rounds).toHaveLength(tags.length)
    detail.rounds.forEach((round, index) => {
      updateTradeRoundTag(workspace.db, round.id, tags[index])
    })
  }
  assignTags(CODE_A, [STOCK_TAG_DABAN, STOCK_TAG_WEIPAN, STOCK_TAG_DABAN])
  assignTags(CODE_B, [STOCK_TAG_ANALYSIS, STOCK_TAG_DABAN, STOCK_TAG_ZHUIZHANG])
}

function groupedFilter(
  startMonth = '',
  endMonth = '',
  recent: number | null = null,
  tag = '',
  size = 5,
) {
  return withStrategy(
    createStatisticsFilter(startMonth, endMonth, recent, tag),
    'grouped',
    size,
  )
}

// ---------------------------------------------------------------- GroupAcc

function settleEvent(pnl: number, closedAt: number): SettleEvent {
  const round: StockTradeRound = {
    id: 'round',
    ledgerId: LEDGER,
    stockCode: CODE_A,
    historyId: 'history',
    roundNo: 3,
    openedAt: 0,
    closedAt,
    tag: STOCK_TAG_DABAN,
    review: '',
    createdAt: 0,
  }
  return {
    round,
    stockName: NAME_A,
    pnl,
    pnlRate: 1.25,
    tradeCount: 4,
  }
}

describe('GroupAcc', () => {
  it('starts each group curve from zero', () => {
    const downThenUp = new GroupAcc()
    downThenUp.push(-10_000)
    downThenUp.push(5_000)
    expect([downThenUp.peak, downThenUp.cum, downThenUp.drawdown]).toEqual([0, -5_000, 10_000])

    const upThenDown = new GroupAcc()
    upThenDown.push(100_000)
    upThenDown.push(-30_000)
    upThenDown.push(-50_000)
    expect([upThenDown.count, upThenDown.pnl]).toEqual([3, 20_000])
    expect([upThenDown.win, upThenDown.loss]).toEqual([1, 2])
    expect([upThenDown.winSum, upThenDown.lossSum]).toEqual([100_000, 80_000])
    expect(upThenDown.drawdown).toBe(80_000)
  })

  it('counts a breakeven settlement without scoring it', () => {
    const acc = new GroupAcc()
    acc.push(0)
    acc.push(60_000)
    expect([acc.count, acc.win, acc.loss]).toEqual([2, 1, 0])
    expect([acc.pnl, acc.drawdown]).toEqual([60_000, 0])
  })

  it('anchors a group point on its last settlement', () => {
    const acc = new GroupAcc()
    acc.push(100_000)
    acc.push(-40_000)
    const point = acc.finish(settleEvent(-40_000, 1_700_000_000), 7, 10_000_000)

    expect([point.sequence, point.span]).toEqual([7, 2])
    expect(point.totalPnl).toBe(60_000)
    expect(point.expectancy).toBe(30_000)
    expect(point.winRate).toBe(50)
    expect([point.winCount, point.lossCount]).toEqual([1, 1])
    expect([point.avgWin, point.avgLoss]).toEqual([100_000, 40_000])
    expect([point.maxDrawdown, point.maxDrawdownPct]).toEqual([40_000, 0.4])
    // 身份字段来自组末那笔
    expect(point.pnl).toBe(-40_000)
    expect(point.pnlRate).toBe(1.25)
    expect(point.tradeCount).toBe(4)
    expect(point.closedAt).toBe(1_700_000_000)
    expect(point.stockCode).toBe(CODE_A)
    expect(point.stockRoundNo).toBe(3)
    expect(point.tag).toBe(STOCK_TAG_DABAN)
  })

  it('has no ratio without a loss sample', () => {
    const acc = new GroupAcc()
    acc.push(10_000)
    const point = acc.finish(settleEvent(10_000, 0), 1, 0)
    expect(point.pnlRatio).toBeNull()
    expect(point.avgLoss).toBe(0)
    expect(point.maxDrawdownPct).toBe(0)
  })
})

// ---------------------------------------------------------------- 月份 / 筛选纯函数

describe('normalizeStatisticsMonthRange', () => {
  it('requires both ends and a valid YYYY-MM format', () => {
    expect(normalizeStatisticsMonthRange('', '')).toEqual(['', ''])
    for (const [start, end] of [
      ['2023-01', ''],
      ['', '2023-01'],
      ['2023/01', '2023-02'],
      ['2023-1', '2023-02'],
      ['2023-13', '2023-12'],
      ['2023-03', '2023-01'],
    ]) {
      expect(() => normalizeStatisticsMonthRange(start, end)).toThrow(AppError)
    }
  })

  it('covers whole months including a leap February', () => {
    expect(normalizeStatisticsMonthRange('2023-07', '2023-07')).toEqual([
      '2023-07-01',
      '2023-07-31',
    ])
    expect(normalizeStatisticsMonthRange('2023-07', '2023-12')).toEqual([
      '2023-07-01',
      '2023-12-31',
    ])
    expect(normalizeStatisticsMonthRange('2024-02', '2024-02')).toEqual([
      '2024-02-01',
      '2024-02-29',
    ])
    expect(normalizeStatisticsMonthRange('2023-02', '2023-02')).toEqual([
      '2023-02-01',
      '2023-02-28',
    ])
  })
})

describe('includeStatisticsEvent', () => {
  it('honours recent first, then the inclusive range', () => {
    expect(includeStatisticsEvent('2023-07-01', 0, 3, '', '', 0)).toBe(true)
    // 最近 2 笔：只放行末尾两条
    expect(includeStatisticsEvent('2023-07-01', 0, 3, '', '', 2)).toBe(false)
    expect(includeStatisticsEvent('2023-07-02', 1, 3, '', '', 2)).toBe(true)
    expect(includeStatisticsEvent('2023-07-03', 2, 3, '', '', 2)).toBe(true)
    // 区间（含首尾日）
    expect(includeStatisticsEvent('2023-07-01', 0, 3, '2023-07-01', '2023-07-31', 0)).toBe(true)
    expect(includeStatisticsEvent('2023-08-01', 0, 3, '2023-07-01', '2023-07-31', 0)).toBe(false)
  })
})

// ---------------------------------------------------------------- 统计读层

describe('stock statistics read layer', () => {
  it('starts from the first settlement', () => {
    const workspace = newWorkspace()
    setPrincipalCents(workspace, 10_000_000)
    // 第 1 笔 A +100000 → 第 2 笔 B +50000 → 第 3 笔 A −80000
    seedCleanRoundOn(workspace, CODE_A, NAME_A, 10_000, 11_000, 10, 2023, 7, 1)
    seedCleanRoundOn(workspace, CODE_B, NAME_B, 8_000, 8_500, 10, 2023, 7, 2)
    seedCleanRoundOn(workspace, CODE_A, NAME_A, 20_000, 19_200, 10, 2023, 7, 3)

    const stats = getStatistics(workspace.db, LEDGER)
    expect(stats.principal).toBe(10_000_000)
    expect(stats.roundCount).toBe(3)
    expect(stats.points).toHaveLength(3)

    const p1 = stats.points[0]
    expect([p1.sequence, p1.closedAt]).toEqual([1, localNoon(2023, 7, 1) + 3_600])
    expect(p1.stockCode).toBe(CODE_A)
    expect([p1.pnl, p1.totalPnl]).toEqual([100_000, 100_000])
    expect([p1.winCount, p1.lossCount]).toEqual([1, 0])
    expect(p1.winRate).toBe(100)
    expect([p1.avgWin, p1.avgLoss]).toEqual([100_000, 0])
    expect(p1.pnlRatio).toBeNull()
    expect(p1.expectancy).toBe(100_000)
    expect([p1.maxDrawdown, p1.maxDrawdownPct]).toEqual([0, 0])

    const p2 = stats.points[1]
    expect([p2.sequence, p2.closedAt]).toEqual([2, localNoon(2023, 7, 2) + 3_600])
    expect(p2.stockCode).toBe(CODE_B)
    expect([p2.pnl, p2.totalPnl]).toEqual([50_000, 150_000])
    expect([p2.winCount, p2.lossCount]).toEqual([2, 0])
    expect(p2.winRate).toBe(100)
    expect(p2.avgWin).toBe(75_000)
    expect(p2.expectancy).toBe(75_000)
    expect([p2.maxDrawdown, p2.maxDrawdownPct]).toEqual([0, 0])

    const p3 = stats.points[2]
    expect([p3.sequence, p3.closedAt]).toEqual([3, localNoon(2023, 7, 3) + 3_600])
    expect([p3.pnl, p3.totalPnl]).toEqual([-80_000, 70_000])
    expect([p3.winCount, p3.lossCount]).toEqual([2, 1])
    expect(p3.winRate).toBe(66.67)
    expect([p3.avgWin, p3.avgLoss]).toEqual([75_000, 80_000])
    expect(p3.pnlRatio).toBeCloseTo(0.9375, 4)
    expect(p3.expectancy).toBe(23_333)
    expect(p3.maxDrawdown).toBe(80_000)
    expect(p3.maxDrawdownPct).toBeCloseTo(0.8, 3)
  })

  it('counts a breakeven settlement in the total', () => {
    const workspace = newWorkspace()
    setPrincipalCents(workspace, 10_000_000)
    seedCleanRoundOn(workspace, CODE_A, NAME_A, 10_000, 11_000, 10, 2023, 7, 1)
    seedCleanRoundOn(workspace, CODE_B, NAME_B, 10_000, 10_000, 10, 2023, 7, 2)
    seedCleanRoundOn(workspace, CODE_A, NAME_A, 10_000, 9_400, 10, 2023, 7, 3)

    const stats = getStatistics(workspace.db, LEDGER)
    expect([stats.roundCount, stats.points.length]).toEqual([3, 3])

    const p2 = stats.points[1]
    expect(p2.sequence).toBe(2)
    expect(p2.totalPnl).toBe(100_000)
    expect([p2.winCount, p2.lossCount]).toEqual([1, 0])
    expect(p2.winRate).toBe(50)
    expect([p2.avgWin, p2.expectancy]).toEqual([100_000, 50_000])

    const p3 = stats.points[2]
    expect(p3.totalPnl).toBe(40_000)
    expect([p3.winCount, p3.lossCount]).toEqual([1, 1])
    expect(p3.winRate).toBe(33.33)
    expect(p3.avgLoss).toBe(60_000)
    expect(p3.pnlRatio).toBeCloseTo(1.6667, 3)
    expect(p3.expectancy).toBe(13_333)
    expect(p3.maxDrawdown).toBe(60_000)
    expect(p3.maxDrawdownPct).toBeCloseTo(0.6, 3)
  })

  it('puts interest principal into the equity curve without touching principal', () => {
    const workspace = newWorkspace()
    setPrincipalCents(workspace, 10_000_000)
    // 第 1 轮亏 80_000：本金 10_000_000 → 9_920_000，峰值仍是 10_000_000
    seedCleanRoundOn(workspace, CODE_A, NAME_A, 10_000, 9_200, 10, 2023, 7, 1)
    // 亏损之后的次日记一笔利息归本：9_950_000 没有超过峰值
    addInterestAtDate(workspace.db, LEDGER, 30_000, '2023-07-02')
    // 第 2 轮再亏 100_000
    seedCleanRoundOn(workspace, CODE_B, NAME_B, 10_000, 9_000, 10, 2023, 7, 3)

    const stats = getStatistics(workspace.db, LEDGER)
    expect(stats.principal).toBe(10_000_000)
    expect([stats.points[0].pnl, stats.points[0].maxDrawdown]).toEqual([-80_000, 80_000])

    const p2 = stats.points[1]
    expect(p2.pnl).toBe(-100_000)
    // 9_920_000 + 30_000 = 9_950_000 未超过峰值，再亏 100_000 → 回撤 150_000
    expect(p2.maxDrawdown).toBe(150_000)
    expect(p2.maxDrawdownPct).toBeCloseTo(1.5, 3)
  })

  it('needs at least one settlement', () => {
    const workspace = newWorkspace()
    const empty = getStatistics(workspace.db, LEDGER)
    expect([empty.roundCount, empty.points.length]).toEqual([0, 0])

    setPrincipalCents(workspace, 10_000_000)
    seedCleanRoundOn(workspace, CODE_A, NAME_A, 10_000, 11_000, 10, 2023, 7, 1)
    const one = getStatistics(workspace.db, LEDGER)
    expect([one.roundCount, one.points.length]).toEqual([1, 1])
    const point = one.points[0]
    expect([point.sequence, point.totalPnl]).toEqual([1, 100_000])
    expect(point.winRate).toBe(100)
    expect(point.avgWin).toBe(100_000)
  })

  it('uses the principal at settlement as the drawdown denominator', () => {
    const workspace = newWorkspace()
    setPrincipalCents(workspace, 10_000_000)
    // 第 1 笔盈利 +100000（2023-07-22）
    seedCleanRoundOn(workspace, CODE_A, NAME_A, 10_000, 11_000, 10, 2023, 7, 22)
    // 第 2 笔前追加本金 5,000,000（本金 10,000,000 → 15,000,000）
    addPrincipalAtDate(workspace.db, LEDGER, 5_000_000, '2023-07-25')
    // 第 2 笔亏损 -200000（2023-07-28）
    seedCleanRoundOn(workspace, CODE_A, NAME_A, 20_000, 18_000, 10, 2023, 7, 28)
    // 第 3 笔前支取 1,000,000（2023-07-29，本金不变）
    withdrawAtDate(workspace.db, LEDGER, 1_000_000, '2023-07-29')
    // 第 3 笔盈利 +300000（2023-08-01）
    seedCleanRoundOn(workspace, CODE_A, NAME_A, 10_000, 13_000, 10, 2023, 8, 1)

    const stats = getStatistics(workspace.db, LEDGER)
    expect(stats.points).toHaveLength(3)
    expect(stats.principal).toBe(15_000_000)

    expect([stats.points[0].maxDrawdown, stats.points[0].maxDrawdownPct]).toEqual([0, 0])

    // 追加后当时本金 15,000,000；峰值总资产 15,100,000，回撤 200,000 → 1.33%
    const p2 = stats.points[1]
    expect(p2.maxDrawdown).toBe(200_000)
    expect(p2.maxDrawdownPct).toBeCloseTo(1.33, 2)

    // 支取 1,000,000 计入总资产曲线：峰值 15,100,000 → 支取后 13,900,000，回撤 1,200,000
    const p3 = stats.points[2]
    expect(p3.maxDrawdown).toBe(1_200_000)
    expect(p3.maxDrawdownPct).toBeCloseTo(8, 2)
  })

  it('recomputes the window for a month range', () => {
    const workspace = newWorkspace()
    setPrincipalCents(workspace, 10_000_000)
    seedCleanRoundOn(workspace, CODE_A, NAME_A, 10_000, 11_000, 10, 2023, 7, 22)
    seedCleanRoundOn(workspace, CODE_B, NAME_B, 10_000, 9_200, 10, 2023, 7, 25)
    seedCleanRoundOn(workspace, CODE_A, NAME_A, 10_000, 10_500, 10, 2023, 8, 1)

    const july = getStatisticsRange(workspace.db, LEDGER, '2023-07', '2023-07', 0, '')
    expect([july.roundCount, july.points.length]).toEqual([2, 2])
    expect([
      july.points[0].sequence,
      july.points[0].totalPnl,
      july.points[0].winCount,
      july.points[0].maxDrawdown,
    ]).toEqual([1, 100_000, 1, 0])
    const p2 = july.points[1]
    expect([p2.sequence, p2.totalPnl, p2.winCount, p2.lossCount]).toEqual([2, 20_000, 1, 1])
    expect(p2.winRate).toBe(50)
    expect([p2.avgWin, p2.avgLoss]).toEqual([100_000, 80_000])
    expect(p2.pnlRatio).toBeCloseTo(1.25, 3)
    expect(p2.expectancy).toBe(10_000)
    expect(p2.maxDrawdown).toBe(80_000)
    expect(p2.maxDrawdownPct).toBeCloseTo(0.8, 3)

    const august = getStatisticsRange(workspace.db, LEDGER, '2023-08', '2023-08', 0, '')
    expect([august.roundCount, august.points.length]).toEqual([1, 1])
    expect(august.points[0].sequence).toBe(1)
    expect(august.points[0].totalPnl).toBe(50_000)

    // 跨月区间不应遗漏边界内数据
    const cross = getStatisticsRange(workspace.db, LEDGER, '2023-07', '2023-12', 0, '')
    expect(cross.roundCount).toBe(3)
  })

  it('recomputes the window for the most recent N settlements', () => {
    const workspace = newWorkspace()
    setPrincipalCents(workspace, 10_000_000)
    seedCleanRoundOn(workspace, CODE_A, NAME_A, 10_000, 11_000, 10, 2023, 7, 22)
    seedCleanRoundOn(workspace, CODE_B, NAME_B, 10_000, 9_200, 10, 2023, 7, 25)
    seedCleanRoundOn(workspace, CODE_A, NAME_A, 10_000, 10_500, 10, 2023, 8, 1)

    const stats = getStatisticsRange(workspace.db, LEDGER, '', '', 2, '')
    expect([stats.roundCount, stats.points.length]).toEqual([2, 2])
    expect([stats.points[0].sequence, stats.points[0].pnl]).toEqual([1, -80_000])
    expect([stats.points[1].sequence, stats.points[1].totalPnl]).toEqual([2, -30_000])

    const all = getStatisticsRange(workspace.db, LEDGER, '', '', 100, '')
    expect([all.roundCount, all.points.length]).toEqual([3, 3])
  })

  it('splits grouped settlements into disjoint groups', () => {
    const workspace = newWorkspace()
    setPrincipalCents(workspace, 10_000_000)
    // 7 笔：+100000 −80000 +50000 −20000 +30000 +10000 −40000
    const prices: Array<[number, number]> = [
      [10_000, 11_000],
      [10_000, 9_200],
      [10_000, 10_500],
      [10_000, 9_800],
      [10_000, 10_300],
      [10_000, 10_100],
      [10_000, 9_600],
    ]
    prices.forEach(([open, close], index) => {
      seedCleanRoundOn(workspace, CODE_A, NAME_A, open, close, 10, 2023, 7, index + 1)
    })

    const grouped = getStatisticsFor(workspace.db, LEDGER, groupedFilter('', '', null, '', 5))
    // 7 笔 → 5 + 2 两组；逐笔累计序列照旧是 7 个点
    expect([grouped.roundCount, grouped.points.length]).toEqual([7, 7])
    expect(grouped.groups).toHaveLength(2)

    const first = grouped.groups[0]
    expect([first.sequence, first.span]).toEqual([5, 5])
    expect(first.totalPnl).toBe(80_000)
    expect([first.winCount, first.lossCount]).toEqual([3, 2])
    expect(first.winRate).toBe(60)
    expect(first.avgWin).toBe(60_000)
    expect(first.avgLoss).toBe(50_000)
    expect(first.pnlRatio).toBeCloseTo(1.2, 4)
    expect(first.expectancy).toBe(16_000)
    // 组内曲线：峰值 100000、谷底 20000 → 回撤 80000，占本金 0.8%
    expect(first.maxDrawdown).toBe(80_000)
    expect(first.maxDrawdownPct).toBeCloseTo(0.8, 3)

    const last = grouped.groups[1]
    expect([last.sequence, last.span]).toEqual([7, 2])
    expect(last.totalPnl).toBe(-30_000)
    expect([last.winCount, last.lossCount]).toEqual([1, 1])
    expect(last.winRate).toBe(50)
    expect([last.avgWin, last.avgLoss]).toEqual([10_000, 40_000])
    expect(last.expectancy).toBe(-15_000)
    expect(last.maxDrawdown).toBe(40_000)
    expect(last.maxDrawdownPct).toBeCloseTo(0.4, 3)
    // 组点挂在组末那笔结算上
    expect(last.pnl).toBe(-40_000)
    expect(last.stockCode).toBe(CODE_A)
    expect(last.closedAt).toBe(grouped.points[6].closedAt)

    const sum = grouped.groups.reduce((total, point) => total + point.totalPnl, 0)
    expect(sum).toBe(grouped.points[6].totalPnl)
    expect(sum).toBe(50_000)

    // 分组不改逐笔累计序列；逐笔累计口径下不返回分组点
    const cumulative = getStatisticsFor(workspace.db, LEDGER, createStatisticsFilter('', '', null, ''))
    expect(grouped.points).toEqual(cumulative.points)
    expect(cumulative.groups).toEqual([])
  })

  it('applies groups after the filter', () => {
    const workspace = newWorkspace()
    setPrincipalCents(workspace, 10_000_000)
    // 6 笔：+100000 −80000 +50000 −20000 +30000 +10000
    const prices: Array<[number, number]> = [
      [10_000, 11_000],
      [10_000, 9_200],
      [10_000, 10_500],
      [10_000, 9_800],
      [10_000, 10_300],
      [10_000, 10_100],
    ]
    prices.forEach(([open, close], index) => {
      seedCleanRoundOn(workspace, CODE_A, NAME_A, open, close, 10, 2023, 7, index + 1)
    })

    // 最近 3 笔（−20000 +30000 +10000）+ 每 2 笔 → 2 组（2 + 1），集合内重新编号
    const recent = getStatisticsFor(workspace.db, LEDGER, groupedFilter('', '', 3, '', 2))
    expect([recent.roundCount, recent.points.length, recent.groups.length]).toEqual([3, 3, 2])
    expect([recent.groups[0].sequence, recent.groups[0].span]).toEqual([2, 2])
    expect(recent.groups[0].totalPnl).toBe(10_000)
    expect([recent.groups[1].sequence, recent.groups[1].span]).toEqual([3, 1])
    expect(recent.groups[1].totalPnl).toBe(10_000)
    expect(recent.groups[1].winRate).toBe(100)

    // 月份区间同样先定集合；集合为空时两组序列都为空
    const july = getStatisticsFor(workspace.db, LEDGER, groupedFilter('2023-07', '2023-07', null, '', 4))
    expect([july.roundCount, july.groups.length]).toEqual([6, 2])
    expect([july.groups[0].span, july.groups[1].span]).toEqual([4, 2])

    const empty = getStatisticsFor(workspace.db, LEDGER, groupedFilter('2023-06', '2023-06', null, '', 4))
    expect([empty.roundCount, empty.points.length, empty.groups.length]).toEqual([0, 0, 0])
  })

  it('combines grouping with a tag filter', () => {
    const workspace = newWorkspace()
    seedTaggedStatRounds(workspace)

    // 打板 3 笔：+100000（07-01）、+50000（08-01）、+50000（08-02）
    const daban = getStatisticsFor(
      workspace.db,
      LEDGER,
      groupedFilter('', '', null, STOCK_TAG_DABAN, 2),
    )
    expect([daban.roundCount, daban.groups.length]).toEqual([3, 2])
    expect([
      daban.groups[0].sequence,
      daban.groups[0].span,
      daban.groups[0].totalPnl,
    ]).toEqual([2, 2, 150_000])
    expect([
      daban.groups[1].sequence,
      daban.groups[1].span,
      daban.groups[1].totalPnl,
    ]).toEqual([3, 1, 50_000])
    // 标签筛选下逐笔累计序列同样只含这 3 笔
    expect(daban.points).toHaveLength(3)
    expect(daban.points[2].totalPnl).toBe(200_000)
  })

  it('uses the principal at the group end for the grouped drawdown rate', () => {
    const workspace = newWorkspace()
    setPrincipalCents(workspace, 10_000_000)
    // 第 1 组（两笔都亏）：−200000、−300000 → 组内回撤 500000 ÷ 当时本金 1000 万 = 5%
    seedCleanRoundOn(workspace, CODE_A, NAME_A, 20_000, 18_000, 10, 2023, 1, 5)
    seedCleanRoundOn(workspace, CODE_B, NAME_B, 20_000, 17_000, 10, 2023, 1, 6)
    // 组间追加本金 500 万
    addPrincipalAtDate(workspace.db, LEDGER, 5_000_000, '2023-01-10')
    // 第 2 组（两笔都亏）：−100000、−200000 → 组内回撤 300000 ÷ 当时本金 1500 万 = 2%
    seedCleanRoundOn(workspace, CODE_A, NAME_A, 20_000, 19_000, 10, 2023, 1, 20)
    seedCleanRoundOn(workspace, CODE_B, NAME_B, 20_000, 18_000, 10, 2023, 1, 21)

    const stats = getStatisticsFor(workspace.db, LEDGER, groupedFilter('', '', null, '', 2))
    expect(stats.groups).toHaveLength(2)
    expect(stats.groups[0].maxDrawdown).toBe(500_000)
    expect(stats.groups[0].maxDrawdownPct).toBeCloseTo(5, 2)
    expect(stats.groups[1].maxDrawdown).toBe(300_000)
    expect(stats.groups[1].maxDrawdownPct).toBeCloseTo(2, 2)
  })

  it('validates the grouped size on the production path', () => {
    const workspace = newWorkspace()
    for (const size of [null, 0, 1, -5, 1001]) {
      const error = appError(() =>
        getStatisticsFor(workspace.db, LEDGER, groupedFilter('', '', null, '', size as number)),
      )
      expect(error.status).toBe(400)
      expect(error.message).toContain('group_size')
    }
    // 逐笔累计口径下同一个字段不参与校验
    expect(() =>
      getStatisticsFor(
        workspace.db,
        LEDGER,
        withStrategy(createStatisticsFilter('', '', null, ''), 'cumulative', 1),
      ),
    ).not.toThrow()
  })

  it('uses the principal at the point for the range drawdown rate', () => {
    const workspace = newWorkspace()
    setPrincipalCents(workspace, 10_000_000)
    // 第 1 笔亏损 -200000（2023-01-05），随后追加本金 500 万，第 2 笔亏损 -300000（2023-01-20）
    seedCleanRoundOn(workspace, CODE_A, NAME_A, 20_000, 18_000, 10, 2023, 1, 5)
    addPrincipalAtDate(workspace.db, LEDGER, 5_000_000, '2023-01-10')
    seedCleanRoundOn(workspace, CODE_B, NAME_B, 20_000, 17_000, 10, 2023, 1, 20)

    const stats = getStatisticsRange(workspace.db, LEDGER, '2023-01', '2023-01', 0, '')
    expect(stats.roundCount).toBe(2)

    // 区间曲线从 0 起步：第 1 笔后累计 -200000，回撤 200000 ÷ 当时本金 1000 万 = 2%
    expect(stats.points[0].maxDrawdown).toBe(200_000)
    expect(stats.points[0].maxDrawdownPct).toBeCloseTo(2, 2)

    // 区间曲线峰值仍为 0，第 2 笔后累计 -500000 → 回撤 500000；当时本金 1500 万 → 3.33%
    expect(stats.points[1].maxDrawdown).toBe(500_000)
    expect(stats.points[1].maxDrawdownPct).toBeCloseTo(3.33, 2)
    expect(stats.points[1].totalPnl).toBe(-500_000)
  })

  it('validates the range arguments and returns an empty window', () => {
    const workspace = newWorkspace()
    const cases: Array<[string, string, number]> = [
      ['2023-01', '', 0],
      ['', '2023-01', 0],
      ['2023-01', '2023-02', 5],
      ['2023/01', '2023-02', 0],
      ['2023-03', '2023-01', 0],
      ['', '', -1],
    ]
    for (const [start, end, recent] of cases) {
      expect(() =>
        getStatisticsRange(workspace.db, LEDGER, start, end, recent, ''),
      ).toThrow(AppError)
    }

    const empty = getStatisticsRange(workspace.db, LEDGER, '2023-06', '2023-06', 0, '')
    expect([empty.roundCount, empty.points.length]).toEqual([0, 0])
  })

  it('exposes the tag on every point and filters by it', () => {
    const workspace = newWorkspace()
    seedTaggedStatRounds(workspace)

    const all = getStatisticsRange(workspace.db, LEDGER, '', '', 0, '')
    expect([all.roundCount, all.points.length]).toEqual([6, 6])
    expect(all.points.map((point) => point.tag)).toEqual([
      STOCK_TAG_DABAN,
      STOCK_TAG_ANALYSIS,
      STOCK_TAG_WEIPAN,
      STOCK_TAG_DABAN,
      STOCK_TAG_DABAN,
      STOCK_TAG_ZHUIZHANG,
    ])
    expect(all.points.map((point) => point.sequence)).toEqual([1, 2, 3, 4, 5, 6])

    // 按「打板」筛选：只保留 3 笔，序号从 1 重新累计，累计盈亏只含筛选集合
    const daban = getStatisticsRange(workspace.db, LEDGER, '', '', 0, STOCK_TAG_DABAN)
    expect([daban.roundCount, daban.points.length]).toEqual([3, 3])
    expect(daban.points.map((point) => point.stockCode)).toEqual([CODE_A, CODE_B, CODE_A])
    expect(daban.points.map((point) => point.sequence)).toEqual([1, 2, 3])
    expect(daban.points.every((point) => point.tag === STOCK_TAG_DABAN)).toBe(true)
    expect(daban.points.map((point) => point.totalPnl)).toEqual([100_000, 150_000, 200_000])
    expect([daban.points[2].winCount, daban.points[2].winRate]).toEqual([3, 100])

    for (const tag of [STOCK_TAG_ANALYSIS, STOCK_TAG_WEIPAN, STOCK_TAG_ZHUIZHANG]) {
      const part = getStatisticsRange(workspace.db, LEDGER, '', '', 0, tag)
      expect(part.roundCount).toBe(1)
      expect(part.points[0].tag).toBe(tag)
    }

    const error = appError(() =>
      getStatisticsRange(workspace.db, LEDGER, '', '', 0, '打新'),
    )
    expect(error.status).toBe(400)
    expect(error.message).toBe('无效的交易标签')
  })

  it('combines the tag with month and recent filters', () => {
    const workspace = newWorkspace()
    seedTaggedStatRounds(workspace)

    // 标签 × 月份：7 月打板 1 笔（A1），8 月打板 2 笔（B2、A3）
    const july = getStatisticsRange(workspace.db, LEDGER, '2023-07', '2023-07', 0, STOCK_TAG_DABAN)
    expect(july.roundCount).toBe(1)
    expect(july.points[0].stockCode).toBe(CODE_A)
    expect(july.points[0].sequence).toBe(1)

    const august = getStatisticsRange(workspace.db, LEDGER, '2023-08', '2023-08', 0, STOCK_TAG_DABAN)
    expect([august.roundCount, august.points.length]).toEqual([2, 2])
    expect(august.points[1].totalPnl).toBe(100_000)

    // 标签 × 最近 N：最近 1 笔打板 = A3（2023-08-02）；取最近 100 笔回到全部 3 笔
    const one = getStatisticsRange(workspace.db, LEDGER, '', '', 1, STOCK_TAG_DABAN)
    expect(one.roundCount).toBe(1)
    expect(one.points[0].stockCode).toBe(CODE_A)
    expect(one.points[0].stockRoundNo).toBe(3)

    const all = getStatisticsRange(workspace.db, LEDGER, '', '', 100, STOCK_TAG_DABAN)
    expect([all.roundCount, all.points.length]).toEqual([3, 3])
  })

  it('follows the open time when a later round closes first', () => {
    const workspace = newWorkspace()
    setPrincipalCents(workspace, 10_000_000)
    const aOpened = localNoon(2023, 6, 20)
    const aClosed = localNoon(2023, 7, 20)
    const bOpened = localNoon(2023, 7, 10)
    const bClosed = localNoon(2023, 7, 15)
    seedRound(workspace, CODE_A, NAME_A, 10_000, 11_000, 10, aOpened, aClosed)
    seedRound(workspace, CODE_B, NAME_B, 10_000, 9_500, 10, bOpened, bClosed)

    const stats = getStatistics(workspace.db, LEDGER)
    expect(stats.points).toHaveLength(2)
    expect(stats.points[0].stockCode).toBe(CODE_A)
    expect(stats.points[0].openedAt).toBe(aOpened)
    expect(stats.points[0].closedAt).toBe(aClosed)
    expect(stats.points[0].sequence).toBe(1)
    expect(stats.points[1].stockCode).toBe(CODE_B)
    expect(stats.points[1].sequence).toBe(2)
    expect(stats.points[0].totalPnl).toBe(100_000)
    expect(stats.points[1].totalPnl).toBe(50_000)

    const july = getStatisticsRange(workspace.db, LEDGER, '2023-07', '2023-07', 0, '')
    expect(july.points).toHaveLength(1)
    expect(july.points[0].stockCode).toBe(CODE_B)
    expect(july.points[0].sequence).toBe(1)

    const june = getStatisticsRange(workspace.db, LEDGER, '2023-06', '2023-06', 0, '')
    expect(june.points).toHaveLength(1)
    expect(june.points[0].stockCode).toBe(CODE_A)

    const recent = getStatisticsRange(workspace.db, LEDGER, '', '', 1, '')
    expect(recent.points).toHaveLength(1)
    expect(recent.points[0].stockCode).toBe(CODE_B)
  })
})
