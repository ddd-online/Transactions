/**
 * 股票**成交编辑 / 委托删除 / 影响预演 / 回滚**这一段的请求与回读形状。
 *
 * 对应既有：
 * * 既有实现 的 `update_trade_fill` / `delete_trade_order` /
 *   `preview_trade_change` / `preview_rollback` / `rollback_latest` 的入参；
 * * `DTO stock.rs` 的 `StockTradeImpactRoundDto` / `StockTradeImpactDto` /
 *   `StockOperationRollbackPreviewDto` / `StockOperationRollbackDto`。
 *
 * 字段名是 **wire 契约**（侧 `#[序列化(rename = "…")]` 序列化成 camelCase），所以这里
 * 一律 camelCase；与既有一样，DTO 的 `Vec` → 数组、`Option<T>` → `T | null`。
 *
 * 单位口径与下单切片一致：价格恒为整数**厘**、金额恒为整数**分**、时间恒为 Unix 秒。
 */

/**
 * 编辑一笔成交（成交价 / 手数 / 委托时间）。
 *
 * 既有 `update_trade_fill(workspace, ledger_id, trade_id, price_milli, lots, trade_time)`；
 * 编辑的是**所属委托的全部成交**（费用要按委托重算再分摊），所以 `tradeId` 只是定位入口。
 */
export interface UpdateTradeFillRequest {
  ledgerId: string
  tradeId: string
  /** 成交价（厘 / 股）；必须 > 0 */
  priceMilli: number
  /** 手数；必须 > 0 */
  lots: number
  /** 委托时间（Unix 秒）；`<= 0` 表示不改时间（沿用它自己的） */
  tradeTime: number
}

/** 删除整笔委托（含全部成交明细）。既有 `delete_trade_order(workspace, ledger_id, order_id)`。 */
export interface DeleteTradeOrderRequest {
  ledgerId: string
  orderId: string
}

/**
 * 影响预演：与命令面一一对应（`update_trade` / `delete_order` 复用同一入口）。
 *
 * 既有 `preview_trade_change(workspace, ledger_id, action, trade_id, order_id, price_milli, lots,
 * trade_time)` —— 未用到的字段传 0 / 空串。`action` 保持 `string`（与既有一致，未知动作由服务层
 * 报 400「无效的预演动作」），不在类型层收窄。
 */
export interface PreviewTradeChangeRequest {
  ledgerId: string
  /** `update_trade` / `delete_order` */
  action: string
  tradeId: string
  orderId: string
  priceMilli: number
  lots: number
  tradeTime: number
}

/**
 * 编辑 / 删除后会失效的轮次（该轮的复盘随之丢失）。
 *
 * 既有 `StockTradeImpactRoundDto`；`roundId` 用于界面定位，`hasReview` / `dayReviewCount`
 * 用来在确认框里说清"会丢什么"。
 */
export interface StockTradeImpactRoundDto {
  roundId: string
  stockCode: string
  stockName: string
  /** 该股自己的轮次序号（从 1 起） */
  roundNo: number
  tag: string
  /** 这一轮写没写过轮次复盘 */
  hasReview: boolean
  /** 该轮归档的每日复盘条数（> 0 = 轮次不再成立时这些也一并丢失） */
  dayReviewCount: number
}

/**
 * 交易编辑 / 删除前的影响预演结果（既有 `StockTradeImpactDto`）。
 *
 * 预演在事务里真的执行改动并重放，最后强制回滚 —— **绝不落库**；这里只是"如果做了会怎样"。
 */
export interface StockTradeImpactDto {
  stockCode: string
  stockName: string
  /** 该股变动后的持仓股数 */
  positionAfter: number
  /** 变动后的可用现金（分） */
  cashAfter: number
  /** 会因此失效的轮次（按股票代码 → 轮次序号排序） */
  removedRounds: StockTradeImpactRoundDto[]
}

/**
 * 回滚预演（既有 `StockOperationRollbackPreviewDto`）。
 *
 * 「失效轮次」沿用编辑 / 删除那一套：回滚清仓 / 减仓会让该轮次不再成立，轮次上的复盘与标签
 * 随之丢失 —— 确认框要先把这件事说清楚。资金类操作恒为空数组。
 */
export interface StockOperationRollbackPreviewDto {
  /** 要撤销的操作名 */
  action: string
  /** 展示摘要（金额 / 股票与手数） */
  detail: string
  removedRounds: StockTradeImpactRoundDto[]
}

/** 回滚结果（既有 `StockOperationRollbackDto`）。 */
export interface StockOperationRollbackDto {
  /** 被撤销的操作名 */
  action: string
  /** 撤销目标已被别的改动删除 → 只把记录弹掉，没有实际回滚 */
  skipped: boolean
}
