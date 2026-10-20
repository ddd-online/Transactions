import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { closeWorkspace, openWorkspace } from '../../electron/db'
import { openDatabase } from '../../electron/db/driver'
import type { Db } from '../../electron/db/driver'
import {
  attachUnattachedTrades,
  countTradeRounds,
  createPosition,
  createTrade,
  createTradeHistory,
  createTradeRound,
  deleteTradeHistoriesByLedger,
  deleteTradeRound,
  deleteTradesByIds,
  deleteTradesByOrder,
  firstUnattachedTrade,
  getPosition,
  getTrade,
  getTradeHistory,
  getTradeRound,
  listAllTradesAsc,
  listPositions,
  listTradeHistories,
  listTradeRounds,
  listTradeRoundsByStock,
  listTrades,
  listTradesAsc,
  listTradesByOrder,
  listTradesByRound,
  listTradeStocks,
  minUnattachedTradeTime,
  queryStockName,
  updatePosition,
  updateTrade,
  updateTradeHistoryName,
  updateTradeRoundDerived,
  updateTradeRoundReview,
  updateTradeRoundTag,
  updateTradeSettlement,
  updateTradesRoundId,
  type StockPosition,
  type StockTradeHistory,
  type StockTradeRound,
} from '../../electron/db/dao/stock-trade'
import {
  STOCK_TRADE_ADD,
  STOCK_TRADE_CLOSE,
  STOCK_TRADE_OPEN,
  type StockTrade,
} from '../../shared/domain/models'
import { AppError } from '../../shared/errors'

const directories: string[] = []

function workspaceDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'tr-stock-trade-dao-test-'))
  directories.push(directory)
  return directory
}

afterEach(() => {
  closeWorkspace()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function openTestWorkspace() {
  return openWorkspace(workspaceDirectory())
}

function expectNotFound(fn: () => unknown): void {
  try {
    fn()
    throw new Error('应当抛 404')
  } catch (error) {
    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).status).toBe(404)
  }
}

function makePosition(overrides: Partial<StockPosition> = {}): StockPosition {
  return {
    id: 'p1',
    ledgerId: 'l1',
    stockCode: '600000',
    stockName: '浦发银行',
    quantity: 1000,
    totalCost: 1_000_510,
    realizedPnl: 0,
    review: '本轮草稿',
    tag: '',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

function makeTrade(
  id: string,
  orderId: string,
  orderSeq: number,
  tradeTime: number,
  overrides: Partial<StockTrade> = {},
): StockTrade {
  return {
    id,
    ledgerId: 'l1',
    stockCode: '600000',
    stockName: '浦发银行',
    tradeType: STOCK_TRADE_OPEN,
    roundId: '',
    orderId,
    orderSeq,
    price: 1000,
    lots: 10,
    shares: 1000,
    amount: 1_000_000,
    fee: 0,
    commission: 0,
    stampDuty: 0,
    transferFee: 0,
    realizedPnl: null,
    tradeTime,
    roundFee: null,
    remark: '不应落库的备注',
    createdAt: 0,
    ...overrides,
  }
}

function makeHistory(
  id: string,
  stockCode = '600000',
  stockName = '浦发银行',
  overrides: Partial<StockTradeHistory> = {},
): StockTradeHistory {
  return {
    id,
    ledgerId: 'l1',
    stockCode,
    stockName,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

function makeRound(
  id: string,
  roundNo: number,
  stockCode = '600000',
  overrides: Partial<StockTradeRound> = {},
): StockTradeRound {
  return {
    id,
    ledgerId: 'l1',
    stockCode,
    historyId: 'h1',
    roundNo,
    openedAt: 100,
    closedAt: 200,
    tag: '分析',
    review: '',
    createdAt: 0,
    ...overrides,
  }
}

function idsOf(items: ReadonlyArray<{ id: string }>): string[] {
  return items.map((item) => item.id)
}

describe('stock-trade DAO', () => {
  it('round-trips a position and maps every cents column', () => {
    const workspace = openTestWorkspace()
    const position = makePosition({
      totalCost: 1_234_567,
      realizedPnl: -98_765,
      review: '本轮复盘',
      tag: '打板',
    })

    createPosition(workspace.db, position, 1_700_000_000)

    expect(getPosition(workspace.db, 'l1', '600000')).toEqual({
      ...position,
      createdAt: 1_700_000_000,
      updatedAt: 1_700_000_000,
    })
    expectNotFound(() => getPosition(workspace.db, 'l1', 'absent'))
  })

  it('lists positions by quantity desc then created_at asc and updates only derived fields', () => {
    const workspace = openTestWorkspace()
    createPosition(workspace.db, makePosition({ id: 'a', stockCode: 'a', quantity: 100 }), 100)
    createPosition(workspace.db, makePosition({ id: 'b', stockCode: 'b', quantity: 200 }), 200)
    createPosition(workspace.db, makePosition({ id: 'c', stockCode: 'c', quantity: 100 }), 300)

    expect(idsOf(listPositions(workspace.db, 'l1'))).toEqual(['b', 'a', 'c'])

    const updated: StockPosition = {
      ...makePosition({ id: 'b', stockCode: 'b', stockName: '改名后' }),
      quantity: 0,
      totalCost: 0,
      realizedPnl: 12_345,
      review: '',
      tag: '追涨',
    }
    updatePosition(workspace.db, updated, 400)

    expect(getPosition(workspace.db, 'l1', 'b')).toEqual({
      ...updated,
      createdAt: 200,
      updatedAt: 400,
    })
  })

  it('round-trips a trade and maps price_milli plus every cents column', () => {
    const workspace = openTestWorkspace()
    const roundFee = {
      commissionRate: 0.00005,
      minCommission: 0,
      stampDutyRate: 0,
      transferFeeRate: 0.00001,
    }
    const trade = makeTrade('t1', 'o1', 2, 1_700_000_000, {
      stockCode: '600519',
      stockName: '贵州茅台',
      tradeType: STOCK_TRADE_CLOSE,
      roundId: 'r1',
      price: 4389,
      lots: 2,
      shares: 200,
      amount: 87_780,
      fee: 512,
      commission: 500,
      stampDuty: 0,
      transferFee: 12,
      realizedPnl: 12_345,
      roundFee,
      remark: '清仓备注',
    })

    createTrade(workspace.db, trade, 1_700_000_100)

    expect(getTrade(workspace.db, 't1')).toEqual({
      ...trade,
      createdAt: 1_700_000_100,
    })
    expectNotFound(() => getTrade(workspace.db, 'absent'))
  })

  it('treats a partial round fee snapshot as absent and keeps NULL realized pnl', () => {
    const workspace = openTestWorkspace()
    const roundFee = {
      commissionRate: 0.00005,
      minCommission: 0,
      stampDutyRate: 0,
      transferFeeRate: 0,
    }
    createTrade(workspace.db, makeTrade('t1', 'o1', 1, 100), 100)
    createTrade(workspace.db, makeTrade('t2', 'o2', 1, 200, { roundFee }), 200)

    expect(getTrade(workspace.db, 't1').roundFee).toBeNull()
    expect(getTrade(workspace.db, 't1').realizedPnl).toBeNull()
    expect(getTrade(workspace.db, 't2').roundFee).toEqual(roundFee)

    const listed = listAllTradesAsc(workspace.db, 'l1')
    expect(listed.map((trade) => trade.roundFee)).toEqual([null, roundFee])

    workspace.db
      .prepare('UPDATE stock_trade SET round_stamp_duty_rate = NULL WHERE id = ?')
      .run('t2')
    expect(getTrade(workspace.db, 't2').roundFee).toBeNull()
  })

  it('keeps remark and created_at on create', () => {
    const workspace = openTestWorkspace()
    createTrade(workspace.db, makeTrade('t1', 'o1', 1, 100), 123)
    const loaded = getTrade(workspace.db, 't1')
    expect(loaded.remark).toBe('不应落库的备注')
    expect(loaded.createdAt).toBe(123)

    createTrade(workspace.db, makeTrade('t2', 'o2', 1, 200, { remark: '' }), 456)
    expect(getTrade(workspace.db, 't2').remark).toBe('')
  })

  it('lists a stock trades newest first and oldest first', () => {
    const workspace = openTestWorkspace()
    createTrade(workspace.db, makeTrade('early', 'o-early', 1, 100), 100)
    createTrade(workspace.db, makeTrade('mid', 'o-mid', 1, 200), 200)
    createTrade(workspace.db, makeTrade('late-a', 'o-late-a', 1, 300), 300)
    createTrade(workspace.db, makeTrade('late-b', 'o-late-b', 1, 300), 400)

    expect(idsOf(listTrades(workspace.db, 'l1', '600000'))).toEqual([
      'late-b',
      'late-a',
      'mid',
      'early',
    ])
    expect(idsOf(listTradesAsc(workspace.db, 'l1', '600000'))).toEqual([
      'early',
      'mid',
      'late-a',
      'late-b',
    ])
  })

  it('breaks ascending trade ties by created_at then id', () => {
    const workspace = openTestWorkspace()
    createTrade(workspace.db, makeTrade('c', 'o1', 1, 100), 100)
    createTrade(workspace.db, makeTrade('b', 'o1', 1, 100), 100)
    createTrade(workspace.db, makeTrade('a', 'o1', 1, 100), 200)

    expect(idsOf(listTradesAsc(workspace.db, 'l1', '600000'))).toEqual(['b', 'c', 'a'])
  })

  it('orders all ledger trades by trade_time, created_at, order_seq then id', () => {
    const workspace = openTestWorkspace()
    createTrade(workspace.db, makeTrade('order-2', 'o2', 2, 100), 100)
    createTrade(workspace.db, makeTrade('order-1', 'o1', 1, 100), 100)
    createTrade(workspace.db, makeTrade('order-0', 'o0', 1, 100), 100)
    createTrade(workspace.db, makeTrade('order-early', 'o-early', 9, 100), 50)

    expect(idsOf(listAllTradesAsc(workspace.db, 'l1'))).toEqual([
      'order-early',
      'order-0',
      'order-1',
      'order-2',
    ])
  })

  it('lists one order by order_seq then created_at and id', () => {
    const workspace = openTestWorkspace()
    createTrade(workspace.db, makeTrade('t2', 'o1', 1, 100), 200)
    createTrade(workspace.db, makeTrade('t1', 'o1', 1, 100), 100)
    createTrade(workspace.db, makeTrade('t0', 'o1', 1, 100), 100)
    createTrade(workspace.db, makeTrade('t3', 'o2', 1, 200), 200)

    expect(idsOf(listTradesByOrder(workspace.db, 'l1', 'o1'))).toEqual(['t0', 't1', 't2'])

    deleteTradesByOrder(workspace.db, 'l1', 'o1')
    expect(idsOf(listAllTradesAsc(workspace.db, 'l1'))).toEqual(['t3'])

    deleteTradesByIds(workspace.db, [])
    expect(idsOf(listAllTradesAsc(workspace.db, 'l1'))).toEqual(['t3'])
    deleteTradesByIds(workspace.db, ['t3'])
    expect(listAllTradesAsc(workspace.db, 'l1')).toEqual([])
  })

  it('updates trade body but leaves name, remark and created_at untouched', () => {
    const workspace = openTestWorkspace()
    createTrade(workspace.db, makeTrade('t1', 'o1', 1, 100), 100)

    updateTrade(
      workspace.db,
      makeTrade('t1', 'o2', 3, 300, {
        stockName: '不应写入的名称',
        tradeType: STOCK_TRADE_ADD,
        roundId: 'r9',
        price: 5000,
        lots: 1,
        shares: 100,
        amount: 50_000,
        fee: 500,
        commission: 500,
        stampDuty: 0,
        transferFee: 0,
        realizedPnl: 777,
        remark: '不应写入的备注',
      }),
    )

    const loaded = getTrade(workspace.db, 't1')
    expect(loaded).toMatchObject({
      stockName: '浦发银行',
      remark: '不应落库的备注',
      createdAt: 100,
      tradeType: STOCK_TRADE_ADD,
      roundId: 'r9',
      orderId: 'o2',
      orderSeq: 3,
      price: 5000,
      lots: 1,
      shares: 100,
      amount: 50_000,
      fee: 500,
      commission: 500,
      stampDuty: 0,
      transferFee: 0,
      realizedPnl: 777,
      tradeTime: 300,
    })
  })

  it('writes only the settlement fields including a NULL realized pnl', () => {
    const workspace = openTestWorkspace()
    createTrade(workspace.db, makeTrade('t1', 'o1', 1, 100, { fee: 321 }), 100)

    updateTradeSettlement(workspace.db, 't1', 'r1', 999)
    expect(getTrade(workspace.db, 't1')).toMatchObject({ roundId: 'r1', realizedPnl: 999, fee: 321 })

    updateTradeSettlement(workspace.db, 't1', 'r2', null)
    expect(getTrade(workspace.db, 't1')).toMatchObject({ roundId: 'r2', realizedPnl: null, fee: 321 })
  })

  it('round-trips history and lists it by updated_at then created_at', () => {
    const workspace = openTestWorkspace()
    createTradeHistory(workspace.db, makeHistory('h1'), 100)
    createTradeHistory(workspace.db, makeHistory('h2', '000001', '平安银行'), 200)

    expect(getTradeHistory(workspace.db, 'l1', '600000')).toEqual({
      ...makeHistory('h1'),
      createdAt: 100,
      updatedAt: 100,
    })
    expect(idsOf(listTradeHistories(workspace.db, 'l1'))).toEqual(['h2', 'h1'])

    updateTradeHistoryName(workspace.db, 'l1', '600000', '浦发银行改名', 300)
    expect(getTradeHistory(workspace.db, 'l1', '600000')).toEqual({
      ...makeHistory('h1', '600000', '浦发银行改名'),
      createdAt: 100,
      updatedAt: 300,
    })
    expect(idsOf(listTradeHistories(workspace.db, 'l1'))).toEqual(['h1', 'h2'])

    // 同一 updated_at 时按 created_at 倒序
    workspace.db
      .prepare('UPDATE stock_trade_history SET updated_at = 300 WHERE ledger_id = ?')
      .run('l1')
    expect(idsOf(listTradeHistories(workspace.db, 'l1'))).toEqual(['h2', 'h1'])

    expectNotFound(() => getTradeHistory(workspace.db, 'l1', 'absent'))
  })

  it('deletes histories for one ledger only', () => {
    const workspace = openTestWorkspace()
    createTradeHistory(workspace.db, makeHistory('h1'))
    createTradeHistory(workspace.db, makeHistory('h2', '600000', '浦发银行', { ledgerId: 'l2' }))

    deleteTradeHistoriesByLedger(workspace.db, 'l1')

    expect(listTradeHistories(workspace.db, 'l1')).toEqual([])
    expect(idsOf(listTradeHistories(workspace.db, 'l2'))).toEqual(['h2'])
    expectNotFound(() => getTradeHistory(workspace.db, 'l1', '600000'))
  })

  it('lists distinct traded stock codes', () => {
    const workspace = openTestWorkspace()
    createTrade(workspace.db, makeTrade('t1', 'o1', 1, 100))
    createTrade(workspace.db, makeTrade('t2', 'o2', 1, 200))
    createTrade(
      workspace.db,
      makeTrade('t3', 'o3', 1, 300, { stockCode: '000001', stockName: '平安银行' }),
    )

    expect(listTradeStocks(workspace.db, 'l1').sort()).toEqual(['000001', '600000'])
  })

  it('round-trips rounds, orders them and preserves review and tag across derived updates', () => {
    const workspace = openTestWorkspace()
    createTradeHistory(workspace.db, makeHistory('h1'))
    createTradeHistory(workspace.db, makeHistory('h2', '000001', '平安银行'))
    createTradeRound(workspace.db, makeRound('r2', 2), 100)
    createTradeRound(workspace.db, makeRound('r1', 1), 200)
    createTradeRound(
      workspace.db,
      makeRound('r3', 1, '000001', { historyId: 'h2', tag: '' }),
      300,
    )

    expect(countTradeRounds(workspace.db, 'h1')).toBe(2)
    expect(countTradeRounds(workspace.db, 'h2')).toBe(1)
    expect(getTradeRound(workspace.db, 'r1')).toEqual({
      ...makeRound('r1', 1),
      createdAt: 200,
    })
    expect(idsOf(listTradeRoundsByStock(workspace.db, 'l1', '600000'))).toEqual(['r1', 'r2'])
    expect(idsOf(listTradeRounds(workspace.db, 'l1'))).toEqual(['r3', 'r1', 'r2'])
    expect(getTradeRound(workspace.db, 'r3').tag).toBe('')

    updateTradeRoundReview(workspace.db, 'r1', '复盘正文')
    updateTradeRoundTag(workspace.db, 'r1', '打板')
    expect(getTradeRound(workspace.db, 'r1')).toMatchObject({ review: '复盘正文', tag: '打板' })

    updateTradeRoundDerived(workspace.db, 'r1', 'h-other', 111, 222)
    expect(getTradeRound(workspace.db, 'r1')).toMatchObject({
      historyId: 'h-other',
      openedAt: 111,
      closedAt: 222,
      review: '复盘正文',
      tag: '打板',
    })

    deleteTradeRound(workspace.db, 'r2')
    expect(idsOf(listTradeRoundsByStock(workspace.db, 'l1', '600000'))).toEqual(['r1'])
    expectNotFound(() => getTradeRound(workspace.db, 'r2'))
  })

  it('finds the first unattached trade as the opening order and attaches the rest', () => {
    const workspace = openTestWorkspace()
    expect(firstUnattachedTrade(workspace.db, 'l1', '600000')).toBeNull()
    expect(minUnattachedTradeTime(workspace.db, 'l1', '600000')).toBe(0)

    const roundFee = {
      commissionRate: 0.00005,
      minCommission: 0,
      stampDutyRate: 0,
      transferFeeRate: 0,
    }
    createTrade(workspace.db, makeTrade('t2', 'o2', 1, 100, { roundFee }), 200)
    createTrade(workspace.db, makeTrade('t1', 'o1', 1, 300, { roundFee }), 100)
    createTrade(
      workspace.db,
      makeTrade('other', 'other-order', 1, 50, {
        stockCode: '000001',
        stockName: '平安银行',
      }),
      100,
    )

    expect(firstUnattachedTrade(workspace.db, 'l1', '600000')?.id).toBe('t2')
    expect(minUnattachedTradeTime(workspace.db, 'l1', '600000')).toBe(100)
    expect(minUnattachedTradeTime(workspace.db, 'l1', '000001')).toBe(50)

    attachUnattachedTrades(workspace.db, 'l1', '600000', 'r1')

    expect(firstUnattachedTrade(workspace.db, 'l1', '600000')).toBeNull()
    expect(minUnattachedTradeTime(workspace.db, 'l1', '600000')).toBe(0)
    expect(idsOf(listTradesByRound(workspace.db, 'r1'))).toEqual(['t2', 't1'])
  })

  it('orders trades within a round by trade_time, created_at then id', () => {
    const workspace = openTestWorkspace()
    createTrade(workspace.db, makeTrade('t2', 'o2', 1, 200, { roundId: 'r1' }), 100)
    createTrade(workspace.db, makeTrade('t1', 'o1', 1, 100, { roundId: 'r1' }), 300)
    createTrade(workspace.db, makeTrade('t3', 'o3', 1, 100, { roundId: 'r1' }), 100)
    createTrade(workspace.db, makeTrade('t0', 'o0', 1, 100, { roundId: 'r1' }), 100)

    expect(idsOf(listTradesByRound(workspace.db, 'r1'))).toEqual(['t0', 't3', 't1', 't2'])
  })

  it('bulk-attaches trades by id and ignores an empty id set', () => {
    const workspace = openTestWorkspace()
    createTrade(workspace.db, makeTrade('t1', 'o1', 1, 100), 100)
    createTrade(workspace.db, makeTrade('t2', 'o2', 1, 200), 200)
    createTrade(workspace.db, makeTrade('t3', 'o3', 1, 300), 300)

    updateTradesRoundId(workspace.db, 'r1', [])
    expect(listTradesByRound(workspace.db, 'r1')).toEqual([])

    updateTradesRoundId(workspace.db, 'r1', ['t1', 't3'])

    expect(idsOf(listTradesByRound(workspace.db, 'r1'))).toEqual(['t1', 't3'])
  })

  it('looks up a stock name across ledgers and rejects empty names', () => {
    const workspace = openTestWorkspace()
    expectNotFound(() => queryStockName(workspace.db, '600000'))

    createTrade(workspace.db, makeTrade('empty', 'o1', 1, 100, { stockName: '' }), 100)
    expectNotFound(() => queryStockName(workspace.db, '600000'))

    createTrade(
      workspace.db,
      makeTrade('named', 'o2', 1, 200, { ledgerId: 'other-ledger', stockName: '浦发银行' }),
      200,
    )
    expect(queryStockName(workspace.db, '600000')).toBe('浦发银行')

    // 最近一笔是空名称时按"查无记录"处理（与旧 SQL 的取行口径一致）
    createTrade(workspace.db, makeTrade('newest-empty', 'o3', 1, 300, { stockName: '' }), 300)
    expectNotFound(() => queryStockName(workspace.db, '600000'))
  })

  it('sees writes committed by another connection', () => {
    const workspace = openTestWorkspace()
    for (let round = 0; round < 4; round += 1) {
      expect(listAllTradesAsc(workspace.db, 'l1')).toHaveLength(round)

      const writer: Db = openDatabase(workspace.databasePath)
      try {
        createTrade(writer, makeTrade(`t${round}`, `o${round}`, 1, 100), 100 + round)
      } finally {
        writer.close()
      }

      expect(listAllTradesAsc(workspace.db, 'l1')).toHaveLength(round + 1)
    }
  })
})
