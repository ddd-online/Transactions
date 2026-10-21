import {
  STOCK_EVENT_BUY,
  STOCK_EVENT_INTEREST_PRINCIPAL,
  STOCK_EVENT_SELL,
  STOCK_EVENT_WITHDRAW,
} from '../../../shared/domain/consts'
import type { StockFundRecord, StockOperation } from '../../../shared/types/stock'
import type { Db } from '../driver'

/**
 * 股票资金记录 / 汇总 / 操作记录 DAO。
 *
 * 逐条移植自既有 `tr-store/src/dao/stock.rs` 的资金记录段与操作记录段
 * （表 `tbl_billadm_stock_fund_record` → `stock_fund_record`，金额列补 `_cents`）。
 *
 * 三处不能改的口径：
 * * `createFundRecord` / `createOperation` 的 `created_at` **严格递增**：秒级时间戳同一秒
 *   会并列，而「链序 / 最新一次操作」依赖这个顺序，并列时只能落到随机 UUID 上。所以取
 *   `MAX(now, 本账本已有最大 created_at + 1)`；服务层显式给出 `createdAt > 0` 时原样采用
 *   （复刻被重放记录的录入位置）。
 * * `queryFundRecords` 的列表序是 `record_date DESC, created_at DESC, id DESC`，**不是**
 *   链序；链序（日期 → 创建时间 → ID）由 `shared/domain/fund` 的 `cashChain` 自己排。
 * * 操作记录插入后立刻裁剪到最新 [`STOCK_OPERATION_LIMIT`] 条（与插入同一事务）。
 *
 * SQL 只拼固定列名 / 语句常量，值一律 `?`。
 */

const FUND_COLUMNS =
  'id, ledger_id, record_date, event_type, event_text, amount_change_cents, ' +
  'cash_balance_cents, net_pnl_cents, remark, created_at'
const OPERATION_COLUMNS = 'id, ledger_id, kind, action, detail, target_id, created_at'

/** 每个账本保留的操作记录条数上限（超出的最较早记录在写入时丢弃）。 */
export const STOCK_OPERATION_LIMIT = 10

interface FundRow {
  id: string
  ledger_id: string
  record_date: string
  event_type: string
  event_text: string
  amount_change_cents: number
  cash_balance_cents: number
  net_pnl_cents: number | null
  remark: string | null
  created_at: number
}

interface OperationRow {
  id: string
  ledger_id: string
  kind: string
  action: string
  detail: string
  target_id: string | null
  created_at: number
}

/** 当前 Unix 秒（既有 `tr_store::util::now_unix`）。 */
function nowUnix(): number {
  return Math.floor(Date.now() / 1000)
}

function fundFromRow(row: FundRow): StockFundRecord {
  return {
    id: row.id,
    ledgerId: row.ledger_id,
    recordDate: row.record_date,
    eventType: row.event_type,
    eventText: row.event_text,
    amountChange: row.amount_change_cents,
    cashBalance: row.cash_balance_cents,
    netPnl: row.net_pnl_cents,
    remark: row.remark ?? '',
    createdAt: row.created_at,
  }
}

function operationFromRow(row: OperationRow): StockOperation {
  return {
    id: row.id,
    ledgerId: row.ledger_id,
    kind: row.kind,
    action: row.action,
    detail: row.detail,
    targetId: row.target_id ?? '',
    createdAt: row.created_at,
  }
}

// ---------------------------------------------------------------- 资金记录

/**
 * 新增一条资金记录。
 *
 * `createdAt > 0` 时原样采用（重放）；否则取 `MAX(now, 本账本已有最大 created_at + 1)`，
 * 让同一秒内录入的多条记录顺序可复现（见文件头）。
 */
export function createFundRecord(db: Db, record: StockFundRecord): void {
  let createdAt = record.createdAt
  if (createdAt <= 0) {
    const row = db
      .prepare(
        'SELECT COALESCE(MAX(created_at), 0) AS max_created_at FROM stock_fund_record ' +
          'WHERE ledger_id = ?',
      )
      .get(record.ledgerId) as unknown as { max_created_at: number } | undefined
    createdAt = Math.max(nowUnix(), (row?.max_created_at ?? 0) + 1)
  }
  db.prepare(
    'INSERT INTO stock_fund_record ' +
      '(id, ledger_id, record_date, event_type, event_text, amount_change_cents, ' +
      'cash_balance_cents, net_pnl_cents, remark, created_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    record.id,
    record.ledgerId,
    record.recordDate,
    record.eventType,
    record.eventText,
    record.amountChange,
    record.cashBalance,
    record.netPnl,
    record.remark,
    createdAt,
  )
}

/** 末条资金记录：`record_date DESC, created_at DESC, id DESC`；没有记录返回 `null`。 */
export function queryLatestFundRecord(db: Db, ledgerId: string): StockFundRecord | null {
  const row = db
    .prepare(
      `SELECT ${FUND_COLUMNS} FROM stock_fund_record WHERE ledger_id = ? ` +
        'ORDER BY record_date DESC, created_at DESC, id DESC LIMIT 1',
    )
    .get(ledgerId) as unknown as FundRow | undefined
  return row ? fundFromRow(row) : null
}

/** 按 id 取一条资金记录；不存在返回 `null`。 */
export function getFundRecord(db: Db, id: string): StockFundRecord | null {
  const row = db
    .prepare(`SELECT ${FUND_COLUMNS} FROM stock_fund_record WHERE id = ? ORDER BY id LIMIT 1`)
    .get(id) as unknown as FundRow | undefined
  return row ? fundFromRow(row) : null
}

/** 按 id 删一条资金记录（回滚资金类操作；调用方随后要复算现金链）。 */
export function deleteFundRecord(db: Db, id: string): void {
  db.prepare('DELETE FROM stock_fund_record WHERE id = ?').run(id)
}

/**
 * 资金记录分页（`page` 从 1 起，不做边界钳制 —— 钳制在服务层）。
 *
 * 返回 `{ records, total }`；列表序 `record_date DESC, created_at DESC, id DESC`。
 */
export function queryFundRecords(
  db: Db,
  ledgerId: string,
  page: number,
  pageSize: number,
): { records: StockFundRecord[]; total: number } {
  const totalRow = db
    .prepare('SELECT COUNT(*) AS count FROM stock_fund_record WHERE ledger_id = ?')
    .get(ledgerId) as unknown as { count: number }
  const rows = db
    .prepare(
      `SELECT ${FUND_COLUMNS} FROM stock_fund_record WHERE ledger_id = ? ` +
        'ORDER BY record_date DESC, created_at DESC, id DESC LIMIT ? OFFSET ?',
    )
    .all(ledgerId, pageSize, (page - 1) * pageSize) as unknown as FundRow[]
  return { records: rows.map(fundFromRow), total: totalRow.count }
}

/**
 * 按**录入顺序**（`created_at ASC, id ASC`）返回全部资金记录。
 *
 * 这个顺序不是现金链的链序（链序由 `cashChain` 自己排）；它只保证同一次调用里顺序稳定，
 * 好把算出的余额写回对应的行。
 */
export function listAllFundRecords(db: Db, ledgerId: string): StockFundRecord[] {
  const rows = db
    .prepare(
      `SELECT ${FUND_COLUMNS} FROM stock_fund_record WHERE ledger_id = ? ` +
        'ORDER BY created_at ASC, id ASC',
    )
    .all(ledgerId) as unknown as FundRow[]
  return rows.map(fundFromRow)
}

/**
 * 有「买入 / 卖出」资金记录的账本 id（去重，按 id 升序）。
 *
 * 只给数据订正用（`repair_source_trade_fund_dates` 要按账本重放）：只有买卖记录才可能
 * 带既有本的 UTC 日期，本金 / 支取 / 利息归本的日期由界面给字符串。
 */
export function listTradeFundLedgerIds(db: Db): string[] {
  const rows = db
    .prepare(
      'SELECT DISTINCT ledger_id FROM stock_fund_record WHERE event_type IN (?, ?) ' +
        'ORDER BY ledger_id ASC',
    )
    .all(STOCK_EVENT_BUY, STOCK_EVENT_SELL) as unknown as Array<{ ledger_id: string }>
  return rows.map((row) => row.ledger_id)
}

/** 清空买卖产生的资金记录，保留本金 / 追加 / 支取记录（数据订正用）。 */
export function deleteTradeFundRecords(db: Db, ledgerId: string): void {
  db.prepare(
    'DELETE FROM stock_fund_record WHERE ledger_id = ? AND event_type IN (?, ?)',
  ).run(ledgerId, STOCK_EVENT_BUY, STOCK_EVENT_SELL)
}

/** 只回写资金记录的现金余额（重算链条使用）。 */
export function updateFundRecordCashBalance(db: Db, id: string, cashBalance: number): void {
  db.prepare('UPDATE stock_fund_record SET cash_balance_cents = ? WHERE id = ?').run(
    cashBalance,
    id,
  )
}

// ---------------------------------------------------------------- 汇总

/** Σ 卖出净盈亏（`COALESCE(SUM(net_pnl_cents), 0)`）。 */
export function sumNetPnl(db: Db, ledgerId: string): number {
  const row = db
    .prepare(
      'SELECT COALESCE(SUM(net_pnl_cents), 0) AS total FROM stock_fund_record WHERE ledger_id = ?',
    )
    .get(ledgerId) as unknown as { total: number }
  return row.total
}

/** 累计支取金额：`amount_change_cents` 存负数，取反求和。 */
export function sumWithdrawn(db: Db, ledgerId: string): number {
  const row = db
    .prepare(
      'SELECT COALESCE(SUM(-amount_change_cents), 0) AS total FROM stock_fund_record ' +
        'WHERE ledger_id = ? AND event_type = ?',
    )
    .get(ledgerId, STOCK_EVENT_WITHDRAW) as unknown as { total: number }
  return row.total
}

/** 累计利息归本金额：`amount_change_cents` 存正数，直接求和。 */
export function sumInterestPrincipal(db: Db, ledgerId: string): number {
  const row = db
    .prepare(
      'SELECT COALESCE(SUM(amount_change_cents), 0) AS total FROM stock_fund_record ' +
        'WHERE ledger_id = ? AND event_type = ?',
    )
    .get(ledgerId, STOCK_EVENT_INTEREST_PRINCIPAL) as unknown as { total: number }
  return row.total
}

/** 当前持仓成本：Σ 未清仓（`quantity > 0`）持仓的总成本。 */
export function sumPositionCost(db: Db, ledgerId: string): number {
  const row = db
    .prepare(
      'SELECT COALESCE(SUM(total_cost_cents), 0) AS total FROM stock_position ' +
        'WHERE ledger_id = ? AND quantity > 0',
    )
    .get(ledgerId) as unknown as { total: number }
  return row.total
}

/** 某账本资金记录条数。 */
export function countFundRecords(db: Db, ledgerId: string): number {
  const row = db
    .prepare('SELECT COUNT(*) AS count FROM stock_fund_record WHERE ledger_id = ?')
    .get(ledgerId) as unknown as { count: number }
  return row.count
}

// ---------------------------------------------------------------- 操作记录（回滚用）

/**
 * 新增一条操作记录，并把该账本裁剪到最近 [`STOCK_OPERATION_LIMIT`] 条。
 *
 * `created_at` 与 `createFundRecord` 同一套 idiom：取 `MAX(now, 已有最大值 + 1)`，
 * 「最新一次操作」的顺序才确定。裁剪与插入在**同一次调用**里完成：调用方都在事务中，
 * 超限的较早记录随本次操作一起提交 / 回滚。
 */
export function createOperation(db: Db, operation: StockOperation): void {
  const row = db
    .prepare(
      'SELECT COALESCE(MAX(created_at), 0) AS max_created_at FROM stock_operation ' +
        'WHERE ledger_id = ?',
    )
    .get(operation.ledgerId) as unknown as { max_created_at: number } | undefined
  const createdAt = Math.max(nowUnix(), (row?.max_created_at ?? 0) + 1)

  db.prepare(
    'INSERT INTO stock_operation (id, ledger_id, kind, action, detail, target_id, created_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(
    operation.id,
    operation.ledgerId,
    operation.kind,
    operation.action,
    operation.detail,
    operation.targetId,
    createdAt,
  )

  // 只留最新的 N 条；`created_at` 严格递增，所以"更旧的"就是 created_at 更小的那些。
  db.prepare(
    'DELETE FROM stock_operation WHERE ledger_id = ? AND id NOT IN (' +
      'SELECT id FROM stock_operation WHERE ledger_id = ? ' +
      'ORDER BY created_at DESC, id DESC LIMIT ?)',
  ).run(operation.ledgerId, operation.ledgerId, STOCK_OPERATION_LIMIT)
}

/** 操作记录列表：最新的在前。 */
export function listOperations(db: Db, ledgerId: string, limit: number): StockOperation[] {
  const rows = db
    .prepare(
      `SELECT ${OPERATION_COLUMNS} FROM stock_operation WHERE ledger_id = ? ` +
        'ORDER BY created_at DESC, id DESC LIMIT ?',
    )
    .all(ledgerId, limit) as unknown as OperationRow[]
  return rows.map(operationFromRow)
}

/** 最新一条操作记录；没有记录时返回 `null`。 */
export function latestOperation(db: Db, ledgerId: string): StockOperation | null {
  const row = db
    .prepare(
      `SELECT ${OPERATION_COLUMNS} FROM stock_operation WHERE ledger_id = ? ` +
        'ORDER BY created_at DESC, id DESC LIMIT 1',
    )
    .get(ledgerId) as unknown as OperationRow | undefined
  return row ? operationFromRow(row) : null
}

/** 删一条操作记录（回滚成功后把它弹掉）。 */
export function deleteOperation(db: Db, id: string): void {
  db.prepare('DELETE FROM stock_operation WHERE id = ?').run(id)
}
