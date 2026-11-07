/**
 * 成交口径：一笔成交与它所在轮次的**换算与呈现**规则。
 *
 * 两条写入路径共用这里：`electron/services/stock-trade-write`（下单：建仓 / 加仓 / 减仓 /
 * 清仓）与 `stock-trade-edit`（改一笔成交 / 删委托 / 重放 / 回滚）；交易历史的读层也用它
 * 取 wire 形状。它们各自只留自己独有的编排（写库顺序、事务边界），规则本身只在这里。
 *
 * ## 接口（六个导出）
 *
 * | 导出 | 管什么 |
 * |---|---|
 * | {@link costBasisOf} | 减仓时按剩余总成本的比例结转成本 |
 * | {@link tradeInstrumentOf} | 由代码判品种（决定收哪些费），未知代码兜底为深市股票 |
 * | {@link roundFeeOfSetting} | 账本费用设置 → 本轮快照（只用四项费率） |
 * | {@link settingOfRoundFee} | 本轮快照 → 费用算法要的形态（`id` / 账本留空） |
 * | {@link tradeDto} | 成交 → wire 形状（没有快照就**不输出** `roundFee`） |
 * | {@link tradeOrderRemark} | 资金记录备注：「名称 N手 @ 均价（M笔成交）」 |
 *
 * ## 为什么是纯函数
 *
 * 这些都是"给参数、拿结果"的换算：不碰数据库、不碰 Electron、不需要工作空间。于是它们能像
 * `fee` / `stock` 那样被表驱动地断言，而不必为每条规则建一个临时账本、落库、再读库。
 *
 * ## 改动纪律
 *
 * 下单与重放共用这些函数，**一致性由 import 保证**——不再靠"与另一处同口径"的注释维系。
 * 加一条成交规则 = 在这里加一个导出；不要在 writer 里另写一份"字面相同"的实现。
 * 费用怎么算（费率、最低佣金、逐笔取整）不归这里，在 `fee`。
 */

import type { StockTradeDto } from '../types/stock-history'
import { type Instrument, instrumentOf as feeInstrumentOf } from './fee'
import type { RoundFee, StockFeeSetting, StockTrade } from './models'
import { milliToYuan } from './money'
import { roundHalfAwayFromZero } from './rounding'
import { sharesOf } from './stock'

/**
 * 减仓按剩余总成本的比例结转成本（四舍五入到分），避免整除截断造成已实现盈亏偏差。
 *
 * `shares == 0`（清仓时只归档那一笔 0 手标记成交）或没有持仓时直接 0：0/0 在浮点里是 NaN，
 * `NaN as i64` 恰好是 0 —— 别把正确性建在这个巧合上。
 */
export function costBasisOf(totalCost: number, shares: number, quantity: number): number {
  if (shares <= 0 || quantity <= 0) return 0
  return roundHalfAwayFromZero((totalCost * shares) / quantity)
}

/**
 * 品种判定（决定收哪些费）：老数据里可能存着不在支持范围的代码（北交所、可转债、脏数据），
 * 这种记录按**深市股票**处理（卖出收印花税、不收过户费）—— 与引入品种之前的默认行为一致，
 * 不让一条历史记录把整轮重放 / 编辑打断。界面侧的下单校验会先挡住这类代码。
 *
 * 「按代码判品种」的唯一判据仍是费用算法里的 `instrumentOf`；这里只是它**带兜底**的那一层，
 * 所以费用算法本身继续收确定的品种、不需要处理 `null`。
 */
export function tradeInstrumentOf(stockCode: string): Instrument {
  return feeInstrumentOf(stockCode) ?? 'shenzhenStock'
}

/** 只留费用算法要的四项（既有 `RoundFee::from(&StockFeeSetting)`）。 */
export function roundFeeOfSetting(setting: StockFeeSetting): RoundFee {
  return {
    commissionRate: setting.commissionRate,
    minCommission: setting.minCommission,
    stampDutyRate: setting.stampDutyRate,
    transferFeeRate: setting.transferFeeRate,
  }
}

/** 折成费用算法要的形态（既有 `RoundFee::to_setting`；`id` / `ledgerId` 留空）。 */
export function settingOfRoundFee(round: RoundFee): StockFeeSetting {
  return {
    id: '',
    ledgerId: '',
    commissionRate: round.commissionRate,
    minCommission: round.minCommission,
    stampDutyRate: round.stampDutyRate,
    transferFeeRate: round.transferFeeRate,
    createdAt: 0,
    updatedAt: 0,
  }
}

/**
 * 成交 → wire 形状。
 *
 * 没有费用快照（`roundFee` 为 `null` = 老数据，按账本系统配置）时**不输出**这个键 ——
 * 不是 `null`、也不是 `undefined`：wire 上少一个键，升级之后历史列表的形状才不会变形。
 */
export function tradeDto(trade: StockTrade): StockTradeDto {
  const dto: StockTradeDto = {
    id: trade.id,
    ledgerId: trade.ledgerId,
    stockCode: trade.stockCode,
    stockName: trade.stockName,
    tradeType: trade.tradeType,
    roundId: trade.roundId,
    orderId: trade.orderId,
    orderSeq: trade.orderSeq,
    price: trade.price,
    lots: trade.lots,
    shares: trade.shares,
    amount: trade.amount,
    fee: trade.fee,
    commission: trade.commission,
    stampDuty: trade.stampDuty,
    transferFee: trade.transferFee,
    realizedPnl: trade.realizedPnl,
    tradeTime: trade.tradeTime,
    remark: trade.remark,
  }
  if (trade.roundFee) dto.roundFee = trade.roundFee
  return dto
}

/**
 * 资金记录备注：「名称 N手 @ 均价」，多笔成交时末尾加「（M笔成交）」。
 *
 * 均价由成交总额与股数反推回**厘**（`totalAmount / shares` 是分/股，价格口径是厘/股），
 * 单笔委托时它就是那一笔的成交价。
 */
export function tradeOrderRemark(
  stockName: string,
  totalLots: number,
  totalAmount: number,
  count: number,
): string {
  const shares = sharesOf(totalLots)
  const avgPriceMilli = shares > 0 ? roundHalfAwayFromZero((totalAmount * 10) / shares) : 0
  if (count <= 1) {
    return `${stockName} ${totalLots}手 @ ${milliToYuan(avgPriceMilli)}`
  }
  return `${stockName} ${totalLots}手 @ ${milliToYuan(avgPriceMilli)}（${count}笔成交）`
}
