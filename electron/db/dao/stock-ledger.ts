import type { Db } from '../driver'

/** `stock_ledger` 的原始行；数字字段不落库，由本轮成交实时计算。 */
export interface StockLedgerRow {
  id: string
  ledgerId: string
  stockCode: string
  roundId: string | null
  whyBuy: string
  stopLoss: string
  takeProfit: string
  followedSystem: string
  summary: string
  createdAt: number
  updatedAt: number
}

interface LedgerDbRow {
  id: string
  ledger_id: string
  stock_code: string
  round_id: string | null
  why_buy: string
  stop_loss: string
  take_profit: string
  followed_system: string
  summary: string
  created_at: number
  updated_at: number
}

const COLUMNS =
  'id, ledger_id, stock_code, round_id, why_buy, stop_loss, take_profit, followed_system, ' +
  'summary, created_at, updated_at'

function fromRow(row: LedgerDbRow): StockLedgerRow {
  return {
    id: row.id,
    ledgerId: row.ledger_id,
    stockCode: row.stock_code,
    roundId: row.round_id,
    whyBuy: row.why_buy,
    stopLoss: row.stop_loss,
    takeProfit: row.take_profit,
    followedSystem: row.followed_system,
    summary: row.summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** 持仓期的台账（round_id 为空）。 */
export function getOpenStockLedger(
  db: Db,
  ledgerId: string,
  stockCode: string,
): StockLedgerRow | null {
  const row = db
    .prepare(
      `SELECT ${COLUMNS} FROM stock_ledger WHERE ledger_id = ? AND stock_code = ? ` +
        'AND round_id IS NULL LIMIT 1',
    )
    .get(ledgerId, stockCode) as LedgerDbRow | undefined
  return row ? fromRow(row) : null
}

/** 已归档轮次的台账。 */
export function getStockLedgerByRound(
  db: Db,
  ledgerId: string,
  roundId: string,
): StockLedgerRow | null {
  const row = db
    .prepare(`SELECT ${COLUMNS} FROM stock_ledger WHERE ledger_id = ? AND round_id = ? LIMIT 1`)
    .get(ledgerId, roundId) as LedgerDbRow | undefined
  return row ? fromRow(row) : null
}

export function insertStockLedger(db: Db, row: StockLedgerRow): void {
  db.prepare(
    'INSERT INTO stock_ledger ' +
      '(id, ledger_id, stock_code, round_id, why_buy, stop_loss, take_profit, followed_system, ' +
      'summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    row.id,
    row.ledgerId,
    row.stockCode,
    row.roundId,
    row.whyBuy,
    row.stopLoss,
    row.takeProfit,
    row.followedSystem,
    row.summary,
    row.createdAt,
    row.updatedAt,
  )
}

export function updateStockLedger(db: Db, row: StockLedgerRow): void {
  db.prepare(
    'UPDATE stock_ledger SET why_buy = ?, stop_loss = ?, take_profit = ?, followed_system = ?, ' +
      'summary = ?, updated_at = ? WHERE ledger_id = ? AND id = ?',
  ).run(
    row.whyBuy,
    row.stopLoss,
    row.takeProfit,
    row.followedSystem,
    row.summary,
    row.updatedAt,
    row.ledgerId,
    row.id,
  )
}

/** 清仓归档时，把该股持仓期台账挂到新轮次。 */
export function attachOpenStockLedger(
  db: Db,
  ledgerId: string,
  stockCode: string,
  roundId: string,
  now: number,
): void {
  db.prepare(
    'UPDATE stock_ledger SET round_id = ?, updated_at = ? ' +
      'WHERE ledger_id = ? AND stock_code = ? AND round_id IS NULL',
  ).run(roundId, now, ledgerId, stockCode)
}
