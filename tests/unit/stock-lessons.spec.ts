import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { closeWorkspace, openWorkspace } from '../../electron/db'
import { addPrincipalAtDate } from '../../electron/services/stock-account'
import { getTradeHistoryDetail } from '../../electron/services/stock-history'
import {
  createLesson,
  listLessons,
  listRoundOptions,
  removeLesson,
  updateLesson,
} from '../../electron/services/stock-lessons'
import { createTradeOrderWithRoundFee } from '../../electron/services/stock-trade-write'
import { AppError } from '../../shared/errors'
import type { CreateTradeOrderWithRoundFeeRequest } from '../../shared/types/stock-trade'

const directories: string[] = []

function workspaceDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'tr-stock-lessons-'))
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
  time: number,
): CreateTradeOrderWithRoundFeeRequest {
  return {
    ledgerId: 'l1',
    stockCode: '600000',
    stockName: '浦发银行',
    tradeType,
    fills: [{ priceMilli, lots: 10 }],
    tradeTime: time,
    remark: '',
    tag: '分析',
  }
}

/** 建仓 → 清仓，返回归档后的轮次 id。 */
function closedRound(db: ReturnType<typeof openWorkspace>['db']): string {
  addPrincipalAtDate(db, 'l1', 1_000_000, '2026-01-01')
  createTradeOrderWithRoundFee(db, order('open', 5_000, at(5)))
  createTradeOrderWithRoundFee(db, order('close', 6_000, at(9)))
  return getTradeHistoryDetail(db, 'l1', '600000').rounds[0].id
}

describe('stock lessons', () => {
  it('creates a linked one-line lesson from a closed round', () => {
    const db = openWorkspace(workspaceDirectory()).db
    const roundId = closedRound(db)

    const lesson = createLesson(db, 'l1', '  只做看得懂的回踩确认  ', roundId)
    expect(lesson.text).toBe('只做看得懂的回踩确认')
    expect(lesson.roundId).toBe(roundId)
    expect(lesson.sourceAvailable).toBe(true)
    expect(lesson.stockCode).toBe('600000')
    expect(lesson.roundNo).toBe(1)
    expect(lesson.pnl).toBeGreaterThan(0)
    expect(lesson.pnlRate).toBeGreaterThan(0)

    expect(listLessons(db, 'l1')).toEqual([lesson])
    expect(listRoundOptions(db, 'l1')).toEqual([
      expect.objectContaining({ roundId, stockCode: '600000', roundNo: 1 }),
    ])
  })

  it('allows an unlinked lesson and clears the link on update', () => {
    const db = openWorkspace(workspaceDirectory()).db
    const roundId = closedRound(db)
    const linked = createLesson(db, 'l1', '先有计划再下单', roundId)

    const unlinked = updateLesson(db, 'l1', linked.id, '先有计划再下单，别追', null)
    expect(unlinked.roundId).toBeNull()
    expect(unlinked.sourceAvailable).toBe(false)
    expect(unlinked.stockCode).toBe('')
    expect(unlinked.pnl).toBe(0)

    const standalone = createLesson(db, 'l1', '空仓也是一种仓位', null)
    expect(standalone.roundId).toBeNull()
    expect(listLessons(db, 'l1')).toHaveLength(2)
  })

  it('keeps the snapshot and marks the source unavailable when a round is deleted', () => {
    const db = openWorkspace(workspaceDirectory()).db
    const roundId = closedRound(db)
    const lesson = createLesson(db, 'l1', '这一轮赢在等回踩', roundId)

    db.prepare('DELETE FROM stock_trade_round WHERE id = ?').run(roundId)
    const [after] = listLessons(db, 'l1')
    expect(after.sourceAvailable).toBe(false)
    expect(after.roundId).toBe(roundId)
    expect(after.stockCode).toBe(lesson.stockCode)
    expect(after.roundNo).toBe(lesson.roundNo)
    expect(after.pnl).toBe(lesson.pnl)
  })

  it('validates text and unknown rounds, and deletes a lesson only', () => {
    const db = openWorkspace(workspaceDirectory()).db
    const roundId = closedRound(db)

    expect(() => createLesson(db, 'l1', '   ', null)).toThrow(AppError)
    expect(() => createLesson(db, 'l1', '长'.repeat(81), null)).toThrow(/最多 80/)
    expect(() => createLesson(db, 'l1', '有效心得', 'missing-round')).toThrow(/不存在/)

    const lesson = createLesson(db, 'l1', '先记录再复盘', roundId)
    removeLesson(db, 'l1', lesson.id)
    expect(listLessons(db, 'l1')).toEqual([])
    expect(getTradeHistoryDetail(db, 'l1', '600000').roundCount).toBe(1)
    expect(() => removeLesson(db, 'l1', lesson.id)).toThrow(/不存在/)
  })
})
