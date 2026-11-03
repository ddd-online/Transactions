/**
 * 消费记录 DAO 的查询形状（对应既有 `DTO core.rs` 的 DTO）。
 *
 * 字段名与既有 wire 契约一致（camelCase）；模型本身在 `shared/domain/models`。
 * 金额恒为整数分，时间戳恒为 Unix 秒。
 */

import type { QueryConditionItem, TransactionRecord } from '../domain/models'

/** 排序字段（既有 `QueryConditionSortField`）；`field` 的取值走 DAO 的白名单。 */
export interface QueryConditionSortField {
  field: string
  /** `asc` 升序；其它值（含空串）一律按降序。 */
  order: string
}

/** 消费记录查询条件（既有 `TrQueryCondition`）。 */
export interface TrQueryCondition {
  ledgerId: string
  /** 默认 -1（不分页）；只有 `> 0` 才生效。 */
  offset: number
  /** 默认 -1（不分页）；只有 `> 0` 才生效。 */
  limit: number
  /** `[起, 止]` 两个 Unix 秒；长度不是 2 时忽略。 */
  tsRange: number[]
  /** 条件项之间是 OR，条件项内部是 AND；空数组 = 不加限制。 */
  items: QueryConditionItem[]
  sortFields: QueryConditionSortField[]
}

/** 按交易类型汇总的金额（分）：收入 / 支出 / 转账。 */
export interface TrStatistics {
  income: number
  expense: number
  transfer: number
}

/** `queryFiltered` 的结果：分页后的记录 + 命中总数 + 与列表同源的统计。 */
export interface TrFilterResult {
  items: TransactionRecord[]
  total: number
  statistics: TrStatistics
}

/** 单条曲线的分桶点（既有 `ChartPoint`：`%Y-%m` 或 `%Y`）。 */
export interface ChartPoint {
  time: string
  /** 合计金额（分） */
  amount: number
}

/** 新建/编辑一条消费记录的 wire 形状（既有 `TransactionRecordDto`；金额字段名仍是 `price`）。 */
export interface TransactionRecordDto {
  ledgerId: string
  transactionId: string
  /** 金额（分） */
  price: number
  transactionType: string
  category: string
  description: string
  tags: string[]
  transactionAt: number
  outlier: boolean
  keyEventDate: string
}

/** 条件查询的返回（既有 `TrQueryResult`）。 */
export interface TrQueryResult {
  items: TransactionRecordDto[]
  total: number
  page: number
  page_size: number
  total_pages: number
  trStatistics: Record<string, number>
}

/** 一条图表曲线的查询条件（既有 `ChartLineCondition`）。 */
export interface ChartLineCondition {
  label: string
  transactionType: string
  includeOutlier: boolean
  conditions: QueryConditionItem[]
}

export interface ChartQueryRequest {
  ledgerId: string
  tsRange: number[]
  /** year / month */
  granularity: string
  lines: ChartLineCondition[]
}

export interface ChartLineData {
  label: string
  type: string
  data: ChartPoint[]
}

export interface ChartQueryResponse {
  lines: ChartLineData[]
  statistics: Record<string, number>
}

/** 饼图的查询条件：范围内按分组字段求和。 */
export interface ChartPieQueryRequest {
  ledgerId: string
  tsRange: number[]
  /** `transactionType` / `category` */
  groupField: string
  /** 按分类分组时只统计这一种交易类型；其余为空串 */
  groupTransactionType: string
}

/** 饼图的一片：`key` 是原始分组值（类型码 / 分类名），`label` 是展示文案。 */
export interface ChartPieSlice {
  key: string
  label: string
  /** 该组的合计金额（分） */
  amount: number
}

export interface ChartPieResponse {
  /** 已按金额倒序、同额按标签升序 */
  slices: ChartPieSlice[]
  /** 各片金额之和（分） */
  total: number
  /**
   * 这个范围里到底有没有记录（**不受分组字段与交易类型过滤影响**）。
   *
   * 两种「没有数据」要说不同的话：一条记录都没有，和「有记录、但这一种交易类型
   * 一条都没有」是两件事，空态文案得说对是哪一件。
   */
  hasRecords: boolean
}
