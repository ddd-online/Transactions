import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { closeWorkspace, openWorkspace } from '../../electron/db'
import { addPrincipalAtDate } from '../../electron/services/stock-account'
import { listStockTrades } from '../../electron/services/stock-trades'
import { createTradeOrderWithRoundFee } from '../../electron/services/stock-trade-write'
import type { CreateTradeOrderWithRoundFeeRequest } from '../../shared/types/stock-trade'

const directories: string[] = []

function workspaceDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'tr-stock-trades-'))
  directories.push(directory)
  return directory
}

afterEach(() => {
  closeWorkspace()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function order(tradeType: string, priceMilli: number, lots: number, time: number): CreateTradeOrderWithRoundFeeRequest {
  return {
    ledgerId: 'l1',
    stockCode: '600000',
    stockName: '浦发银行',
    tradeType,
    fills: [{ priceMilli, lots }],
    tradeTime: time,
    remark: '',
    tag: '分析',
  }
}

describe('stock trade list', () => {
  it('returns only the current round while a position is open', () => {
    const db = openWorkspace(workspaceDirectory()).db
    addPrincipalAtDate(db, 'l1', 100_000, '2026-01-01')
    createTradeOrderWithRoundFee(db, order('open', 5_000, 1, 1_700_000_000))
    createTradeOrderWithRoundFee(db, order('add', 5_100, 1, 1_700_000_100))
    createTradeOrderWithRoundFee(db, order('reduce', 5_200, 1, 1_700_000_200))

    const rows = listStockTrades(db, 'l1', '600000')
    expect(rows).toHaveLength(3)
    expect(rows.map((row) => row.tradeType)).toEqual(['reduce', 'add', 'open'])
    expect(rows[2].price).toBe(5_000)
    expect(rows[2].amount).toBe(50_000)
  })

  it('returns the full history after closing and hides zero-share markers', () => {
    const db = openWorkspace(workspaceDirectory()).db
    addPrincipalAtDate(db, 'l1', 100_000, '2026-01-01')
    createTradeOrderWithRoundFee(db, order('open', 5_000, 1, 1_700_000_000))
    createTradeOrderWithRoundFee(db, order('close', 6_000, 1, 1_700_000_100))

    const rows = listStockTrades(db, 'l1', '600000')
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.tradeType)).toEqual(['close', 'open'])
    expect(rows[0].realizedPnl).not.toBeNull()
  })
})

