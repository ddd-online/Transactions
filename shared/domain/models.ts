/** 股票域的共享模型（字段名与旧版 wire 契约一致：camelCase）。 */

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
