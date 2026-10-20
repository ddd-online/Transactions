/**
 * 交易历史（左栏列表 / 右栏详情 / 汇总）的 DTO 形状。
 *
 * 对应旧版 `tr-domain/src/dto/stock.rs` 的 `StockTradeHistoryDto` /
 * `StockTradeRoundDto` / `StockTradeHistoryDetailDto` / `StockTradeHistorySummaryDto`
 * 与它们内嵌的 `StockTradeDto`。
 *
 * 字段名是 **wire 契约**：Rust 侧 `#[serde(rename = "…")]` 把 snake_case 序列化成 camelCase，
 * 所以这里一律 camelCase。单位口径与旧版逐字一致：
 *
 * * 金额恒为整数**分**（`totalPnl` / `pnl` / `amount` / `fee` …）；
 * * 股票价格恒为整数**厘**（`price` / `latestPrice`，1/1000 元）；
 * * 百分比是「百分数」而不是小数（`12.5` 表示 12.5%）；
 * * `Option<T>` → `T | null`；`skip_serializing_if = "Option::is_none"` 的字段用可选属性
 *   （省略键）表示"没有这一项"。
 *
 * 这里只收这段读层真正需要的形状：`StockTradeDto` 是详情里逐笔成交的**完整** wire 形状
 * （与 `shared/domain/stock-dto.ts` 里成交流水行消费的最小子集不是同一份，故不复用）。
 */

import type { RoundFee } from '../domain/models'
import type { StockDayReviewDto } from './stock-position'

/** 一笔股票成交（详情内嵌的完整 wire 形状）。 */
export interface StockTradeDto {
  id: string
  ledgerId: string
  stockCode: string
  stockName: string
  /** open / add / reduce / close */
  tradeType: string
  /** 所属轮次；在建轮次为空串 */
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
  /** 卖出净盈亏（分）；非卖出为 `null` */
  realizedPnl: number | null
  /** 这一笔所用的本轮费用设置；省略 = 老数据，按账本系统配置 */
  roundFee?: RoundFee
  /** 成交时间（Unix 秒） */
  tradeTime: number
  remark: string
}

/** 一次完整轮次：从建仓到清仓的全部交易 + 本轮盈亏。 */
export interface StockTradeRoundDto {
  id: string
  historyId: string
  /** 该股自己的轮次序号（从 1 起） */
  roundNo: number
  /** 本轮首次建仓时间（Unix 秒） */
  openedAt: number
  /** 本轮清仓时间（Unix 秒） */
  closedAt: number
  tag: string
  review: string
  /** 本轮盈亏（分） */
  pnl: number
  /** 本轮盈亏率（%） */
  pnlRate: number
  /** 本轮成交笔数（0 手的归档标记成交不计） */
  tradeCount: number
  /** 该轮归档的每日复盘（按日期倒序，最新在前） */
  dayReviews: StockDayReviewDto[]
  trades: StockTradeDto[]
}

/** 股票交易历史集合（左栏列表项）。 */
export interface StockTradeHistoryDto {
  id: string
  ledgerId: string
  stockCode: string
  stockName: string
  /** 已完成轮次数 */
  roundCount: number
  /** 该股累计已实现盈亏（分） */
  totalPnl: number
  /** 累计盈亏率（%，相对全部建仓成本） */
  totalPnlRate: number
  /** 最近一次清仓时间（Unix 秒） */
  lastClosedAt: number
  /** 最新价（厘 / 股）；行情缺失时省略 */
  latestPrice?: number
  createdAt: number
  updatedAt: number
}

/** 单只股票的交易历史详情（右栏）。 */
export interface StockTradeHistoryDetailDto {
  id: string
  ledgerId: string
  stockCode: string
  stockName: string
  roundCount: number
  totalPnl: number
  totalPnlRate: number
  /** 盈利轮数 */
  winCount: number
  /** 亏损轮数 */
  lossCount: number
  lastClosedAt: number
  rounds: StockTradeRoundDto[]
}

/** 交易历史总览。 */
export interface StockTradeHistorySummaryDto {
  /** 已清仓股票数 */
  stockCount: number
  roundCount: number
  winCount: number
  lossCount: number
  totalPnl: number
  totalPnlRate: number
}
