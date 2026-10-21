/**
 * 股票持仓 / 成交 / 交易历史 / 轮次 DAO。
 *
 * 逐条移植自既有 `tr-store/src/dao/stock.rs`（position / trade / trade history / round
 * 四节），SQL 形状、ORDER BY 与列映射保持不变：
 *
 * - 单行查询一律补 `ORDER BY id LIMIT 1`（主键升序取第一行，唯一索引被破坏时也确定）；
 * - 时间戳由 DAO 写入（`created_at` / `updated_at` 都是 Unix 秒）；
 * - 金额恒为整数分、股价恒为整数厘；新 schema 的 `_cents` / `_milli` 后缀在 `from*Row`
 *   里映射回模型的 `amount` / `price` 字段，SQL 不出现原列名；
 * - `Option<String>` 的可空文本列读回空串（`round_id` / `order_id` / `remark` 等），
 *   `Option<i64>` 的 `realized_pnl_cents` 保持 `null`；
 * - `round_*` 四列**齐备**才算本轮费用快照，缺一列按"没有快照"处理（老数据口径）；
 * - 值一律 `?`，只拼接常量片段（表名 / 列名 / 按数量生成的占位符）。
 */

import type { RoundFee, StockTrade } from '../../../shared/domain/models'
import { AppError } from '../../../shared/errors'
import type { Db } from '../driver'

const POSITION_COLUMNS =
  'id, ledger_id, stock_code, stock_name, quantity, total_cost_cents, realized_pnl_cents, ' +
  'review, created_at, updated_at, tag'
const TRADE_COLUMNS =
  'id, ledger_id, stock_code, stock_name, trade_type, round_id, order_id, order_seq, ' +
  'price_milli, lots, shares, amount_cents, fee_cents, commission_cents, stamp_duty_cents, ' +
  'transfer_fee_cents, realized_pnl_cents, trade_time, remark, created_at, ' +
  'round_commission_rate, round_min_commission_cents, round_stamp_duty_rate, ' +
  'round_transfer_fee_rate'
const HISTORY_COLUMNS = 'id, ledger_id, stock_code, stock_name, created_at, updated_at'
const ROUND_COLUMNS =
  'id, ledger_id, stock_code, history_id, round_no, opened_at, closed_at, tag, review, created_at'

/** 「未挂接轮次」的判定片段（`round_id` 为空串或 NULL），常量拼接，值仍走占位符。 */
const UNATTACHED_ROUND_SQL = "(round_id = '' OR round_id IS NULL)"

export interface StockPosition {
  id: string
  ledgerId: string
  stockCode: string
  stockName: string
  /** 持仓数量（股） */
  quantity: number
  /** 持仓总成本（分） */
  totalCost: number
  /** 已实现盈亏（分，该股累计） */
  realizedPnl: number
  /** 本轮复盘（持仓期间先写，清仓归档到轮次） */
  review: string
  /** 本轮交易标签（空串 = 没设过） */
  tag: string
  createdAt: number
  updatedAt: number
}

export interface StockTradeHistory {
  id: string
  ledgerId: string
  stockCode: string
  stockName: string
  createdAt: number
  updatedAt: number
}

export interface StockTradeRound {
  id: string
  ledgerId: string
  stockCode: string
  historyId: string
  /** 轮次序号（该股从 1 起） */
  roundNo: number
  /** 本轮首次建仓时间（Unix 秒） */
  openedAt: number
  /** 本轮清仓时间（Unix 秒） */
  closedAt: number
  /** 交易标签（分析/打板/尾盘/追涨/蓄力） */
  tag: string
  /** 本轮交易复盘 */
  review: string
  createdAt: number
}

interface PositionRow {
  id: string
  ledger_id: string
  stock_code: string
  stock_name: string
  quantity: number
  total_cost_cents: number
  realized_pnl_cents: number
  review: string | null
  created_at: number
  updated_at: number
  tag: string | null
}

interface TradeRow {
  id: string
  ledger_id: string
  stock_code: string
  stock_name: string
  trade_type: string
  round_id: string | null
  order_id: string | null
  order_seq: number
  price_milli: number
  lots: number
  shares: number
  amount_cents: number
  fee_cents: number
  commission_cents: number
  stamp_duty_cents: number
  transfer_fee_cents: number
  realized_pnl_cents: number | null
  trade_time: number
  remark: string | null
  created_at: number
  round_commission_rate: number | null
  round_min_commission_cents: number | null
  round_stamp_duty_rate: number | null
  round_transfer_fee_rate: number | null
}

interface HistoryRow {
  id: string
  ledger_id: string
  stock_code: string
  stock_name: string
  created_at: number
  updated_at: number
}

interface RoundRow {
  id: string
  ledger_id: string
  stock_code: string
  history_id: string
  round_no: number
  opened_at: number
  closed_at: number
  tag: string | null
  review: string | null
  created_at: number
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000)
}

/** 既有 DAO 以 `QueryReturnedNoRows` 表示"查无此行"；对外文案固定为 `record not found`。 */
function notFound(): AppError {
  return new AppError('record not found', { status: 404 })
}

function positionFromRow(row: PositionRow): StockPosition {
  return {
    id: row.id,
    ledgerId: row.ledger_id,
    stockCode: row.stock_code,
    stockName: row.stock_name,
    quantity: row.quantity,
    totalCost: row.total_cost_cents,
    realizedPnl: row.realized_pnl_cents,
    review: row.review ?? '',
    tag: row.tag ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * 读 4 个可空列拼成本轮费用快照；**四项都有**才返回 `Some`。
 *
 * 三缺一（理论上不该出现）按"没有快照"处理，调用方退回系统配置 —— 免得半份设置参与算费。
 */
function roundFeeFromRow(row: TradeRow): RoundFee | null {
  const commissionRate = row.round_commission_rate
  const minCommission = row.round_min_commission_cents
  const stampDutyRate = row.round_stamp_duty_rate
  const transferFeeRate = row.round_transfer_fee_rate
  if (
    commissionRate === null ||
    minCommission === null ||
    stampDutyRate === null ||
    transferFeeRate === null
  ) {
    return null
  }
  return {
    commissionRate,
    minCommission,
    stampDutyRate,
    transferFeeRate,
  }
}

function tradeFromRow(row: TradeRow): StockTrade {
  return {
    id: row.id,
    ledgerId: row.ledger_id,
    stockCode: row.stock_code,
    stockName: row.stock_name,
    tradeType: row.trade_type,
    roundId: row.round_id ?? '',
    orderId: row.order_id ?? '',
    orderSeq: row.order_seq,
    price: row.price_milli,
    lots: row.lots,
    shares: row.shares,
    amount: row.amount_cents,
    fee: row.fee_cents,
    commission: row.commission_cents,
    stampDuty: row.stamp_duty_cents,
    transferFee: row.transfer_fee_cents,
    realizedPnl: row.realized_pnl_cents,
    tradeTime: row.trade_time,
    roundFee: roundFeeFromRow(row),
    remark: row.remark ?? '',
    createdAt: row.created_at,
  }
}

function historyFromRow(row: HistoryRow): StockTradeHistory {
  return {
    id: row.id,
    ledgerId: row.ledger_id,
    stockCode: row.stock_code,
    stockName: row.stock_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function roundFromRow(row: RoundRow): StockTradeRound {
  return {
    id: row.id,
    ledgerId: row.ledger_id,
    stockCode: row.stock_code,
    historyId: row.history_id,
    roundNo: row.round_no,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    tag: row.tag ?? '',
    review: row.review ?? '',
    createdAt: row.created_at,
  }
}

// ---------- 持仓 ----------

/** 取某股持仓；不存在抛 404。 */
export function getPosition(db: Db, ledgerId: string, stockCode: string): StockPosition {
  const row = db
    .prepare(
      `SELECT ${POSITION_COLUMNS} FROM stock_position ` +
        'WHERE ledger_id = ? AND stock_code = ? ORDER BY id LIMIT 1',
    )
    .get(ledgerId, stockCode) as PositionRow | undefined
  if (!row) throw notFound()
  return positionFromRow(row)
}

export function createPosition(db: Db, position: StockPosition, now = nowUnix()): void {
  db.prepare(
    'INSERT INTO stock_position ' +
      '(id, ledger_id, stock_code, stock_name, quantity, total_cost_cents, realized_pnl_cents, ' +
      'review, created_at, updated_at, tag) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    position.id,
    position.ledgerId,
    position.stockCode,
    position.stockName,
    position.quantity,
    position.totalCost,
    position.realizedPnl,
    position.review,
    now,
    now,
    position.tag,
  )
}

/**
 * 只更新派生字段（数量 / 成本 / 已实现盈亏 / 名称 / 复盘 / 本轮标签），
 * 不动 `ledger_id`、`stock_code`、`created_at`。
 */
export function updatePosition(db: Db, position: StockPosition, now = nowUnix()): void {
  db.prepare(
    'UPDATE stock_position SET quantity = ?, total_cost_cents = ?, realized_pnl_cents = ?, ' +
      'stock_name = ?, review = ?, updated_at = ?, tag = ? WHERE id = ?',
  ).run(
    position.quantity,
    position.totalCost,
    position.realizedPnl,
    position.stockName,
    position.review,
    now,
    position.tag,
    position.id,
  )
}

/** 某账本全部持仓：`quantity DESC, created_at ASC`（已清仓的也返回，由服务层过滤）。 */
export function listPositions(db: Db, ledgerId: string): StockPosition[] {
  const rows = db
    .prepare(
      `SELECT ${POSITION_COLUMNS} FROM stock_position WHERE ledger_id = ? ` +
        'ORDER BY quantity DESC, created_at ASC',
    )
    .all(ledgerId) as unknown as PositionRow[]
  return rows.map(positionFromRow)
}

// ---------- 交易 ----------

/**
 * 新建成交。
 *
 * 本轮费用快照（`round_*`）是可空列：没有快照就写 NULL（老数据 / 未记录的口径）；
 * `realized_pnl_cents` 同理，买入成交写 NULL。
 */
export function createTrade(db: Db, trade: StockTrade, now = nowUnix()): void {
  const roundFee = trade.roundFee
  db.prepare(
    'INSERT INTO stock_trade ' +
      '(id, ledger_id, stock_code, stock_name, trade_type, round_id, order_id, order_seq, ' +
      'price_milli, lots, shares, amount_cents, fee_cents, commission_cents, stamp_duty_cents, ' +
      'transfer_fee_cents, realized_pnl_cents, trade_time, remark, created_at, ' +
      'round_commission_rate, round_min_commission_cents, round_stamp_duty_rate, ' +
      'round_transfer_fee_rate) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    trade.id,
    trade.ledgerId,
    trade.stockCode,
    trade.stockName,
    trade.tradeType,
    trade.roundId,
    trade.orderId,
    trade.orderSeq,
    trade.price,
    trade.lots,
    trade.shares,
    trade.amount,
    trade.fee,
    trade.commission,
    trade.stampDuty,
    trade.transferFee,
    trade.realizedPnl,
    trade.tradeTime,
    trade.remark,
    now,
    roundFee?.commissionRate ?? null,
    roundFee?.minCommission ?? null,
    roundFee?.stampDutyRate ?? null,
    roundFee?.transferFeeRate ?? null,
  )
}

/** 某股全部交易（倒序）：`trade_time DESC, created_at DESC`。 */
export function listTrades(db: Db, ledgerId: string, stockCode: string): StockTrade[] {
  const rows = db
    .prepare(
      `SELECT ${TRADE_COLUMNS} FROM stock_trade ` +
        'WHERE ledger_id = ? AND stock_code = ? ORDER BY trade_time DESC, created_at DESC',
    )
    .all(ledgerId, stockCode) as unknown as TradeRow[]
  return rows.map(tradeFromRow)
}

/** 某股全部交易（升序，历史回填 / 轮次归并使用）。 */
export function listTradesAsc(db: Db, ledgerId: string, stockCode: string): StockTrade[] {
  const rows = db
    .prepare(
      `SELECT ${TRADE_COLUMNS} FROM stock_trade ` +
        'WHERE ledger_id = ? AND stock_code = ? ' +
        'ORDER BY trade_time ASC, created_at ASC, id ASC',
    )
    .all(ledgerId, stockCode) as unknown as TradeRow[]
  return rows.map(tradeFromRow)
}

/**
 * 整个账本的全部交易（升序，重放重建使用）。
 *
 * 同一委托内的多笔成交按 `order_seq` 排序，保证重放顺序确定。
 */
export function listAllTradesAsc(db: Db, ledgerId: string): StockTrade[] {
  const rows = db
    .prepare(
      `SELECT ${TRADE_COLUMNS} FROM stock_trade WHERE ledger_id = ? ` +
        'ORDER BY trade_time ASC, created_at ASC, order_seq ASC, id ASC',
    )
    .all(ledgerId) as unknown as TradeRow[]
  return rows.map(tradeFromRow)
}

export function getTrade(db: Db, tradeId: string): StockTrade {
  const row = db
    .prepare(`SELECT ${TRADE_COLUMNS} FROM stock_trade WHERE id = ? ORDER BY id LIMIT 1`)
    .get(tradeId) as TradeRow | undefined
  if (!row) throw notFound()
  return tradeFromRow(row)
}

/** 同一委托下的全部成交明细，按 `order_seq` 升序。 */
export function listTradesByOrder(db: Db, ledgerId: string, orderId: string): StockTrade[] {
  const rows = db
    .prepare(
      `SELECT ${TRADE_COLUMNS} FROM stock_trade ` +
        'WHERE ledger_id = ? AND order_id = ? ORDER BY order_seq ASC, created_at ASC, id ASC',
    )
    .all(ledgerId, orderId) as unknown as TradeRow[]
  return rows.map(tradeFromRow)
}

export function deleteTradesByOrder(db: Db, ledgerId: string, orderId: string): void {
  db.prepare('DELETE FROM stock_trade WHERE ledger_id = ? AND order_id = ?').run(ledgerId, orderId)
}

/** 按 ID 集合删除交易（空集合直接返回）。 */
export function deleteTradesByIds(db: Db, ids: readonly string[]): void {
  if (ids.length === 0) return
  const placeholders = ids.map(() => '?').join(', ')
  db.prepare(`DELETE FROM stock_trade WHERE id IN (${placeholders})`).run(...ids)
}

/** 更新成交本身（编辑成交时按当前费用设置重算后落库）；不动名称 / 备注 / 时间戳。 */
export function updateTrade(db: Db, trade: StockTrade): void {
  db.prepare(
    'UPDATE stock_trade SET trade_type = ?, round_id = ?, order_id = ?, order_seq = ?, ' +
      'price_milli = ?, lots = ?, shares = ?, amount_cents = ?, fee_cents = ?, ' +
      'commission_cents = ?, stamp_duty_cents = ?, transfer_fee_cents = ?, ' +
      'realized_pnl_cents = ?, trade_time = ? WHERE id = ?',
  ).run(
    trade.tradeType,
    trade.roundId,
    trade.orderId,
    trade.orderSeq,
    trade.price,
    trade.lots,
    trade.shares,
    trade.amount,
    trade.fee,
    trade.commission,
    trade.stampDuty,
    trade.transferFee,
    trade.realizedPnl,
    trade.tradeTime,
    trade.id,
  )
}

/** 只回写重放派生字段（轮次挂接与已实现盈亏），不触碰成交本身。 */
export function updateTradeSettlement(
  db: Db,
  tradeId: string,
  roundId: string,
  realizedPnl: number | null,
): void {
  db.prepare('UPDATE stock_trade SET round_id = ?, realized_pnl_cents = ? WHERE id = ?').run(
    roundId,
    realizedPnl,
    tradeId,
  )
}

// ---------- 交易历史集合 ----------

export function getTradeHistory(db: Db, ledgerId: string, stockCode: string): StockTradeHistory {
  const row = db
    .prepare(
      `SELECT ${HISTORY_COLUMNS} FROM stock_trade_history ` +
        'WHERE ledger_id = ? AND stock_code = ? ORDER BY id LIMIT 1',
    )
    .get(ledgerId, stockCode) as HistoryRow | undefined
  if (!row) throw notFound()
  return historyFromRow(row)
}

export function createTradeHistory(
  db: Db,
  history: StockTradeHistory,
  now = nowUnix(),
): void {
  db.prepare(
    'INSERT INTO stock_trade_history ' +
      '(id, ledger_id, stock_code, stock_name, created_at, updated_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?)',
  ).run(history.id, history.ledgerId, history.stockCode, history.stockName, now, now)
}

/** 列表按 `updated_at DESC, created_at DESC`。 */
export function listTradeHistories(db: Db, ledgerId: string): StockTradeHistory[] {
  const rows = db
    .prepare(
      `SELECT ${HISTORY_COLUMNS} FROM stock_trade_history WHERE ledger_id = ? ` +
        'ORDER BY updated_at DESC, created_at DESC',
    )
    .all(ledgerId) as unknown as HistoryRow[]
  return rows.map(historyFromRow)
}

/** 清空账本的历史集合（重放重建时按交易流重新生成）。 */
export function deleteTradeHistoriesByLedger(db: Db, ledgerId: string): void {
  db.prepare('DELETE FROM stock_trade_history WHERE ledger_id = ?').run(ledgerId)
}

export function updateTradeHistoryName(
  db: Db,
  ledgerId: string,
  stockCode: string,
  stockName: string,
  now = nowUnix(),
): void {
  db.prepare(
    'UPDATE stock_trade_history SET stock_name = ?, updated_at = ? ' +
      'WHERE ledger_id = ? AND stock_code = ?',
  ).run(stockName, now, ledgerId, stockCode)
}

/** 存在交易记录的股票代码列表（不做排序，历史回填使用；SQL 是去重的 `stock_code` 列表）。 */
export function listTradeStocks(db: Db, ledgerId: string): string[] {
  const rows = db
    .prepare('SELECT DISTINCT stock_code FROM stock_trade WHERE ledger_id = ?')
    .all(ledgerId) as unknown as Array<{ stock_code: string }>
  return rows.map((row) => row.stock_code)
}

// ---------- 轮次 ----------

export function countTradeRounds(db: Db, historyId: string): number {
  const row = db
    .prepare('SELECT COUNT(*) AS count FROM stock_trade_round WHERE history_id = ?')
    .get(historyId) as { count: number }
  return row.count
}

export function createTradeRound(db: Db, round: StockTradeRound, now = nowUnix()): void {
  db.prepare(
    'INSERT INTO stock_trade_round ' +
      '(id, ledger_id, stock_code, history_id, round_no, opened_at, closed_at, tag, review, ' +
      'created_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    round.id,
    round.ledgerId,
    round.stockCode,
    round.historyId,
    round.roundNo,
    round.openedAt,
    round.closedAt,
    round.tag,
    round.review,
    now,
  )
}

/** 某股全部轮次：`round_no ASC`。 */
export function listTradeRoundsByStock(
  db: Db,
  ledgerId: string,
  stockCode: string,
): StockTradeRound[] {
  const rows = db
    .prepare(
      `SELECT ${ROUND_COLUMNS} FROM stock_trade_round ` +
        'WHERE ledger_id = ? AND stock_code = ? ORDER BY round_no ASC',
    )
    .all(ledgerId, stockCode) as unknown as RoundRow[]
  return rows.map(roundFromRow)
}

/** 整个账本的全部轮次（重放重建时用于保留标签与复盘）：`stock_code ASC, round_no ASC`。 */
export function listTradeRounds(db: Db, ledgerId: string): StockTradeRound[] {
  const rows = db
    .prepare(
      `SELECT ${ROUND_COLUMNS} FROM stock_trade_round WHERE ledger_id = ? ` +
        'ORDER BY stock_code ASC, round_no ASC',
    )
    .all(ledgerId) as unknown as RoundRow[]
  return rows.map(roundFromRow)
}

export function deleteTradeRound(db: Db, roundId: string): void {
  db.prepare('DELETE FROM stock_trade_round WHERE id = ?').run(roundId)
}

/** 回写轮次的派生字段（历史集合与起止时间），标签与复盘保持不变。 */
export function updateTradeRoundDerived(
  db: Db,
  roundId: string,
  historyId: string,
  openedAt: number,
  closedAt: number,
): void {
  db.prepare(
    'UPDATE stock_trade_round SET history_id = ?, opened_at = ?, closed_at = ? WHERE id = ?',
  ).run(historyId, openedAt, closedAt, roundId)
}

export function getTradeRound(db: Db, roundId: string): StockTradeRound {
  const row = db
    .prepare(`SELECT ${ROUND_COLUMNS} FROM stock_trade_round WHERE id = ? ORDER BY id LIMIT 1`)
    .get(roundId) as RoundRow | undefined
  if (!row) throw notFound()
  return roundFromRow(row)
}

export function updateTradeRoundReview(db: Db, roundId: string, review: string): void {
  db.prepare('UPDATE stock_trade_round SET review = ? WHERE id = ?').run(review, roundId)
}

export function updateTradeRoundTag(db: Db, roundId: string, tag: string): void {
  db.prepare('UPDATE stock_trade_round SET tag = ? WHERE id = ?').run(tag, roundId)
}

/** 某轮次的全部交易：`trade_time ASC, created_at ASC, id ASC`。 */
export function listTradesByRound(db: Db, roundId: string): StockTrade[] {
  const rows = db
    .prepare(
      `SELECT ${TRADE_COLUMNS} FROM stock_trade WHERE round_id = ? ` +
        'ORDER BY trade_time ASC, created_at ASC, id ASC',
    )
    .all(roundId) as unknown as TradeRow[]
  return rows.map(tradeFromRow)
}

/**
 * 某股尚未挂接轮次的**第一笔**成交（= 本轮建仓单）；没有未挂接成交时返回 `null`。
 *
 * 排序口径与资金链一致：**(成交时间 → 录入时间 → 委托内序号 → ID)** —— 倒填的委托
 * 排在它时间该在的位置上（`created_at` 是同一秒内的次序，`id` 兜底定序）。
 * 本轮的费用设置就从这一行读。
 */
export function firstUnattachedTrade(
  db: Db,
  ledgerId: string,
  stockCode: string,
): StockTrade | null {
  const row = db
    .prepare(
      `SELECT ${TRADE_COLUMNS} FROM stock_trade ` +
        `WHERE ledger_id = ? AND stock_code = ? AND ${UNATTACHED_ROUND_SQL} ` +
        'ORDER BY trade_time ASC, created_at ASC, order_seq ASC, id ASC LIMIT 1',
    )
    .get(ledgerId, stockCode) as TradeRow | undefined
  return row ? tradeFromRow(row) : null
}

/** 某股尚未挂接轮次的最小成交时间；全部已挂接时返回 0。 */
export function minUnattachedTradeTime(db: Db, ledgerId: string, stockCode: string): number {
  const row = db
    .prepare(
      'SELECT COALESCE(MIN(trade_time), 0) AS min_trade_time FROM stock_trade ' +
        `WHERE ledger_id = ? AND stock_code = ? AND ${UNATTACHED_ROUND_SQL}`,
    )
    .get(ledgerId, stockCode) as { min_trade_time: number } | undefined
  return row?.min_trade_time ?? 0
}

/** 把某股全部未挂接的交易挂到指定轮次（清仓时收尾）。 */
export function attachUnattachedTrades(
  db: Db,
  ledgerId: string,
  stockCode: string,
  roundId: string,
): void {
  db.prepare(
    'UPDATE stock_trade SET round_id = ? ' +
      `WHERE ledger_id = ? AND stock_code = ? AND ${UNATTACHED_ROUND_SQL}`,
  ).run(roundId, ledgerId, stockCode)
}

/** 批量把指定交易挂到轮次（历史回填使用；空集合直接返回）。 */
export function updateTradesRoundId(db: Db, roundId: string, ids: readonly string[]): void {
  if (ids.length === 0) return
  const placeholders = ids.map(() => '?').join(', ')
  db.prepare(`UPDATE stock_trade SET round_id = ? WHERE id IN (${placeholders})`).run(
    roundId,
    ...ids,
  )
}

/** 从已有交易记录查询股票名称（**跨账本**，按最近成交优先）。 */
export function queryStockName(db: Db, stockCode: string): string {
  const row = db
    .prepare(
      'SELECT stock_name FROM stock_trade WHERE stock_code = ? ' +
        'ORDER BY created_at DESC, id DESC LIMIT 1',
    )
    .get(stockCode) as { stock_name: string | null } | undefined
  // 空名称按"查无记录"处理，让上层回退到外部行情接口。
  if (!row || !row.stock_name) throw notFound()
  return row.stock_name
}

