/**
 * 股票账户 / 设置 / 资金记录这一段的模型与 DTO 形状。
 *
 * 对应旧版：
 * * `tr-domain/src/models/stock.rs` 的 `StockAccount` / `StockFundRecord` /
 *   `StockTradeTagSetting` / `StockReviewSetting` / `StockOperation`；
 * * `tr-domain/src/dto/stock.rs` 的 `StockFundRecordDto` / `StockFundRecordPage` /
 *   `StockTradeTagSettingDto` / `StockReviewSettingDto` / `StockOperationDto`。
 *
 * 字段名是 **wire 契约**：Rust 侧 `#[serde(rename = "…")]` 把 snake_case 序列化成 camelCase，
 * 所以这里一律 camelCase；库列名仍是 snake_case，映射在 DAO 层显式书写。
 * 金额恒为整数「分」，时间戳恒为 Unix 秒。费用设置与 `RoundFee` 是共享模型
 * （`shared/domain/models`），不在这里重复声明。
 */

/** 股票账户（每个账本一个）。表 `stock_account`。 */
export interface StockAccount {
  id: string
  ledgerId: string
  /** 本金（分，累计投入） */
  principal: number
  createdAt: number
  updatedAt: number
}

/**
 * 资金变化记录：现金余额链条的来源，当前现金 = 链末条（按链序）的余额。
 * 表 `stock_fund_record`。
 */
export interface StockFundRecord {
  id: string
  ledgerId: string
  /** 资金变化的发生日期（`YYYY-MM-DD`，本地日） */
  recordDate: string
  /** `add_principal` / `withdraw` / `interest_principal` / `buy` / `sell` */
  eventType: string
  /** 固定文案（追加本金 / 支取 / 利息归本 / 买入 / 卖出）—— 改动即影响界面 */
  eventText: string
  /** 带符号的变动额（分） */
  amountChange: number
  /** 现金余额（分，派生值：插入后按链序复算） */
  cashBalance: number
  /** 卖出净盈亏（分）；非卖出事件为 `null` */
  netPnl: number | null
  remark: string
  /** 录入时间（Unix 秒，**单调递增**：同一秒内的多条也能定序） */
  createdAt: number
}

/** 资金变化记录（对外的 wire 形状；与模型同字段）。 */
export type StockFundRecordDto = StockFundRecord

/** 资金变化记录分页结果（`page` 从 1 起）。 */
export interface StockFundRecordPage {
  items: StockFundRecordDto[]
  total: number
  page: number
  pageSize: number
}

/** 交易标签设置（每个账本一份）。表 `stock_trade_tag_setting`。 */
export interface StockTradeTagSetting {
  id: string
  ledgerId: string
  /** 可用标签的有序 JSON 数组字符串（不直接对外，走 DTO） */
  tags: string
  createdAt: number
  updatedAt: number
}

/** 交易标签设置 DTO：可用标签有序列表 + 默认标签。 */
export interface StockTradeTagSettingDto {
  tags: string[]
  /** 默认标签「分析」，始终存在且不可删除 */
  defaultTag: string
}

/** 本轮复盘模板设置（每个账本一份）。表 `stock_review_setting`。 */
export interface StockReviewSetting {
  id: string
  ledgerId: string
  /** 空串 = 没设过 ⇒ 用内置模板（服务层返回生效的那份） */
  template: string
  createdAt: number
  updatedAt: number
}

/** 本轮复盘模板 DTO：`template` 是**生效的那份**。 */
export interface StockReviewSettingDto {
  template: string
}

/** 可回滚的操作记录（每个账本最多保留最新 10 条）。表 `stock_operation`。 */
export interface StockOperation {
  id: string
  ledgerId: string
  /** `fund`（资金类）/ `order`（委托类） */
  kind: string
  /** 操作名（追加本金 / 支取 / 利息归本 / 建仓 / 加仓 / 减仓 / 清仓） */
  action: string
  /** 展示摘要（金额 / 股票与手数） */
  detail: string
  /** 撤销目标：资金类 = 资金记录 id，委托类 = `order_id` */
  targetId: string
  /** 录入时间（Unix 秒，**单调递增**） */
  createdAt: number
}

/** 一条可回滚的操作记录（列表用；`kind` 与 `targetId` 是内部字段，不对外暴露）。 */
export interface StockOperationDto {
  id: string
  action: string
  detail: string
  createdAt: number
}

/**
 * 账户资金口径的回读结果（本切片能算出来的那部分）。
 *
 * 旧版 `set_principal` / `add_principal*` / `add_withdraw*` / `add_interest*` 回读的是
 * `StockOverviewDto`；那份 DTO 里的持仓市值 / 浮动盈亏 / 行情失败数要有行情与成交流，
 * 属于持仓 / 成交切片。这里只给**现金口径**，公式与旧版一致：
 * `availableCash = principal + interestTotal + sellNetPnlTotal − withdrawnTotal − positionCost`。
 */
export interface StockAccountSummary {
  /** 本金（分） */
  principal: number
  /** 可用现金（分） */
  availableCash: number
  /** 累计支取（分） */
  withdrawnTotal: number
  /** 累计利息归本（分） */
  interestTotal: number
  /** 当前持仓成本（分；只算未清仓的持仓） */
  positionCost: number
  /**
   * Σ 卖出净盈亏（分，**含**未清仓轮次里已经减掉的部分）。
   *
   * 它只用来推可用现金，不是界面上的「已实现盈亏」（后者只算已清仓轮次）。
   */
  sellNetPnlTotal: number
}
