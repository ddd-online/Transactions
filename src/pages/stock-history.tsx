import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'

import { Input, Select, Table } from 'antd'
import type { HTMLAttributes } from 'react'

import { centsToYuan, milliToYuan } from '../../shared/domain/money'
import { formatTimestamp } from '../../shared/domain/time'
import type {
  StockTradeDto,
  StockTradeHistoryDetailDto,
  StockTradeHistoryDto,
  StockTradeHistorySummaryDto,
  StockTradeRoundDto,
} from '../../shared/types/stock-history'
import type { StockTradeTagSettingDto } from '../../shared/types/stock'
import { Button } from '../components/button'
import { ConfirmDialog } from '../components/confirm-dialog'
import { EmptyState } from '../components/empty-state'
import { Icon } from '../components/icon'
import { notify } from '../components/toast'
import {
  stockDateTime,
  stockErrorMessage,
  stockPercent,
  stockPnlClass,
  stockPrice,
  stockTradeTypeLabel,
} from './stock-format'

export interface StockHistoryPanelProps {
  ledgerId: string
  onSummaryChange?: (summary: StockTradeHistorySummaryDto | null) => void
}

function money(cents: number): string {
  return `¥${centsToYuan(cents)}`
}

export function StockHistoryPanel({
  ledgerId,
  onSummaryChange,
}: StockHistoryPanelProps): JSX.Element {
  const [rows, setRows] = useState<StockTradeHistoryDto[]>([])
  const [selectedCode, setSelectedCode] = useState('')
  const [detail, setDetail] = useState<StockTradeHistoryDetailDto | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [roundTags, setRoundTags] = useState<Record<string, string>>({})
  const [tagOptions, setTagOptions] = useState<string[]>([])
  const [edits, setEdits] = useState<Record<string, { price: string; lots: string }>>({})
  const [confirmOrder, setConfirmOrder] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async (): Promise<void> => {
    if (!ledgerId) {
      setRows([])
      onSummaryChange?.(null)
      setDetail(null)
      return
    }
    try {
      const [list, total] = await Promise.all([
        window.api.invoke('stock_history', { ledger_id: ledgerId }),
        window.api.invoke('stock_history_summary', { ledger_id: ledgerId }),
      ])
      setRows(list)
      onSummaryChange?.(total)
      setError('')
    } catch (loadError) {
      setError(stockErrorMessage(loadError))
    }
  }, [ledgerId, onSummaryChange])

  useEffect(() => {
    void load()
  }, [load])

  const openDetail = useCallback(
    async (code: string): Promise<void> => {
      if (!code) return
      setError('')
      setSelectedCode(code)
      try {
        const next = await window.api.invoke('stock_history_detail', {
          ledger_id: ledgerId,
          stock_code: code,
        })
        setDetail(next)
        setRoundTags(Object.fromEntries(next.rounds.map((round) => [round.id, round.tag])))
        // 选中股票时展开最新一轮（轮次最大），历史从最近一笔开始读。
        const latestRoundNo = next.rounds.reduce(
          (latest, round) => Math.max(latest, round.roundNo),
          -Infinity,
        )
        setExpanded(
          Object.fromEntries(
            next.rounds.map((round) => [round.id, round.roundNo === latestRoundNo]),
          ),
        )
        setEdits(
          Object.fromEntries(
            next.rounds
              .flatMap((round) => round.trades)
              .map((trade) => [trade.id, { price: milliToYuan(trade.price), lots: String(trade.lots) }]),
          ),
        )
        const settings: StockTradeTagSettingDto = await window.api.invoke('stock_tag_settings_get', {
          ledger_id: ledgerId,
        })
        setTagOptions(settings.tags)
      } catch (detailError) {
        setError(stockErrorMessage(detailError))
      }
    },
    [ledgerId],
  )

  useEffect(() => {
    if (!selectedCode && rows.length > 0) {
      void openDetail(rows[0].stockCode)
    }
  }, [openDetail, rows, selectedCode])

  const saveRoundReview = useCallback(
    async (roundId: string, review: string): Promise<void> => {
      if (!detail) return
      try {
        const next = await window.api.invoke('stock_round_review', {
          ledger_id: ledgerId,
          round_id: roundId,
          review,
        })
        setDetail(next)
        notify('复盘已保存')
      } catch (reviewError) {
        notify(stockErrorMessage(reviewError), 'error')
      }
    },
    [detail, ledgerId],
  )

  const saveRoundTag = useCallback(
    async (roundId: string, tag: string): Promise<void> => {
      if (!detail) return
      try {
        const next = await window.api.invoke('stock_round_tag', {
          ledger_id: ledgerId,
          round_id: roundId,
          tag,
        })
        setDetail(next)
        setRoundTags(Object.fromEntries(next.rounds.map((round) => [round.id, round.tag])))
      } catch (tagError) {
        notify(stockErrorMessage(tagError), 'error')
      }
    },
    [detail, ledgerId],
  )

  const saveTrade = useCallback(
    async (tradeId: string): Promise<void> => {
      if (!detail) return
      const edit = edits[tradeId]
      if (!edit) return
      const trade = detail.rounds.flatMap((round) => round.trades).find((item) => item.id === tradeId)
      try {
        await window.api.invoke('stock_trade_update', {
          ledger_id: ledgerId,
          id: tradeId,
          price: Number(edit.price),
          lots: Number(edit.lots),
          trade_time: trade?.tradeTime || Math.floor(Date.now() / 1000),
        })
        await openDetail(detail.stockCode)
        notify('成交已更新')
      } catch (tradeError) {
        notify(stockErrorMessage(tradeError), 'error')
      }
    },
    [detail, edits, ledgerId, openDetail],
  )

  const deleteOrder = useCallback(async (): Promise<void> => {
    if (!confirmOrder || !detail) return
    try {
      await window.api.invoke('stock_trade_order_delete', {
        ledger_id: ledgerId,
        order_id: confirmOrder,
      })
      setConfirmOrder(null)
      await openDetail(detail.stockCode)
    } catch (deleteError) {
      notify(stockErrorMessage(deleteError), 'error')
    }
  }, [confirmOrder, detail, ledgerId, openDetail])

  const totals = useMemo(() => {
    if (!detail) return null
    return {
      win: detail.winCount,
      loss: detail.lossCount,
      rounds: detail.roundCount,
    }
  }, [detail])

  return (
    <div className="stock-history-view">
      <div className="stock-history-main">
        <aside className="stock-master stock-history-master">
          {rows.length === 0 ? (
            <EmptyState
              testId="stock-history-empty"
              title={ledgerId ? '还没有已清仓的交易历史' : '请先创建/选择账本'}
            />
          ) : (
            <div className="stock-master__list">
              {rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className={`stock-master__row${row.stockCode === selectedCode ? ' is-active' : ''}`}
                  data-testid="stock-history-row"
                  onClick={() => void openDetail(row.stockCode)}
                >
                  <div className="stock-master__headline">
                    <strong>{row.stockName}</strong>
                    <span className="stock-muted stock-mono">{row.stockCode}</span>
                  </div>
                  <div className="stock-master__line">
                    <span className="stock-muted">
                      现价 <span className="stock-mono">{stockPrice(row.latestPrice)}</span>
                    </span>
                    <span className={stockPnlClass(row.totalPnl)}>
                      {row.totalPnl >= 0 ? '盈' : '亏'} {money(Math.abs(row.totalPnl))}
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
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="stock-history-detail" data-testid="stock-history-detail">
          {!detail ? (
            <div className="stock-detail__empty">
              {error ? <p className="stock-inline-error">{error}</p> : null}
            </div>
          ) : (
            <>
              <header className="stock-detail__head">
                <div className="stock-detail__identity">
                  <h2>{detail.stockName}</h2>
                  <span className="stock-muted stock-mono">{detail.stockCode}</span>
                  <span className={stockPnlClass(detail.totalPnl)}>
                    {money(detail.totalPnl)} {stockPercent(detail.totalPnlRate)}
                  </span>
                  <span className="stock-muted">
                    {totals ? `${totals.win} 胜 ${totals.loss} 负 · ${totals.rounds} 轮` : ''}
                  </span>
                </div>
              </header>

              <div className="stock-rounds">
                {detail.rounds.map((round) => (
                  <RoundBlock
                    key={round.id}
                    round={round}
                    expanded={expanded[round.id] ?? false}
                    review={round.review}
                    tag={roundTags[round.id] ?? round.tag}
                    options={tagOptions}
                    edits={edits}
                    onToggle={() =>
                      setExpanded((current) => ({ ...current, [round.id]: !current[round.id] }))
                    }
                    onSaveReview={(review) => void saveRoundReview(round.id, review)}
                    onTag={(value) => void saveRoundTag(round.id, value)}
                    onEdit={(trade, field, value) =>
                      setEdits((current) => ({
                        ...current,
                        [trade.id]: {
                          price:
                            field === 'price'
                              ? value
                              : current[trade.id]?.price ?? milliToYuan(trade.price),
                          lots:
                            field === 'lots'
                              ? value
                              : current[trade.id]?.lots ?? String(trade.lots),
                        },
                      }))
                    }
                    onSaveTrade={(tradeId) => void saveTrade(tradeId)}
                    onDelete={(orderId) => setConfirmOrder(orderId)}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={confirmOrder !== null}
        title="删除整笔委托"
        message="删除后持仓与资金会按重放结果回滚，确定继续？"
        confirmText="删除"
        danger
        onCancel={() => setConfirmOrder(null)}
        onConfirm={() => void deleteOrder()}
      />
    </div>
  )
}

interface RoundBlockProps {
  round: StockTradeRoundDto
  expanded: boolean
  review: string
  tag: string
  options: string[]
  edits: Record<string, { price: string; lots: string }>
  onToggle: () => void
  onSaveReview: (review: string) => void
  onTag: (value: string) => void
  onEdit: (trade: StockTradeDto, field: 'price' | 'lots', value: string) => void
  onSaveTrade: (id: string) => void
  onDelete: (orderId: string) => void
}

function RoundBlock({
  round,
  expanded,
  review,
  tag,
  options,
  edits,
  onToggle,
  onSaveReview,
  onTag,
  onEdit,
  onSaveTrade,
  onDelete,
}: RoundBlockProps): JSX.Element {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingReview, setEditingReview] = useState(false)
  const [reviewDraft, setReviewDraft] = useState(review)
  return (
    <article className="stock-round" data-testid="stock-round">
      <button type="button" className="stock-round__head" onClick={onToggle}>
        <Icon name={expanded ? 'Down' : 'CaretRight'} size={12} />
        <span>
          第 {round.roundNo} 轮 · {formatTimestamp(round.openedAt, 'YYYY-MM-DD')} →{' '}
          {formatTimestamp(round.closedAt, 'YYYY-MM-DD')}
        </span>
        <span className={stockPnlClass(round.pnl)}>
          {money(round.pnl)} · {stockPercent(round.pnlRate)}
        </span>
      </button>
      {expanded ? (
        <div className="stock-round__body">
          <div className="stock-round__meta">
            <Select
              data-testid="round-tag"
              value={tag}
              options={options.map((item) => ({ value: item, label: item }))}
              onChange={onTag}
              popupMatchSelectWidth={false}
              size="small"
            />
            <span className="stock-muted">{round.tradeCount} 笔成交</span>
          </div>

          <Table
            className="tr-table stock-trade-table"
            rowKey="id"
            pagination={false}
            size="small"
            dataSource={round.trades.filter((trade) => trade.shares > 0)}
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
                render: (value: number) => money(value),
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

          <div className="stock-round__review">
            <div className="stock-round__review-head">
              <span className="stock-section-title">本轮复盘</span>
              <Button
                variant="secondary"
                size="sm"
                testId="round-review-open"
                onClick={() => {
                  if (editingReview) {
                    setEditingReview(false)
                    return
                  }
                  setReviewDraft(review)
                  setEditingReview(true)
                }}
              >
                编辑
              </Button>
            </div>
            {editingReview ? (
              <div className="stock-review-box">
                <Input.TextArea
                  data-testid="round-review"
                  rows={6}
                  placeholder="买入理由 / 卖出理由 / 买点审视 / 卖点审视 / 交易心得"
                  value={reviewDraft}
                  onChange={(event) => setReviewDraft(event.target.value)}
                />
                <div className="stock-review-box__footer">
                  <Button
                    variant="secondary"
                    testId="round-review-cancel"
                    onClick={() => setEditingReview(false)}
                  >
                    取消
                  </Button>
                  <Button
                    variant="primary"
                    testId="round-review-save"
                    onClick={() => {
                      onSaveReview(reviewDraft)
                      setEditingReview(false)
                    }}
                  >
                    保存复盘
                  </Button>
                </div>
              </div>
            ) : (
              <p className="stock-round__review-text">
                {review || '还没有写本轮复盘，点「编辑」记录买入与卖出的理由。'}
              </p>
            )}
          </div>

          <section className="stock-round__daily">
            <div className="stock-round__section-head">
              <span className="stock-section-title">每日复盘</span>
              <span className="stock-muted">{round.dayReviews.length} 条</span>
            </div>
            {round.dayReviews.length > 0 ? (
              <ul className="stock-round__days">
                {round.dayReviews.map((day) => (
                  <li key={day.date}>
                    <span className="stock-muted">{day.date}</span>
                    <span>{day.review}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="stock-muted stock-round__daily-empty">本轮没有每日复盘</p>
            )}
          </section>
        </div>
      ) : null}
    </article>
  )
}
