import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { closeWorkspace, openWorkspace } from '../../electron/db'
import { AppError } from '../../shared/errors'
import { addPrincipalAtDate } from '../../electron/services/stock-account'
import { createTradeOrderWithRoundFee } from '../../electron/services/stock-trade-write'
import { lookupStockName, updateDayReview, updateRoundReview, updateRoundTag } from '../../electron/services/stock-review'
import { getTradeHistoryDetail } from '../../electron/services/stock-history'
import type { StockQuoteFetcher } from '../../electron/services/stock-quote'
import type { CreateTradeOrderWithRoundFeeRequest } from '../../shared/types/stock-trade'

const directories: string[] = []

function workspaceDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'tr-stock-review-'))
  directories.push(directory)
  return directory
}

afterEach(() => {
  closeWorkspace()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function at(year: number, month: number, day: number): number {
  return Math.trunc(new Date(year, month - 1, day, 12).getTime() / 1000)
}

function order(
  tradeType: string,
  priceMilli: number,
  time: number,
): CreateTradeOrderWithRoundFeeRequest {
  return {
    ledgerId: 'l1',
    stockCode: '600000',
    stockName: '浦发银行',
    tradeType,
    fills: [{ priceMilli, lots: 1 }],
    tradeTime: time,
    remark: '',
    tag: '分析',
  }
}

describe('stock review', () => {
  it('creates, updates and deletes a day review within the current round', () => {
    const db = openWorkspace(workspaceDirectory()).db
    addPrincipalAtDate(db, 'l1', 100_000, '2026-01-01')
    createTradeOrderWithRoundFee(db, order('open', 5_000, at(2026, 1, 5)))

    const rows = updateDayReview(db, 'l1', '600000', '2026-01-05', '  今天观察  ')
    expect(rows).toEqual([{ date: '2026-01-05', review: '今天观察' }])
    expect(updateDayReview(db, 'l1', '600000', '2026-01-05', '改一版')).toEqual([
      { date: '2026-01-05', review: '改一版' },
    ])
    expect(updateDayReview(db, 'l1', '600000', '2026-01-05', '  ')).toEqual([])
  })

  it('rejects dates before the round, in the future, or after closing', () => {
    const db = openWorkspace(workspaceDirectory()).db
    addPrincipalAtDate(db, 'l1', 100_000, '2026-01-01')
    createTradeOrderWithRoundFee(db, order('open', 5_000, at(2026, 1, 5)))

    expect(() => updateDayReview(db, 'l1', '600000', '2026-01-04', 'x')).toThrow(
      '每日复盘不能早于本轮建仓日（2026-01-05）',
    )
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const future = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`
    expect(() => updateDayReview(db, 'l1', '600000', future, 'x')).toThrow(
      '每日复盘只能写到当天',
    )

    createTradeOrderWithRoundFee(db, order('close', 6_000, at(2026, 1, 6)))
    expect(() => updateDayReview(db, 'l1', '600000', '2026-01-06', 'x')).toThrow(
      '该股票已清仓，每日复盘不可再编辑',
    )
  })

  it('updates a round review and returns the refreshed detail', () => {
    const db = openWorkspace(workspaceDirectory()).db
    addPrincipalAtDate(db, 'l1', 100_000, '2026-01-01')
    createTradeOrderWithRoundFee(db, order('open', 5_000, at(2026, 1, 5)))
    createTradeOrderWithRoundFee(db, order('close', 6_000, at(2026, 1, 6)))

    const before = getTradeHistoryDetail(db, 'l1', '600000')
    expect(before.rounds).toHaveLength(1)
    const roundId = before.rounds[0].id
    const detail = updateRoundReview(db, 'l1', roundId, '  复盘一下  ')
    expect(detail.rounds[0].review).toBe('复盘一下')

    expect(() => updateRoundReview(db, 'l1', 'missing', 'x')).toThrow('轮次不存在')
    expect(updateRoundTag(db, 'l1', roundId, '打板').rounds[0].tag).toBe('打板')
    expect(() => updateRoundTag(db, 'l1', roundId, '不存在')).toThrow('无效的交易标签')
  })

  it('looks up a stock name locally first, then from the quote fetcher', async () => {
    const db = openWorkspace(workspaceDirectory()).db
    addPrincipalAtDate(db, 'l1', 100_000, '2026-01-01')
    createTradeOrderWithRoundFee(db, order('open', 5_000, at(2026, 1, 5)))

    const fetcher: StockQuoteFetcher = {
      fetchQuotes: async () => new Map(),
      fetchName: async (code) => (code === '000001' ? '平安银行' : ''),
    }
    expect(await lookupStockName(db, fetcher, '600000')).toEqual({
      stockCode: '600000',
      stockName: '浦发银行',
    })
    expect(await lookupStockName(db, fetcher, '000001')).toEqual({
      stockCode: '000001',
      stockName: '平安银行',
    })
    await expect(lookupStockName(db, fetcher, '999999')).rejects.toBeInstanceOf(AppError)
  })
})

