import type { Db } from '../driver'

/** `stock_lesson` 的原始行；来源字段是创建/更新时写下的快照。 */
export interface StockLessonRow {
  id: string
  ledgerId: string
  text: string
  roundId: string | null
  stockCode: string
  stockName: string
  roundNo: number
  openedAt: number
  closedAt: number
  pnl: number
  pnlRate: number
  createdAt: number
  updatedAt: number
}

/** 可关联的历史轮次（JOIN 历史集合拿股票名）。 */
export interface StockRoundSourceRow {
  roundId: string
  stockCode: string
  stockName: string
  roundNo: number
  openedAt: number
  closedAt: number
}

interface LessonDbRow {
  id: string
  ledger_id: string
  text: string
  round_id: string | null
  stock_code: string
  stock_name: string
  round_no: number
  opened_at: number
  closed_at: number
  pnl_cents: number
  pnl_rate: number
  created_at: number
  updated_at: number
}

interface RoundSourceDbRow {
  id: string
  stock_code: string
  stock_name: string | null
  round_no: number
  opened_at: number
  closed_at: number
}

const LESSON_COLUMNS =
  'id, ledger_id, text, round_id, stock_code, stock_name, round_no, opened_at, closed_at, ' +
  'pnl_cents, pnl_rate, created_at, updated_at'

function lessonFromRow(row: LessonDbRow): StockLessonRow {
  return {
    id: row.id,
    ledgerId: row.ledger_id,
    text: row.text,
    roundId: row.round_id,
    stockCode: row.stock_code,
    stockName: row.stock_name,
    roundNo: row.round_no,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    pnl: row.pnl_cents,
    pnlRate: row.pnl_rate,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function sourceFromRow(row: RoundSourceDbRow): StockRoundSourceRow {
  return {
    roundId: row.id,
    stockCode: row.stock_code,
    stockName: row.stock_name ?? '',
    roundNo: row.round_no,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
  }
}

/** 某账本的心得：新建在前。 */
export function listStockLessons(db: Db, ledgerId: string): StockLessonRow[] {
  const rows = db
    .prepare(
      `SELECT ${LESSON_COLUMNS} FROM stock_lesson WHERE ledger_id = ? ` +
        'ORDER BY created_at DESC, id DESC',
    )
    .all(ledgerId) as unknown as LessonDbRow[]
  return rows.map(lessonFromRow)
}

export function getStockLesson(db: Db, ledgerId: string, id: string): StockLessonRow | null {
  const row = db
    .prepare(`SELECT ${LESSON_COLUMNS} FROM stock_lesson WHERE ledger_id = ? AND id = ?`)
    .get(ledgerId, id) as LessonDbRow | undefined
  return row ? lessonFromRow(row) : null
}

export function insertStockLesson(db: Db, row: StockLessonRow): void {
  db.prepare(
    'INSERT INTO stock_lesson ' +
      '(id, ledger_id, text, round_id, stock_code, stock_name, round_no, opened_at, closed_at, ' +
      'pnl_cents, pnl_rate, created_at, updated_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    row.id,
    row.ledgerId,
    row.text,
    row.roundId,
    row.stockCode,
    row.stockName,
    row.roundNo,
    row.openedAt,
    row.closedAt,
    row.pnl,
    row.pnlRate,
    row.createdAt,
    row.updatedAt,
  )
}

export function updateStockLesson(db: Db, row: StockLessonRow): void {
  db.prepare(
    'UPDATE stock_lesson SET text = ?, round_id = ?, stock_code = ?, stock_name = ?, round_no = ?, ' +
      'opened_at = ?, closed_at = ?, pnl_cents = ?, pnl_rate = ?, updated_at = ? ' +
      'WHERE ledger_id = ? AND id = ?',
  ).run(
    row.text,
    row.roundId,
    row.stockCode,
    row.stockName,
    row.roundNo,
    row.openedAt,
    row.closedAt,
    row.pnl,
    row.pnlRate,
    row.updatedAt,
    row.ledgerId,
    row.id,
  )
}

export function deleteStockLesson(db: Db, ledgerId: string, id: string): void {
  db.prepare('DELETE FROM stock_lesson WHERE ledger_id = ? AND id = ?').run(ledgerId, id)
}

/** 所有可关联轮次（已归档、带股票名），按清仓时间倒序。 */
export function listStockRoundSources(db: Db, ledgerId: string): StockRoundSourceRow[] {
  const rows = db
    .prepare(
      'SELECT r.id, r.stock_code, h.stock_name, r.round_no, r.opened_at, r.closed_at ' +
        'FROM stock_trade_round r ' +
        'LEFT JOIN stock_trade_history h ON h.id = r.history_id ' +
        'WHERE r.ledger_id = ? ' +
        'ORDER BY r.closed_at DESC, r.stock_code ASC, r.round_no DESC',
    )
    .all(ledgerId) as unknown as RoundSourceDbRow[]
  return rows.map(sourceFromRow)
}

export function getStockRoundSource(
  db: Db,
  ledgerId: string,
  roundId: string,
): StockRoundSourceRow | null {
  const row = db
    .prepare(
      'SELECT r.id, r.stock_code, h.stock_name, r.round_no, r.opened_at, r.closed_at ' +
        'FROM stock_trade_round r ' +
        'LEFT JOIN stock_trade_history h ON h.id = r.history_id ' +
        'WHERE r.ledger_id = ? AND r.id = ? LIMIT 1',
    )
    .get(ledgerId, roundId) as RoundSourceDbRow | undefined
  return row ? sourceFromRow(row) : null
}
