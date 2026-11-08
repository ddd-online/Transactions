import type { HTMLAttributes, JSX, ReactNode } from 'react'

import { Select, Table } from 'antd'

import { centsToYuan, milliToYuan } from '../../shared/domain/money'
import type { StockPositionDto } from '../../shared/types/stock-position'
import type { StockTradeDto } from '../../shared/types/stock-history'
import { Button } from '../components/button'
import { EmptyState } from '../components/empty-state'
import { ScrollArea } from '../components/scroll-area'
import { StockCode } from './stock-code'
import { feeText, type StockFeeRates } from './stock-positions-fee'
import { StockLedgerSection } from './stock-ledger'
import { StockMasterRow } from './stock-master-row'
import { StockNameRefresh } from './stock-name-refresh'
import {
  stockDateTime,
  stockMoney,
  stockPercent,
  stockPnlClass,
  stockPrice,
  stockRoundRate,
  stockSignedMoney,
  stockTradeTypeLabel,
} from './stock-format'

export interface StockPositionsTableProps {
  ledgerId: string
  positions: StockPositionDto[]
  /** 当前选中的那一只；undefined = 没有持仓 */
  selected: StockPositionDto | undefined
  tags: string[]
  /** 账本默认费率：本轮没单独设费率时，详情里那一行沿用账本 */
  fee: StockFeeRates | null
  trades: StockTradeDto[]
  /** 成交表下面那一行「费用合计」，页面已经按整数分加好 */
  tradesFeeTotal: number
  error: string
  /** 复盘入口那两段（写今日 / 本轮复盘）：状态在页面，表格只负责把它摆回详情里的位置 */
  review: ReactNode
  onSelect: (stockCode: string) => void
  /** 建仓（不带 position）与加仓 / 减仓 / 清仓（带当前持仓）共用一个入口 */
  onOpenTrade: (type: string, position?: StockPositionDto) => void
  onTagChange: (tag: string) => void
  onRenamed: (stockName: string) => void
  onEditTrade: (trade: StockTradeDto) => void
  onDeleteOrder: (orderId: string) => void
}

function marketValueOf(position: StockPositionDto): number {
  if (position.latestPrice === undefined) return position.totalCost
  return Math.round((position.latestPrice * position.quantity) / 10)
}

function pnlOf(position: StockPositionDto): number {
  return marketValueOf(position) + position.roundCashFlow
}

/** 持仓页的两栏：左栏持仓列表，右栏详情与成交记录（复盘那一段由调用方塞进来）。 */
export function StockPositionsTable({
  ledgerId,
  positions,
  selected,
  tags,
  fee,
  trades,
  tradesFeeTotal,
  error,
  review,
  onSelect,
  onOpenTrade,
  onTagChange,
  onRenamed,
  onEditTrade,
  onDeleteOrder,
}: StockPositionsTableProps): JSX.Element {
  const marketValue = selected ? marketValueOf(selected) : 0
  const pnl = selected ? pnlOf(selected) : 0
  const pnlRate = selected && selected.totalCost > 0 ? (pnl / selected.totalCost) * 100 : 0
  const quote = selected ? stockRoundRate(selected.latestPrice, selected.prevClose) : null

  return (
    <>
      <aside className="stock-master">
        {positions.length === 0 ? (
          <EmptyState
            testId="stock-position-empty"
            title={ledgerId ? '当前没有持仓' : '请先创建/选择账本'}
          />
        ) : (
          <ScrollArea className="stock-master__scroll">
            <div className="stock-master__list">
              {positions.map((position) => {
                const rowPnl = pnlOf(position)
                return (
                  <StockMasterRow
                    key={position.id}
                    stockName={position.stockName}
                    stockCode={position.stockCode}
                    active={position.stockCode === selected?.stockCode}
                    testId="stock-position-row"
                    codeTestId="stock-position-row-code"
                    onSelect={() => onSelect(position.stockCode)}
                  >
                    <div className="stock-master__stats">
                      <span className="stock-label">现价</span>
                      <span className="stock-label stock-master__stat-label--end">浮动盈亏</span>
                      <span className="stock-master__stat-value">
                        <span className="stock-mono">{stockPrice(position.latestPrice)}</span>
                        {position.latestPrice !== undefined && position.prevClose !== undefined ? (
                          <span className={stockPnlClass(position.latestPrice - position.prevClose)}>
                            {stockRoundRate(position.latestPrice, position.prevClose).percent}
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={`stock-master__stat-value stock-master__stat-value--end ${stockPnlClass(rowPnl)}`}
                      >
                        <span className="stock-mono">{stockMoney(rowPnl)}</span>
                      </span>
                    </div>
                    <div className="stock-master__meta">
                      <span className="stock-muted">
                        {Number((position.quantity / 100).toFixed(2))} 手
                      </span>
                      <span className={stockPnlClass(rowPnl)}>
                        {stockPercent((rowPnl / position.totalCost) * 100)}
                      </span>
                    </div>
                  </StockMasterRow>
                )
              })}
            </div>
          </ScrollArea>
        )}
        <div className="stock-master__footer">
          <Button
            variant="primary"
            block
            testId="stock-position-create"
            onClick={() => onOpenTrade('open')}
          >
            建仓
          </Button>
        </div>
      </aside>

      <section className="stock-detail">
        {!selected ? (
          <div className="stock-detail__empty">
            {error ? (
              <p role="alert" className="stock-inline-error">
                {error}
              </p>
            ) : null}
          </div>
        ) : (
          <>
            <ScrollArea className="stock-detail__info">
              <header className="stock-detail__head">
                <div className="stock-detail__identity">
                  <h2>{selected.stockName}</h2>
                  <StockCode
                    code={selected.stockCode}
                    className="stock-muted stock-mono"
                    testId="stock-position-detail-code"
                  />
                  <StockNameRefresh
                    ledgerId={ledgerId}
                    stockCode={selected.stockCode}
                    stockName={selected.stockName}
                    testId="stock-position-name-refresh"
                    onRenamed={onRenamed}
                  />
                </div>
                <div className="stock-detail__actions">
                  <Select
                    className="stock-tag-select"
                    data-testid="position-tag-select"
                    value={selected.tag}
                    options={tags.map((tag) => ({ value: tag, label: tag }))}
                    onChange={(value) => onTagChange(value)}
                    popupMatchSelectWidth={false}
                    size="small"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    testId="stock-position-close"
                    onClick={() => onOpenTrade('close', selected)}
                  >
                    清仓
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    testId="stock-position-reduce"
                    onClick={() => onOpenTrade('reduce', selected)}
                  >
                    减仓
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    testId="stock-position-add"
                    onClick={() => onOpenTrade('add', selected)}
                  >
                    加仓
                  </Button>
                </div>
              </header>

              <div className="stock-detail__metrics">
                <div>
                  <span className="stock-label">现价</span>
                  <strong className="stock-mono">{stockPrice(selected.latestPrice)}</strong>
                </div>
                <div>
                  <span className="stock-label">当日涨跌</span>
                  <strong className={quote?.up ? 'is-up' : 'is-down'}>
                    {quote ? `${quote.change} ${quote.percent}` : '—'}
                  </strong>
                </div>
                <div>
                  <span className="stock-label">持仓市值</span>
                  <strong className="stock-mono">{stockMoney(marketValue)}</strong>
                </div>
                <div>
                  <span className="stock-label">浮动盈亏</span>
                  <strong className={stockPnlClass(pnl)}>
                    {stockMoney(pnl)} {stockPercent(pnlRate)}
                  </strong>
                </div>
              </div>

              <p className="stock-fee-line">
                本轮费率 <span>{feeText(selected, fee)}</span>
              </p>

              <StockLedgerSection
                ledgerId={ledgerId}
                stockCode={selected.stockCode}
                trades={trades}
              />

              {review}
            </ScrollArea>

            <section className="stock-detail__section">
                <span className="stock-section-title">成交记录</span>
                {trades.length > 0 ? (
                  <span className="stock-trade-total" data-testid="stock-trade-fee-total">
                    费用合计 <strong className="stock-mono">{stockMoney(tradesFeeTotal)}</strong>
                  </span>
                ) : null}
              </section>
              <div className="stock-detail__trades">
                {/* 窄窗里 8 列放不下：让成交记录自己横向滚，数字不换行 */}
                <ScrollArea className="stock-detail__trades-scroll" axis="both">
                  <Table
                    className="tr-table stock-trade-table"
                    sticky={{
                      // 表头贴在成交记录自己的滚动区顶边；详情只有一个这样的滚动区
                      getContainer: () =>
                        (document.querySelector(
                          '.stock-detail__trades-scroll [data-overlayscrollbars-viewport]',
                        ) as HTMLElement | null) ?? window,
                    }}
                    rowKey="id"
                    pagination={false}
                    size="small"
                    dataSource={trades}
                    onRow={() => ({ 'data-testid': 'stock-trade' }) as HTMLAttributes<HTMLElement>}
                    columns={[
                      {
                        title: '时间',
                        dataIndex: 'tradeTime',
                        align: 'center',
                        render: (value: number) => stockDateTime(value),
                        width: 140,
                      },
                      {
                        title: '类型',
                        dataIndex: 'tradeType',
                        align: 'center',
                        width: 64,
                        render: (value: string) => (
                          <span className={`stock-trade-type is-${value}`}>
                            {stockTradeTypeLabel(value)}
                          </span>
                        ),
                      },
                      {
                        title: '成交价',
                        dataIndex: 'price',
                        align: 'right',
                        render: (value: number) => milliToYuan(value),
                      },
                      { title: '手数', dataIndex: 'lots', align: 'center', width: 56 },
                      {
                        title: '成交金额',
                        dataIndex: 'amount',
                        align: 'right',
                        render: (value: number) => centsToYuan(value),
                      },
                      {
                        title: '费用',
                        dataIndex: 'fee',
                        align: 'right',
                        render: (value: number) => (
                          <span data-testid="stock-trade-fee">{stockMoney(value)}</span>
                        ),
                      },
                      {
                        title: '资金变动',
                        key: 'cash',
                        align: 'right',
                        render: (_, row) => {
                          const cash =
                            row.tradeType === 'reduce' || row.tradeType === 'close'
                              ? row.amount - row.fee
                              : -(row.amount + row.fee)
                          return (
                            <span className={stockPnlClass(cash)}>{stockSignedMoney(cash)}</span>
                          )
                        },
                      },
                      {
                        title: '操作',
                        key: 'actions',
                        align: 'center',
                        width: 96,
                        render: (_, row) => (
                          <span className="stock-row-actions">
                            <Button
                              variant="text"
                              size="sm"
                              testId="stock-trade-edit"
                              onClick={() => onEditTrade(row)}
                            >
                              编辑
                            </Button>
                            <Button
                              variant="text-danger"
                              size="sm"
                              testId="stock-trade-delete"
                              onClick={() => onDeleteOrder(row.orderId)}
                            >
                              删除
                            </Button>
                          </span>
                        ),
                      },
                    ]}
                  />
                </ScrollArea>
              </div>
          </>
        )}
      </section>
    </>
  )
}
