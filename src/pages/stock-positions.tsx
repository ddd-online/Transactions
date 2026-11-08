import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'

import { Input, Modal, Select } from 'antd'

import { computeOrderFee, instrumentOf, isValidStockCode } from '../../shared/domain/fee'
import { centsToYuan, milliToYuan } from '../../shared/domain/money'
import { todayYmd } from '../../shared/domain/time'
import type { StockDayReviewDto, StockPositionDto } from '../../shared/types/stock-position'
import type { StockTradeDto } from '../../shared/types/stock-history'
import type { StockReviewSettingDto } from '../../shared/types/stock'
import { Button } from '../components/button'
import { ConfirmDialog } from '../components/confirm-dialog'
import { DatePicker } from '../components/date-picker'
import { notify } from '../components/toast'
import { StockDailyReviews } from './stock-daily-reviews'
import { StockRoundReview } from './stock-round-review'
import {
  EMPTY_TRADE_FEE,
  feeFormOf,
  feeRatesOf,
  feeText,
  type TradeFeeForm,
} from './stock-positions-fee'
import { StockPositionsTable } from './stock-positions-table'
import {
  stockErrorMessage,
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

const EMPTY_TRADE: TradeForm = {
  type: 'open',
  code: '',
  name: '',
  fills: [{ price: '', lots: '' }],
  date: todayYmd(),
  tag: '分析',
  remark: '',
}

function stockMoney(cents: number): string {
  return `¥${centsToYuan(cents)}`
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
  const [roundEditing, setRoundEditing] = useState(false)
  const [dailyModalOpen, setDailyModalOpen] = useState(false)
  /** 正在改的那一天；null = 打开的是「写今日」 */
  const [dailyEdit, setDailyEdit] = useState<StockDayReviewDto | null>(null)
  const [dailyDate, setDailyDate] = useState(todayYmd())
  const [dailyText, setDailyText] = useState('')
  const [dailyTemplate, setDailyTemplate] = useState('')
  const [roundTemplate, setRoundTemplate] = useState('')
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

  const activeCode = selected?.stockCode ?? ''

  /** 名称刷新回来：只改这一只的名字。重拉整页会把弹窗、复盘草稿与滚动位置一起洗掉。 */
  const renameSelected = useCallback(
    (stockName: string): void => {
      setPositions((rows) =>
        rows.map((row) => (row.stockCode === activeCode ? { ...row, stockName } : row)),
      )
    },
    [activeCode],
  )

  /** 表格里这些成交的费用合计（费用恒为整数分，加完再格式化，不丢精度）。 */
  const tradesFeeTotal = useMemo(
    () => trades.reduce((total, trade) => total + trade.fee, 0),
    [trades],
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
      return
    }
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
      notify(dailyEdit ? '复盘已更新' : '复盘已保存')
      setDailyModalOpen(false)
      setDailyEdit(null)
      await load()
    } catch (reviewError) {
      notify(stockErrorMessage(reviewError), 'error')
    }
  }, [dailyDate, dailyEdit, dailyText, ledgerId, load, selected])

  const openDailyReview = (): void => {
    const today = todayYmd()
    setDailyEdit(null)
    setDailyDate(today)
    setDailyText(
      selected?.dayReviews.find((review) => review.date === today)?.review ?? dailyTemplate,
    )
    setDailyModalOpen(true)
  }

  /** 改已经写过的一天：日期钉在那一天（改日期等于把这段文字挪去盖掉别的日子），正文用原文打头。 */
  const openDailyEdit = (day: StockDayReviewDto): void => {
    setDailyEdit(day)
    setDailyDate(day.date)
    setDailyText(day.review)
    setDailyModalOpen(true)
  }

  const saveRound = useCallback(
    async (review: string): Promise<void> => {
      if (!selected) return
      try {
        await window.api.invoke('stock_position_review', {
          ledger_id: ledgerId,
          code: selected.stockCode,
          review,
        })
        notify('复盘已保存')
        await load()
      } catch (reviewError) {
        notify(stockErrorMessage(reviewError), 'error')
      }
    },
    [ledgerId, load, selected],
  )

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
      <StockPositionsTable
        ledgerId={ledgerId}
        positions={positions}
        selected={selected}
        tags={tags}
        fee={fee}
        trades={trades}
        tradesFeeTotal={tradesFeeTotal}
        error={error}
        onSelect={setSelectedCode}
        onOpenTrade={openTrade}
        onTagChange={(value) => void saveTag(value)}
        onRenamed={renameSelected}
        onEditTrade={(trade) => {
          setEditingTrade(trade)
          setEditPrice(milliToYuan(trade.price))
          setEditLots(String(trade.lots))
        }}
        onDeleteOrder={setDeleteOrder}
        review={
          selected ? (
            <>
              <section className="stock-detail__section">
                <span className="stock-section-title">每日复盘</span>
                <Button
                  variant="secondary"
                  size="sm"
                  testId="position-review-open"
                  onClick={openDailyReview}
                >
                  写今日
                </Button>
              </section>
              <StockDailyReviews
                days={selected.dayReviews}
                testId="position-daily-review"
                onEdit={openDailyEdit}
                empty={
                  // 空态也是一行、也能点：点它就是「写今日」，和上面有内容的行同一种反馈
                  <div className="stock-review-line">
                    <button
                      type="button"
                      className="stock-review-day"
                      data-testid="position-daily-review"
                      aria-label="写今日的每日复盘"
                      onClick={openDailyReview}
                    >
                      <span className="stock-review-day__text stock-muted">
                        还没有写每日复盘，点「写今日」记下今天的盘面和判断。
                      </span>
                    </button>
                  </div>
                }
              />

              <section className="stock-detail__section">
                <span className="stock-section-title">本轮复盘</span>
                <Button
                  variant="secondary"
                  size="sm"
                  testId="position-round-edit"
                  onClick={() => setRoundEditing(true)}
                >
                  编辑
                </Button>
              </section>
              <StockRoundReview
                key={selected.stockCode}
                testId="position-round"
                review={selected.review}
                template={roundTemplate}
                emptyText="还没有写本轮复盘，点「编辑」记录买入与卖出的理由。"
                editing={roundEditing}
                onEditingChange={setRoundEditing}
                onSave={saveRound}
              />
            </>
          ) : null
        }
      />

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
                {tradeFillAmounts.length} 笔 · {tradeLots} 手 · {stockMoney(tradeAmount)}
              </span>
            </div>
            <div>
              <span>预估费用</span>
              <span>{tradeFeeUnknown ? '—' : stockMoney(tradeFeeBreakdown.total)}</span>
            </div>
            <div className="stock-trade-summary__total">
              <span>{tradeIsBuy ? '预计支出' : '预计到手'}</span>
              <strong>{stockMoney(tradeTotal)}</strong>
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

          {error ? <p role="alert" className="stock-modal-error">{error}</p> : null}
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
        title={dailyEdit ? `每日复盘 · ${dailyEdit.date}` : '每日复盘'}
        width={560}
        centered
        destroyOnHidden
        footer={null}
        onCancel={() => {
          setDailyModalOpen(false)
          setDailyEdit(null)
        }}
      >
        <div className="stock-modal-form">
          {dailyEdit ? (
            // 改的是某一天：日期不是字段，是这一行的身份 —— 不摆一个灰掉、看起来像坏了的选择器
            <div>
              <span className="stock-label">日期</span>
              <span className="stock-review-date" data-testid="position-review-date-value">
                {dailyEdit.date}
              </span>
            </div>
          ) : (
            <label>
              <span className="stock-label">日期</span>
              <DatePicker
                testId="position-review-date"
                value={dailyDate}
                onChange={setDailyDate}
              />
            </label>
          )}
          <label>
            <span className="stock-label">复盘</span>
            <Input.TextArea
              data-testid="position-review-text"
              aria-label={dailyEdit ? `${dailyEdit.date} 的每日复盘` : '今日的每日复盘'}
              rows={6}
              placeholder="记录今天的盘面与判断"
              value={dailyText}
              onChange={(event) => setDailyText(event.target.value)}
            />
          </label>
          <div className="stock-modal-actions">
            <Button
              variant="secondary"
              testId="position-review-cancel"
              onClick={() => {
                setDailyModalOpen(false)
                setDailyEdit(null)
              }}
            >
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
