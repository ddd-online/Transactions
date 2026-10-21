/**
 * 成交流水 / 统计模块消费的股票 DTO 形状。
 *
 * 字段名是 **wire 契约**：`DTO stock.rs` 用 `#[序列化(rename = "…")]` 把
 * snake_case 的 字段序列化成 camelCase，所以这里一律 camelCase（`orderId`、`orderSeq`、
 * `realizedPnl` …）。`id` / `price` / `lots` / `shares` / `amount` / `fee` / `commission`
 * 这类单词字段的 序列化 名与 字段同名。
 *
 * **只收这两个模块真正读的字段**，不是整份 DTO 的镜像：`StockTradeDto` 里的 `ledgerId`、
 * `stockCode`、`roundId`、`roundFee` 等字段成交流水行与统计指标都不读，故不在这里重复声明。
 * `Option<T>` → `T | null`。
 */

/**
 * 一笔股票成交（`StockTradeDto` 的最小子集）。
 *
 * 价格单位是**厘**、金额 / 费用单位是**分**；数量同时给 `lots` 与 `shares`。
 */
export interface StockTradeDto {
  id: string
  /** open / add / reduce / close */
  tradeType: string
  /** 委托号；历史数据可能为空串（为空时按成交 id 分组） */
  orderId: string
  /** 同一委托内的成交序号（组内按它升序） */
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
  /** 卖出净盈亏（分）；非卖出为 null */
  realizedPnl: number | null
  /** 成交时间（Unix 秒） */
  tradeTime: number
}

/** 编辑 / 删除交易后会失效的一轮（`StockTradeImpactRoundDto` 的最小子集）。 */
export interface StockTradeImpactRoundDto {
  /** 该股自己的轮次序号 */
  roundNo: number
  /** 这一轮写过复盘 */
  hasReview: boolean
  /** 这一轮的每日复盘条数（> 0 = 轮次不再成立时这些也一并丢失） */
  dayReviewCount: number
}

/** 交易编辑 / 删除前的影响预演结果（`StockTradeImpactDto` 的最小子集）。 */
export interface StockTradeImpactDto {
  stockName: string
  /** 该股变动后的持仓**股数** */
  positionAfter: number
  /** 会因此失效的轮次 */
  removedRounds: StockTradeImpactRoundDto[]
}

/** 一个结算统计点（`StockStatisticsPointDto` 的最小子集：只收七档指标读的字段）。 */
export interface StockStatisticsPointDto {
  /** 累计盈亏（分） */
  totalPnl: number
  /** 胜率（%） */
  winRate: number
  /** 平均盈利（分） */
  avgWin: number
  /** 平均亏损（分，正数） */
  avgLoss: number
  /** 盈亏比（平均盈利 ÷ 平均亏损）；尚无亏损样本时为 null */
  pnlRatio: number | null
  /** 期望值（分 / 笔） */
  expectancy: number
  /** 最大回撤占当时本金比例（%） */
  maxDrawdownPct: number
}
