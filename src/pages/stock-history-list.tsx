import type { JSX } from 'react'

import { formatTimestamp } from '../../shared/domain/time'
import type { StockTradeHistoryDto } from '../../shared/types/stock-history'
import { EmptyState } from '../components/empty-state'
import { ScrollArea } from '../components/scroll-area'
import { stockMoney, stockPercent, stockPnlClass, stockPrice } from './stock-format'
import { StockMasterRow } from './stock-master-row'

export interface StockHistoryListProps {
  ledgerId: string
  rows: StockTradeHistoryDto[]
  selectedCode: string
  onSelect: (stockCode: string) => void
}

/** 股票记录页左栏：已清仓的股票列表，卡片带现价 / 累计盈亏 / 轮次。 */
export function StockHistoryList({
  ledgerId,
  rows,
  selectedCode,
  onSelect,
}: StockHistoryListProps): JSX.Element {
  return (
    <aside className="stock-master stock-history-master">
      {rows.length === 0 ? (
        <EmptyState
          testId="stock-history-empty"
          title={ledgerId ? '还没有已清仓的交易历史' : '请先创建/选择账本'}
        />
      ) : (
        <ScrollArea className="stock-master__scroll">
          <div className="stock-master__list">
            {rows.map((row) => (
              <StockMasterRow
                key={row.id}
                stockName={row.stockName}
                stockCode={row.stockCode}
                active={row.stockCode === selectedCode}
                testId="stock-history-row"
                codeTestId="stock-history-row-code"
                onSelect={() => onSelect(row.stockCode)}
              >
                <div className="stock-master__line">
                  <span className="stock-muted">
                    现价 <span className="stock-mono">{stockPrice(row.latestPrice)}</span>
                  </span>
                  <span className={stockPnlClass(row.totalPnl)}>
                    {row.totalPnl >= 0 ? '盈' : '亏'} {stockMoney(Math.abs(row.totalPnl))}
                  </span>
                </div>
                <div className="stock-master__line">
                  <span className="stock-muted">
                    {row.roundCount} 轮 · 最近 {formatTimestamp(row.lastClosedAt, 'YYYY-MM-DD')}
                  </span>
                  <span className={stockPnlClass(row.totalPnlRate)}>
                    {stockPercent(row.totalPnlRate)}
                  </span>
                </div>
              </StockMasterRow>
            ))}
          </div>
        </ScrollArea>
      )}
    </aside>
  )
}
