import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { closeWorkspace, openWorkspace } from '../../electron/db'
import { AppError } from '../../shared/errors'
import { addPrincipalAtDate } from '../../electron/services/stock-account'
import { archiveStockData, resetStockData } from '../../electron/services/stock-lifecycle'
import { createTradeOrderWithRoundFee } from '../../electron/services/stock-trade-write'
import type { CreateTradeOrderWithRoundFeeRequest } from '../../shared/types/stock-trade'

const directories: string[] = []

function workspaceDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'tr-stock-lifecycle-'))
  directories.push(directory)
  return directory
}

afterEach(() => {
  closeWorkspace()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function order(
  tradeType: string,
  priceMilli: number,
  lots: number,
  time: number,
): CreateTradeOrderWithRoundFeeRequest {
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

function counts(db: ReturnType<typeof openWorkspace>['db'], ledgerId: string) {
  const tables = [
    'stock_account',
    'stock_fund_record',
    'stock_trade',
    'stock_position',
    'stock_operation',
    'stock_trade_history',
    'stock_trade_round',
    'stock_fee_setting',
  ]
  return Object.fromEntries(
    tables.map((table) => [
      table,
      (
        db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ledger_id = ?`).get(ledgerId) as {
          count: number
        }
      ).count,
    ]),
  )
}

describe('stock lifecycle', () => {
  it('resets every stock table for the ledger', () => {
    const db = openWorkspace(workspaceDirectory()).db
    addPrincipalAtDate(db, 'l1', 100_000, '2026-01-01')
    createTradeOrderWithRoundFee(db, order('open', 5_000, 1, 1_700_000_000))
    expect(counts(db, 'l1')['stock_trade']).toBe(1)

    resetStockData(db, 'l1')
    expect(counts(db, 'l1')).toEqual({
      stock_account: 0,
      stock_fund_record: 0,
      stock_trade: 0,
      stock_position: 0,
      stock_operation: 0,
      stock_trade_history: 0,
      stock_trade_round: 0,
      stock_fee_setting: 0,
    })
  })

  it('refuses to archive while a round is open', () => {
    const db = openWorkspace(workspaceDirectory()).db
    addPrincipalAtDate(db, 'l1', 100_000, '2026-01-01')
    createTradeOrderWithRoundFee(db, order('open', 5_000, 1, 1_700_000_000))
    try {
      archiveStockData(db, 'l1', '归档账本')
      throw new Error('应当拒绝归档')
    } catch (error) {
      expect(error).toBeInstanceOf(AppError)
      expect((error as AppError).status).toBe(409)
      expect((error as AppError).message).toContain('仍有未清仓的轮次（浦发银行）')
    }
  })

  it('archives data into a new ledger, copies fees and clears operations', () => {
    const db = openWorkspace(workspaceDirectory()).db
    addPrincipalAtDate(db, 'l1', 100_000, '2026-01-01')
    createTradeOrderWithRoundFee(db, order('open', 5_000, 1, 1_700_000_000))
    createTradeOrderWithRoundFee(db, order('close', 6_000, 1, 1_700_000_100))
    expect(counts(db, 'l1')['stock_trade_history']).toBe(1)

    const newLedgerId = archiveStockData(db, 'l1', '归档账本')
    expect(newLedgerId.length).toBeGreaterThan(0)

    const original = counts(db, 'l1')
    expect(original['stock_trade']).toBe(0)
    expect(original['stock_operation']).toBe(0)
    expect(original['stock_fee_setting']).toBe(1)
    const moved = counts(db, newLedgerId)
    expect(moved['stock_trade']).toBe(2)
    expect(moved['stock_trade_history']).toBe(1)
    expect(moved['stock_account']).toBe(1)
    expect(moved['stock_position']).toBe(1)
    expect(moved['stock_operation']).toBe(0)

    const feeRows = db
      .prepare('SELECT ledger_id FROM stock_fee_setting ORDER BY ledger_id')
      .all() as Array<{ ledger_id: string }>
    expect(feeRows.map((row) => row.ledger_id).sort()).toEqual([newLedgerId, 'l1'].sort())
  })
})


