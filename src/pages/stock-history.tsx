import { useCallback, useEffect, useState, type JSX } from 'react'

import { centsToYuan, milliToYuan } from '../../shared/domain/money'
import { formatTimestamp } from '../../shared/domain/time'
import type {
  StockTradeHistoryDetailDto,
  StockTradeHistoryDto,
  StockTradeHistorySummaryDto,
} from '../../shared/types/stock-history'
import type { StockTradeTagSettingDto } from '../../shared/types/stock'
import { ConfirmDialog } from '../components/confirm-dialog'

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'msg' in error) {
    return String((error as { msg: unknown }).msg)
  }
  if (error instanceof Error) return error.message
  return String(error)
}

function money(cents: number): string {
  return `¥${centsToYuan(cents)}`
}

export interface StockHistoryPanelProps {
  ledgerId: string
}

/** 股票 · 交易历史：已清仓股票列表 + 汇总 + 单股轮次详情。 */
export function StockHistoryPanel({ ledgerId }: StockHistoryPanelProps): JSX.Element {
  const [summary, setSummary] = useState<StockTradeHistorySummaryDto | null>(null)
  const [rows, setRows] = useState<StockTradeHistoryDto[]>([])
  const [detail, setDetail] = useState<StockTradeHistoryDetailDto | null>(null)
  const [reviews, setReviews] = useState<Record<string, string>>({})
  const [roundTags, setRoundTags] = useState<Record<string, string>>({})
  const [tagOptions, setTagOptions] = useState<string[]>([])
  const [edits, setEdits] = useState<Record<string, { price: string; lots: string }>>({})
  const [confirmOrder, setConfirmOrder] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    if (!ledgerId) {
      setRows([])
      setSummary(null)
      setDetail(null)
      return
    }
    setLoading(true)
    try {
      const [list, total] = await Promise.all([
        window.api.invoke('stock_history', { ledger_id: ledgerId }),
        window.api.invoke('stock_history_summary', { ledger_id: ledgerId }),
      ])
      setRows(list)
      setSummary(total)
      setError('')
    } catch (loadError) {
      setError(errorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [ledgerId])

  useEffect(() => {
    void load()
  }, [load])

  const openDetail = useCallback(
    async (code: string): Promise<void> => {
      setError('')
      try {
        const next = await window.api.invoke('stock_history_detail', {
          ledger_id: ledgerId,
          stock_code: code,
        })
        setDetail(next)
        setReviews(Object.fromEntries(next.rounds.map((round) => [round.id, round.review])))
        setRoundTags(Object.fromEntries(next.rounds.map((round) => [round.id, round.tag])))
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
        setError(errorMessage(detailError))
      }
    },
    [ledgerId],
  )

  const saveRoundReview = useCallback(
    async (roundId: string): Promise<void> => {
      if (!detail) return
      setError('')
      try {
        const next = await window.api.invoke('stock_round_review', {
          ledger_id: ledgerId,
          round_id: roundId,
          review: reviews[roundId] ?? '',
        })
        setDetail(next)
        setReviews(Object.fromEntries(next.rounds.map((round) => [round.id, round.review])))
      } catch (reviewError) {
        setError(errorMessage(reviewError))
      }
    },
    [detail, ledgerId, reviews],
  )

  const saveRoundTag = useCallback(
    async (roundId: string, tag: string): Promise<void> => {
      if (!detail) return
      setError('')
      try {
        const next = await window.api.invoke('stock_round_tag', {
          ledger_id: ledgerId,
          round_id: roundId,
          tag,
        })
        setDetail(next)
        setRoundTags(Object.fromEntries(next.rounds.map((round) => [round.id, round.tag])))
        setEdits(
          Object.fromEntries(
            next.rounds
              .flatMap((round) => round.trades)
              .map((trade) => [trade.id, { price: milliToYuan(trade.price), lots: String(trade.lots) }]),
          ),
        )
      } catch (tagError) {
        setError(errorMessage(tagError))
      }
    },
    [detail, ledgerId],
  )

  const saveTrade = useCallback(
    async (tradeId: string): Promise<void> => {
      if (!detail) return
      const edit = edits[tradeId]
      if (!edit) return
      const trade = detail.rounds
        .flatMap((round) => round.trades)
        .find((item) => item.id === tradeId)
      setError('')
      try {
        await window.api.invoke('stock_trade_update', {
          ledger_id: ledgerId,
          id: tradeId,
          price: Number(edit.price),
          lots: Number(edit.lots),
          trade_time: trade?.tradeTime ?? 0,
        })
        await openDetail(detail.stockCode)
      } catch (tradeError) {
        setError(errorMessage(tradeError))
      }
    },
    [detail, edits, ledgerId, openDetail],
  )

  const deleteOrder = useCallback(
    async (orderId: string): Promise<void> => {
      if (!detail) return
      setError('')
      try {
        await window.api.invoke('stock_trade_order_delete', {
          ledger_id: ledgerId,
          order_id: orderId,
        })
        await openDetail(detail.stockCode)
      } catch (deleteError) {
        setError(errorMessage(deleteError))
      }
    },
    [detail, ledgerId, openDetail],
  )

  return (
    <section className="m0-card m0-card--wide">
      <div className="m0-card-head">
        <h2>股票 · 交易历史</h2>
        <span className="m0-muted">{loading ? '加载中…' : `${rows.length} 只股票`}</span>
      </div>

      {summary ? (
        <div className="m0-stats m0-stock-stats" data-testid="stock-history-summary">
          <div className="m0-stat">
            <span className="m0-muted">已清仓股票</span>
            <strong>{summary.stockCount}</strong>
          </div>
          <div className="m0-stat">
            <span className="m0-muted">轮次（胜 / 负）</span>
            <strong>
              {summary.roundCount}（{summary.winCount} / {summary.lossCount}）
            </strong>
          </div>
          <div className="m0-stat">
            <span className="m0-muted">总盈亏</span>
            <strong>{money(summary.totalPnl)}</strong>
          </div>
          <div className="m0-stat">
            <span className="m0-muted">总盈亏率</span>
            <strong>{summary.totalPnlRate.toFixed(2)}%</strong>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="m0-error" data-testid="stock-history-error">
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="m0-muted" data-testid="stock-history-empty">
          {ledgerId ? '还没有已清仓的交易历史' : '请先创建/选择账本'}
        </p>
      ) : (
        <table className="m0-table">
          <thead>
            <tr>
              <th>股票</th>
              <th className="m0-right">轮次</th>
              <th className="m0-right">总盈亏</th>
              <th className="m0-right">盈亏率</th>
              <th className="m0-right">最新价</th>
              <th>最后清仓</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} data-testid="stock-history-row">
                <td>
                  {row.stockName} {row.stockCode}
                </td>
                <td className="m0-right">{row.roundCount}</td>
                <td className="m0-right">{money(row.totalPnl)}</td>
                <td className="m0-right">{row.totalPnlRate.toFixed(2)}%</td>
                <td className="m0-right">
                  {row.latestPrice === undefined ? '—' : milliToYuan(row.latestPrice)}
                </td>
                <td>{formatTimestamp(row.lastClosedAt, 'YYYY-MM-DD')}</td>
                <td className="m0-right">
                  <button
                    type="button"
                    className="m0-link"
                    data-testid="stock-history-open"
                    onClick={() => void openDetail(row.stockCode)}
                  >
                    详情
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {detail ? (
        <div className="m0-stock-history-detail" data-testid="stock-history-detail">
          <h3 className="m0-subtitle">
            {detail.stockName} {detail.stockCode} · {detail.roundCount} 轮
          </h3>
          <p className="m0-muted">
            总盈亏 {money(detail.totalPnl)} · {detail.totalPnlRate.toFixed(2)}% · 胜{' '}
            {detail.winCount} / 负 {detail.lossCount}
          </p>
          <ul className="m0-rounds">
            {detail.rounds.map((round) => (
              <li key={round.id} data-testid="stock-round">
                <div className="m0-card-head">
                  <span>
                    第 {round.roundNo} 轮 · {formatTimestamp(round.openedAt, 'YYYY-MM-DD')} →{' '}
                    {formatTimestamp(round.closedAt, 'YYYY-MM-DD')}
                  </span>
                  <span className={round.pnl >= 0 ? 'm0-amount-income' : 'm0-amount-expense'}>
                    {money(round.pnl)} · {round.pnlRate.toFixed(2)}%
                  </span>
                </div>
                <p className="m0-muted">
                  {round.tag} · {round.tradeCount} 笔成交
                  {round.review ? ` · ${round.review}` : ''}
                </p>
                <div className="m0-actions">
                  <textarea
                    className="m0-input m0-round-review"
                    data-testid="round-review"
                    placeholder="本轮复盘"
                    value={reviews[round.id] ?? ''}
                    onChange={(event) =>
                      setReviews((current) => ({ ...current, [round.id]: event.target.value }))
                    }
                  />
                  <button
                    type="button"
                    className="m0-link"
                    data-testid="round-review-save"
                    onClick={() => void saveRoundReview(round.id)}
                  >
                    保存复盘
                  </button>
                  <select
                    className="m0-input"
                    data-testid="round-tag"
                    value={roundTags[round.id] ?? round.tag}
                    onChange={(event) => void saveRoundTag(round.id, event.target.value)}
                  >
                    {tagOptions.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </select>
                </div>
                <ul className="m0-trade-list">
                  {round.trades
                    .filter((trade) => trade.shares > 0)
                    .map((trade) => (
                      <li key={trade.id} data-testid="stock-trade">
                        <span>{trade.tradeType}</span>
                        <input
                          className="m0-input"
                          data-testid="stock-trade-price"
                          value={edits[trade.id]?.price ?? milliToYuan(trade.price)}
                          onChange={(event) =>
                            setEdits((current) => ({
                              ...current,
                              [trade.id]: {
                                price: event.target.value,
                                lots: current[trade.id]?.lots ?? String(trade.lots),
                              },
                            }))
                          }
                        />
                        <input
                          className="m0-input"
                          data-testid="stock-trade-lots"
                          value={edits[trade.id]?.lots ?? String(trade.lots)}
                          onChange={(event) =>
                            setEdits((current) => ({
                              ...current,
                              [trade.id]: {
                                price: current[trade.id]?.price ?? milliToYuan(trade.price),
                                lots: event.target.value,
                              },
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="m0-link"
                          data-testid="stock-trade-save"
                          onClick={() => void saveTrade(trade.id)}
                        >
                          保存
                        </button>
                        <button
                          type="button"
                          className="m0-link"
                          data-testid="stock-trade-delete"
                          onClick={() => setConfirmOrder(trade.orderId)}
                        >
                          删除委托
                        </button>
                      </li>
                    ))}
                </ul>
                {round.dayReviews.length > 0 ? (
                  <ul className="m0-muted">
                    {round.dayReviews.map((review) => (
                      <li key={review.date}>
                        {review.date}：{review.review}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmOrder !== null}
        title="删除整笔委托"
        message="删除后持仓与资金会按重放结果回滚，确定继续？"
        confirmText="删除"
        danger
        onCancel={() => setConfirmOrder(null)}
        onConfirm={() => {
          const orderId = confirmOrder
          setConfirmOrder(null)
          if (orderId) void deleteOrder(orderId)
        }}
      />
    </section>
  )
}








