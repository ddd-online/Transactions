import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { closeWorkspace, openWorkspace } from '../../electron/db'
import { addPrincipalAtDate } from '../../electron/services/stock-account'
import { getTradeHistoryDetail } from '../../electron/services/stock-history'
import { getStockLedger, saveStockLedger } from '../../electron/services/stock-ledger'
import { createTradeOrderWithRoundFee } from '../../electron/services/stock-trade-write'
import { AppError } from '../../shared/errors'
import type { CreateTradeOrderWithRoundFeeRequest } from '../../shared/types/stock-trade'

const directories: string[] = []

function workspaceDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'tr-stock-ledger-'))
  directories.push(directory)
  return directory
}

afterEach(() => {
  closeWorkspace()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function at(day: number): number {
  return Math.trunc(new Date(2026, 0, day, 12).getTime() / 1000)
}

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

function fields(whyBuy: string, summary: string) {
  return {
    whyBuy,
    stopLoss: '9.00',
    takeProfit: '12.00',
    followedSystem: '是',
    summary,
  }
}

describe('stock ledger', () => {
  it('derives buy numbers while holding, then archives and derives sell numbers on close', () => {
    const db = openWorkspace(workspaceDirectory()).db
    addPrincipalAtDate(db, 'l1', 1_000_000, '2026-01-01')
    createTradeOrderWithRoundFee(db, order('open', 5_000, 1, at(5)))
    createTradeOrderWithRoundFee(db, order('add', 6_000, 1, at(7)))

    const draft = getStockLedger(db, 'l1', { stockCode: '600000' })
    expect(draft.exists).toBe(false)
    expect(draft.closed).toBe(false)
    expect(draft.buyPrice).not.toBe('')
    expect(draft.buyCost).not.toBe('')
    expect([draft.sellPrice, draft.sellNet, draft.netPnl]).toEqual(['', '', ''])

    const saved = saveStockLedger(db, 'l1', {
      stockCode: '600000',
      fields: fields('看好回踩确认', '先小仓试错'),
    })
    expect(saved.exists).toBe(true)
    expect(saved.roundId).toBeNull()
    expect(saved.whyBuy).toBe('看好回踩确认')

    createTradeOrderWithRoundFee(db, order('close', 7_000, 2, at(9)))
    const round = getTradeHistoryDetail(db, 'l1', '600000').rounds[0]
    const archived = getStockLedger(db, 'l1', { roundId: round.id })
    expect(archived.exists).toBe(true)
    expect(archived.closed).toBe(true)
    expect(archived.whyBuy).toBe('看好回踩确认')
    expect(archived.sellPrice).not.toBe('')
    expect(archived.sellNet).not.toBe('')
    expect(archived.netPnl).not.toBe('')

    const edited = saveStockLedger(db, 'l1', {
      roundId: round.id,
      fields: fields('看好回踩确认', '执行得不错'),
    })
    expect(edited.summary).toBe('执行得不错')
    expect(getStockLedger(db, 'l1', { roundId: round.id }).summary).toBe('执行得不错')
  })

  it('creates a history ledger on demand and validates empty text / no open round', () => {
    const db = openWorkspace(workspaceDirectory()).db
    addPrincipalAtDate(db, 'l1', 1_000_000, '2026-01-01')
    createTradeOrderWithRoundFee(db, order('open', 5_000, 1, at(5)))
    createTradeOrderWithRoundFee(db, order('close', 6_000, 1, at(9)))
    const round = getTradeHistoryDetail(db, 'l1', '600000').rounds[0]

    const draft = getStockLedger(db, 'l1', { roundId: round.id })
    expect(draft.exists).toBe(false)
    expect(draft.closed).toBe(true)
    expect(draft.sellNet).not.toBe('')

    const saved = saveStockLedger(db, 'l1', {
      roundId: round.id,
      fields: fields('按计划建仓', '没有按系统执行'),
    })
    expect(saved.exists).toBe(true)
    expect(saved.followedSystem).toBe('是')

    expect(() =>
      saveStockLedger(db, 'l1', {
        roundId: round.id,
        fields: {
          whyBuy: '',
          stopLoss: '',
          takeProfit: '',
          followedSystem: '',
          summary: '',
        },
      }),
    ).toThrow(AppError)
    expect(() =>
      saveStockLedger(db, 'l1', {
        stockCode: '600000',
        fields: fields('没有持仓', ''),
      }),
    ).toThrow(/没有进行中的轮次/)
  })
})
