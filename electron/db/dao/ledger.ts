import type { Db } from '../driver'
import type { Ledger } from '../../../shared/domain/models'

const COLUMNS = 'id, name, description, created_at, updated_at'

/** 账本级联删除的表清单（顺序固定：先子表后父表，最后账本行）。 */
export const LEDGER_CASCADE = [
  'DELETE FROM transaction_record_tag WHERE ledger_id = ?',
  'DELETE FROM transaction_record WHERE ledger_id = ?',
  'DELETE FROM category WHERE ledger_id = ?',
  'DELETE FROM tag WHERE ledger_id = ?',
  'DELETE FROM chart WHERE ledger_id = ?',
  'DELETE FROM transaction_template WHERE ledger_id = ?',
  'DELETE FROM key_event_image WHERE ledger_id = ?',
  'DELETE FROM key_event WHERE ledger_id = ?',
  'DELETE FROM diary_entry WHERE ledger_id = ?',
  'DELETE FROM stock_fund_record WHERE ledger_id = ?',
  'DELETE FROM stock_fee_setting WHERE ledger_id = ?',
  'DELETE FROM stock_trade_tag_setting WHERE ledger_id = ?',
  'DELETE FROM stock_review_setting WHERE ledger_id = ?',
  'DELETE FROM stock_lesson WHERE ledger_id = ?',
  'DELETE FROM stock_trade WHERE ledger_id = ?',
  'DELETE FROM stock_trade_round WHERE ledger_id = ?',
  'DELETE FROM stock_day_review WHERE ledger_id = ?',
  'DELETE FROM stock_trade_history WHERE ledger_id = ?',
  'DELETE FROM stock_position WHERE ledger_id = ?',
  'DELETE FROM stock_account WHERE ledger_id = ?',
  'DELETE FROM stock_operation WHERE ledger_id = ?',
  'DELETE FROM todo_progress WHERE ledger_id = ?',
  'DELETE FROM todo_item WHERE ledger_id = ?',
  'DELETE FROM todo_card WHERE ledger_id = ?',
  'DELETE FROM ledger WHERE id = ?',
] as const

interface LedgerRow {
  id: string
  name: string
  description: string
  created_at: number
  updated_at: number
}

function fromRow(row: LedgerRow): Ledger {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function nowUnix(): number {
  return Math.floor(Date.now() / 1000)
}

export function createLedger(
  db: Db,
  ledger: { id: string; name: string; description: string },
  now = nowUnix(),
): void {
  db.prepare(
    'INSERT INTO ledger (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  ).run(ledger.id, ledger.name, ledger.description, now, now)
}

/** 修改名称/描述并刷新 updated_at；不存在的 id 视为成功（命中 0 行不报错）。 */
export function updateLedger(
  db: Db,
  ledger: { id: string; name: string; description: string },
  now = nowUnix(),
): void {
  db.prepare('UPDATE ledger SET name = ?, description = ?, updated_at = ? WHERE id = ?').run(
    ledger.name,
    ledger.description,
    now,
    ledger.id,
  )
}

export function listLedgers(db: Db): Ledger[] {
  const rows = db
    .prepare(`SELECT ${COLUMNS} FROM ledger ORDER BY created_at, rowid`)
    .all() as unknown as LedgerRow[]
  return rows.map(fromRow)
}

export function findLedger(db: Db, id: string): Ledger | null {
  const row = db.prepare(`SELECT ${COLUMNS} FROM ledger WHERE id = ?`).get(id) as
    | LedgerRow
    | undefined
  return row ? fromRow(row) : null
}

export function deleteLedgerCascade(db: Db, id: string): void {
  db.transaction(() => {
    for (const statement of LEDGER_CASCADE) {
      db.prepare(statement).run(id)
    }
  })
}
