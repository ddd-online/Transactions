/** 股票交易台账：持仓时记录计划，清仓后随轮次归档。 */
export interface StockLedgerDto {
  /** 是否已经保存过台账 */
  exists: boolean
  roundId: string | null
  /** 已清仓：卖出字段可用 */
  closed: boolean
  whyBuy: string
  stopLoss: string
  takeProfit: string
  followedSystem: string
  summary: string
  /** 以下数字全部由本轮成交自动计算，界面只读 */
  buyPrice: string
  buyCost: string
  sellPrice: string
  sellNet: string
  netPnl: string
}
