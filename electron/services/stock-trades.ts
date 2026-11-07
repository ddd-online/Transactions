import { currentRoundTrades } from '../../shared/domain/stock'
import { tradeDto } from '../../shared/domain/trade-rules'
import { AppError } from '../../shared/errors'
import type { StockTrade } from '../../shared/domain/models'
import type { StockTradeDto } from '../../shared/types/stock-history'
import type { Db } from '../db/driver'
import { getPosition, listTrades } from '../db/dao/stock-trade'

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
    rows.filter((trade) => trade.shares > 0).map(tradeDto)

  if (position && (position.quantity > 0 || current.length > 0)) {
    return visible(current)
  }
  return visible(trades)
}
