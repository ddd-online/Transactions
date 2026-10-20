import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { closeWorkspace, openWorkspace, type OpenedWorkspace } from '../../electron/db'
import {
  createTrade,
  createTradeHistory,
  createTradeRound,
  listTradesByRound,
  updateTradeRoundTag,
} from '../../electron/db/dao/stock-trade'
import {
  deriveTradeCycles,
  ensureStockHistoryBackfill,
  getTradeHistoryDetail,
  getTradeHistorySummary,
  listTradeHistories,
  percentOf,
  roundPnl,
} from '../../electron/services/stock-history'
import type { StockQuoteFetcher } from '../../electron/services/stock-quote'
import {
  STOCK_TAG_ANALYSIS,
  STOCK_TAG_DABAN,
  STOCK_TRADE_ADD,
  STOCK_TRADE_CLOSE,
  STOCK_TRADE_OPEN,
  STOCK_TRADE_REDUCE,
} from '../../shared/domain/consts'
import type { StockTrade } from '../../shared/domain/models'
import { amountOfLots } from '../../shared/domain/stock'
import { AppError } from '../../shared/errors'
import type { StockQuoteDto } from '../../shared/types/stock-position'

const LEDGER = 'ledger-history'

const directories: string[] = []
let tradeSequence = 0

function workspaceDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'tr-stock-history-test-'))
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

/** 无行情的注入源：列表读取不该因为没有外部数据而失败。 */
const noQuotes: StockQuoteFetcher = {
  async fetchQuotes() {
    return new Map()
  },
  async fetchName() {
    return ''
  },
}

function stubQuotes(quotes: Record<string, StockQuoteDto>): StockQuoteFetcher {
  return {
    async fetchQuotes(codes) {
      const result = new Map<string, StockQuoteDto>()
      for (const code of codes) {
        const quote = quotes[code]
        if (quote) result.set(code, quote)
      }
      return result
    },
    async fetchName() {
      return ''
    },
  }
}

// ---------------------------------------------------------------- 造数

interface TradeSeed {
  stockCode: string
  stockName?: string
  tradeType: string
  /** 成交价（厘 / 股） */
  price: number
  lots: number
  /** 成交时间（Unix 秒） */
  at: number
  fee?: number
  /** 覆盖股数（0 手的归档标记成交用） */
  shares?: number
  amount?: number
}

function seedTrade(workspace: OpenedWorkspace, seed: TradeSeed): string {
  tradeSequence += 1
  const shares = seed.shares ?? seed.lots * 100
  const trade: StockTrade = {
    id: `trade-${tradeSequence}`,
    ledgerId: LEDGER,
    stockCode: seed.stockCode,
    stockName: seed.stockName ?? '测试股票',
    tradeType: seed.tradeType,
    roundId: '',
    orderId: '',
    orderSeq: 1,
    price: seed.price,
    lots: seed.lots,
    shares,
    amount: seed.amount ?? amountOfLots(seed.price, seed.lots),
    fee: seed.fee ?? 0,
    commission: 0,
    stampDuty: 0,
    transferFee: 0,
    realizedPnl: null,
    roundFee: null,
    remark: '',
    tradeTime: seed.at,
    createdAt: 0,
  }
  createTrade(workspace.db, trade)
  return trade.id
}

/** 建仓 → 清仓（未挂接，交给回填归档）。 */
function seedUnattachedRound(
  workspace: OpenedWorkspace,
  stockCode: string,
  stockName: string,
  openMilli: number,
  closeMilli: number,
  lots: number,
  openedAt: number,
  closedAt: number,
  fee = 0,
): void {
  seedTrade(workspace, {
    stockCode,
    stockName,
    tradeType: STOCK_TRADE_OPEN,
    price: openMilli,
    lots,
    at: openedAt,
    fee,
  })
  seedTrade(workspace, {
    stockCode,
    stockName,
    tradeType: STOCK_TRADE_CLOSE,
    price: closeMilli,
    lots,
    at: closedAt,
    fee,
  })
}

// ---------------------------------------------------------------- 纯函数

describe('roundPnl', () => {
  function trade(tradeType: string, amount: number, fee: number): StockTrade {
    return {
      id: 't',
      ledgerId: LEDGER,
      stockCode: '600000',
      stockName: '浦发银行',
      tradeType,
      roundId: '',
      orderId: '',
      orderSeq: 1,
      price: 0,
      lots: 0,
      shares: 0,
      amount,
      fee,
      commission: 0,
      stampDuty: 0,
      transferFee: 0,
      realizedPnl: null,
      roundFee: null,
      remark: '',
      tradeTime: 0,
      createdAt: 0,
    }
  }

  it('subtracts buy cost including fees', () => {
    const result = roundPnl([
      trade(STOCK_TRADE_OPEN, 10_000, 5),
      trade(STOCK_TRADE_CLOSE, 11_000, 6),
    ])
    expect(result.buyCost).toBe(10_005)
    expect(result.pnl).toBe(11_000 - 6 - 10_005)
    expect(result.pnlRate).toBe(Math.round((result.pnl / 10_005) * 10_000) / 100)
  })

  it('counts reduce as a sell', () => {
    const result = roundPnl([
      trade(STOCK_TRADE_OPEN, 10_000, 0),
      trade(STOCK_TRADE_ADD, 5_000, 0),
      trade(STOCK_TRADE_REDUCE, 6_000, 0),
      trade(STOCK_TRADE_CLOSE, 10_000, 0),
    ])
    expect(result.buyCost).toBe(15_000)
    expect(result.pnl).toBe(16_000 - 15_000)
  })

  it('has a zero rate without buy cost', () => {
    const result = roundPnl([trade(STOCK_TRADE_CLOSE, 1_000, 0)])
    expect(result.buyCost).toBe(0)
    expect(result.pnl).toBe(1_000)
    expect(result.pnlRate).toBe(0)
  })
})

describe('deriveTradeCycles', () => {
  function trade(id: string, tradeType: string, at: number): StockTrade {
    return {
      id,
      ledgerId: LEDGER,
      stockCode: '600000',
      stockName: '浦发银行',
      tradeType,
      roundId: '',
      orderId: '',
      orderSeq: 1,
      price: 0,
      lots: 0,
      shares: 0,
      amount: 0,
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
  }

  it('only a close ends a round (a reduce to zero does not)', () => {
    const cycles = deriveTradeCycles([
      trade('a', STOCK_TRADE_OPEN, 10),
      trade('b', STOCK_TRADE_REDUCE, 20),
      trade('c', STOCK_TRADE_ADD, 30),
      trade('d', STOCK_TRADE_CLOSE, 40),
      trade('e', STOCK_TRADE_OPEN, 50),
    ])
    expect(cycles).toHaveLength(1)
    expect(cycles[0].ids).toEqual(['a', 'b', 'c', 'd'])
    expect(cycles[0].openedAt).toBe(10)
    expect(cycles[0].closedAt).toBe(40)
  })
})

// ---------------------------------------------------------------- 回填与读层

describe('stock history read layer', () => {
  it('archives a closed round with all of its trades', async () => {
    const workspace = newWorkspace()
    const code = '600000'
    const name = '浦发银行'
    const closeAt = 1_700_000_300

    // 建仓 100 手 → 加仓 100 手 → 减仓 100 手 → 清仓 100 手
    const ids = [
      seedTrade(workspace, {
        stockCode: code,
        stockName: name,
        tradeType: STOCK_TRADE_OPEN,
        price: 10_000,
        lots: 100,
        at: 1_700_000_000,
        fee: 2_454,
      }),
      seedTrade(workspace, {
        stockCode: code,
        stockName: name,
        tradeType: STOCK_TRADE_ADD,
        price: 11_000,
        lots: 100,
        at: 1_700_000_100,
        fee: 2_699,
      }),
      seedTrade(workspace, {
        stockCode: code,
        stockName: name,
        tradeType: STOCK_TRADE_REDUCE,
        price: 12_000,
        lots: 100,
        at: 1_700_000_200,
        fee: 8_945,
      }),
      seedTrade(workspace, {
        stockCode: code,
        stockName: name,
        tradeType: STOCK_TRADE_CLOSE,
        price: 12_500,
        lots: 100,
        at: closeAt,
        fee: 9_318,
      }),
    ]

    const histories = await listTradeHistories(workspace.db, LEDGER, noQuotes)
    expect(histories).toHaveLength(1)
    expect(histories[0].stockCode).toBe(code)
    expect(histories[0].stockName).toBe(name)
    expect(histories[0].roundCount).toBe(1)
    expect(histories[0].lastClosedAt).toBe(closeAt)
    expect(histories[0].latestPrice).toBeUndefined()

    const detail = getTradeHistoryDetail(workspace.db, LEDGER, code)
    expect(detail.rounds).toHaveLength(1)
    const round = detail.rounds[0]
    expect(round.roundNo).toBe(1)
    expect(round.openedAt).toBe(1_700_000_000)
    expect(round.closedAt).toBe(closeAt)
    expect(round.trades).toHaveLength(4)
    expect(round.trades.map((item) => item.tradeType)).toEqual([
      STOCK_TRADE_OPEN,
      STOCK_TRADE_ADD,
      STOCK_TRADE_REDUCE,
      STOCK_TRADE_CLOSE,
    ])
    // 回填后每笔都挂在轮次上
    for (let index = 0; index < ids.length; index += 1) {
      expect(round.trades[index].id).toBe(ids[index])
      expect(round.trades[index].roundId).toBe(round.id)
    }

    // 买入成本 = (10000000+2454) + (11000000+2699) = 21005153
    // 卖出净额 = (12000000-8945) + (12500000-9318) = 24481737
    const wantPnl = 24_481_737 - 21_005_153
    expect(round.pnl).toBe(wantPnl)
    expect(detail.totalPnl).toBe(wantPnl)
    expect(round.pnlRate).toBeGreaterThan(16)
    expect(round.pnlRate).toBeLessThan(17)
    expect([detail.winCount, detail.lossCount]).toEqual([1, 0])
    expect(detail.totalPnlRate).toBe(percentOf(wantPnl, 21_005_153))
  })

  it('reuses one history for multiple rounds', async () => {
    const workspace = newWorkspace()
    const code = '600000'
    const name = '浦发银行'
    // 第一轮盈利；第二轮亏损
    seedUnattachedRound(workspace, code, name, 10_000, 11_000, 10, 1_700_001_000, 1_700_001_100)
    seedUnattachedRound(workspace, code, name, 20_000, 19_000, 10, 1_700_001_200, 1_700_001_300)

    const histories = await listTradeHistories(workspace.db, LEDGER, noQuotes)
    expect(histories).toHaveLength(1)
    expect(histories[0].roundCount).toBe(2)
    expect(histories[0].lastClosedAt).toBe(1_700_001_300)

    const detail = getTradeHistoryDetail(workspace.db, LEDGER, code)
    expect(detail.rounds.map((round) => round.roundNo)).toEqual([1, 2])
    expect(detail.rounds[0].pnl).toBeGreaterThan(0)
    expect(detail.rounds[1].pnl).toBeLessThan(0)
    expect([detail.winCount, detail.lossCount]).toEqual([1, 1])
    expect(detail.totalPnl).toBe(detail.rounds[0].pnl + detail.rounds[1].pnl)
  })

  it('backfills legacy trades idempotently', async () => {
    const workspace = newWorkspace()
    const code = '600000'
    const name = '浦发银行'
    // 功能上线前的存量交易：两轮完整轮次，round_id 均为空
    seedUnattachedRound(
      workspace, code, name, 10_000, 12_000, 10, 1_690_000_000, 1_690_000_100, 500,
    )
    seedUnattachedRound(
      workspace, code, name, 9_000, 8_000, 10, 1_690_000_200, 1_690_000_300, 500,
    )

    const histories = await listTradeHistories(workspace.db, LEDGER, noQuotes)
    expect(histories).toHaveLength(1)
    expect(histories[0].roundCount).toBe(2)

    const detail = getTradeHistoryDetail(workspace.db, LEDGER, code)
    expect(detail.rounds).toHaveLength(2)
    expect(detail.rounds[0].pnl).toBeGreaterThan(0)
    expect(detail.rounds[1].pnl).toBeLessThan(0)
    for (const round of detail.rounds) {
      expect(round.trades).toHaveLength(2)
      for (const trade of round.trades) expect(trade.roundId).toBe(round.id)
    }

    // 再次读取应幂等，不重复建轮次
    const again = await listTradeHistories(workspace.db, LEDGER, noQuotes)
    expect(again[0].roundCount).toBe(2)
  })

  it('does not archive an open round, then archives it on close', async () => {
    const workspace = newWorkspace()
    const code = '600000'
    const name = '浦发银行'
    seedTrade(workspace, {
      stockCode: code, stockName: name, tradeType: STOCK_TRADE_OPEN,
      price: 10_000, lots: 10, at: 1_690_000_000,
    })
    seedTrade(workspace, {
      stockCode: code, stockName: name, tradeType: STOCK_TRADE_ADD,
      price: 11_000, lots: 10, at: 1_690_000_100,
    })

    const histories = await listTradeHistories(workspace.db, LEDGER, noQuotes)
    expect(histories).toHaveLength(0)
    const error = appError(() => getTradeHistoryDetail(workspace.db, LEDGER, code))
    expect(error.status).toBe(404)
    expect(error.message).toBe('该股票暂无交易历史')

    // 随后清仓：本轮从第一次建仓开始完整归档（列表入口触发回填）
    seedTrade(workspace, {
      stockCode: code, stockName: name, tradeType: STOCK_TRADE_CLOSE,
      price: 12_000, lots: 20, at: 1_690_000_200,
    })
    await listTradeHistories(workspace.db, LEDGER, noQuotes)
    const detail = getTradeHistoryDetail(workspace.db, LEDGER, code)
    expect(detail.rounds).toHaveLength(1)
    expect(detail.rounds[0].trades).toHaveLength(3)
    expect(detail.rounds[0].openedAt).toBe(1_690_000_000)
  })

  it('keeps a zero-share close marker out of the detail trades', async () => {
    const workspace = newWorkspace()
    const code = '600000'
    const name = '浦发银行'
    seedTrade(workspace, {
      stockCode: code, stockName: name, tradeType: STOCK_TRADE_OPEN,
      price: 10_000, lots: 100, at: 1_700_000_000,
    })
    seedTrade(workspace, {
      stockCode: code, stockName: name, tradeType: STOCK_TRADE_REDUCE,
      price: 11_000, lots: 100, at: 1_700_000_100,
    })
    // 清仓时「只归档」的 0 手标记成交
    seedTrade(workspace, {
      stockCode: code, stockName: name, tradeType: STOCK_TRADE_CLOSE,
      price: 0, lots: 0, shares: 0, amount: 0, at: 1_700_000_200,
    })

    // 列表入口触发回填，详情再按已归档轮次读取
    await listTradeHistories(workspace.db, LEDGER, noQuotes)
    const detail = getTradeHistoryDetail(workspace.db, LEDGER, code)
    expect(detail.rounds).toHaveLength(1)
    expect(detail.rounds[0].tradeCount).toBe(2)
    expect(detail.rounds[0].trades).toHaveLength(2)
    expect(detail.rounds[0].pnl).toBe(1_000_000)
    // 轮次上仍挂着 3 笔成交（标记成交不消失，只是不进详情成交列表）
    expect(listTradesByRound(workspace.db, detail.rounds[0].id)).toHaveLength(3)
  })

  it('summarizes across stocks', async () => {
    const workspace = newWorkspace()
    const codeA = '600000'
    const codeB = '000001'
    // A：第一轮盈利，第二轮亏损
    seedUnattachedRound(workspace, codeA, '浦发银行', 10_000, 12_000, 10, 1_690_002_000, 1_690_002_100)
    seedUnattachedRound(workspace, codeA, '浦发银行', 20_000, 18_000, 10, 1_690_002_200, 1_690_002_300)
    // B：一轮盈利
    seedUnattachedRound(workspace, codeB, '平安银行', 5_000, 5_500, 5, 1_690_002_400, 1_690_002_500)

    const summary = getTradeHistorySummary(workspace.db, LEDGER)
    expect(summary.stockCount).toBe(2)
    expect(summary.roundCount).toBe(3)
    expect([summary.winCount, summary.lossCount]).toEqual([2, 1])

    let wantPnl = 0
    for (const code of [codeA, codeB]) {
      const detail = getTradeHistoryDetail(workspace.db, LEDGER, code)
      for (const round of detail.rounds) wantPnl += round.pnl
    }
    expect(summary.totalPnl).toBe(wantPnl)
    expect(summary.totalPnlRate).toBeGreaterThan(0)
  })

  it('attaches quotes and sorts by last close time descending', async () => {
    const workspace = newWorkspace()
    seedUnattachedRound(
      workspace, '600000', '浦发银行', 10_000, 11_000, 10, 1_700_000_000, 1_700_000_100,
    )
    seedUnattachedRound(
      workspace, '000001', '平安银行', 20_000, 19_000, 10, 1_700_000_000, 1_700_000_200,
    )
    const fetcher = stubQuotes({
      '600000': {
        stockCode: '600000',
        latestPrice: 12_340,
        prevClose: 12_000,
        quoteTime: 1_700_000_000,
      },
      // 0 = 停牌 / 无行情：不该回填 latestPrice
      '000001': { stockCode: '000001', latestPrice: 0, prevClose: 0, quoteTime: 0 },
    })

    const items = await listTradeHistories(workspace.db, LEDGER, fetcher)
    expect(items.map((item) => item.stockCode)).toEqual(['000001', '600000'])
    const byCode = new Map(items.map((item) => [item.stockCode, item]))
    expect(byCode.get('600000')?.latestPrice).toBe(12_340)
    expect(byCode.get('000001')?.latestPrice).toBeUndefined()
  })

  it('keeps DAO order for histories with the same last close time', async () => {
    const workspace = newWorkspace()
    // DAO 的列表序是 updated_at DESC, created_at DESC；回填后的稳定排序不能打乱同值项
    for (const [id, code, now] of [
      ['history-a', '600000', 100],
      ['history-b', '000001', 200],
    ] as const) {
      createTradeHistory(
        workspace.db,
        { id, ledgerId: LEDGER, stockCode: code, stockName: code, createdAt: 0, updatedAt: 0 },
        now,
      )
      createTradeRound(
        workspace.db,
        {
          id: `round-${code}`,
          ledgerId: LEDGER,
          stockCode: code,
          historyId: id,
          roundNo: 1,
          openedAt: 1,
          closedAt: 500,
          tag: STOCK_TAG_ANALYSIS,
          review: '',
          createdAt: 0,
        },
        now,
      )
    }

    const items = await listTradeHistories(workspace.db, LEDGER, noQuotes)
    expect(items.map((item) => item.stockCode)).toEqual(['000001', '600000'])
    expect(items.map((item) => item.lastClosedAt)).toEqual([500, 500])
  })

  it('groups archived day reviews by round and ignores the open round', async () => {
    const workspace = newWorkspace()
    const code = '600000'
    seedUnattachedRound(
      workspace, code, '浦发银行', 10_000, 11_000, 10, 1_700_000_000, 1_700_000_100,
    )
    await listTradeHistories(workspace.db, LEDGER, noQuotes)
    const detailBefore = getTradeHistoryDetail(workspace.db, LEDGER, code)
    const roundId = detailBefore.rounds[0].id

    const insert = workspace.db.prepare(
      'INSERT INTO stock_day_review ' +
        '(id, ledger_id, stock_code, round_id, review_date, review, created_at, updated_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    insert.run('day-1', LEDGER, code, roundId, '2026-10-15', '第一篇', 1, 1)
    insert.run('day-2', LEDGER, code, roundId, '2026-10-16', '第二篇', 1, 1)
    // 当前轮（round_id = ''）的复盘不属于任何归档轮次
    insert.run('day-open', LEDGER, code, '', '2026-10-17', '在建', 1, 1)

    const detail = getTradeHistoryDetail(workspace.db, LEDGER, code)
    expect(detail.rounds[0].dayReviews).toEqual([
      { date: '2026-10-16', review: '第二篇' },
      { date: '2026-10-15', review: '第一篇' },
    ])
  })

  it('is idempotent for one stock and creates no history while the round is open', () => {
    const workspace = newWorkspace()
    const code = '600000'
    seedTrade(workspace, {
      stockCode: code, stockName: '浦发银行', tradeType: STOCK_TRADE_OPEN,
      price: 10_000, lots: 10, at: 1_700_000_000,
    })
    ensureStockHistoryBackfill(workspace.db, LEDGER, code)
    ensureStockHistoryBackfill(workspace.db, LEDGER, code)
    expect(appError(() => getTradeHistoryDetail(workspace.db, LEDGER, code)).status).toBe(404)
  })

  it('writes the default analysis tag on backfilled rounds', async () => {
    const workspace = newWorkspace()
    const code = '600000'
    seedUnattachedRound(
      workspace, code, '浦发银行', 10_000, 11_000, 10, 1_700_000_000, 1_700_000_100,
    )
    await listTradeHistories(workspace.db, LEDGER, noQuotes)
    const detail = getTradeHistoryDetail(workspace.db, LEDGER, code)
    expect(detail.rounds[0].tag).toBe(STOCK_TAG_ANALYSIS)

    // 归档后的标签可改（读层只回读，写由 DAO / 上层负责）
    updateTradeRoundTag(workspace.db, detail.rounds[0].id, STOCK_TAG_DABAN)
    expect(getTradeHistoryDetail(workspace.db, LEDGER, code).rounds[0].tag).toBe(STOCK_TAG_DABAN)
  })
})
