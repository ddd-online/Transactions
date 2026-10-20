import type { Db } from '../driver'
import type { Category } from '../../../shared/domain/models'

const COLUMNS = 'ledger_id, name, transaction_type, sort_order'

interface CategoryRow {
  ledger_id: string
  name: string
  transaction_type: string
  sort_order: number
}

function fromRow(row: CategoryRow): Category {
  return {
    ledgerId: row.ledger_id,
    name: row.name,
    transactionType: row.transaction_type,
    sortOrder: row.sort_order,
  }
}

/**
 * 分类 DAO。
 *
 * 行为约定（与旧 `tr-store/src/dao/category.rs` 一致）：
 * - `Category` 没有时间戳列，`create` / `update` 不碰 `created_at` / `updated_at`
 * - 列表排序固定为 `ORDER BY sort_order ASC, name DESC`
 * - 唯一键是 `(ledger_id, name, transaction_type)`，重复插入由 SQLite 报错；
 *   删除是幂等的（不存在的行视为成功）
 * - 记录数统计只读 `transaction_record`，与标签侧口径逐字一致
 */

/** 按账本查询分类；`transaction_type` 为空或 `all` 时不过滤。 */
export function listCategories(
  db: Db,
  ledgerId: string,
  transactionType: string,
): Category[] {
  const filtered = transactionType !== '' && transactionType !== 'all'
  const sql = filtered
    ? `SELECT ${COLUMNS} FROM category WHERE ledger_id = ? AND transaction_type = ? ORDER BY sort_order ASC, name DESC`
    : `SELECT ${COLUMNS} FROM category WHERE ledger_id = ? ORDER BY sort_order ASC, name DESC`

  const statement = db.prepare(sql)
  const rows = (
    filtered ? statement.all(ledgerId, transactionType) : statement.all(ledgerId)
  ) as unknown as CategoryRow[]
  return rows.map(fromRow)
}

/** 该账本 + 交易类型下最大的 `sort_order`（无记录时为 0）。 */
export function getMaxSort(db: Db, ledgerId: string, transactionType: string): number {
  const row = db
    .prepare(
      'SELECT COALESCE(MAX(sort_order), 0) AS max_sort_order FROM category WHERE ledger_id = ? AND transaction_type = ?',
    )
    .get(ledgerId, transactionType) as { max_sort_order: number } | undefined
  return row?.max_sort_order ?? 0
}

/** 新建分类。 */
export function createCategory(db: Db, category: Category): void {
  db.prepare(
    'INSERT INTO category (ledger_id, name, transaction_type, sort_order) VALUES (?, ?, ?, ?)',
  ).run(category.ledgerId, category.name, category.transactionType, category.sortOrder)
}

/** 删除单个分类（不存在的记录视为成功）。 */
export function deleteCategory(
  db: Db,
  ledgerId: string,
  name: string,
  transactionType: string,
): void {
  db.prepare('DELETE FROM category WHERE ledger_id = ? AND name = ? AND transaction_type = ?').run(
    ledgerId,
    name,
    transactionType,
  )
}

/** 更新排序号。 */
export function updateCategorySort(
  db: Db,
  ledgerId: string,
  name: string,
  transactionType: string,
  sortOrder: number,
): void {
  db.prepare(
    'UPDATE category SET sort_order = ? WHERE ledger_id = ? AND name = ? AND transaction_type = ?',
  ).run(sortOrder, ledgerId, name, transactionType)
}

/** 某账本的分类总数（用于判断是否已初始化）。 */
export function countByLedgerId(db: Db, ledgerId: string): number {
  const row = db
    .prepare('SELECT COUNT(*) AS count FROM category WHERE ledger_id = ?')
    .get(ledgerId) as { count: number } | undefined
  return row?.count ?? 0
}

/** 单个分类名下的交易记录数。 */
export function countRecordsByCategory(db: Db, ledgerId: string, category: string): number {
  const row = db
    .prepare(
      'SELECT COUNT(*) AS count FROM transaction_record WHERE ledger_id = ? AND category = ?',
    )
    .get(ledgerId, category) as { count: number } | undefined
  return row?.count ?? 0
}

/**
 * 批量统计每个分类名下的交易记录数。
 *
 * 只返回**确实有记录**的分类名（调用方取不到时得 0）；`names` 为空时不查库。
 */
export function countRecordsByCategories(
  db: Db,
  ledgerId: string,
  names: readonly string[],
): Record<string, number> {
  const counts: Record<string, number> = {}
  if (names.length === 0) return counts

  const placeholders = names.map(() => '?').join(', ')
  const rows = db
    .prepare(
      `SELECT category, COUNT(*) AS count FROM transaction_record WHERE ledger_id = ? AND category IN (${placeholders}) GROUP BY category`,
    )
    .all(ledgerId, ...names) as unknown as Array<{ category: string; count: number }>

  for (const row of rows) {
    counts[row.category] = row.count
  }
  return counts
}
