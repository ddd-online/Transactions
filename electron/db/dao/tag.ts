import type { Db } from '../driver'
import type { Tag } from '../../../shared/domain/models'

const COLUMNS = 'ledger_id, name, category_transaction_type, sort_order'

interface TagRow {
  ledger_id: string
  name: string
  category_transaction_type: string
  sort_order: number
}

function fromRow(row: TagRow): Tag {
  return {
    ledgerId: row.ledger_id,
    name: row.name,
    categoryTransactionType: row.category_transaction_type,
    sortOrder: row.sort_order,
  }
}

/**
 * 标签 DAO。
 *
 * 行为约定（与旧 `tr-store/src/dao/tag.rs` 一致）：
 * - `Tag` 没有时间戳列，`create` / `update` 不碰时间
 * - 列表排序固定为 `ORDER BY sort_order ASC, name DESC`
 * - 唯一键是 `(ledger_id, name, category_transaction_type)`
 * - `countByTag` 统计的是**交易记录标签关联表**（`transaction_record_tag`）
 */

/** 按账本查询标签；`category_transaction_type` 为空或 `all` 时不过滤。 */
export function listTags(
  db: Db,
  ledgerId: string,
  categoryTransactionType: string,
): Tag[] {
  const filtered = categoryTransactionType !== '' && categoryTransactionType !== 'all'
  const sql = filtered
    ? `SELECT ${COLUMNS} FROM tag WHERE ledger_id = ? AND category_transaction_type = ? ORDER BY sort_order ASC, name DESC`
    : `SELECT ${COLUMNS} FROM tag WHERE ledger_id = ? ORDER BY sort_order ASC, name DESC`

  const statement = db.prepare(sql)
  const rows = (
    filtered ? statement.all(ledgerId, categoryTransactionType) : statement.all(ledgerId)
  ) as unknown as TagRow[]
  return rows.map(fromRow)
}

/** 该账本 + `分类:交易类型` 下最大的 `sort_order`（无记录时为 0）。 */
export function getMaxSort(
  db: Db,
  ledgerId: string,
  categoryTransactionType: string,
): number {
  const row = db
    .prepare(
      'SELECT COALESCE(MAX(sort_order), 0) AS max_sort_order FROM tag WHERE ledger_id = ? AND category_transaction_type = ?',
    )
    .get(ledgerId, categoryTransactionType) as { max_sort_order: number } | undefined
  return row?.max_sort_order ?? 0
}

/** 新建标签。 */
export function createTag(db: Db, tag: Tag): void {
  db.prepare(
    'INSERT INTO tag (ledger_id, name, category_transaction_type, sort_order) VALUES (?, ?, ?, ?)',
  ).run(tag.ledgerId, tag.name, tag.categoryTransactionType, tag.sortOrder)
}

/** 删除单个标签（不存在的记录视为成功）。 */
export function deleteTag(
  db: Db,
  ledgerId: string,
  name: string,
  categoryTransactionType: string,
): void {
  db.prepare(
    'DELETE FROM tag WHERE ledger_id = ? AND name = ? AND category_transaction_type = ?',
  ).run(ledgerId, name, categoryTransactionType)
}

/** 删除某分类（`分类名:交易类型`）下的全部标签。 */
export function deleteTagsByCategory(
  db: Db,
  ledgerId: string,
  categoryTransactionType: string,
): void {
  db.prepare('DELETE FROM tag WHERE ledger_id = ? AND category_transaction_type = ?').run(
    ledgerId,
    categoryTransactionType,
  )
}

/** 删除交易记录上的某个标签关联（删除标签前调用）。 */
export function deleteRecordTagsByTag(db: Db, ledgerId: string, name: string): void {
  db.prepare('DELETE FROM transaction_record_tag WHERE ledger_id = ? AND tag = ?').run(
    ledgerId,
    name,
  )
}

/** 更新排序号。 */
export function updateTagSort(
  db: Db,
  ledgerId: string,
  name: string,
  categoryTransactionType: string,
  sortOrder: number,
): void {
  db.prepare(
    'UPDATE tag SET sort_order = ? WHERE ledger_id = ? AND name = ? AND category_transaction_type = ?',
  ).run(sortOrder, ledgerId, name, categoryTransactionType)
}

/** 该标签名下的交易记录数（查 `transaction_record_tag`）。 */
export function countByTag(db: Db, ledgerId: string, tag: string): number {
  const row = db
    .prepare(
      'SELECT COUNT(*) AS count FROM transaction_record_tag WHERE ledger_id = ? AND tag = ?',
    )
    .get(ledgerId, tag) as { count: number } | undefined
  return row?.count ?? 0
}

/**
 * 批量统计每个标签名下的关联交易数。
 *
 * 只返回**确实有记录**的标签名（调用方取不到时得 0）；`names` 为空时不查库。
 */
export function countRecordsByTags(
  db: Db,
  ledgerId: string,
  names: readonly string[],
): Record<string, number> {
  const counts: Record<string, number> = {}
  if (names.length === 0) return counts

  const placeholders = names.map(() => '?').join(', ')
  const rows = db
    .prepare(
      `SELECT tag, COUNT(*) AS count FROM transaction_record_tag WHERE ledger_id = ? AND tag IN (${placeholders}) GROUP BY tag`,
    )
    .all(ledgerId, ...names) as unknown as Array<{ tag: string; count: number }>

  for (const row of rows) {
    counts[row.tag] = row.count
  }
  return counts
}
