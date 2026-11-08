import { useCallback, useEffect, useState, type JSX, type ReactNode } from 'react'

import { Input, Modal } from 'antd'

import { planLevelsOf } from '../../shared/domain/plan-levels'
import type { StockLedgerDto } from '../../shared/types/stock-ledger'
import type { StockTradeDto } from '../../shared/types/stock-history'
import { Button } from '../components/button'
import { notify } from '../components/toast'
import { stockErrorMessage } from './stock-format'
import { ledgerMarkdown } from './stock-ledger-md'

export interface StockLedgerSectionProps {
  ledgerId: string
  /** 持仓页传股票代码 */
  stockCode?: string
  /** 记录页传轮次 id */
  roundId?: string
  /** 这一轮 / 这个持仓的成交；复制台账时一并写进「成交记录」 */
  trades?: StockTradeDto[]
}

interface LedgerForm {
  whyBuy: string
  stopLoss: string
  takeProfit: string
  followedSystem: string
  summary: string
}

const EMPTY_FORM: LedgerForm = {
  whyBuy: '',
  stopLoss: '',
  takeProfit: '',
  followedSystem: '',
  summary: '',
}

function pnlClass(value: string): string {
  if (!value || value === '¥0.00') return ''
  return value.startsWith('¥-') ? 'is-down' : 'is-up'
}

/** 百分比 / 盈亏比的涨跌色：正数红（涨）、负数绿（跌）、零不上色。 */
function levelTone(text: string): string {
  if (text.startsWith('+')) return 'is-up'
  if (text.startsWith('-')) return 'is-down'
  return ''
}

/** 只读台账里贴在价位右边的落差：「9  较买入价 -3.30%」—— 和价格同一行，不另占一行。 */
function PlanDelta({ text, testId }: { text: string | null; testId: string }): JSX.Element | null {
  if (!text) return null
  return (
    <span className="stock-ledger__delta-note" data-testid={testId}>
      <span className="stock-ledger__delta-note-label">较买入价</span>
      <span className={`stock-ledger__delta-note-value ${levelTone(text)}`}>{text}</span>
    </span>
  )
}

/** 弹窗里贴在输入框右端的百分比 —— 边填边算，不另占一行。 */
function DeltaSuffix({ text, id }: { text: string | null; id: string }): JSX.Element | null {
  if (!text) return null
  return (
    <span id={id} data-testid={id} className={`stock-ledger__delta ${levelTone(text)}`}>
      <span className="sr-only">较买入价 </span>
      {text}
    </span>
  )
}

/**
 * 算不出盈亏比时那句话：三种原因各说各的下一步，不拿「填好后自动计算」盖住已经填过的框。
 * 保本 / 移动止损是最常见的 `blocked` —— 止损就在买入价上或之上，没有可亏的空间。
 */
const RATIO_PROMPTS = {
  missing: '填好止损和止盈后自动计算',
  unreadable: '止损和止盈写成价格数字，才能算盈亏比',
  blocked: '止盈高于买入价、止损低于买入价，才有盈亏比',
} as const

function Field({
  label,
  value,
  wide = false,
  mono = false,
  muted = false,
  tone = '',
  aside,
  testId,
}: {
  label: string
  value: string
  wide?: boolean
  mono?: boolean
  muted?: boolean
  tone?: string
  /** 跟在数字右边的那一小段（止损 / 止盈的落差），与价位同一行 */
  aside?: ReactNode
  testId?: string
}): JSX.Element {
  return (
    <div className={`stock-ledger__field${wide ? ' stock-ledger__field--wide' : ''}`}>
      <span className="stock-label">{label}</span>
      <p
        className={`stock-ledger__value${mono ? ' stock-mono' : ''}${muted ? ' stock-ledger__value--muted' : ''}${tone ? ` ${tone}` : ''}`}
        data-testid={testId}
      >
        <span>{value || '—'}</span>
        {aside}
      </p>
    </div>
  )
}

/** 持仓 / 记录共用的一张交易台账：页内只读，弹窗编辑。 */
export function StockLedgerSection({
  ledgerId,
  stockCode,
  roundId,
  trades,
}: StockLedgerSectionProps): JSX.Element {
  const [ledger, setLedger] = useState<StockLedgerDto | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<LedgerForm>(EMPTY_FORM)

  const load = useCallback(async (): Promise<void> => {
    if (!ledgerId || (!stockCode && !roundId)) {
      setLoaded(true)
      return
    }
    try {
      const next = await window.api.invoke('stock_ledger_get', {
        ledger_id: ledgerId,
        stock_code: stockCode ?? null,
        round_id: roundId ?? null,
      })
      setLedger(next)
      setError('')
    } catch (loadError) {
      setError(stockErrorMessage(loadError))
    } finally {
      setLoaded(true)
    }
  }, [ledgerId, roundId, stockCode])

  useEffect(() => {
    setOpen(false)
    setLoaded(false)
    void load()
  }, [load])

  const beginEdit = (): void => {
    if (!ledger) return
    setForm({
      whyBuy: ledger.whyBuy,
      stopLoss: ledger.stopLoss,
      takeProfit: ledger.takeProfit,
      followedSystem: ledger.followedSystem,
      summary: ledger.summary,
    })
    setError('')
    setOpen(true)
  }

  const copyMarkdown = useCallback((): void => {
    const text = ledgerMarkdown(ledger, trades ?? [])
    if (!text) return
    void (async () => {
      try {
        await window.api.invoke('clipboard_write_text', { text })
        notify('台账已复制为 Markdown')
      } catch {
        notify('复制失败', 'error')
      }
    })()
  }, [ledger, trades])

  const save = async (): Promise<void> => {
    const trimmed: LedgerForm = {
      whyBuy: form.whyBuy.trim(),
      stopLoss: form.stopLoss.trim(),
      takeProfit: form.takeProfit.trim(),
      followedSystem: form.followedSystem.trim(),
      summary: form.summary.trim(),
    }
    if (Object.values(trimmed).every((value) => value === '')) {
      setError('台账至少填写一项')
      return
    }
    setBusy(true)
    setError('')
    try {
      const next = await window.api.invoke('stock_ledger_save', {
        ledger_id: ledgerId,
        stock_code: stockCode ?? null,
        round_id: roundId ?? null,
        why_buy: trimmed.whyBuy,
        stop_loss: trimmed.stopLoss,
        take_profit: trimmed.takeProfit,
        followed_system: trimmed.followedSystem,
        summary: trimmed.summary,
      })
      setLedger(next)
      setOpen(false)
      notify('台账已保存')
    } catch (saveError) {
      setError(stockErrorMessage(saveError))
    } finally {
      setBusy(false)
    }
  }

  const closed = ledger?.closed ?? Boolean(roundId)
  // 三个派生数字只在这里算：入库的是用户手写的止损 / 止盈原文，显示时才折成百分比与倍数。
  const levels = planLevelsOf(ledger?.buyPrice ?? '', ledger?.stopLoss ?? '', ledger?.takeProfit ?? '')
  const draftLevels = planLevelsOf(ledger?.buyPrice ?? '', form.stopLoss, form.takeProfit)
  const ratio = draftLevels.riskReward
  const stopLabelId = 'stock-ledger-stop-label'
  const takeLabelId = 'stock-ledger-take-label'
  const stopDeltaId = 'stock-ledger-stop-delta'
  const takeDeltaId = 'stock-ledger-take-delta'

  return (
    <section className="stock-ledger" data-testid="stock-ledger">
      <header className="stock-ledger__head">
        <span className="stock-section-title">交易台账</span>
        <div className="stock-ledger__actions">
          <Button
            variant="text"
            size="sm"
            testId="stock-ledger-copy"
            title="复制整张台账为 Markdown"
            disabled={!ledger?.exists}
            onClick={copyMarkdown}
          >
            复制到剪贴板
          </Button>
          <Button
            variant="secondary"
            size="sm"
            testId="stock-ledger-edit"
            disabled={!loaded}
            onClick={beginEdit}
          >
            {ledger?.exists ? '编辑' : '填写台账'}
          </Button>
        </div>
      </header>

      {error ? (
        <p role="alert" className="m0-error stock-ledger__error" data-testid="stock-ledger-error">
          {error}
        </p>
      ) : null}

      {!loaded ? (
        <p className="stock-ledger__empty">正在读取台账…</p>
      ) : ledger?.exists ? (
        <div className="stock-ledger__sheet">
          <div className="stock-ledger__group">
            <span className="stock-ledger__group-label">买入计划</span>
            <Field label="为什么买" value={ledger.whyBuy} wide />
            <div className="stock-ledger__row stock-ledger__row--plan">
              <Field label="买入价" value={ledger.buyPrice} mono />
              <Field label="买入成本" value={ledger.buyCost} mono />
              <Field
                label="止损"
                value={ledger.stopLoss}
                aside={<PlanDelta text={levels.downside} testId="stock-ledger-plan-stop" />}
              />
              <Field
                label="止盈"
                value={ledger.takeProfit}
                aside={<PlanDelta text={levels.upside} testId="stock-ledger-plan-take" />}
              />
              <Field
                label="盈亏比"
                value={levels.riskReward.kind === 'value' ? levels.riskReward.text : ''}
                mono
                testId="stock-ledger-ratio"
              />
            </div>
          </div>

          <div className="stock-ledger__group">
            <span className="stock-ledger__group-label">清仓结果</span>
            <div className="stock-ledger__row stock-ledger__row--sell">
              <Field
                label="卖出价"
                value={closed ? ledger.sellPrice : '清仓后回填'}
                mono={closed}
                muted={!closed}
              />
              <Field
                label="卖出净额"
                value={closed ? ledger.sellNet : '清仓后回填'}
                mono={closed}
                muted={!closed}
              />
              <Field
                label="净盈亏"
                value={closed ? ledger.netPnl : '清仓后回填'}
                mono={closed}
                muted={!closed}
                tone={closed ? pnlClass(ledger.netPnl) : ''}
              />
            </div>
          </div>

          <div className="stock-ledger__group">
            <span className="stock-ledger__group-label">执行复盘</span>
            <div className="stock-ledger__execution">
              <Field label="是否按系统执行" value={ledger.followedSystem} />
              <Field label="一句话" value={ledger.summary} />
            </div>
          </div>
        </div>
      ) : (
        <p className="stock-ledger__empty">
          还没有台账。把买入理由、止损止盈和一句总结记在这里。
        </p>
      )}

      <Modal
        open={open}
        title={ledger?.exists ? '编辑台账' : '填写台账'}
        width={680}
        centered
        destroyOnHidden
        footer={null}
        onCancel={() => setOpen(false)}
      >
        <div className="stock-modal-form stock-ledger-form" data-testid="stock-ledger-dialog">
          <label>
            <span className="stock-label">为什么买</span>
            <Input.TextArea
              data-testid="stock-ledger-why"
              rows={4}
              maxLength={2000}
              placeholder="当时为什么决定买这一轮"
              value={form.whyBuy}
              onChange={(event) => {
                setForm((current) => ({ ...current, whyBuy: event.target.value }))
                setError('')
              }}
            />
          </label>

          <div className="stock-modal-grid">
            <label>
              <span className="stock-label">买入价</span>
              <Input
                className="stock-ledger__computed"
                data-testid="stock-ledger-buy-price"
                readOnly
                value={ledger?.buyPrice ?? ''}
                placeholder="按成交自动计算"
              />
            </label>
            <label>
              <span className="stock-label">买入成本</span>
              <Input
                className="stock-ledger__computed"
                data-testid="stock-ledger-buy-cost"
                readOnly
                value={ledger?.buyCost ?? ''}
                placeholder="按成交自动计算"
              />
            </label>
            <label>
              <span className="stock-label" id={stopLabelId}>
                止损
              </span>
              <Input
                data-testid="stock-ledger-stop"
                maxLength={200}
                placeholder="例如：9.00"
                aria-labelledby={stopLabelId}
                aria-describedby={draftLevels.downside ? stopDeltaId : undefined}
                suffix={<DeltaSuffix text={draftLevels.downside} id={stopDeltaId} />}
                value={form.stopLoss}
                onChange={(event) =>
                  setForm((current) => ({ ...current, stopLoss: event.target.value }))
                }
              />
            </label>
            <label>
              <span className="stock-label" id={takeLabelId}>
                止盈
              </span>
              <Input
                data-testid="stock-ledger-take"
                maxLength={200}
                placeholder="例如：12.00"
                aria-labelledby={takeLabelId}
                aria-describedby={draftLevels.upside ? takeDeltaId : undefined}
                suffix={<DeltaSuffix text={draftLevels.upside} id={takeDeltaId} />}
                value={form.takeProfit}
                onChange={(event) =>
                  setForm((current) => ({ ...current, takeProfit: event.target.value }))
                }
              />
            </label>
            <div className="stock-ledger-form__ratio" data-testid="stock-ledger-form-ratio">
              <span className="stock-ledger-form__ratio-label">盈亏比</span>
              {ratio.kind === 'value' ? (
                <span className="stock-ledger-form__ratio-value">{ratio.text}</span>
              ) : (
                <span className="stock-ledger-form__ratio-empty">{RATIO_PROMPTS[ratio.kind]}</span>
              )}
            </div>
            <label>
              <span className="stock-label">卖出价</span>
              <Input
                className="stock-ledger__computed"
                data-testid="stock-ledger-sell-price"
                readOnly
                aria-disabled={!closed}
                value={closed ? ledger?.sellPrice ?? '' : ''}
                placeholder={closed ? '按成交自动计算' : '清仓后回填'}
              />
            </label>
            <label>
              <span className="stock-label">卖出净额</span>
              <Input
                className="stock-ledger__computed"
                data-testid="stock-ledger-sell-net"
                readOnly
                aria-disabled={!closed}
                value={closed ? ledger?.sellNet ?? '' : ''}
                placeholder={closed ? '按成交自动计算' : '清仓后回填'}
              />
            </label>
            <label>
              <span className="stock-label">净盈亏</span>
              <Input
                className={`stock-ledger__computed ${closed ? pnlClass(ledger?.netPnl ?? '') : ''}`}
                data-testid="stock-ledger-pnl"
                readOnly
                aria-disabled={!closed}
                value={closed ? ledger?.netPnl ?? '' : ''}
                placeholder={closed ? '按成交自动计算' : '清仓后回填'}
              />
            </label>
          </div>

            <label>
              <span className="stock-label">是否按系统执行</span>
              <Input
                data-testid="stock-ledger-followed"
                maxLength={200}
                placeholder="例如：是 / 否 / 部分"
                value={form.followedSystem}
                onChange={(event) =>
                  setForm((current) => ({ ...current, followedSystem: event.target.value }))
                }
              />
            </label>
          <label>
            <span className="stock-label">一句话</span>
            <Input
              data-testid="stock-ledger-summary"
              maxLength={2000}
              placeholder="一句话总结这一轮"
              value={form.summary}
              onChange={(event) =>
                setForm((current) => ({ ...current, summary: event.target.value }))
              }
            />
          </label>

          {error ? (
            <p role="alert" className="stock-modal-error" data-testid="stock-ledger-form-error">
              {error}
            </p>
          ) : null}
          <div className="stock-modal-actions">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              testId="stock-ledger-save"
              loading={busy}
              onClick={() => void save()}
            >
              保存
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  )
}
