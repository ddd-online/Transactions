/**
 * 股票**下单**（委托创建）这一段的请求 / 成交明细 / 回读形状。
 *
 * 对应既有：
 * * 既有实现 的 `TradeFill`（委托内的一笔成交，价格单位是**厘**）；
 * * 既有实现 的 `create_trade_order_with_round_fee` /
 *   `create_trade_with_round_fee` 的入参（账本、股票、交易类型、成交明细、委托时间、备注、标签、
 *   本轮费用设置）；
 * * `DTO stock.rs` 的 `StockTradeDto`（创建成功后逐笔回读）。
 *
 * 单位口径（硬契约，与既有逐字一致）：
 * * 价格恒为整数**厘**（1/1000 元）—— `priceMilli`；场内基金的 0.001 元报价靠它；
 * * 金额 / 费用恒为整数**分**；
 * * 时间戳恒为 Unix 秒；`tradeTime <= 0` 时由服务层取当前时间。
 *
 * 这里**不做**"元 → 厘"的换算：既有那条换算在 IPC 命令面（`price_yuan_to_milli`，wire 上的
 * `price` 是元）。本切片是服务层，收的就是厘；把 wire 形状与落库形状混在一起会让两处单位
 * 各说一句话。
 */

import type { RoundFee } from '../domain/models'

/**
 * `StockTradeDto` 与交易历史详情里内嵌的那一份是**同一个 wire 契约**（字段、单位、
 * `roundFee` 的省略语义都相同），这里复用而不是另立一份：两份 DTO 一旦各自演化，
 * "下单返回什么、详情返回什么"就会对不上。
 */
export type { StockTradeDto } from './stock-history'

/** 委托内的一笔成交（既有 `TradeFill`）：价格单位是**厘**（每股），手数是整数手。 */
export interface StockTradeFill {
  /** 成交价（厘 / 股） */
  priceMilli: number
  /** 手数（1 手 = 100 股） */
  lots: number
}

/**
 * 记录一笔委托（不指定本轮费用设置：建仓时取账本的系统配置）。
 *
 * 既有 `create_trade_order` 的同名入参；一次委托可含多笔成交明细（`fills`）。
 */
export interface CreateTradeOrderRequest {
  ledgerId: string
  /** 六位代码（决定品种 → 收哪些费） */
  stockCode: string
  stockName: string
  /** open / add / reduce / close */
  tradeType: string
  /** 成交明细；清仓在持仓已为 0 手时可以为空（"只归档"那条路） */
  fills: readonly StockTradeFill[]
  /** 委托时间（Unix 秒）；`<= 0` 时取当前时间 */
  tradeTime: number
  /** 委托备注（逐笔写进每一笔成交行） */
  remark: string
  /** 本轮交易标签（空串 = 不动既有值；非空必须是本账本可用标签之一） */
  tag: string
}

/**
 * 记录一笔委托，并在**建仓**时指定本轮的费用设置（既有 `create_trade_order_with_round_fee`）。
 *
 * `roundFee` 只在建仓（本轮第一笔买入）被接受；本轮已开始的加仓 / 减仓 / 清仓再带就是
 * 调用方的错（服务层报 400）。
 */
export interface CreateTradeOrderWithRoundFeeRequest extends CreateTradeOrderRequest {
  /** 本轮费用快照；缺省 = 用账本系统配置（建仓时） */
  roundFee?: RoundFee
}

/**
 * 记录单笔成交（等价于只含一笔明细的委托）—— 既有 `create_trade`。
 *
 * 字段与 {@link CreateTradeOrderRequest} 一一对应，只是明细摊平成 `priceMilli` / `lots`。
 */
export interface CreateTradeRequest {
  ledgerId: string
  stockCode: string
  stockName: string
  tradeType: string
  /** 成交价（厘 / 股） */
  priceMilli: number
  /** 手数 */
  lots: number
  tradeTime: number
  remark: string
  tag: string
}

/** 记录单笔成交并指定本轮费用设置（既有 `create_trade_with_round_fee`）。 */
export interface CreateTradeWithRoundFeeRequest extends CreateTradeRequest {
  roundFee?: RoundFee
}
