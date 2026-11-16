/**
 * 股票**成交编辑 / 委托删除 / 回滚**这一段的请求与回读形状。
 *
 * 对应既有：
 * * 既有实现 的 `update_trade_fill` / `delete_trade_order` / `rollback_latest` 的入参；
 * * `DTO stock.rs` 的 `StockOperationRollbackDto`。
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

/** 回滚结果（既有 `StockOperationRollbackDto`）。 */
export interface StockOperationRollbackDto {
  /** 被撤销的操作名 */
  action: string
  /** 撤销目标已被别的改动删除 → 只把记录弹掉，没有实际回滚 */
  skipped: boolean
}
