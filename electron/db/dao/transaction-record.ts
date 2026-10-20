import type { Db } from '../driver'
import type { ChartLine, QueryConditionItem, TransactionRecord } from '../../../shared/domain/models'
import type {
  CategoryExpense,
  ChartPoint,
  TrFilterResult,
  TrQueryCondition,
  TrStatistics,
} from '../../../shared/types/transaction'
import {
  ALL,
  TRANSACTION_TYPE_EXPENSE,
  TRANSACTION_TYPE_INCOME,
  TRANSACTION_TYPE_TRANSFER,
} from '../../../shared/domain/consts'
import { AppError } from '../../../shared/errors'

/**
 * 消费记录 DAO（旧 `tr-store/src/dao/transaction_record.rs` 的逐条移植）。
 *
 * 行为约定：
 * - 筛选、排序、统计、图表分桶**全部在 SQL 里完成**，SQL 形状逐条固定；
 * - 条件项之间是 **OR**，条件项内部是 **AND**；空条件项等价于 `1 = 1`（匹配全部）；
 * - 描述匹配用 `instr(description, ?) > 0`（区分大小写、不把 `%_` 当通配符）；
 * - 标签用子查询：`all` 走 `COUNT(DISTINCT ...) = n`，否则 `EXISTS`，`tag_not` 加 `NOT`；
 * - 排序字段走白名单，非法 / 空回退 `transaction_at desc`；
 * - 统计口径与列表同源：账本 + 时间范围 + 条件项（不含分页与排序）；
 * - 图表分桶用 `strftime(<格式>, transaction_at, 'unixepoch')`，缺省排除 outlier；
 * - 看板分类聚合按**时段合计**，不分桶。
 *
 * SQL 只拼常量片段：值一律 `?`，`ORDER BY` 的列名与方向都来自白名单。
 * 旧表的 `price` 列在新 schema 里叫 `amount_cents`（金额恒为整数分）。
 */

const TABLE = 'transaction_record'
const TAG_TABLE = 'transaction_record_tag'

const COLUMNS =
  'transaction_id, ledger_id, amount_cents, transaction_type, category, description, ' +
  'flags, key_event_date, transaction_at, created_at, updated_at'

/** 排序白名单：旧 wire 字段名 → 新列名（`price` 列已改名为 `amount_cents`）。 */
const SORT_COLUMNS: Readonly<Record<string, string>> = {
  transactionAt: 'transaction_at',
  transactionType: 'transaction_type',
  price: 'amount_cents',
  category: 'category',
}

type SqlValue = string | number

interface TransactionRecordRow {
  transaction_id: string
  ledger_id: string
  amount_cents: number
  transaction_type: string
  category: string
  description: string | null
  flags: string | null
  key_event_date: string | null
  transaction_at: number
  created_at: number
  updated_at: number
}

interface StatisticsRow {
  transaction_type: string
  amount: number | null
}

interface ChartPointRow {
  time: string
  amount: number | null
}

interface CategoryExpenseRow {
  category: string
  amount: number | null
  count: number
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000)
}

/** 旧 DAO 以 `QueryReturnedNoRows` 表示"查无此行"；这里对应 404。 */
function notFound(transactionId: string): AppError {
  return new AppError(`交易记录不存在: ${transactionId}`, { status: 404 })
}

function fromRow(row: TransactionRecordRow): TransactionRecord {
  return {
    transactionId: row.transaction_id,
    ledgerId: row.ledger_id,
    amountCents: row.amount_cents,
    transactionType: row.transaction_type,
    category: row.category,
    description: row.description ?? '',
    flags: row.flags ?? '',
    keyEventDate: row.key_event_date ?? '',
    transactionAt: row.transaction_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** 新建一条记录（自动填充时间戳；`created_at` 与 `updated_at` 同值）。 */
export function create(db: Db, record: TransactionRecord, now = nowUnix()): void {
  db.prepare(
    `INSERT INTO ${TABLE} (transaction_id, ledger_id, amount_cents, transaction_type, category, ` +
      'description, flags, key_event_date, transaction_at, created_at, updated_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    record.transactionId,
    record.ledgerId,
    record.amountCents,
    record.transactionType,
    record.category,
    record.description,
    record.flags,
    record.keyEventDate,
    record.transactionAt,
    now,
    now,
  )
}

/**
 * 批量新建：在调用方的事务内逐条插入，与"500 条一批的多行插入"在行集合
 * 与时间戳口径上完全等价（本函数**不**自己开事务）。
 */
export function createBatch(db: Db, records: readonly TransactionRecord[]): void {
  for (const record of records) {
    create(db, record)
  }
}

/** 按 ID 查询；不存在时抛 404（旧 DAO 抛 `QueryReturnedNoRows`）。 */
export function queryById(db: Db, transactionId: string): TransactionRecord {
  const row = db
    .prepare(`SELECT ${COLUMNS} FROM ${TABLE} WHERE transaction_id = ?`)
    .get(transactionId) as TransactionRecordRow | undefined
  if (!row) throw notFound(transactionId)
  return fromRow(row)
}

/** 删除记录本身（标签关联由服务层在同一事务里清理）；不存在的行视为成功。 */
export function deleteById(db: Db, transactionId: string): void {
  db.prepare(`DELETE FROM ${TABLE} WHERE transaction_id = ?`).run(transactionId)
}

/**
 * 更新关键事件关联日期。命中 0 行时抛 404（把"影响 0 行"显式转成"查无记录"）。
 */
export function updateKeyEventDate(
  db: Db,
  transactionId: string,
  date: string,
  now = nowUnix(),
): void {
  const result = db
    .prepare(`UPDATE ${TABLE} SET key_event_date = ?, updated_at = ? WHERE transaction_id = ?`)
    .run(date, now, transactionId)
  if (Number(result.changes) === 0) throw notFound(transactionId)
}

/** 某账本下关联到指定关键事件日期的记录（按交易时间倒序）。 */
export function queryByKeyEventDate(db: Db, ledgerId: string, date: string): TransactionRecord[] {
  const rows = db
    .prepare(
      `SELECT ${COLUMNS} FROM ${TABLE} WHERE ledger_id = ? AND key_event_date = ? ORDER BY transaction_at desc`,
    )
    .all(ledgerId, date) as unknown as TransactionRecordRow[]
  return rows.map(fromRow)
}

/** 某账本的记录数。 */
export function countByLedgerId(db: Db, ledgerId: string): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS count FROM ${TABLE} WHERE ledger_id = ?`)
    .get(ledgerId) as { count: number } | undefined
  return row?.count ?? 0
}

/**
 * 条件查询：统计 → 总数 → 排序分页。
 *
 * 统计与列表**同一份 WHERE**：账本 + 时间范围 + 条件项（分页与排序不进 WHERE，
 * 所以翻页不影响这三个数）。
 */
export function queryFiltered(db: Db, condition: TrQueryCondition): TrFilterResult {
  const where = buildWhere(condition)
  const statistics = queryStatisticsWhere(db, where.sql, where.args)

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS count FROM ${TABLE} ${where.sql}`)
    .get(...where.args) as { count: number } | undefined
  const total = totalRow?.count ?? 0

  const sort = buildSortClause(condition.sortFields)
  const pagination = buildPagination(condition.limit, condition.offset)
  const rows = db
    .prepare(
      `SELECT ${COLUMNS} FROM ${TABLE} ${where.sql} ORDER BY ${sort}${pagination.sql}`,
    )
    .all(...where.args, ...pagination.args) as unknown as TransactionRecordRow[]

  return { items: rows.map(fromRow), total, statistics }
}

/** 按交易类型汇总指定账本与时间范围内的金额（**不带条件项**，供分析页使用）。 */
export function queryStatistics(
  db: Db,
  ledgerId: string,
  tsRange: readonly number[],
): TrStatistics {
  const where = buildWhere({
    ledgerId,
    offset: -1,
    limit: -1,
    tsRange: [...tsRange],
    items: [],
    sortFields: [],
  })
  return queryStatisticsWhere(db, where.sql, where.args)
}

/** 单条曲线的分桶聚合序列。 */
export function queryChartLineData(
  db: Db,
  ledgerId: string,
  tsRange: readonly number[],
  granularity: string,
  line: ChartLine,
): ChartPoint[] {
  // 分桶：strftime(<格式串>, transaction_at, 'unixepoch')；粒度即格式串。
  const timeFormat = granularity === 'year' ? '%Y' : '%Y-%m'
  const clauses = ['ledger_id = ?']
  // strftime 的格式串是 SELECT 里的第一个参数，必须排在 WHERE 参数之前。
  const args: SqlValue[] = [timeFormat, ledgerId]

  if (tsRange.length === 2) {
    clauses.push('transaction_at >= ?', 'transaction_at <= ?')
    args.push(tsRange[0], tsRange[1])
  }

  clauses.push('transaction_type = ?')
  args.push(line.transactionType)

  if (!line.includeOutlier) {
    // flags 存的是 JSON（{"outlier":true}）；flags 为 NULL 或没有该键时结果是 NULL，
    // `NULL IS NOT 1` 为真，行保留。
    clauses.push("json_extract(flags, '$.outlier') IS NOT 1")
  }

  const items = buildItemsClause(line.conditions)
  if (items.sql.length > 0) {
    clauses.push(`(${items.sql})`)
    args.push(...items.args)
  }

  const rows = db
    .prepare(
      `SELECT strftime(?, transaction_at, 'unixepoch') AS time, SUM(amount_cents) AS amount ` +
        `FROM ${TABLE} WHERE ${clauses.join(' AND ')} GROUP BY time`,
    )
    .all(...args) as unknown as ChartPointRow[]

  return rows.map((row) => ({ time: row.time, amount: row.amount ?? 0 }))
}

/**
 * 支出按分类分组（金额降序、同额按分类名升序）。返回分类、金额（分）、笔数。
 *
 * `tsRange` 必须是 `[起, 止]` 两个端点（服务层负责算出本地边界）；缺项按 0 处理，
 * 与旧 DAO 的 `range_args` 一致。
 */
export function sumExpenseByCategory(
  db: Db,
  ledgerId: string,
  tsRange: readonly number[],
): CategoryExpense[] {
  const rows = db
    .prepare(
      `SELECT category, SUM(amount_cents) AS amount, COUNT(*) AS count FROM ${TABLE} ` +
        'WHERE ledger_id = ? AND transaction_type = ? AND transaction_at >= ? AND transaction_at <= ? ' +
        'GROUP BY category ORDER BY 2 DESC, 1 ASC',
    )
    .all(
      ledgerId,
      TRANSACTION_TYPE_EXPENSE,
      tsRange[0] ?? 0,
      tsRange[1] ?? 0,
    ) as unknown as CategoryExpenseRow[]

  return rows.map((row) => ({
    category: row.category,
    amountCents: row.amount ?? 0,
    count: row.count,
  }))
}

// ---------------------------------------------------------------- SQL 组装

/** 只有一处拼统计 SQL：`queryFiltered` 与 `queryStatistics` 共用。 */
function queryStatisticsWhere(
  db: Db,
  whereSql: string,
  args: readonly SqlValue[],
): TrStatistics {
  const rows = db
    .prepare(
      `SELECT transaction_type, SUM(amount_cents) AS amount FROM ${TABLE} ${whereSql} GROUP BY transaction_type`,
    )
    .all(...args) as unknown as StatisticsRow[]

  const statistics: TrStatistics = { income: 0, expense: 0, transfer: 0 }
  for (const row of rows) {
    const amount = row.amount ?? 0
    switch (row.transaction_type) {
      case TRANSACTION_TYPE_INCOME:
        statistics.income = amount
        break
      case TRANSACTION_TYPE_EXPENSE:
        statistics.expense = amount
        break
      case TRANSACTION_TYPE_TRANSFER:
        statistics.transfer = amount
        break
      default:
        break
    }
  }
  return statistics
}

/** 组装 WHERE 子句（账本 + 可选时间范围 + 条件项）。 */
function buildWhere(condition: TrQueryCondition): { sql: string; args: SqlValue[] } {
  const clauses = ['ledger_id = ?']
  const args: SqlValue[] = [condition.ledgerId]

  if (condition.tsRange.length === 2) {
    clauses.push('transaction_at >= ?')
    args.push(condition.tsRange[0])
    clauses.push('transaction_at <= ?')
    args.push(condition.tsRange[1])
  }

  const items = buildItemsClause(condition.items)
  if (items.sql.length > 0) {
    clauses.push(`(${items.sql})`)
    args.push(...items.args)
  }

  return { sql: `WHERE ${clauses.join(' AND ')}`, args }
}

/** 条件项列表 → SQL 片段（OR 语义）。空列表返回空串（不加任何限制）。 */
function buildItemsClause(items: readonly QueryConditionItem[]): {
  sql: string
  args: SqlValue[]
} {
  if (items.length === 0) return { sql: '', args: [] }

  const orClauses: string[] = []
  const args: SqlValue[] = []

  for (const item of items) {
    const sub: string[] = []
    const subArgs: SqlValue[] = []

    if (item.transactionType !== '') {
      sub.push('transaction_type = ?')
      subArgs.push(item.transactionType)
    }
    if (item.category !== '') {
      sub.push('category = ?')
      subArgs.push(item.category)
    }
    if (item.description !== '') {
      sub.push('instr(description, ?) > 0')
      subArgs.push(item.description)
    }
    if (item.tags.length > 0) {
      const tagCondition = buildTagCondition(item.tags, item.tagPolicy, item.tagNot)
      sub.push(tagCondition.sql)
      subArgs.push(...tagCondition.args)
    }

    if (sub.length === 0) {
      // 空条件项在内存实现中匹配所有记录（OR 语义），保持等价。
      orClauses.push('1 = 1')
      continue
    }

    orClauses.push(`(${sub.join(' AND ')})`)
    args.push(...subArgs)
  }

  return { sql: orClauses.join(' OR '), args }
}

/** 标签匹配子查询：`all` 要求同时包含全部标签，否则按 `any` 处理。 */
function buildTagCondition(
  tags: readonly string[],
  policy: string,
  negate: boolean,
): { sql: string; args: SqlValue[] } {
  const placeholders = tags.map(() => '?').join(', ')
  const args: SqlValue[] = [...tags]

  let expr: string
  if (policy === ALL) {
    // 标签个数也走参数（值一律 `?`，不拼进 SQL）。
    args.push(tags.length)
    expr =
      `(SELECT COUNT(DISTINCT t.tag) FROM ${TAG_TABLE} t ` +
      `WHERE t.transaction_id = ${TABLE}.transaction_id AND t.tag IN (${placeholders})) = ?`
  } else {
    expr =
      `EXISTS (SELECT 1 FROM ${TAG_TABLE} t ` +
      `WHERE t.transaction_id = ${TABLE}.transaction_id AND t.tag IN (${placeholders}))`
  }

  return { sql: negate ? `NOT (${expr})` : expr, args }
}

/** 排序子句：字段白名单 + 默认 `transaction_at desc`。 */
function buildSortClause(sortFields: readonly { field: string; order: string }[]): string {
  if (sortFields.length === 0) return 'transaction_at desc'

  const clauses: string[] = []
  for (const field of sortFields) {
    // 用 hasOwn 而不是直接取值：`constructor` / `__proto__` 这类键会命中原型链。
    const column = Object.hasOwn(SORT_COLUMNS, field.field)
      ? SORT_COLUMNS[field.field]
      : undefined
    if (!column) continue
    const order = field.order === 'asc' ? 'asc' : 'desc'
    clauses.push(`${column} ${order}`)
  }

  return clauses.length === 0 ? 'transaction_at desc' : clauses.join(', ')
}

/**
 * 分页子句。`limit` / `offset` 只有 `> 0` 才生效；`offset` 需要 `LIMIT` 才合法，
 * 因此"只给 offset"时用常量 `LIMIT -1`（不限制）。
 */
function buildPagination(limit: number, offset: number): { sql: string; args: SqlValue[] } {
  if (limit > 0 && offset > 0) return { sql: ' LIMIT ? OFFSET ?', args: [limit, offset] }
  if (limit > 0) return { sql: ' LIMIT ?', args: [limit] }
  if (offset > 0) return { sql: ' LIMIT -1 OFFSET ?', args: [offset] }
  return { sql: '', args: [] }
}
