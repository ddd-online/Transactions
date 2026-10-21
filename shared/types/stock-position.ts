/**
 * 持仓 / 账户总览 / 行情这一段的 DTO 形状。
 *
 * 对应兼容 `tr-domain/src/dto/stock.rs` 的 `StockOverviewDto`、`StockPositionDto`、
 * `StockQuoteDto`、`StockNameDto` 与 `StockDayReviewDto`。字段名是 **wire 契约**：
 * Rust 侧 `#[serde(rename = "…")]` 把 snake_case 序列化成 camelCase，所以这里一律 camelCase。
 *
 * 单位口径（与兼容逐字一致，别在界面层再换算一次）：
 * * 金额恒为整数**分**（`totalCost` / `roundCashFlow` / `realizedPnl` / 总览的全部金额字段）；
 * * 股票价格恒为整数**厘**（`latestPrice` / `prevClose`，1/1000 元）；
 * * 百分比是「百分数」而不是小数（`12.5` 表示 12.5%）。
 *
 * `Option<T>` → `T | null`；但 `roundFee` / `latestPrice` / `prevClose` / `quoteTime`
 * 在兼容是 `skip_serializing_if = "Option::is_none"`，**省略**而不是 `null`，
 * 所以这里用可选字段（`undefined`）表示"没有这一个键"。
 */

import type { RoundFee } from '../domain/models'

/** 一天的一篇每日复盘；`date` 是本地日 `YYYY-MM-DD`。 */
export interface StockDayReviewDto {
  date: string
  review: string
}

/** 外部行情（价格单位：**厘**，每股；时间为 Unix 秒）。 */
export interface StockQuoteDto {
  stockCode: string
  /** 最新价（**厘**，每股） */
  latestPrice: number
  /** 昨收价（**厘**，每股） */
  prevClose: number
  /** 行情时间（Unix 秒） */
  quoteTime: number
}

/** 股票名称查询结果。 */
export interface StockNameDto {
  stockCode: string
  stockName: string
}

/** 股票账户总览。 */
export interface StockOverviewDto {
  /** 本金（分） */
  principal: number
  /** 可用现金（分） */
  availableCash: number
  /** 持仓市值 = Σ（最新价 × 股数）；行情缺失部分按持仓成本计入 */
  positionMarketValue: number
  /** 累计支取（分） */
  withdrawnTotal: number
  /** 累计利息归本（分） */
  interestTotal: number
  /** 总资产 = 可用现金 + 持仓市值 */
  totalAssets: number
  /** 已实现盈亏（**已清仓轮次**的盈亏合计，分） */
  realizedPnl: number
  /** 浮动盈亏（分）= Σ（持仓市值 + 本轮资金变动） */
  unrealizedPnl: number
  /** 本次行情获取失败的持仓数量 */
  quoteFailedCount: number
  /** 总盈亏（已实现 + 浮动）占本金百分比（%） */
  totalPnlPercent: number
  /** 仓位（%）；资金分母 ≤ 0（没有可算比例的资金）时为 `null`，界面显示 `—` */
  positionRatio: number | null
}

/** 股票持仓（持仓列表的一项，已合并行情）。 */
export interface StockPositionDto {
  id: string
  ledgerId: string
  stockCode: string
  stockName: string
  /** 持仓数量（股） */
  quantity: number
  /** 持仓总成本（分，含买入手续费） */
  totalCost: number
  /** 本轮（最近一次清仓之后）资金变动合计（分）：买入为负、卖出为正 */
  roundCashFlow: number
  /** 该股累计已实现盈亏（分） */
  realizedPnl: number
  /** 本轮复盘 */
  review: string
  /** 本轮交易标签的**生效值**（库里空串按默认「分析」给出） */
  tag: string
  /** 本轮建仓日（本地 `YYYY-MM-DD`；空串 = 没有进行中的轮次） */
  roundOpenedDate: string
  /** 当前轮已写的每日复盘（按日期倒序，最新在前） */
  dayReviews: StockDayReviewDto[]
  /** **本轮**的费用设置；省略 = 沿用账本系统配置（老数据 / 空仓） */
  roundFee?: RoundFee
  /** 最新价（**厘**，每股）；行情获取失败时省略 */
  latestPrice?: number
  /** 昨收价（**厘**，每股） */
  prevClose?: number
  /** 行情时间（Unix 秒） */
  quoteTime?: number
}
