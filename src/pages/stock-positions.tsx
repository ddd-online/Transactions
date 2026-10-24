import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'

import { Input, Modal, Select, Table } from 'antd'
import type { HTMLAttributes } from 'react'

import { computeOrderFee, instrumentOf, isValidStockCode } from '../../shared/domain/fee'
import { centsToYuan, milliToYuan } from '../../shared/domain/money'
import { todayYmd } from '../../shared/domain/time'
import type { StockPositionDto } from '../../shared/types/stock-position'
import type { StockTradeDto } from '../../shared/types/stock-history'
import type { StockReviewSettingDto } from '../../shared/types/stock'
import { Button } from '../components/button'
import { ConfirmDialog } from '../components/confirm-dialog'
import { DatePicker } from '../components/date-picker'
import { EmptyState } from '../components/empty-state'
import { Icon } from '../components/icon'
import { notify } from '../components/toast'
import {
  stockDateTime,
  stockErrorMessage,
  stockPercent,
  stockPnlClass,
  stockPrice,
  stockRoundRate,
  stockTradeTypeLabel,
} from './stock-format'

export interface StockPositionsPanelProps {
  ledgerId: string
}

interface TradeFillForm {
  price: string
  lots: string
}

interface TradeForm {
  type: string
  code: string
  name: string
  fills: TradeFillForm[]
  date: string
  tag: string
  remark: string
}

interface TradeFeeForm {
  commission: string
  min: string
  stamp: string
  transfer: string
}

const EMPTY_TRADE: TradeForm = {
  type: 'open',
  code: '',
  name: '',
  fills: [{ price: '', lots: '' }],
  date: todayYmd(),
  tag: '分析',
  remark: '',
}

const EMPTY_TRADE_FEE: TradeFeeForm = {
  commission: '',
  min: '',
  stamp: '',
  transfer: '',
}

function money(cents: number): string {
  return `¥${centsToYuan(cents)}`
}

function signedMoney(cents: number): string {
  return `${cents >= 0 ? '+' : '-'}¥${centsToYuan(Math.abs(cents))}`
}

function marketValueOf(position: StockPositionDto): number {
  if (position.latestPrice === undefined) return position.totalCost
  return Math.round((position.latestPrice * position.quantity) / 10)
}

function pnlOf(position: StockPositionDto): number {
  return marketValueOf(position) + position.roundCashFlow
}

function feeText(
  position: StockPositionDto,
  fee: { commissionRate: number; minCommission: number; stampDutyRate: number; transferFeeRate: number } | null,
): string {
  const round = position.roundFee
  const commission = round?.commissionRate ?? fee?.commissionRate
  const minimum = round?.minCommission ?? fee?.minCommission
  const stamp = round?.stampDutyRate ?? fee?.stampDutyRate
  const transfer = round?.transferFeeRate ?? fee?.transferFeeRate
  if (commission === undefined) return '本轮费率沿用账本默认'
  return [
    `佣金 万${(commission * 10000).toFixed(3)}`,
    `最低 ${minimum === undefined ? '—' : money(minimum)}`,
    `印花税 ${stamp === undefined ? '—' : `${(stamp * 100).toFixed(2)}%`}`,
    `过户费 ${transfer === undefined ? '—' : `${(transfer * 100).toFixed(3)}%`}`,
  ].join(' · ')
}

function feeFormOf(
  rates:
    | {
        commissionRate: number
        minCommission: number
        stampDutyRate: number
        transferFeeRate: number
      }
    | null
    | undefined,
): TradeFeeForm {
  if (!rates) return EMPTY_TRADE_FEE
  return {
    commission: String(Number((rates.commissionRate * 10000).toFixed(4))),
    min: (rates.minCommission / 100).toFixed(2),
    stamp: String(Number((rates.stampDutyRate * 100).toFixed(4))),
    transfer: String(Number((rates.transferFeeRate * 100).toFixed(4))),
  }
}

function feeRatesOf(form: TradeFeeForm): {
  commissionRate: number
  minCommission: number
  stampDutyRate: number
  transferFeeRate: number
} {
  return {
    commissionRate: Number(form.commission) / 10000,
    minCommission: Math.round(Number(form.min) * 100),
    stampDutyRate: Number(form.stamp) / 100,
    transferFeeRate: Number(form.transfer) / 100,
  }
}

export function StockPositionsPanel({ ledgerId }: StockPositionsPanelProps): JSX.Element {
  const [positions, setPositions] = useState<StockPositionDto[]>([])
  const [selectedCode, setSelectedCode] = useState('')
  const [trades, setTrades] = useState<StockTradeDto[]>([])
  const [tags, setTags] = useState<string[]>(['分析'])
  const [fee, setFee] = useState<{
    commissionRate: number
    minCommission: number
    stampDutyRate: number
    transferFeeRate: number
  } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [tradeOpen, setTradeOpen] = useState(false)
  const [tradeForm, setTradeForm] = useState<TradeForm>(EMPTY_TRADE)
  const [tradeFee, setTradeFee] = useState<TradeFeeForm>(EMPTY_TRADE_FEE)
  const [roundExpanded, setRoundExpanded] = useState(true)
  const [roundEditing, setRoundEditing] = useState(false)
  const [dailyExpanded, setDailyExpanded] = useState(true)
  const [dailyModalOpen, setDailyModalOpen] = useState(false)
  const [dailyDate, setDailyDate] = useState(todayYmd())
  const [dailyText, setDailyText] = useState('')
  const [dailyTemplate, setDailyTemplate] = useState('')
  const [roundTemplate, setRoundTemplate] = useState('')
  const [roundText, setRoundText] = useState('')
  const [editingTrade, setEditingTrade] = useState<StockTradeDto | null>(null)
  const [editPrice, setEditPrice] = useState('')
  const [editLots, setEditLots] = useState('1')
  const [deleteOrder, setDeleteOrder] = useState<string | null>(null)
  /** 当前名称是不是按代码自动带出来的：改代码时只清掉自动值，不覆盖手填的名称。 */
  const autoTradeName = useRef('')

  const selected = useMemo(
    () => positions.find((row) => row.stockCode === selectedCode) ?? positions[0],
    [positions, selectedCode],
  )

  const load = useCallback(async (): Promise<void> => {
    if (!ledgerId) {
      setPositions([])
      return
    }
    try {
      const [rows, tagSettings, feeSettings, reviewSettings] = await Promise.all([
        window.api.invoke('stock_positions', { ledger_id: ledgerId }),
        window.api.invoke('stock_tag_settings_get', { ledger_id: ledgerId }),
        window.api.invoke('stock_fee_settings_get', { ledger_id: ledgerId }),
        window.api.invoke('stock_review_template_get', { ledger_id: ledgerId }),
      ])
      const active = rows.filter((row) => row.quantity > 0)
      const review = reviewSettings as StockReviewSettingDto
      setPositions(active)
      setTags(tagSettings.tags)
      setFee(feeSettings)
      setRoundTemplate(review.template)
      setDailyTemplate(review.dailyTemplate)
      setSelectedCode((current) =>
        active.some((row) => row.stockCode === current) ? current : active[0]?.stockCode ?? '',
      )
      setError('')
    } catch (loadError) {
      setError(stockErrorMessage(loadError))
    }
  }, [ledgerId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!selected) {
      setTrades([])
      setRoundText('')
      return
    }
    setRoundText(selected.review)
    setRoundEditing(false)
    setDailyText(selected.dayReviews[0]?.review ?? '')
    setDailyDate(selected.dayReviews[0]?.date ?? todayYmd())
    void (async () => {
      try {
        const rows = await window.api.invoke('stock_trades', {
          ledger_id: ledgerId,
          stock_code: selected.stockCode,
        })
        setTrades(rows)
      } catch (tradeError) {
        setError(stockErrorMessage(tradeError))
      }
    })()
  }, [ledgerId, selected])

  // 建仓时按代码自动带出名称：本地成交历史优先，查不到再走行情；失败静默，允许手填。
  useEffect(() => {
    if (!tradeOpen || tradeForm.type !== 'open') return
    const code = tradeForm.code.trim()
    if (!isValidStockCode(code)) return
    let alive = true
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const result = await window.api.invoke('stock_name', { stock_code: code })
          if (!alive) return
          autoTradeName.current = result.stockName
          setTradeForm((current) =>
            current.code.trim() === code && current.name.trim() === ''
              ? { ...current, name: result.stockName }
              : current,
          )
        } catch {
          if (alive) autoTradeName.current = ''
        }
      })()
    }, 400)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [tradeForm.code, tradeForm.type, tradeOpen])

  const openTrade = (type: string, position?: StockPositionDto): void => {
    autoTradeName.current = ''
    setTradeForm({
      type,
      code: position?.stockCode ?? '',
      name: position?.stockName ?? '',
      fills: [
        {
          price: '',
          lots:
            type === 'close'
              ? String(Math.max(1, Math.floor((position?.quantity ?? 100) / 100)))
              : '',
        },
      ],
      date: todayYmd(),
      tag: position?.tag ?? tags[0] ?? '分析',
      remark: '',
    })
    setTradeFee(
      feeFormOf(
        type === 'open'
          ? fee
          : {
              commissionRate: position?.roundFee?.commissionRate ?? fee?.commissionRate ?? 0,
              minCommission: position?.roundFee?.minCommission ?? fee?.minCommission ?? 0,
              stampDutyRate: position?.roundFee?.stampDutyRate ?? fee?.stampDutyRate ?? 0,
              transferFeeRate:
                position?.roundFee?.transferFeeRate ?? fee?.transferFeeRate ?? 0,
            },
      ),
    )
    setError('')
    setTradeOpen(true)
  }

  const submitTrade = useCallback(async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const rates = feeRatesOf(tradeFee)
      const stockCode = tradeForm.code.trim()
      let stockName = tradeForm.name.trim()
      // 手速快过 400ms 的自动查询时也补一次，避免把建仓记成无名股票。
      if (tradeForm.type === 'open' && !stockName && isValidStockCode(stockCode)) {
        try {
          stockName = (await window.api.invoke('stock_name', { stock_code: stockCode })).stockName
        } catch {
          // 查不到名称时与既有行为一致：按空名称保存
        }
      }
      await window.api.invoke('stock_trade_create', {
        ledger_id: ledgerId,
        stock_code: stockCode,
        stock_name: stockName,
        trade_type: tradeForm.type,
        trade_time: Math.floor(new Date(`${tradeForm.date}T12:00:00`).getTime() / 1000),
        remark: tradeForm.remark,
        tag: tradeForm.tag,
        fills: tradeForm.fills.map((fill) => ({
          price: Number(fill.price),
          lots: Number(fill.lots),
        })),
        price: 0,
        lots: 0,
        round_fee:
          tradeForm.type === 'open'
            ? {
                commission_rate: rates.commissionRate,
                min_commission: rates.minCommission,
                stamp_duty_rate: rates.stampDutyRate,
                transfer_fee_rate: rates.transferFeeRate,
              }
            : undefined,
      })
      setTradeOpen(false)
      notify('成交已记录')
      await load()
    } catch (tradeError) {
      setError(stockErrorMessage(tradeError))
    } finally {
      setBusy(false)
    }
  }, [ledgerId, load, tradeFee, tradeForm])

  const saveTag = useCallback(
    async (value: string): Promise<void> => {
      if (!selected) return
      try {
        await window.api.invoke('stock_position_tag', {
          ledger_id: ledgerId,
          code: selected.stockCode,
          tag: value,
        })
        await load()
      } catch (tagError) {
        notify(stockErrorMessage(tagError), 'error')
      }
    },
    [ledgerId, load, selected],
  )

  const saveDaily = useCallback(async (): Promise<void> => {
    if (!selected) return
    try {
      await window.api.invoke('stock_day_review', {
        ledger_id: ledgerId,
        code: selected.stockCode,
        date: dailyDate,
        review: dailyText,
      })
      notify('复盘已保存')
      setDailyModalOpen(false)
      await load()
    } catch (reviewError) {
      notify(stockErrorMessage(reviewError), 'error')
    }
  }, [dailyDate, dailyText, ledgerId, load, selected])

  const openDailyReview = (): void => {
    const today = todayYmd()
    setDailyDate(today)
    setDailyText(
      selected?.dayReviews.find((review) => review.date === today)?.review ?? dailyTemplate,
    )
    setDailyModalOpen(true)
  }

  const saveRound = useCallback(async (): Promise<void> => {
    if (!selected) return
    try {
      await window.api.invoke('stock_position_review', {
        ledger_id: ledgerId,
        code: selected.stockCode,
        review: roundText,
      })
      notify('复盘已保存')
      await load()
    } catch (reviewError) {
      notify(stockErrorMessage(reviewError), 'error')
    }
  }, [ledgerId, load, roundText, selected])

  const saveTradeEdit = useCallback(async (): Promise<void> => {
    if (!editingTrade) return
    try {
      await window.api.invoke('stock_trade_update', {
        ledger_id: ledgerId,
        id: editingTrade.id,
        price: Number(editPrice),
        lots: Number(editLots),
        trade_time: editingTrade.tradeTime,
      })
      setEditingTrade(null)
      notify('成交已更新')
      await load()
      if (selected) {
        const rows = await window.api.invoke('stock_trades', {
          ledger_id: ledgerId,
          stock_code: selected.stockCode,
        })
        setTrades(rows)
      }
    } catch (tradeError) {
      notify(stockErrorMessage(tradeError), 'error')
    }
  }, [editLots, editPrice, editingTrade, ledgerId, load, selected])

  const removeOrder = useCallback(async (): Promise<void> => {
    if (!deleteOrder) return
    try {
      await window.api.invoke('stock_trade_order_delete', {
        ledger_id: ledgerId,
        order_id: deleteOrder,
      })
      setDeleteOrder(null)
      await load()
      if (selected) {
        const rows = await window.api.invoke('stock_trades', {
          ledger_id: ledgerId,
          stock_code: selected.stockCode,
        })
        setTrades(rows)
      }
    } catch (deleteError) {
      notify(stockErrorMessage(deleteError), 'error')
    }
  }, [deleteOrder, ledgerId, load, selected])

  const marketValue = selected ? marketValueOf(selected) : 0
  const pnl = selected ? pnlOf(selected) : 0
  const pnlRate = selected && selected.totalCost > 0 ? (pnl / selected.totalCost) * 100 : 0
  const quote = selected ? stockRoundRate(selected.latestPrice, selected.prevClose) : null

  const tradeFillAmounts = tradeForm.fills
    .map((fill) => Math.round(Number(fill.price) * 100) * Math.round(Number(fill.lots) * 100))
    .filter((amount) => Number.isFinite(amount) && amount > 0)
  const tradeAmount = tradeFillAmounts.reduce((sum, amount) => sum + amount, 0)
  const tradeLots = tradeForm.fills.reduce(
    (sum, fill) => sum + (Number(fill.price) > 0 ? Number(fill.lots) || 0 : 0),
    0,
  )
  const tradeIsBuy = tradeForm.type === 'open' || tradeForm.type === 'add'
  const tradeFeeRates = feeRatesOf(tradeFee)
  const tradeFeeSetting = {
    id: '',
    ledgerId,
    createdAt: 0,
    updatedAt: 0,
    ...tradeFeeRates,
  }
  const tradeFeeBreakdown = computeOrderFee(
    tradeFillAmounts,
    instrumentOf(tradeForm.code.trim()) ?? 'shenzhenStock',
    tradeFeeSetting,
    tradeIsBuy,
  )
  const tradeFeeUnknown = tradeFillAmounts.length === 0
  const tradeFeeTotal = tradeFeeUnknown ? 0 : tradeFeeBreakdown.total
  const tradeTotal = tradeIsBuy ? tradeAmount + tradeFeeTotal : tradeAmount - tradeFeeTotal

  const updateTradeFill = (index: number, key: 'price' | 'lots', value: string): void => {
    setTradeForm((current) => ({
      ...current,
      fills: current.fills.map((fill, fillIndex) =>
        fillIndex === index ? { ...fill, [key]: value } : fill,
      ),
    }))
  }

  const changeTradeCode = (value: string): void => {
    const auto = autoTradeName.current
    autoTradeName.current = ''
    setTradeForm((current) => ({
      ...current,
      code: value,
      name: auto !== '' && current.name === auto ? '' : current.name,
    }))
  }

  return (
    <div className="stock-positions-view">
      <aside className="stock-master">
        {positions.length === 0 ? (
          <EmptyState
            testId="stock-position-empty"
            title={ledgerId ? '当前没有持仓' : '请先创建/选择账本'}
          />
        ) : (
          <div className="stock-master__list">
            {positions.map((position) => {
              const rowPnl = pnlOf(position)
              return (
                <button
                  key={position.id}
                  type="button"
                  className={`stock-master__row${position.stockCode === selected?.stockCode ? ' is-active' : ''}`}
                  data-testid="stock-position-row"
                  onClick={() => setSelectedCode(position.stockCode)}
                >
                  <div className="stock-master__headline">
                    <strong>{position.stockName}</strong>
                    <span className="stock-muted stock-mono">{position.stockCode}</span>
                  </div>
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
                    <span className={`stock-master__stat-value stock-master__stat-value--end ${stockPnlClass(rowPnl)}`}>
                      <span className="stock-mono">{money(rowPnl)}</span>
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
                </button>
              )
            })}
          </div>
        )}
        <div className="stock-master__footer">
          <Button variant="primary" block testId="stock-position-create" onClick={() => openTrade('open')}>
            建仓
          </Button>
        </div>
      </aside>

      <section className="stock-detail">
        {!selected ? (
          <div className="stock-detail__empty">
            {error ? <p className="stock-inline-error">{error}</p> : null}
          </div>
        ) : (
          <>
            <header className="stock-detail__head">
              <div className="stock-detail__identity">
                <h2>{selected.stockName}</h2>
                <span className="stock-muted stock-mono">{selected.stockCode}</span>
                <Select
                  className="stock-tag-select"
                  data-testid="position-tag-select"
                  value={selected.tag}
                  options={tags.map((tag) => ({ value: tag, label: tag }))}
                  onChange={(value) => void saveTag(value)}
                  popupMatchSelectWidth={false}
                  size="small"
                />              </div>
              <div className="stock-detail__actions">
                <Button variant="primary" size="sm" testId="stock-position-close" onClick={() => openTrade('close', selected)}>
                  清仓
                </Button>
                <Button variant="secondary" size="sm" testId="stock-position-reduce" onClick={() => openTrade('reduce', selected)}>
                  减仓
                </Button>
                <Button variant="secondary" size="sm" testId="stock-position-add" onClick={() => openTrade('add', selected)}>
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
                <strong className="stock-mono">{money(marketValue)}</strong>
              </div>
              <div>
                <span className="stock-label">浮动盈亏</span>
                <strong className={stockPnlClass(pnl)}>
                  {money(pnl)} {stockPercent(pnlRate)}
                </strong>
              </div>
            </div>

            <p className="stock-fee-line">
              本轮费率 <span>{feeText(selected, fee)}</span>
            </p>

            <section className="stock-detail__section">
              <button
                type="button"
                className="stock-section-toggle"
                onClick={() => setDailyExpanded((current) => !current)}
              >
                <Icon name={dailyExpanded ? 'Down' : 'CaretRight'} size={12} />
                每日复盘
              </button>
              <Button
                variant="secondary"
                size="sm"
                testId="position-review-open"
                onClick={openDailyReview}
              >
                写今日
              </Button>
            </section>
            {dailyExpanded ? (
              <div className="stock-review-preview" data-testid="position-daily-review">
                {selected.dayReviews[0]
                  ? `${selected.dayReviews[0].date}：${selected.dayReviews[0].review}`
                  : '还没有写每日复盘，点「写今日」记下今天的盘面和判断。'}
              </div>
            ) : null}

            <section className="stock-detail__section">
              <button
                type="button"
                className="stock-section-toggle"
                data-testid="position-round-toggle"
                onClick={() => {
                  setRoundExpanded((current) => !current)
                  setRoundEditing(false)
                }}
              >
                <Icon name={roundExpanded ? 'Down' : 'CaretRight'} size={12} />
                本轮复盘
              </button>
              <Button
                variant="secondary"
                size="sm"
                testId="position-round-edit"
                onClick={() => {
                  setRoundExpanded(true)
                  // 第一次写且还没动过草稿时用本轮模板起头；已写过的复盘/草稿不覆盖
                  setRoundText((current) => (current.trim() ? current : roundTemplate))
                  setRoundEditing(true)
                }}
              >
                编辑
              </Button>
            </section>
            {roundExpanded ? (
              roundEditing ? (
                <div className="stock-review-box">
                  <Input.TextArea
                    data-testid="position-round-review"
                    rows={6}
                    placeholder="买入理由 / 卖出理由 / 买点审视 / 卖点审视 / 交易心得"
                    value={roundText}
                    onChange={(event) => setRoundText(event.target.value)}
                  />
                  <div className="stock-review-box__footer">
                    <Button
                      variant="secondary"
                      testId="position-round-cancel"
                      onClick={() => setRoundEditing(false)}
                    >
                      取消
                    </Button>
                    <Button
                      variant="primary"
                      testId="position-round-save"
                      onClick={() => {
                        void saveRound().then(() => setRoundEditing(false))
                      }}
                    >
                      保存复盘
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="stock-review-preview stock-review-preview--lines" data-testid="position-round-preview">
                  {selected.review
                    ? selected.review
                    : '还没有写本轮复盘，点「编辑」记录买入与卖出的理由。'}
                </div>
              )
            ) : null}

            <section className="stock-detail__section">
              <span className="stock-section-title">成交记录</span>
            </section>
            <Table
              className="tr-table stock-trade-table"
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
                  width: 150,
                },
                {
                  title: '类型',
                  dataIndex: 'tradeType',
                  align: 'center',
                  width: 80,
                  render: (value: string) => (
                    <span className={`stock-trade-type is-${value}`}>{stockTradeTypeLabel(value)}</span>
                  ),
                },
                {
                  title: '成交价',
                  dataIndex: 'price',
                  align: 'right',
                  render: (value: number) => milliToYuan(value),
                },
                { title: '手数', dataIndex: 'lots', align: 'center', width: 70 },
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
                  title: '资金变动',
                  key: 'cash',
                  align: 'right',
                  render: (_, row) => {
                    const cash =
                      row.tradeType === 'reduce' || row.tradeType === 'close'
                        ? row.amount - row.fee
                        : -(row.amount + row.fee)
                    return <span className={stockPnlClass(cash)}>{signedMoney(cash)}</span>
                  },
                },
                {
                  title: '操作',
                  key: 'actions',
                  align: 'center',
                  width: 110,
                  render: (_, row) => (
                    <span className="stock-row-actions">
                      <Button
                        variant="text"
                        size="sm"
                        testId="stock-trade-edit"
                        onClick={() => {
                          setEditingTrade(row)
                          setEditPrice(milliToYuan(row.price))
                          setEditLots(String(row.lots))
                        }}
                      >
                        编辑
                      </Button>
                      <Button
                        variant="text-danger"
                        size="sm"
                        testId="stock-trade-delete"
                        onClick={() => setDeleteOrder(row.orderId)}
                      >
                        删除
                      </Button>
                    </span>
                  ),
                },
              ]}
            />
          </>
        )}
      </section>

      <Modal
        open={tradeOpen}
        title={`委托${stockTradeTypeLabel(tradeForm.type)}`}
        width={640}
        centered
        destroyOnHidden
        footer={null}
        onCancel={() => setTradeOpen(false)}
      >
        <div className="stock-modal-form stock-trade-form">
          <div className="stock-modal-grid">
            <label>
              <span className="stock-label">股票名称</span>
              <Input
                data-testid="trade-name"
                value={tradeForm.name}
                disabled={tradeForm.type !== 'open'}
                onChange={(event) =>
                  setTradeForm((current) => ({ ...current, name: event.target.value }))
                }
              />
            </label>
            <label>
              <span className="stock-label">股票代码</span>
              <Input
                data-testid="trade-code"
                value={tradeForm.code}
                disabled={tradeForm.type !== 'open'}
                onChange={(event) => changeTradeCode(event.target.value)}
              />
            </label>
          </div>

          <section className="stock-trade-block">
            <div className="stock-trade-block__head">
              <span className="stock-trade-section__title">成交明细</span>
              <Button
                variant="text"
                size="sm"
                testId="trade-add-fill"
                onClick={() =>
                  setTradeForm((current) => ({
                    ...current,
                    fills: [...current.fills, { price: '', lots: '' }],
                  }))
                }
              >
                + 添加一笔成交
              </Button>
            </div>
            {tradeForm.fills.map((fill, index) => (
              <div className="stock-trade-fill" key={index}>
                <Input
                  data-testid={index === 0 ? 'trade-price' : `trade-price-${index + 1}`}
                  inputMode="decimal"
                  placeholder="成交价（元/股）"
                  value={fill.price}
                  onChange={(event) => updateTradeFill(index, 'price', event.target.value)}
                />
                <Input
                  data-testid={index === 0 ? 'trade-lots' : `trade-lots-${index + 1}`}
                  inputMode="numeric"
                  placeholder={
                    tradeForm.type === 'close'
                      ? '手数'
                      : tradeForm.type === 'reduce'
                        ? '手数（可用）'
                        : '手数'
                  }
                  value={fill.lots}
                  disabled={tradeForm.type === 'close'}
                  onChange={(event) => updateTradeFill(index, 'lots', event.target.value)}
                />
                {tradeForm.type === 'close' || tradeForm.fills.length === 1 ? (
                  <span className="stock-trade-fill__dash">—</span>
                ) : (
                  <Button
                    variant="text-danger"
                    size="sm"
                    testId={`trade-remove-fill-${index}`}
                    onClick={() =>
                      setTradeForm((current) => ({
                        ...current,
                        fills: current.fills.filter((_, fillIndex) => fillIndex !== index),
                      }))
                    }
                  >
                    −
                  </Button>
                )}
              </div>
            ))}
          </section>

          <section className="stock-trade-summary">
            <div>
              <span>合计</span>
              <span>
                {tradeFillAmounts.length} 笔 · {tradeLots} 手 · {money(tradeAmount)}
              </span>
            </div>
            <div>
              <span>预估费用</span>
              <span>{tradeFeeUnknown ? '—' : money(tradeFeeBreakdown.total)}</span>
            </div>
            <div className="stock-trade-summary__total">
              <span>{tradeIsBuy ? '预计支出' : '预计到手'}</span>
              <strong>{money(tradeTotal)}</strong>
            </div>
          </section>

          <div className="stock-modal-grid">
            <label>
              <span className="stock-label">委托时间</span>
              <DatePicker
                testId="trade-date"
                value={tradeForm.date}
                onChange={(value) =>
                  setTradeForm((current) => ({ ...current, date: value }))
                }
              />
            </label>
            <label>
              <span className="stock-label">交易标签</span>
              <Select
                data-testid="trade-tag"
                value={tradeForm.tag}
                onChange={(value) =>
                  setTradeForm((current) => ({ ...current, tag: value }))
                }
                options={tags.map((tag) => ({ value: tag, label: tag }))}
              />
            </label>
          </div>

          <section className="stock-trade-fees">
            <div className="stock-trade-block__head">
              <span className="stock-trade-section__title">本轮费用设置</span>
              {tradeForm.type === 'open' ? (
                <Button
                  variant="text"
                  size="sm"
                  testId="trade-fee-restore"
                  onClick={() => setTradeFee(feeFormOf(fee))}
                >
                  恢复系统配置
                </Button>
              ) : null}
            </div>
            {tradeForm.type === 'open' ? (
              <div className="stock-modal-grid">
                <label>
                  <span className="stock-label">佣金费率（万分之）</span>
                  <Input
                    data-testid="trade-fee-commission"
                    inputMode="decimal"
                    value={tradeFee.commission}
                    onChange={(event) =>
                      setTradeFee((current) => ({ ...current, commission: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span className="stock-label">最低佣金（元/委托）</span>
                  <Input
                    data-testid="trade-fee-min"
                    inputMode="decimal"
                    value={tradeFee.min}
                    onChange={(event) =>
                      setTradeFee((current) => ({ ...current, min: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span className="stock-label">印花税（%）</span>
                  <Input
                    data-testid="trade-fee-stamp"
                    inputMode="decimal"
                    value={tradeFee.stamp}
                    onChange={(event) =>
                      setTradeFee((current) => ({ ...current, stamp: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span className="stock-label">过户费（%）</span>
                  <Input
                    data-testid="trade-fee-transfer"
                    inputMode="decimal"
                    value={tradeFee.transfer}
                    onChange={(event) =>
                      setTradeFee((current) => ({ ...current, transfer: event.target.value }))
                    }
                  />
                </label>
              </div>
            ) : (
              <p className="stock-trade-fee-text">
                {selected ? feeText(selected, fee) : '本轮费率沿用账本默认'}
              </p>
            )}
          </section>

          {error ? <p className="stock-modal-error">{error}</p> : null}
          <div className="stock-modal-actions">
            <Button variant="secondary" testId="trade-cancel" onClick={() => setTradeOpen(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              testId="trade-save"
              loading={busy}
              onClick={() => void submitTrade()}
            >
              {stockTradeTypeLabel(tradeForm.type)}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={editingTrade !== null}
        title="编辑成交"
        width={420}
        centered
        destroyOnHidden
        footer={null}
        onCancel={() => setEditingTrade(null)}
      >
        <div className="stock-modal-form">
          <label>
            <span className="stock-label">价格（元）</span>
            <Input
              data-testid="stock-trade-price"
              value={editPrice}
              onChange={(event) => setEditPrice(event.target.value)}
            />
          </label>
          <label>
            <span className="stock-label">手数</span>
            <Input
              data-testid="stock-trade-lots"
              value={editLots}
              onChange={(event) => setEditLots(event.target.value)}
            />
          </label>
          <div className="stock-modal-actions">
            <Button variant="secondary" onClick={() => setEditingTrade(null)}>
              取消
            </Button>
            <Button variant="primary" testId="stock-trade-save" onClick={() => void saveTradeEdit()}>
              保存
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={dailyModalOpen}
        title="每日复盘"
        width={560}
        centered
        destroyOnHidden
        footer={null}
        onCancel={() => setDailyModalOpen(false)}
      >
        <div className="stock-modal-form">
          <label>
            <span className="stock-label">日期</span>
            <DatePicker
              testId="position-review-date"
              value={dailyDate}
              onChange={setDailyDate}
            />
          </label>
          <label>
            <span className="stock-label">复盘</span>
            <Input.TextArea
              data-testid="position-review-text"
              rows={6}
              placeholder="记录今天的盘面与判断"
              value={dailyText}
              onChange={(event) => setDailyText(event.target.value)}
            />
          </label>
          <div className="stock-modal-actions">
            <Button variant="secondary" onClick={() => setDailyModalOpen(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              testId="position-review-save"
              onClick={() => void saveDaily()}
            >
              保存
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteOrder !== null}
        title="删除整笔委托"
        message="删除后持仓与资金会按重放结果回滚，确定继续？"
        confirmText="删除"
        danger
        onCancel={() => setDeleteOrder(null)}
        onConfirm={() => void removeOrder()}
      />
    </div>
  )
}
