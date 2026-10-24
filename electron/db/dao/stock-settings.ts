import type {
  StockAccount,
  StockReviewSetting,
  StockTradeTagSetting,
} from '../../../shared/types/stock'
import type { StockFeeSetting } from '../../../shared/domain/models'
import type { Db } from '../driver'

/**
 * 股票账户 / 费用设置 / 交易标签设置 / 复盘模板设置 DAO。
 *
 * 逐条移植自既有 `tr-store/src/dao/stock.rs` 的对应段（`tbl_billadm_stock_*` → 无前缀表名，
 * 金额列补 `_cents`）：
 *
 * * 单行查询都补 `ORDER BY id LIMIT 1`（按主键升序取第一行）—— 唯一索引被破坏时取到的行
 *   仍然是确定的；
 * * 时间戳由 DAO 在 INSERT / UPDATE 时填（秒级 Unix 秒），服务层不用自己补；
 * * SQL 只拼固定列名常量，值一律 `?`；
 * * 「不存在」在 DAO 层是 `null`（既有是 `QueryReturnedNoRows`），服务层负责 get-or-create。
 *
 * 与既有的差别只有列名映射（`principal` → `principal_cents` 等）与 NULL 的兜底写法一致
 * （既有 `Option::unwrap_or_default` → 这里 `?? ''`）。
 */

const ACCOUNT_COLUMNS = 'id, ledger_id, principal_cents, created_at, updated_at'
const FEE_COLUMNS =
  'id, ledger_id, commission_rate, min_commission_cents, stamp_duty_rate, ' +
  'transfer_fee_rate, created_at, updated_at'
const TAG_SETTING_COLUMNS = 'id, ledger_id, tags, created_at, updated_at'
const REVIEW_SETTING_COLUMNS =
  'id, ledger_id, template, daily_template, created_at, updated_at'

interface AccountRow {
  id: string
  ledger_id: string
  principal_cents: number
  created_at: number
  updated_at: number
}

interface FeeSettingRow {
  id: string
  ledger_id: string
  commission_rate: number
  min_commission_cents: number
  stamp_duty_rate: number
  transfer_fee_rate: number
  created_at: number
  updated_at: number
}

interface TagSettingRow {
  id: string
  ledger_id: string
  tags: string | null
  created_at: number
  updated_at: number
}

interface ReviewSettingRow {
  id: string
  ledger_id: string
  template: string | null
  daily_template: string | null
  created_at: number
  updated_at: number
}

/** 当前 Unix 秒（既有 `tr_store::util::now_unix`）。 */
function nowUnix(): number {
  return Math.floor(Date.now() / 1000)
}

function accountFromRow(row: AccountRow): StockAccount {
  return {
    id: row.id,
    ledgerId: row.ledger_id,
    principal: row.principal_cents,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function feeSettingFromRow(row: FeeSettingRow): StockFeeSetting {
  return {
    id: row.id,
    ledgerId: row.ledger_id,
    commissionRate: row.commission_rate,
    minCommission: row.min_commission_cents,
    stampDutyRate: row.stamp_duty_rate,
    transferFeeRate: row.transfer_fee_rate,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** 既有 `tag_setting_from_row`：NULL 兜底空串（老库可能缺这一列的值）。 */
function tagSettingFromRow(row: TagSettingRow): StockTradeTagSetting {
  return {
    id: row.id,
    ledgerId: row.ledger_id,
    tags: row.tags ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** 既有 `review_setting_from_row`：NULL 兜底空串。 */
function reviewSettingFromRow(row: ReviewSettingRow): StockReviewSetting {
  return {
    id: row.id,
    ledgerId: row.ledger_id,
    template: row.template ?? '',
    dailyTemplate: row.daily_template ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ---------------------------------------------------------------- 账户

/** 取某账本的账户；不存在返回 `null`。 */
export function getAccount(db: Db, ledgerId: string): StockAccount | null {
  const row = db
    .prepare(
      `SELECT ${ACCOUNT_COLUMNS} FROM stock_account WHERE ledger_id = ? ORDER BY id LIMIT 1`,
    )
    .get(ledgerId) as unknown as AccountRow | undefined
  return row ? accountFromRow(row) : null
}

/** 新建账户（时间戳由 DAO 补齐）。 */
export function createAccount(
  db: Db,
  account: { id: string; ledgerId: string; principal: number },
  now = nowUnix(),
): void {
  db.prepare(
    'INSERT INTO stock_account (id, ledger_id, principal_cents, created_at, updated_at) ' +
      'VALUES (?, ?, ?, ?, ?)',
  ).run(account.id, account.ledgerId, account.principal, now, now)
}

/** 更新本金（不改动其它字段）。 */
export function updateAccountPrincipal(
  db: Db,
  ledgerId: string,
  principal: number,
  now = nowUnix(),
): void {
  db.prepare('UPDATE stock_account SET principal_cents = ?, updated_at = ? WHERE ledger_id = ?').run(
    principal,
    now,
    ledgerId,
  )
}

// ---------------------------------------------------------------- 费用设置

/** 取某账本的费用设置；不存在返回 `null`。 */
export function getFeeSetting(db: Db, ledgerId: string): StockFeeSetting | null {
  const row = db
    .prepare(
      `SELECT ${FEE_COLUMNS} FROM stock_fee_setting WHERE ledger_id = ? ORDER BY id LIMIT 1`,
    )
    .get(ledgerId) as unknown as FeeSettingRow | undefined
  return row ? feeSettingFromRow(row) : null
}

/** 新建费用设置（时间戳由 DAO 补齐）。 */
export function createFeeSetting(
  db: Db,
  setting: Omit<StockFeeSetting, 'createdAt' | 'updatedAt'>,
  now = nowUnix(),
): void {
  db.prepare(
    'INSERT INTO stock_fee_setting ' +
      '(id, ledger_id, commission_rate, min_commission_cents, stamp_duty_rate, ' +
      'transfer_fee_rate, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    setting.id,
    setting.ledgerId,
    setting.commissionRate,
    setting.minCommission,
    setting.stampDutyRate,
    setting.transferFeeRate,
    now,
    now,
  )
}

/** 只更新四个费率字段（部分更新，不动其它列）。 */
export function updateFeeSetting(
  db: Db,
  setting: Pick<
    StockFeeSetting,
    'ledgerId' | 'commissionRate' | 'minCommission' | 'stampDutyRate' | 'transferFeeRate'
  >,
  now = nowUnix(),
): void {
  db.prepare(
    'UPDATE stock_fee_setting SET commission_rate = ?, min_commission_cents = ?, ' +
      'stamp_duty_rate = ?, transfer_fee_rate = ?, updated_at = ? WHERE ledger_id = ?',
  ).run(
    setting.commissionRate,
    setting.minCommission,
    setting.stampDutyRate,
    setting.transferFeeRate,
    now,
    setting.ledgerId,
  )
}

// ---------------------------------------------------------------- 交易标签设置

/** 取某账本的交易标签设置；不存在返回 `null`。 */
export function getTradeTagSetting(db: Db, ledgerId: string): StockTradeTagSetting | null {
  const row = db
    .prepare(
      `SELECT ${TAG_SETTING_COLUMNS} FROM stock_trade_tag_setting WHERE ledger_id = ? ` +
        'ORDER BY id LIMIT 1',
    )
    .get(ledgerId) as unknown as TagSettingRow | undefined
  return row ? tagSettingFromRow(row) : null
}

/** 新建交易标签设置（时间戳由 DAO 补齐）。 */
export function createTradeTagSetting(
  db: Db,
  setting: { id: string; ledgerId: string; tags: string },
  now = nowUnix(),
): void {
  db.prepare(
    'INSERT INTO stock_trade_tag_setting (id, ledger_id, tags, created_at, updated_at) ' +
      'VALUES (?, ?, ?, ?, ?)',
  ).run(setting.id, setting.ledgerId, setting.tags, now, now)
}

/** 写标签 JSON（部分更新）。 */
export function updateTradeTagSettingTags(
  db: Db,
  ledgerId: string,
  tagsJson: string,
  now = nowUnix(),
): void {
  db.prepare('UPDATE stock_trade_tag_setting SET tags = ?, updated_at = ? WHERE ledger_id = ?').run(
    tagsJson,
    now,
    ledgerId,
  )
}

// ---------------------------------------------------------------- 本轮复盘模板设置

/** 取某账本的复盘模板设置；不存在返回 `null`。 */
export function getReviewSetting(db: Db, ledgerId: string): StockReviewSetting | null {
  const row = db
    .prepare(
      `SELECT ${REVIEW_SETTING_COLUMNS} FROM stock_review_setting WHERE ledger_id = ? ` +
        'ORDER BY id LIMIT 1',
    )
    .get(ledgerId) as unknown as ReviewSettingRow | undefined
  return row ? reviewSettingFromRow(row) : null
}

/** 新建复盘模板设置（时间戳由 DAO 补齐）。 */
export function createReviewSetting(
  db: Db,
  setting: { id: string; ledgerId: string; template: string; dailyTemplate: string },
  now = nowUnix(),
): void {
  db.prepare(
    'INSERT INTO stock_review_setting (id, ledger_id, template, daily_template, created_at, updated_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?)',
  ).run(setting.id, setting.ledgerId, setting.template, setting.dailyTemplate, now, now)
}

/** 写模板（空串 = 清除自定义，服务层据此回落到内置模板）。 */
export function updateReviewSettingTemplate(
  db: Db,
  ledgerId: string,
  template: string,
  dailyTemplate: string,
  now = nowUnix(),
): void {
  db.prepare(
    'UPDATE stock_review_setting SET template = ?, daily_template = ?, updated_at = ? WHERE ledger_id = ?',
  ).run(template, dailyTemplate, now, ledgerId)
}
