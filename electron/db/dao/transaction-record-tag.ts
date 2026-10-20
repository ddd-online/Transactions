import type { Db } from '../driver'
import type { TrTag } from '../../../shared/domain/models'

/**
 * 消费记录 ↔ 标签关联 DAO（旧 `tr-store/src/dao/transaction_record_tag.rs`）。
 *
 * 新 schema 的主键是 `(ledger_id, transaction_id, tag)`：同一组值重复写入会被
 * SQLite 拒绝，所以服务层写入前仍然要先删后插。
 */

const TABLE = 'transaction_record_tag'
const COLUMNS = 'ledger_id, transaction_id, tag'

interface TrTagRow {
  ledger_id: string
  transaction_id: string
  tag: string
}

function fromRow(row: TrTagRow): TrTag {
  return {
    ledgerId: row.ledger_id,
    transactionId: row.transaction_id,
    tag: row.tag,
  }
}

/** 批量写入标签关联（调用方负责事务；空数组直接返回，不查库）。 */
export function createBatch(db: Db, tags: readonly TrTag[]): void {
  if (tags.length === 0) return

  const statement = db.prepare(`INSERT INTO ${TABLE} (${COLUMNS}) VALUES (?, ?, ?)`)
  for (const tag of tags) {
    statement.run(tag.ledgerId, tag.transactionId, tag.tag)
  }
}

/** 删除某条记录的全部标签关联。 */
export function deleteByTrId(db: Db, transactionId: string): void {
  db.prepare(`DELETE FROM ${TABLE} WHERE transaction_id = ?`).run(transactionId)
}

/** 删除某账本下某个标签的全部关联（删除标签时调用）。 */
export function deleteByTag(db: Db, ledgerId: string, tag: string): void {
  db.prepare(`DELETE FROM ${TABLE} WHERE ledger_id = ? AND tag = ?`).run(ledgerId, tag)
}

/**
 * 批量查询若干记录的全部标签，按 `transaction_id` 归组。
 *
 * 空输入直接返回空对象（提前短路，不查库）；组内顺序不保证，与旧 DAO 一致。
 */
export function queryByTrIds(
  db: Db,
  transactionIds: readonly string[],
): Record<string, TrTag[]> {
  const grouped: Record<string, TrTag[]> = {}
  if (transactionIds.length === 0) return grouped

  const placeholders = transactionIds.map(() => '?').join(', ')
  const rows = db
    .prepare(`SELECT ${COLUMNS} FROM ${TABLE} WHERE transaction_id IN (${placeholders})`)
    .all(...transactionIds) as unknown as TrTagRow[]

  for (const row of rows) {
    const tag = fromRow(row)
    const group = grouped[tag.transactionId] ?? (grouped[tag.transactionId] = [])
    group.push(tag)
  }
  return grouped
}
