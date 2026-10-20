import { randomUUID } from 'node:crypto'

import type { Db } from '../driver'
import type { KeyEvent } from '../../../shared/domain/models'

export const TITLE_MAX_CHARS = 200

const COLUMNS = 'id, date, title, content, color, created_at, updated_at, ledger_id'

interface KeyEventRow {
  id: string
  date: string
  title: string | null
  content: string | null
  color: string | null
  created_at: number
  updated_at: number
  ledger_id: string | null
}

function fromRow(row: KeyEventRow): KeyEvent {
  return {
    id: row.id,
    date: row.date,
    title: row.title ?? '',
    content: row.content ?? '',
    color: row.color ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ledgerId: row.ledger_id ?? '',
  }
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000)
}

/** 幂等写入：`(ledger_id, date)` 冲突时只更新标题/正文/颜色与 updated_at。 */
export function upsert(db: Db, event: KeyEvent, now = nowUnix()): void {
  db.prepare(
    `INSERT INTO key_event (id, date, title, content, color, created_at, updated_at, ledger_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(ledger_id, date) DO UPDATE SET
       title = excluded.title,
       content = excluded.content,
       color = excluded.color,
       updated_at = excluded.updated_at`,
  ).run(
    event.id,
    event.date,
    event.title,
    event.content,
    event.color,
    now,
    now,
    event.ledgerId,
  )
}

export function queryByDate(db: Db, ledgerId: string, date: string): KeyEvent | null {
  const row = db
    .prepare(`SELECT ${COLUMNS} FROM key_event WHERE ledger_id = ? AND date = ?`)
    .get(ledgerId, date) as KeyEventRow | undefined
  return row ? fromRow(row) : null
}

export function queryByYear(db: Db, ledgerId: string, year: string): KeyEvent[] {
  const rows = db
    .prepare(`SELECT ${COLUMNS} FROM key_event WHERE ledger_id = ? AND date LIKE ?`)
    .all(ledgerId, `${year}-%`) as unknown as KeyEventRow[]
  return rows.map(fromRow)
}

export function deleteByDate(db: Db, ledgerId: string, date: string): void {
  db.prepare('DELETE FROM key_event WHERE ledger_id = ? AND date = ?').run(ledgerId, date)
}

/** 确保某天存在事件：不存在则创建一条空事件，返回是否新建。 */
export function ensureExists(db: Db, ledgerId: string, date: string): boolean {
  if (queryByDate(db, ledgerId, date)) return false
  upsert(db, {
    id: randomUUID(),
    date,
    title: '',
    content: '',
    color: '',
    createdAt: 0,
    updatedAt: 0,
    ledgerId,
  })
  return true
}
