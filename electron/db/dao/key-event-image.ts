import type { Db } from '../driver'
import type { KeyEventImage } from '../../../shared/domain/models'

const COLUMNS = 'id, ledger_id, event_date, file_path, thumb_path, sort_order, created_at'

interface KeyEventImageRow {
  id: string
  ledger_id: string
  event_date: string
  file_path: string
  thumb_path: string
  sort_order: number
  created_at: number
}

function fromRow(row: KeyEventImageRow): KeyEventImage {
  return {
    id: row.id,
    ledgerId: row.ledger_id,
    eventDate: row.event_date,
    filePath: row.file_path,
    thumbPath: row.thumb_path,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  }
}

export function create(db: Db, image: KeyEventImage, now = Math.floor(Date.now() / 1000)): void {
  db.prepare(
    `INSERT INTO key_event_image (id, ledger_id, event_date, file_path, thumb_path, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    image.id,
    image.ledgerId,
    image.eventDate,
    image.filePath,
    image.thumbPath,
    image.sortOrder,
    now,
  )
}

export function queryById(db: Db, imageId: string): KeyEventImage | null {
  const row = db
    .prepare(`SELECT ${COLUMNS} FROM key_event_image WHERE id = ?`)
    .get(imageId) as KeyEventImageRow | undefined
  return row ? fromRow(row) : null
}

export function queryByEventDate(db: Db, ledgerId: string, date: string): KeyEventImage[] {
  const rows = db
    .prepare(
      `SELECT ${COLUMNS} FROM key_event_image WHERE ledger_id = ? AND event_date = ? ORDER BY sort_order ASC`,
    )
    .all(ledgerId, date) as unknown as KeyEventImageRow[]
  return rows.map(fromRow)
}

export function queryByLedgerId(db: Db, ledgerId: string): KeyEventImage[] {
  const rows = db
    .prepare(`SELECT ${COLUMNS} FROM key_event_image WHERE ledger_id = ?`)
    .all(ledgerId) as unknown as KeyEventImageRow[]
  return rows.map(fromRow)
}

export function deleteById(db: Db, imageId: string): void {
  db.prepare('DELETE FROM key_event_image WHERE id = ?').run(imageId)
}

export function deleteByEventDate(db: Db, ledgerId: string, date: string): void {
  db.prepare('DELETE FROM key_event_image WHERE ledger_id = ? AND event_date = ?').run(
    ledgerId,
    date,
  )
}
