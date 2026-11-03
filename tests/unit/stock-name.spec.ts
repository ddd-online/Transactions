import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { closeWorkspace, openWorkspace } from '../../electron/db'
import { AppError } from '../../shared/errors'
import { getTradeHistory, getPosition, listTrades, listTradeRoundsByStock } from '../../electron/db/dao/stock-trade'
import { listStockLessons } from '../../electron/db/dao/stock-lesson'
import { addPrincipalAtDate } from '../../electron/services/stock-account'
import { createLesson } from '../../electron/services/stock-lessons'
import { lookupStockName, refreshStockName } from '../../electron/services/stock-name'
import type { StockQuoteFetcher } from '../../electron/services/stock-quote'
import { createTradeOrderWithRoundFee } from '../../electron/services/stock-trade-write'
import type { CreateTradeOrderWithRoundFeeRequest } from '../../shared/types/stock-trade'

const directories: string[] = []

function workspaceDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'tr-stock-name-'))
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
  stockName = '浦发银行',
): CreateTradeOrderWithRoundFeeRequest {
  return {
    ledgerId: 'l1',
    stockCode: '600000',
    stockName,
    tradeType,
    fills: [{ priceMilli, lots: 1 }],
    tradeTime: time,
    remark: '',
    tag: '分析',
  }
}

/** 只有名称的行情源：没列出来的代码一律查不到（`''`）。 */
function quotes(names: Record<string, string>): StockQuoteFetcher {
  return {
    fetchQuotes: async () => new Map(),
    fetchName: async (code) => names[code] ?? '',
  }
}

function openRound(db: ReturnType<typeof openWorkspace>['db']): void {
  addPrincipalAtDate(db, 'l1', 100_000, '2026-01-01')
  createTradeOrderWithRoundFee(db, order('open', 5_000, at(2026, 1, 5)))
}

function closeRound(db: ReturnType<typeof openWorkspace>['db']): void {
  createTradeOrderWithRoundFee(db, order('close', 6_000, at(2026, 1, 6)))
}

describe('stock name', () => {
  it('looks up a stock name locally first, then from the quote fetcher', async () => {
    const db = openWorkspace(workspaceDirectory()).db
    openRound(db)

    const fetcher = quotes({ '000001': '平安银行' })
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

  it('rewrites every name copy of the code, but not the ledger text', async () => {
    const db = openWorkspace(workspaceDirectory()).db
    openRound(db)
    closeRound(db)
    const roundId = listTradeRoundsByStock(db, 'l1', '600000')[0].id
    createLesson(db, 'l1', '追高要谨慎', roundId)
    const historyBefore = getTradeHistory(db, 'l1', '600000')

    const result = await refreshStockName(db, quotes({ '600000': 'XD浦发银' }), 'l1', '600000')
    expect(result).toEqual({ stockCode: '600000', stockName: 'XD浦发银' })

    expect(getPosition(db, 'l1', '600000').stockName).toBe('XD浦发银')
    expect(listTrades(db, 'l1', '600000').map((trade) => trade.stockName)).toEqual([
      'XD浦发银',
      'XD浦发银',
    ])
    expect(getTradeHistory(db, 'l1', '600000').stockName).toBe('XD浦发银')
    expect(listStockLessons(db, 'l1')[0].stockName).toBe('XD浦发银')

    // 历史集合的 `updated_at` 不动：记录页左栏按它倒序，改名不该把这只股票顶到最上面
    expect(getTradeHistory(db, 'l1', '600000').updatedAt).toBe(historyBefore.updatedAt)

    // 账本文字是当时的快照：资金变化记录与操作日志里的买入 / 卖出那几行仍是旧名字
    const ledgerText = [
      ...(db
        .prepare('SELECT event_text, remark FROM stock_fund_record WHERE ledger_id = ?')
        .all('l1') as Array<{ event_text: string; remark: string }>).map(
        (row) => `${row.event_text}\n${row.remark}`,
      ),
      ...(db
        .prepare('SELECT detail FROM stock_operation WHERE ledger_id = ?')
        .all('l1') as Array<{ detail: string }>).map((row) => row.detail),
    ].join('\n')
    expect(ledgerText).toContain('买入 浦发银行 1手')
    expect(ledgerText).not.toContain('XD浦发银')
  })

  it('rejects codes and quotes that do not resolve, without writing', async () => {
    const db = openWorkspace(workspaceDirectory()).db
    openRound(db)

    let asked = 0
    const counting: StockQuoteFetcher = {
      fetchQuotes: async () => new Map(),
      fetchName: async () => {
        asked += 1
        return ''
      },
    }
    await expect(refreshStockName(db, counting, 'l1', '600000')).rejects.toThrow(
      '行情没有返回 600000 的名称',
    )
    expect(asked).toBe(1)

    await expect(refreshStockName(db, counting, '', '600000')).rejects.toThrow(
      'ledger_id is required',
    )
    await expect(refreshStockName(db, counting, 'l1', '60000')).rejects.toThrow('股票代码不合法')
    expect(asked).toBe(1)
    expect(getPosition(db, 'l1', '600000').stockName).toBe('浦发银行')
  })
})
