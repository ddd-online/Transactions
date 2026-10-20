import { AppError } from '../../shared/errors'
import { currentRoundTrades } from '../../shared/domain/stock'
import type { Db } from '../db/driver'
import { getPosition, listTrades } from '../db/dao/stock-trade'
import type { StockTradeDto } from '../../shared/types/stock-history'
import type { StockTrade } from '../../shared/domain/models'

function toDto(trade: StockTrade): StockTradeDto {
  return {
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
    ...(trade.roundFee ? { roundFee: trade.roundFee } : {}),
    tradeTime: trade.tradeTime,
    remark: trade.remark,
  }
}

/** 某股票可见的成交：有未清仓轮次时只返回本轮，否则返回全部历史；0 手标记隐藏。 */
export function listStockTrades(db: Db, ledgerId: string, stockCode: string): StockTradeDto[] {
  if (!stockCode) throw new AppError('stock_code is required', { status: 400 })
  const trades = listTrades(db, ledgerId, stockCode)
  const asc = [...trades].reverse()
  const current = [...currentRoundTrades(asc)].reverse()

  let position = null
  try {
    position = getPosition(db, ledgerId, stockCode)
  } catch {
    position = null
  }

  const visible = (rows: StockTrade[]): StockTradeDto[] =>
    rows.filter((trade) => trade.shares > 0).map(toDto)

  if (position && (position.quantity > 0 || current.length > 0)) {
    return visible(current)
  }
  return visible(trades)
}
