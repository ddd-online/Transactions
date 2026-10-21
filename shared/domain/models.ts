/** 股票域的共享模型（字段名与既有 wire 契约一致：camelCase）。 */

export interface StockFeeSetting {
  id: string
  ledgerId: string
  /** 佣金费率（万 2.354 → 0.0002354） */
  commissionRate: number
  /** 最低佣金（分 / 笔） */
  minCommission: number
  /** 印花税率（卖出收取，0.05%） */
  stampDutyRate: number
  /** 过户费率（买卖双向，仅沪市，0.001%） */
  transferFeeRate: number
  createdAt: number
  updatedAt: number
}

/** 一轮持仓的费用快照（建仓时定下，本轮内不可改；四列全空 = 老数据）。 */
export interface RoundFee {
  commissionRate: number
  minCommission: number
  stampDutyRate: number
  transferFeeRate: number
}

export const STOCK_TRADE_OPEN = 'open'
export const STOCK_TRADE_ADD = 'add'
export const STOCK_TRADE_REDUCE = 'reduce'
export const STOCK_TRADE_CLOSE = 'close'

/** 一笔股票成交。价格单位是**厘**，金额/费用单位是**分**。 */
export interface StockTrade {
  id: string
  ledgerId: string
  stockCode: string
  stockName: string
  /** open / add / reduce / close */
  tradeType: string
  roundId: string
  orderId: string
  orderSeq: number
  /** 成交价（厘 / 股） */
  price: number
  lots: number
  shares: number
  /** 成交金额（分） */
  amount: number
  fee: number
  commission: number
  stampDuty: number
  transferFee: number
  /** 卖出净盈亏（分），仅减仓 / 清仓非空 */
  realizedPnl: number | null
  tradeTime: number
  roundFee: RoundFee | null
  remark: string
  createdAt: number
}

export const DEFAULT_STOCK_FEE_SETTING: Omit<StockFeeSetting, 'id' | 'ledgerId' | 'createdAt' | 'updatedAt'> = {
  commissionRate: 0.0002354,
  minCommission: 500,
  stampDutyRate: 0.0005,
  transferFeeRate: 0.00001,
}

/** 日记日期树的一项（既有 wire 契约：date / wordCount / mood）。 */
export interface DiaryDateItem {
  date: string
  wordCount: number
  mood: string
}

// ---------------------------------------------------------------- 核心记账模型
// 内部字段用 camelCase；与既有 wire 的 snake_case/camelCase 差异由 DTO / DAO 层显式映射。

export interface Ledger {
  id: string
  name: string
  description: string
  createdAt: number
  updatedAt: number
}

export interface TransactionRecordFlags {
  outlier: boolean
}

export interface TransactionRecord {
  transactionId: string
  ledgerId: string
  /** 交易金额（分；源库列名 price） */
  amountCents: number
  transactionType: string
  category: string
  description: string
  /** 标记集 JSON */
  flags: string
  keyEventDate: string
  transactionAt: number
  createdAt: number
  updatedAt: number
}

export interface TrTag {
  ledgerId: string
  transactionId: string
  tag: string
}

export interface Category {
  ledgerId: string
  name: string
  transactionType: string
  sortOrder: number
}

export interface Tag {
  ledgerId: string
  name: string
  /** 形如 `餐饮美食:expense` */
  categoryTransactionType: string
  sortOrder: number
}

export interface TransactionTemplate {
  templateId: string
  ledgerId: string
  templateName: string
  transactionType: string
  category: string
  /** 标签集 JSON 数组字符串 */
  tags: string
  flags: string
  description: string
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export interface QueryConditionItem {
  transactionType: string
  category: string
  tags: string[]
  tagPolicy: string
  tagNot: boolean
  description: string
}

export interface ChartLine {
  label: string
  transactionType: string
  includeOutlier: boolean
  conditions: QueryConditionItem[]
}

export interface Chart {
  chartId: string
  ledgerId: string
  title: string
  /** year / month */
  granularity: string
  /** 曲线配置 JSON */
  chartLines: string
  /** line / bar */
  chartType: string
  isPreset: boolean
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export interface KeyEvent {
  id: string
  date: string
  title: string
  content: string
  color: string
  createdAt: number
  updatedAt: number
  ledgerId: string
}

export interface KeyEventImage {
  id: string
  ledgerId: string
  eventDate: string
  /** 相对 data/assets 的原图路径 */
  filePath: string
  /** 相对 data/assets 的缩略图路径 */
  thumbPath: string
  sortOrder: number
  createdAt: number
}

export interface DiaryEntry {
  id: string
  date: string
  content: string
  /** Unicode 字符数，不是字节数 */
  wordCount: number
  mood: string
  createdAt: number
  updatedAt: number
  ledgerId: string
}
