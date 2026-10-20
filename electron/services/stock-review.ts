import { AppError } from '../../shared/errors'
import { currentRoundTrades } from '../../shared/domain/stock'
import type { Db } from '../db/driver'
import { getTradeRound, listTradesAsc, updateTradeRoundReview, updateTradeRoundTag } from '../db/dao/stock-trade'
import type { StockDayReviewDto, StockNameDto } from '../../shared/types/stock-position'
import type { StockTradeHistoryDetailDto } from '../../shared/types/stock-history'
import { getTradeHistoryDetail } from './stock-history'
import { getTradeTags, unixToDate } from './stock-account'
import type { StockQuoteFetcher } from './stock-quote'
import { isValidDiaryDate } from './diary'
import { todayYmd } from '../../shared/domain/time'

/** 每日复盘：只能写在当前未清仓轮次、建仓日之后（含当天），最多 500 字；空串 = 删除。 */
export function updateDayReview(
  db: Db,
  ledgerId: string,
  stockCode: string,
  date: string,
  review: string,
): StockDayReviewDto[] {
  if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
  if (!stockCode) throw new AppError('stock_code is required', { status: 400 })
  const day = date.trim()
  if (!isValidDiaryDate(day)) throw new AppError('日期格式应为 YYYY-MM-DD', { status: 400 })
  if (day > todayYmd()) throw new AppError('每日复盘只能写到当天', { status: 400 })

  const current = currentRoundTrades(listTradesAsc(db, ledgerId, stockCode))
  const first = current[0]
  if (!first) throw new AppError('该股票已清仓，每日复盘不可再编辑', { status: 404 })
  const openedOn = unixToDate(first.tradeTime)
  if (day < openedOn) {
    throw new AppError(`每日复盘不能早于本轮建仓日（${openedOn}）`, { status: 400 })
  }

  const content = review.trim()
  if (Array.from(content).length > 500) {
    throw new AppError('每日复盘不能超过 500 字', { status: 400 })
  }

  if (content === '') {
    db.prepare(
      "DELETE FROM stock_day_review WHERE ledger_id = ? AND stock_code = ? AND round_id = '' AND review_date = ?",
    ).run(ledgerId, stockCode, day)
  } else {
    const existing = db
      .prepare(
        "SELECT id FROM stock_day_review WHERE ledger_id = ? AND stock_code = ? AND round_id = '' AND review_date = ?",
      )
      .get(ledgerId, stockCode, day) as { id: string } | undefined
    if (existing) {
      db.prepare('UPDATE stock_day_review SET review = ?, updated_at = ? WHERE id = ?').run(
        content,
        Math.floor(Date.now() / 1000),
        existing.id,
      )
    } else {
      db.prepare(
        "INSERT INTO stock_day_review (id, ledger_id, stock_code, round_id, review_date, review, created_at, updated_at) VALUES (?, ?, ?, '', ?, ?, ?, ?)",
      ).run(
        crypto.randomUUID(),
        ledgerId,
        stockCode,
        day,
        content,
        Math.floor(Date.now() / 1000),
        Math.floor(Date.now() / 1000),
      )
    }
  }

  const rows = db
    .prepare(
      "SELECT review_date, review FROM stock_day_review WHERE ledger_id = ? AND stock_code = ? AND round_id = '' ORDER BY review_date DESC",
    )
    .all(ledgerId, stockCode) as Array<{ review_date: string; review: string }>
  return rows.map((row) => ({ date: row.review_date, review: row.review }))
}

/** 保存某轮次复盘（500 字以内），返回该股最新历史详情。 */
export function updateRoundReview(
  db: Db,
  ledgerId: string,
  roundId: string,
  review: string,
): StockTradeHistoryDetailDto {
  if (!roundId) throw new AppError('round_id is required', { status: 400 })
  const content = review.trim()
  if (Array.from(content).length > 500) {
    throw new AppError('交易复盘不能超过 500 字', { status: 400 })
  }
  const round = (() => {
    try {
      return getTradeRound(db, roundId)
    } catch {
      throw new AppError('轮次不存在', { status: 404 })
    }
  })()
  if (round.ledgerId !== ledgerId) throw new AppError('轮次不存在', { status: 404 })
  updateTradeRoundReview(db, roundId, content)
  return getTradeHistoryDetail(db, ledgerId, round.stockCode)
}

/** 更新已完成轮次的交易标签（空串回到默认「分析」）。 */
export function updateRoundTag(
  db: Db,
  ledgerId: string,
  roundId: string,
  tag: string,
): StockTradeHistoryDetailDto {
  if (!roundId) throw new AppError('round_id is required', { status: 400 })
  const normalized = tag.trim() === '' ? '分析' : tag.trim()
  const round = (() => {
    try {
      return getTradeRound(db, roundId)
    } catch {
      throw new AppError('轮次不存在', { status: 404 })
    }
  })()
  if (round.ledgerId !== ledgerId) throw new AppError('轮次不存在', { status: 404 })
  if (!getTradeTags(db, ledgerId).includes(normalized)) {
    throw new AppError('无效的交易标签', { status: 400 })
  }
  updateTradeRoundTag(db, roundId, normalized)
  return getTradeHistoryDetail(db, ledgerId, round.stockCode)
}

/** 股票名称：先查本地成交，未命中走行情；都没有时报 404。 */
export async function lookupStockName(
  db: Db,
  fetcher: StockQuoteFetcher,
  stockCode: string,
): Promise<StockNameDto> {
  if (!stockCode) throw new AppError('stock_code is required', { status: 400 })
  try {
    const row = db
      .prepare(
        "SELECT stock_name FROM stock_trade WHERE stock_code = ? AND stock_name != '' LIMIT 1",
      )
      .get(stockCode) as { stock_name: string } | undefined
    if (row && row.stock_name) return { stockCode, stockName: row.stock_name }
  } catch {
    // 本地查询失败继续走外部行情
  }
  const name = await fetcher.fetchName(stockCode)
  if (!name) throw new AppError(`未找到股票: ${stockCode}`, { status: 404 })
  return { stockCode, stockName: name }
}

