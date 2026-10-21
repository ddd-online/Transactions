import { randomUUID } from 'node:crypto'

import { daysInMonth } from '../../shared/domain/calendar'
import {
  STOCK_EVENT_ADD_PRINCIPAL,
  STOCK_EVENT_INTEREST_PRINCIPAL,
  STOCK_EVENT_WITHDRAW,
  STOCK_OP_KIND_FUND,
  STOCK_REVIEW_TEMPLATE_DEFAULT,
  STOCK_REVIEW_TEMPLATE_MAX_CHARS,
  STOCK_TAG_ANALYSIS,
  defaultStockTradeTags,
} from '../../shared/domain/consts'
import {
  type CashChange,
  cashBefore,
  cashChain,
  withdrawLimitMessage,
} from '../../shared/domain/fund'
import { centsToYuan } from '../../shared/domain/money'
import {
  DEFAULT_STOCK_FEE_SETTING,
  type RoundFee,
  type StockFeeSetting,
} from '../../shared/domain/models'
import { formatTimestamp, todayYmd } from '../../shared/domain/time'
import { AppError } from '../../shared/errors'
import type {
  StockAccount,
  StockAccountSummary,
  StockFundRecord,
  StockFundRecordPage,
  StockOperationDto,
  StockTradeTagSetting,
  StockTradeTagSettingDto,
} from '../../shared/types/stock'
import type { Db } from '../db/driver'
import {
  STOCK_OPERATION_LIMIT,
  createFundRecord,
  createOperation,
  countFundRecords,
  listAllFundRecords,
  listOperations as listOperationRows,
  queryFundRecords,
  queryLatestFundRecord,
  sumInterestPrincipal,
  sumNetPnl,
  sumPositionCost,
  sumWithdrawn,
  updateFundRecordCashBalance,
} from '../db/dao/stock-fund'
import {
  createAccount,
  createFeeSetting,
  createReviewSetting,
  createTradeTagSetting,
  getAccount,
  getFeeSetting,
  getReviewSetting,
  getTradeTagSetting,
  updateAccountPrincipal,
  updateFeeSetting,
  updateReviewSettingTemplate,
  updateTradeTagSettingTags,
} from '../db/dao/stock-settings'
import { logError } from '../logging'

/**
 * 股票账户 / 费用设置 / 交易标签 / 复盘模板 / 本金类资金写入 / 资金记录服务。
 *
 * 逐条移植自既有实现（账户与设置段、本金类写入、资金记录分页、
 * 操作记录列表）与 `stock/write.rs` 的 `recalculate_cash_chain`。
 *
 * 四条口径不能改：
 * * **本金三类写入都在一个事务里**：改 `principal`（仅追加本金）、写资金记录、
 *   复算现金链、记一条可回滚操作，缺一不可；
 * * **现金余额是派生值**：按 (日期 → 创建时间 → ID) 的链序逐条累加
 *   （链起点 = 本金 − Σ追加本金），所以**倒填**的日期只是让那一行排到它该在的位置，
 *   金额不会被跳过；
 * * **支取上限取链末条的余额**，文案在 `fund.ts`（用户可见）；
 * * 校验文案、状态码（400 校验 / 409 冲突）与既有逐字一致。
 *
 * 与既有的唯一差别在**回读形状**：既有几个写入入口回读 `StockOverviewDto`（含持仓市值 /
 * 浮动盈亏 / 行情失败数），那几项需要行情与成交流 —— 属于持仓 / 成交切片。这里回读
 * {@link StockAccountSummary}（同一套现金公式，只少行情相关字段）。
 */

/** 把非 `AppError` 的异常折成既有的 `Database` 错误（500），并记日志。 */
function databaseFailure(message: string, error: unknown): AppError {
  if (error instanceof AppError) return error
  logError(`${message}, err: ${String(error)}`)
  return new AppError(message, { status: 500 })
}

// ---------------------------------------------------------------- 日期口径

const STRICT_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * 归一化资金变化的发生日期；空串按当天记录，非法格式报错。
 *
 * 只接受严格的 `YYYY-MM-DD`（`2026/01/05` 与 `2026-1-5` 都会被拒绝）。日期按**宿主本地时区**
 * 取当天（与既有 `chrono::Local` 一致）。
 */
export function normalizeStockRecordDate(date: string): string {
  if (date === '') return todayYmd()
  const match = STRICT_DATE_PATTERN.exec(date)
  if (!match) {
    throw new AppError('日期格式应为 YYYY-MM-DD', { status: 400 })
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new AppError('日期格式应为 YYYY-MM-DD', { status: 400 })
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * Unix 秒 → `YYYY-MM-DD`，**按宿主本地时区**（既有 `chrono::Local`）。
 *
 * 股票域的时间戳落在**本地 00:00**（界面只让用户选日期），按 UTC 取会得到"早一天"。
 * 超出 `Date` 可表示范围的极端值退回 Unix 纪元当天，避免 `NaN-NaN-NaN`。
 */
export function unixToDate(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  if (Number.isNaN(date.getTime())) return '1970-01-01'
  return formatTimestamp(timestamp, 'YYYY-MM-DD')
}

// ---------------------------------------------------------------- get-or-create

/** 事务内外通用的「取账户，不存在则建（本金 0）」。 */
function getOrCreateAccountIn(db: Db, ledgerId: string): StockAccount {
  const existing = getAccount(db, ledgerId)
  if (existing) return existing
  createAccount(db, { id: randomUUID(), ledgerId, principal: 0 })
  // 回读一次拿 DAO 填的时间戳（既有这里返回的是内存里 created_at = 0 的副本）
  const saved = getAccount(db, ledgerId)
  if (!saved) throw new AppError('创建股票账户失败', { status: 500 })
  return saved
}

/** 取账户；不存在则创建（本金为 0）。 */
export function getOrCreateAccount(db: Db, ledgerId: string): StockAccount {
  try {
    return getOrCreateAccountIn(db, ledgerId)
  } catch (error) {
    throw databaseFailure('读取股票账户失败', error)
  }
}

/** 默认费用设置（万2.354 / 5 元 / 0.05% / 0.001%）。 */
function defaultFeeSetting(ledgerId: string): Omit<StockFeeSetting, 'createdAt' | 'updatedAt'> {
  return {
    id: randomUUID(),
    ledgerId,
    commissionRate: DEFAULT_STOCK_FEE_SETTING.commissionRate,
    minCommission: DEFAULT_STOCK_FEE_SETTING.minCommission,
    stampDutyRate: DEFAULT_STOCK_FEE_SETTING.stampDutyRate,
    transferFeeRate: DEFAULT_STOCK_FEE_SETTING.transferFeeRate,
  }
}

/** 事务内外通用的「取费用设置，不存在则按默认值创建」。 */
function getOrCreateFeeSettingIn(db: Db, ledgerId: string): StockFeeSetting {
  const existing = getFeeSetting(db, ledgerId)
  if (existing) return existing
  createFeeSetting(db, defaultFeeSetting(ledgerId))
  const saved = getFeeSetting(db, ledgerId)
  if (!saved) throw new AppError('创建交易费用设置失败', { status: 500 })
  return saved
}

/** 取费用设置；不存在则按默认值创建。 */
export function getOrCreateFeeSetting(db: Db, ledgerId: string): StockFeeSetting {
  try {
    return getOrCreateFeeSettingIn(db, ledgerId)
  } catch (error) {
    throw databaseFailure('读取交易费用设置失败', error)
  }
}

/** 既有 `tags_to_json`：序列化失败时退回 `[]`（这里只有字符串数组，不会失败）。 */
function tagsToJson(tags: readonly string[]): string {
  return JSON.stringify(tags)
}

/** 事务内外通用的「取标签设置，不存在则按默认标签列表创建」。 */
function getOrCreateTradeTagSettingIn(db: Db, ledgerId: string): StockTradeTagSetting {
  const existing = getTradeTagSetting(db, ledgerId)
  if (existing) return existing
  createTradeTagSetting(db, {
    id: randomUUID(),
    ledgerId,
    tags: tagsToJson(defaultStockTradeTags()),
  })
  const saved = getTradeTagSetting(db, ledgerId)
  if (!saved) throw new AppError('创建交易标签设置失败', { status: 500 })
  return saved
}

/**
 * 返回某账本当前可用的交易标签（有序）。
 *
 * 解析异常或空列表时回退默认列表**并修复存储**（既有同一口径）。
 */
export function getTradeTags(db: Db, ledgerId: string): string[] {
  let setting: StockTradeTagSetting
  try {
    setting = getOrCreateTradeTagSettingIn(db, ledgerId)
  } catch (error) {
    throw databaseFailure('读取交易标签设置失败', error)
  }

  let parsed: unknown = null
  try {
    parsed = JSON.parse(setting.tags)
  } catch {
    // 存储里不是合法 JSON：按空列表处理，下面回退默认值并修复
    parsed = null
  }
  if (
    Array.isArray(parsed) &&
    parsed.length > 0 &&
    parsed.every((tag) => typeof tag === 'string')
  ) {
    return parsed as string[]
  }

  const defaults = defaultStockTradeTags()
  try {
    updateTradeTagSettingTags(db, ledgerId, tagsToJson(defaults))
  } catch (error) {
    throw databaseFailure('修复交易标签设置失败', error)
  }
  return defaults
}

/** 返回某账本当前可用的交易标签设置（含默认标签「分析」）。 */
export function getTradeTagsDto(db: Db, ledgerId: string): StockTradeTagSettingDto {
  return { tags: getTradeTags(db, ledgerId), defaultTag: STOCK_TAG_ANALYSIS }
}

// ---------------------------------------------------------------- 费用设置

/**
 * 四项费用参数的合法性（系统配置与本轮快照**同一套判据**）：佣金费率必须为正，
 * 最低佣金、印花税、过户费允许为 0（不收取），但不能为负。
 */
export function validateFeeSetting(setting: RoundFee): void {
  if (
    setting.commissionRate <= 0 ||
    setting.minCommission < 0 ||
    setting.stampDutyRate < 0 ||
    setting.transferFeeRate < 0
  ) {
    throw new AppError('佣金费率必须大于 0，最低佣金与费率不能为负', { status: 400 })
  }
}

/** 保存费用设置；返回落库后的那一行。 */
export function saveFeeSettings(db: Db, ledgerId: string, fee: RoundFee): StockFeeSetting {
  validateFeeSetting(fee)
  try {
    getOrCreateFeeSettingIn(db, ledgerId)
    updateFeeSetting(db, {
      ledgerId,
      commissionRate: fee.commissionRate,
      minCommission: fee.minCommission,
      stampDutyRate: fee.stampDutyRate,
      transferFeeRate: fee.transferFeeRate,
    })
    const saved = getFeeSetting(db, ledgerId)
    if (!saved) throw new AppError('保存交易费用设置失败', { status: 500 })
    return saved
  } catch (error) {
    throw databaseFailure('保存交易费用设置失败', error)
  }
}

// ---------------------------------------------------------------- 交易标签

/**
 * 保存某账本可用交易标签：去空白、去重并保留顺序；
 * 默认标签「分析」不可删除，列表至少保留一项，单个标签不超过 8 字、总数不超过 20 个。
 *
 * 校验顺序与既有一致：重复 → 单标签超长 → 总数超限。
 */
export function saveTradeTags(
  db: Db,
  ledgerId: string,
  tags: readonly string[],
): StockTradeTagSettingDto {
  if (ledgerId === '') {
    throw new AppError('ledger_id is required', { status: 400 })
  }

  const normalized: string[] = []
  const seen: string[] = []
  for (const raw of tags) {
    const tag = raw.trim()
    if (tag === '') continue
    if (seen.includes(tag)) {
      throw new AppError('标签不能重复', { status: 400 })
    }
    if (Array.from(tag).length > 8) {
      throw new AppError('单个标签不能超过 8 个字', { status: 400 })
    }
    if (normalized.length >= 20) {
      throw new AppError('标签数量不能超过 20 个', { status: 400 })
    }
    seen.push(tag)
    normalized.push(tag)
  }
  if (normalized.length === 0) {
    throw new AppError('至少保留一个标签', { status: 400 })
  }
  if (!normalized.includes(STOCK_TAG_ANALYSIS)) {
    throw new AppError('默认标签「分析」不可删除', { status: 400 })
  }

  try {
    // 确保设置行存在（不存在时按默认值创建）
    getOrCreateTradeTagSettingIn(db, ledgerId)
    updateTradeTagSettingTags(db, ledgerId, tagsToJson(normalized))
  } catch (error) {
    throw databaseFailure('保存交易标签设置失败', error)
  }
  return { tags: normalized, defaultTag: STOCK_TAG_ANALYSIS }
}

// ---------------------------------------------------------------- 复盘模板

/** 「生效的模板」的唯一判据：去空白后为空 ⇒ 内置模板。 */
function effectiveReviewTemplate(stored: string): string {
  return stored.trim() === '' ? STOCK_REVIEW_TEMPLATE_DEFAULT : stored
}

/** 取某账本**生效的**复盘模板：设过就用设的，没设过（或设成空）就用内置模板。 */
export function getReviewTemplate(db: Db, ledgerId: string): string {
  try {
    const setting = getReviewSetting(db, ledgerId)
    return effectiveReviewTemplate(setting?.template ?? '')
  } catch (error) {
    throw databaseFailure('读取复盘模板失败', error)
  }
}

/**
 * 保存复盘模板，返回**生效的那份**。
 *
 * * 全空白 = 清除自定义（回到内置模板）；其余**原样存**（含换行）；
 * * 长度上限 [`STOCK_REVIEW_TEMPLATE_MAX_CHARS`]：模板会被预填进正文，而正文有 500 字上限。
 */
export function saveReviewTemplate(db: Db, ledgerId: string, template: string): string {
  if (ledgerId === '') {
    throw new AppError('ledger_id is required', { status: 400 })
  }
  if (Array.from(template).length > STOCK_REVIEW_TEMPLATE_MAX_CHARS) {
    throw new AppError(`复盘模板不能超过 ${STOCK_REVIEW_TEMPLATE_MAX_CHARS} 字`, { status: 400 })
  }
  const stored = template.trim() === '' ? '' : template

  try {
    const existing = getReviewSetting(db, ledgerId)
    if (existing) {
      updateReviewSettingTemplate(db, ledgerId, stored)
    } else {
      createReviewSetting(db, { id: randomUUID(), ledgerId, template: stored })
    }
  } catch (error) {
    throw databaseFailure('保存复盘模板失败', error)
  }
  return effectiveReviewTemplate(stored)
}

// ---------------------------------------------------------------- 资金口径复算

/**
 * 复算某账本资金记录的现金余额（既有 `stock::write::recalculate_cash_chain`）。
 *
 * 链起点 = 本金 − Σ追加本金；链序 = (日期 → 创建时间 → ID)，由 `cashChain` 排序。
 * 只回写余额有变化的行（余额是派生值，插入时写 0）。
 */
export function recalculateCashChain(db: Db, ledgerId: string): void {
  const account = getOrCreateAccountIn(db, ledgerId)
  const records = listAllFundRecords(db, ledgerId)

  let base = account.principal
  for (const record of records) {
    if (record.eventType === STOCK_EVENT_ADD_PRINCIPAL) {
      base -= record.amountChange
    }
  }

  const entries: CashChange[] = records.map((record) => ({
    recordDate: record.recordDate,
    createdAt: record.createdAt,
    id: record.id,
    amountChange: record.amountChange,
  }))
  const balances = cashChain(base, entries)
  for (let index = 0; index < records.length; index += 1) {
    if (records[index].cashBalance !== balances[index]) {
      updateFundRecordCashBalance(db, records[index].id, balances[index])
    }
  }
}

/** 金额摘要（分 → `¥1234.56`；无千分位，负数由 `centsToYuan` 带出）。 */
function amountDetail(amount: number): string {
  return `¥${centsToYuan(amount)}`
}

/** 记一次可回滚的资金类操作（在调用方的事务里调用，与操作同生共死）。 */
function logOperation(
  db: Db,
  ledgerId: string,
  kind: string,
  action: string,
  detail: string,
  targetId: string,
): void {
  createOperation(db, {
    id: randomUUID(),
    ledgerId,
    kind,
    action,
    detail,
    targetId,
    createdAt: 0,
  })
}

// ---------------------------------------------------------------- 账户总览（现金口径）

/**
 * 账户资金口径的回读：`availableCash` 的公式与既有 `get_overview` 一致。
 *
 * 既有的 `realizedPnl` 只算已清仓轮次；现金口径的「卖出净额」含未清仓轮次里已减仓的部分，
 * 两者别互换（见 `StockAccountSummary.sellNetPnlTotal`）。
 */
export function getAccountSummary(db: Db, ledgerId: string): StockAccountSummary {
  try {
    const account = getOrCreateAccountIn(db, ledgerId)
    const sellNetPnlTotal = sumNetPnl(db, ledgerId)
    const withdrawnTotal = sumWithdrawn(db, ledgerId)
    const interestTotal = sumInterestPrincipal(db, ledgerId)
    const positionCost = sumPositionCost(db, ledgerId)
    const availableCash =
      account.principal + interestTotal + sellNetPnlTotal - withdrawnTotal - positionCost
    return {
      principal: account.principal,
      availableCash,
      withdrawnTotal,
      interestTotal,
      positionCost,
      sellNetPnlTotal,
    }
  } catch (error) {
    throw databaseFailure('读取股票账户总览失败', error)
  }
}

// ---------------------------------------------------------------- 本金类写入

/** 设置初始本金；已有资金记录时拒绝（避免现金余额链条断裂）。 */
export function setPrincipal(db: Db, ledgerId: string, amount: number): StockAccountSummary {
  if (amount <= 0) {
    throw new AppError('本金必须大于 0', { status: 400 })
  }
  try {
    // 确保账户存在
    getOrCreateAccountIn(db, ledgerId)
    if (countFundRecords(db, ledgerId) > 0) {
      throw new AppError('已有资金变化记录，请使用「追加本金」', { status: 409 })
    }
    updateAccountPrincipal(db, ledgerId, amount)
  } catch (error) {
    throw databaseFailure('设置本金失败', error)
  }
  return getAccountSummary(db, ledgerId)
}

/**
 * 追加本金并指定资金变化的发生日期；`date` 为空时按当天记录。
 *
 * 本金抬高 `amount`，同时写一条 `add_principal` 资金记录（备注写明本金前后值）。
 */
export function addPrincipalAtDate(
  db: Db,
  ledgerId: string,
  amount: number,
  date = '',
): StockAccountSummary {
  if (amount <= 0) {
    throw new AppError('追加金额必须大于 0', { status: 400 })
  }
  const recordDate = normalizeStockRecordDate(date)

  try {
    db.transaction(() => {
      const account = getOrCreateAccountIn(db, ledgerId)
      const newPrincipal = account.principal + amount
      updateAccountPrincipal(db, ledgerId, newPrincipal)

      const record: StockFundRecord = {
        id: randomUUID(),
        ledgerId,
        recordDate,
        eventType: STOCK_EVENT_ADD_PRINCIPAL,
        eventText: '追加本金',
        amountChange: amount,
        // 余额是派生值：插入后按链序复算
        cashBalance: 0,
        netPnl: null,
        remark: `本金 ${centsToYuan(account.principal)} → ${centsToYuan(newPrincipal)}`,
        createdAt: 0,
      }
      createFundRecord(db, record)
      recalculateCashChain(db, ledgerId)
      logOperation(db, ledgerId, STOCK_OP_KIND_FUND, '追加本金', amountDetail(amount), record.id)
    })
  } catch (error) {
    throw databaseFailure('追加本金失败', error)
  }
  return getAccountSummary(db, ledgerId)
}

/** 追加本金（当天）。 */
export function addPrincipal(db: Db, ledgerId: string, amount: number): StockAccountSummary {
  return addPrincipalAtDate(db, ledgerId, amount, '')
}

/**
 * 从股票账户支取并指定资金变化的发生日期；`date` 为空时按当天记录。
 *
 * 现金减少 `amount`，本金保持不变（本金始终是"累计投入"）；超过可用现金报 400。
 */
export function withdrawAtDate(
  db: Db,
  ledgerId: string,
  amount: number,
  date = '',
): StockAccountSummary {
  if (amount <= 0) {
    throw new AppError('支取金额必须大于 0', { status: 400 })
  }
  const recordDate = normalizeStockRecordDate(date)

  try {
    db.transaction(() => {
      const account = getOrCreateAccountIn(db, ledgerId)
      // 当前现金：末条资金记录余额，无记录时为本金
      const latest = queryLatestFundRecord(db, ledgerId)
      const prevCash = cashBefore(latest ? latest.cashBalance : null, account.principal)
      if (amount > prevCash) {
        throw new AppError(withdrawLimitMessage(prevCash), { status: 400 })
      }

      const record: StockFundRecord = {
        id: randomUUID(),
        ledgerId,
        recordDate,
        eventType: STOCK_EVENT_WITHDRAW,
        eventText: '支取',
        amountChange: -amount,
        // 余额是派生值：插入后按链序复算
        cashBalance: 0,
        netPnl: null,
        // 备注只说这一笔是什么：余额那一列由链算出来，写进备注的数字会随日期倒填失真
        remark: `支取 ${centsToYuan(amount)} 元`,
        createdAt: 0,
      }
      createFundRecord(db, record)
      recalculateCashChain(db, ledgerId)
      logOperation(db, ledgerId, STOCK_OP_KIND_FUND, '支取', amountDetail(amount), record.id)
    })
  } catch (error) {
    throw databaseFailure('支取失败', error)
  }
  return getAccountSummary(db, ledgerId)
}

/** 从股票账户支取（当天）。 */
export function withdraw(db: Db, ledgerId: string, amount: number): StockAccountSummary {
  return withdrawAtDate(db, ledgerId, amount, '')
}

/**
 * 利息归本并指定资金变化的发生日期；`date` 为空时按当天记录。
 *
 * 利息计入可用现金，`principal`（累计投入本金）保持不变。
 */
export function addInterestAtDate(
  db: Db,
  ledgerId: string,
  amount: number,
  date = '',
): StockAccountSummary {
  if (amount <= 0) {
    throw new AppError('利息金额必须大于 0', { status: 400 })
  }
  const recordDate = normalizeStockRecordDate(date)

  try {
    db.transaction(() => {
      const record: StockFundRecord = {
        id: randomUUID(),
        ledgerId,
        recordDate,
        eventType: STOCK_EVENT_INTEREST_PRINCIPAL,
        eventText: '利息归本',
        amountChange: amount,
        // 余额是派生值：插入后按链序复算
        cashBalance: 0,
        netPnl: null,
        remark: `利息 ${centsToYuan(amount)} 元`,
        createdAt: 0,
      }
      createFundRecord(db, record)
      // 复算里会补建账户（既有同一路径）
      recalculateCashChain(db, ledgerId)
      logOperation(db, ledgerId, STOCK_OP_KIND_FUND, '利息归本', amountDetail(amount), record.id)
    })
  } catch (error) {
    throw databaseFailure('利息归本失败', error)
  }
  return getAccountSummary(db, ledgerId)
}

/** 利息归本（当天）。 */
export function addInterest(db: Db, ledgerId: string, amount: number): StockAccountSummary {
  return addInterestAtDate(db, ledgerId, amount, '')
}

// ---------------------------------------------------------------- 读取

/**
 * 资金记录分页：`page` 从 1 起（< 1 收敛到 1）；`pageSize` < 1 → 10、> 100 → 100。
 * 列表序 `record_date DESC, created_at DESC, id DESC`。
 */
export function listFundRecords(
  db: Db,
  ledgerId: string,
  page: number,
  pageSize: number,
): StockFundRecordPage {
  const currentPage = page < 1 ? 1 : page
  const currentPageSize = pageSize < 1 ? 10 : pageSize > 100 ? 100 : pageSize
  try {
    const { records, total } = queryFundRecords(db, ledgerId, currentPage, currentPageSize)
    return { items: records, total, page: currentPage, pageSize: currentPageSize }
  } catch (error) {
    throw databaseFailure('读取资金记录失败', error)
  }
}

/** 某账本的操作记录（最新的在前，最多 [`STOCK_OPERATION_LIMIT`] 条）。 */
export function listOperations(db: Db, ledgerId: string): StockOperationDto[] {
  try {
    return listOperationRows(db, ledgerId, STOCK_OPERATION_LIMIT).map((operation) => ({
      id: operation.id,
      action: operation.action,
      detail: operation.detail,
      createdAt: operation.createdAt,
    }))
  } catch (error) {
    throw databaseFailure('读取操作记录失败', error)
  }
}
