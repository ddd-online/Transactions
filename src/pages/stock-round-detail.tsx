import { useMemo, useState, type HTMLAttributes, type JSX } from 'react'

import { Input, Select, Table } from 'antd'

import { centsToYuan, milliToYuan } from '../../shared/domain/money'
import { formatTimestamp } from '../../shared/domain/time'
import type {
  StockTradeDto,
  StockTradeHistoryDetailDto,
  StockTradeRoundDto,
} from '../../shared/types/stock-history'
import { Button } from '../components/button'
import { Icon } from '../components/icon'
import { ScrollArea } from '../components/scroll-area'
import { StockCode } from './stock-code'
import { StockDailyReviews } from './stock-daily-reviews'
import {
  stockDateTime,
  stockMoney,
  stockPercent,
  stockPnlClass,
  stockRoundFee,
  stockTradeTypeLabel,
} from './stock-format'
import { StockLedgerSection } from './stock-ledger'
import { StockNameRefresh } from './stock-name-refresh'
import { StockRoundReview } from './stock-round-review'

export interface StockRoundDetailProps {
  ledgerId: string
  detail: StockTradeHistoryDetailDto | null
  error: string
  expanded: Record<string, boolean>
  arrivedRoundId: string
  roundTags: Record<string, string>
  template: string
  tagOptions: string[]
  edits: Record<string, { price: string; lots: string }>
  onCreateLesson?: (roundId: string) => void
  onToggle: (roundId: string) => void
  onSaveReview: (roundId: string, review: string) => Promise<void>
  onTag: (roundId: string, tag: string) => void
  onEdit: (trade: StockTradeDto, field: 'price' | 'lots', value: string) => void
  onSaveTrade: (tradeId: string) => void
  onDelete: (orderId: string) => void
  /** 名称刷新回来：就地把详情头改名，不重拉 */
  onRenamed: (stockName: string) => void
}

/** 股票记录页右栏：选中股票的累计摘要与每一轮的成交 / 费用 / 标签 / 台账 / 复盘。 */
export function StockRoundDetail({
  ledgerId,
  detail,
  error,
  expanded,
  arrivedRoundId,
  roundTags,
  template,
  tagOptions,
  edits,
  onCreateLesson,
  onToggle,
  onSaveReview,
  onTag,
  onEdit,
  onSaveTrade,
  onDelete,
  onRenamed,
}: StockRoundDetailProps): JSX.Element {
  const totals = useMemo(() => {
    if (!detail) return null
    return {
      win: detail.winCount,
      loss: detail.lossCount,
      rounds: detail.roundCount,
    }
  }, [detail])

  return (
    <section className="stock-history-detail" data-testid="stock-history-detail">
      {!detail ? (
        <div className="stock-detail__empty">
          {error ? <p role="alert" className="stock-inline-error">{error}</p> : null}
        </div>
      ) : (
        <>
          <header className="stock-detail__head">
            <div className="stock-detail__identity">
              <h2>{detail.stockName}</h2>
              <StockCode
                code={detail.stockCode}
                className="stock-muted stock-mono"
                testId="stock-history-detail-code"
              />
              <StockNameRefresh
                ledgerId={ledgerId}
                stockCode={detail.stockCode}
                stockName={detail.stockName}
                testId="stock-history-name-refresh"
                onRenamed={onRenamed}
              />
            </div>
            <div className="stock-detail__summary">
              <span className={stockPnlClass(detail.totalPnl)}>
                {stockMoney(detail.totalPnl)} {stockPercent(detail.totalPnlRate)}
              </span>
              {totals ? (
                <span className="stock-muted">
                  {totals.win} 胜 {totals.loss} 负 · {totals.rounds} 轮
                </span>
              ) : null}
            </div>
          </header>

          <ScrollArea className="stock-rounds-scroll">
            <div className="stock-rounds">
            {detail.rounds.map((round) => (
              <RoundBlock
                key={round.id}
                ledgerId={ledgerId}
                round={round}
                expanded={expanded[round.id] ?? false}
                arrived={arrivedRoundId === round.id}
                review={round.review}
                template={template}
                tag={roundTags[round.id] ?? round.tag}
                options={tagOptions}
                edits={edits}
                onToggle={() => onToggle(round.id)}
                onSaveReview={(review) => onSaveReview(round.id, review)}
                onCreateLesson={onCreateLesson}
                onTag={(value) => onTag(round.id, value)}
                onEdit={onEdit}
                onSaveTrade={onSaveTrade}
                onDelete={onDelete}
              />
              ))}
            </div>
          </ScrollArea>
        </>
      )}
    </section>
  )
}

interface RoundBlockProps {
  ledgerId: string
  round: StockTradeRoundDto
  expanded: boolean
  arrived: boolean
  review: string
  template: string
  tag: string
  options: string[]
  edits: Record<string, { price: string; lots: string }>
  onToggle: () => void
  onSaveReview: (review: string) => Promise<void>
  onCreateLesson?: (roundId: string) => void
  onTag: (value: string) => void
  onEdit: (trade: StockTradeDto, field: 'price' | 'lots', value: string) => void
  onSaveTrade: (id: string) => void
  onDelete: (orderId: string) => void
}

function RoundBlock({
  ledgerId,
  round,
  expanded,
  arrived,
  review,
  template,
  tag,
  options,
  edits,
  onToggle,
  onSaveReview,
  onCreateLesson,
  onTag,
  onEdit,
  onSaveTrade,
  onDelete,
}: RoundBlockProps): JSX.Element {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingReview, setEditingReview] = useState(false)
  // 费用只统计真正成交的行（和表里显示的同一批）：费用恒为整数分，加完再格式化。
  const visibleTrades = round.trades.filter((trade) => trade.shares > 0)
  const roundFee = stockRoundFee(visibleTrades)
  return (
    <article
      className={`stock-round${arrived ? ' is-arrived' : ''}`}
      data-testid="stock-round"
      data-round-id={round.id}
    >
      <div className="stock-round__head" onClick={onToggle}>
        <button
          type="button"
          className="stock-round__toggle"
          aria-expanded={expanded}
          onClick={(event) => {
            event.stopPropagation()
            onToggle()
          }}
        >
          <Icon name="CaretRight" size={12} />
          <span>
            第 {round.roundNo} 轮 · {formatTimestamp(round.openedAt, 'YYYY-MM-DD')} →{' '}
            {formatTimestamp(round.closedAt, 'YYYY-MM-DD')}
          </span>
        </button>
        <span className="stock-muted stock-round__count">{round.tradeCount} 笔成交</span>
        <span className="stock-muted stock-round__fee" data-testid="round-fee-total">
          费用 <strong className="stock-mono">{stockMoney(roundFee)}</strong>
        </span>
        <span className={`stock-round__pnl ${stockPnlClass(round.pnl)}`}>
          {stockMoney(round.pnl)} · {stockPercent(round.pnlRate)}
        </span>
        <span className="stock-round__tag-slot" onClick={(event) => event.stopPropagation()}>
          <Select
            className="stock-round__tag"
            data-testid="round-tag"
            value={tag}
            options={options.map((item) => ({ value: item, label: item }))}
            onChange={onTag}
            popupMatchSelectWidth={false}
            size="small"
          />
        </span>
        {onCreateLesson ? (
          <Button
            variant="secondary"
            size="sm"
            testId="round-lesson-create"
            onClick={(event) => {
              event.stopPropagation()
              onCreateLesson(round.id)
            }}
          >
            记心得
          </Button>
        ) : null}
      </div>
      {expanded ? (
        <div className="stock-round__body">
          <Table
            className="tr-table stock-trade-table"
            rowKey="id"
            pagination={false}
            size="small"
            tableLayout="fixed"
            dataSource={visibleTrades}
            onRow={() => ({ 'data-testid': 'stock-trade' }) as HTMLAttributes<HTMLElement>}
            columns={[
              {
                title: '时间',
                dataIndex: 'tradeTime',
                align: 'center',
                width: 150,
                render: (value: number) => stockDateTime(value),
              },
              {
                title: '类型',
                dataIndex: 'tradeType',
                align: 'center',
                width: 80,
                render: (value: string) => stockTradeTypeLabel(value),
              },
              {
                title: '成交价',
                dataIndex: 'price',
                align: 'right',
                render: (value: number, trade) =>
                  trade.tradeType === 'close' || editingId !== trade.id ? (
                    milliToYuan(value)
                  ) : (
                    <Input
                      size="small"
                      data-testid="stock-trade-price"
                      value={edits[trade.id]?.price ?? milliToYuan(value)}
                      onChange={(event) => onEdit(trade, 'price', event.target.value)}
                    />
                  ),
              },
              {
                title: '手数',
                dataIndex: 'lots',
                align: 'center',
                width: 90,
                render: (value: number, trade) =>
                  trade.tradeType === 'close' || editingId !== trade.id ? (
                    value
                  ) : (
                    <Input
                      size="small"
                      data-testid="stock-trade-lots"
                      value={edits[trade.id]?.lots ?? String(value)}
                      onChange={(event) => onEdit(trade, 'lots', event.target.value)}
                    />
                  ),
              },
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
                title: '操作',
                key: 'actions',
                align: 'center',
                width: 150,
                render: (_, trade) => (
                  <span className="stock-row-actions">
                    {trade.tradeType !== 'close' ? (
                      editingId === trade.id ? (
                        <Button
                          variant="text"
                          size="sm"
                          testId="stock-trade-save"
                          onClick={() => {
                            onSaveTrade(trade.id)
                            setEditingId(null)
                          }}
                        >
                          保存
                        </Button>
                      ) : (
                        <Button
                          variant="text"
                          size="sm"
                          testId="stock-trade-edit"
                          onClick={() => setEditingId(trade.id)}
                        >
                          编辑
                        </Button>
                      )
                    ) : null}
                    <Button
                      variant="text-danger"
                      size="sm"
                      testId="stock-trade-delete"
                      onClick={() => onDelete(trade.orderId)}
                    >
                      删除
                    </Button>
                  </span>
                ),
              },
            ]}
          />

          <StockLedgerSection ledgerId={ledgerId} roundId={round.id} trades={round.trades} />

          <section className="stock-round__daily">
            <div className="stock-round__section-head">
              <span className="stock-section-title">每日复盘</span>
              <span className="stock-muted">{round.dayReviews.length} 条</span>
            </div>
            {/* 与持仓详情同一种读法：一天一条、一行省略，点开弹窗读全文 */}
            <StockDailyReviews
              days={round.dayReviews}
              testId="round-daily-review"
              empty={<p className="stock-muted stock-round__daily-empty">本轮没有每日复盘</p>}
            />
          </section>

          <div className="stock-round__review">
            <div className="stock-round__review-head">
              <span className="stock-section-title">本轮复盘</span>
              <Button
                variant="secondary"
                size="sm"
                testId="round-edit"
                onClick={() => setEditingReview(true)}
              >
                编辑
              </Button>
            </div>
            <StockRoundReview
              key={round.id}
              testId="round"
              review={review}
              template={template}
              emptyText="还没有写本轮复盘，点「编辑」记录买入与卖出的理由。"
              editing={editingReview}
              onEditingChange={setEditingReview}
              onSave={onSaveReview}
            />
          </div>
        </div>
      ) : null}
    </article>
  )
}
