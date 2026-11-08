import { useCallback, useEffect, useState, type JSX } from 'react'

import { planLevelsOf } from '../../shared/domain/plan-levels'
import type { StockLedgerDto } from '../../shared/types/stock-ledger'
import type { StockTradeDto } from '../../shared/types/stock-history'
import { Button } from '../components/button'
import { notify } from '../components/toast'
import { stockErrorMessage } from './stock-format'
import {
  EMPTY_FORM,
  StockLedgerForm,
  normalizeLedgerForm,
  type LedgerForm,
} from './stock-ledger-form'
import { ledgerMarkdown } from './stock-ledger-md'
import { StockLedgerRead } from './stock-ledger-read'

export interface StockLedgerSectionProps {
  ledgerId: string
  /** 持仓页传股票代码 */
  stockCode?: string
  /** 记录页传轮次 id */
  roundId?: string
  /** 这一轮 / 这个持仓的成交；复制台账时一并写进「成交记录」 */
  trades?: StockTradeDto[]
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
    const trimmed = normalizeLedgerForm(form)
    if (!trimmed) {
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

      <StockLedgerRead ledger={ledger} loaded={loaded} closed={closed} levels={levels} />

      <StockLedgerForm
        open={open}
        ledger={ledger}
        closed={closed}
        form={form}
        error={error}
        busy={busy}
        onChange={setForm}
        onClearError={() => setError('')}
        onSave={() => void save()}
        onClose={() => setOpen(false)}
      />
    </section>
  )
}
