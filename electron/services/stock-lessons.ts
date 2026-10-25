import { randomUUID } from 'node:crypto'

import { STOCK_LESSON_TEXT_MAX } from '../../shared/domain/consts'
import { AppError } from '../../shared/errors'
import type { StockLessonDto, StockRoundOptionDto } from '../../shared/types/stock-lesson'
import type { Db } from '../db/driver'
import {
  deleteStockLesson,
  getStockLesson,
  getStockRoundSource,
  insertStockLesson,
  listStockLessons,
  listStockRoundSources,
  type StockLessonRow,
  type StockRoundSourceRow,
  updateStockLesson,
} from '../db/dao/stock-lesson'
import { listTradesByRound } from '../db/dao/stock-trade'
import { ensureTradeHistoryBackfill, roundPnl } from './stock-history'

function nowUnix(): number {
  return Math.floor(Date.now() / 1000)
}

function normalizedText(text: string): string {
  const next = text.trim()
  if (!next) throw new AppError('心得不能为空', { status: 400 })
  if (next.length > STOCK_LESSON_TEXT_MAX) {
    throw new AppError(`心得最多 ${STOCK_LESSON_TEXT_MAX} 个字`, { status: 400 })
  }
  return next
}

function sourcePnl(db: Db, roundId: string, cache: Map<string, { pnl: number; pnlRate: number }>) {
  const cached = cache.get(roundId)
  if (cached) return cached
  const trades = listTradesByRound(db, roundId).filter((trade) => trade.shares > 0)
  const { pnl, pnlRate } = roundPnl(trades)
  const result = { pnl, pnlRate }
  cache.set(roundId, result)
  return result
}

function lessonDto(
  db: Db,
  row: StockLessonRow,
  sources: Map<string, StockRoundSourceRow>,
  pnlCache: Map<string, { pnl: number; pnlRate: number }>,
): StockLessonDto {
  const source = row.roundId ? sources.get(row.roundId) : undefined
  if (!source) {
    return {
      id: row.id,
      text: row.text,
      roundId: row.roundId,
      stockCode: row.stockCode,
      stockName: row.stockName,
      roundNo: row.roundNo,
      openedAt: row.openedAt,
      closedAt: row.closedAt,
      pnl: row.pnl,
      pnlRate: row.pnlRate,
      sourceAvailable: false,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }
  const money = sourcePnl(db, source.roundId, pnlCache)
  return {
    id: row.id,
    text: row.text,
    roundId: row.roundId,
    stockCode: source.stockCode,
    stockName: source.stockName,
    roundNo: source.roundNo,
    openedAt: source.openedAt,
    closedAt: source.closedAt,
    pnl: money.pnl,
    pnlRate: money.pnlRate,
    sourceAvailable: true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** 读取某账本的全部心得；仍存在的关联轮次用实时数据覆盖快照。 */
export function listLessons(db: Db, ledgerId: string): StockLessonDto[] {
  const rows = listStockLessons(db, ledgerId)
  const sources = new Map(listStockRoundSources(db, ledgerId).map((row) => [row.roundId, row]))
  const pnlCache = new Map<string, { pnl: number; pnlRate: number }>()
  return rows.map((row) => lessonDto(db, row, sources, pnlCache))
}

/** 可关联的轮次：先补齐旧交易的历史轮次，再按清仓时间倒序。 */
export function listRoundOptions(db: Db, ledgerId: string): StockRoundOptionDto[] {
  ensureTradeHistoryBackfill(db, ledgerId)
  const pnlCache = new Map<string, { pnl: number; pnlRate: number }>()
  return listStockRoundSources(db, ledgerId).map((source) => {
    const money = sourcePnl(db, source.roundId, pnlCache)
    return {
      roundId: source.roundId,
      stockCode: source.stockCode,
      stockName: source.stockName,
      roundNo: source.roundNo,
      openedAt: source.openedAt,
      closedAt: source.closedAt,
      pnl: money.pnl,
      pnlRate: money.pnlRate,
    }
  })
}

function snapshotFor(
  db: Db,
  ledgerId: string,
  roundId: string | null,
): Pick<StockLessonRow, 'roundId' | 'stockCode' | 'stockName' | 'roundNo' | 'openedAt' | 'closedAt' | 'pnl' | 'pnlRate'> {
  if (!roundId) {
    return {
      roundId: null,
      stockCode: '',
      stockName: '',
      roundNo: 0,
      openedAt: 0,
      closedAt: 0,
      pnl: 0,
      pnlRate: 0,
    }
  }
  const source = getStockRoundSource(db, ledgerId, roundId)
  if (!source) throw new AppError('关联的交易轮次不存在', { status: 400 })
  const money = sourcePnl(db, roundId, new Map())
  return {
    roundId,
    stockCode: source.stockCode,
    stockName: source.stockName,
    roundNo: source.roundNo,
    openedAt: source.openedAt,
    closedAt: source.closedAt,
    pnl: money.pnl,
    pnlRate: money.pnlRate,
  }
}

export function createLesson(
  db: Db,
  ledgerId: string,
  text: string,
  roundId: string | null,
): StockLessonDto {
  const id = randomUUID()
  const now = nowUnix()
  const row: StockLessonRow = {
    id,
    ledgerId,
    text: normalizedText(text),
    ...snapshotFor(db, ledgerId, roundId),
    createdAt: now,
    updatedAt: now,
  }
  insertStockLesson(db, row)
  return lessonDto(
    db,
    row,
    new Map(listStockRoundSources(db, ledgerId).map((source) => [source.roundId, source])),
    new Map(),
  )
}

export function updateLesson(
  db: Db,
  ledgerId: string,
  id: string,
  text: string,
  roundId: string | null,
): StockLessonDto {
  const existing = getStockLesson(db, ledgerId, id)
  if (!existing) throw new AppError('心得不存在', { status: 404 })
  const row: StockLessonRow = {
    ...existing,
    text: normalizedText(text),
    ...snapshotFor(db, ledgerId, roundId),
    updatedAt: nowUnix(),
  }
  updateStockLesson(db, row)
  return lessonDto(
    db,
    row,
    new Map(listStockRoundSources(db, ledgerId).map((source) => [source.roundId, source])),
    new Map(),
  )
}

export function removeLesson(db: Db, ledgerId: string, id: string): void {
  const existing = getStockLesson(db, ledgerId, id)
  if (!existing) throw new AppError('心得不存在', { status: 404 })
  deleteStockLesson(db, ledgerId, id)
}
