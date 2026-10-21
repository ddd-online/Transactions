import { useEffect, useState, type JSX } from 'react'

import { centsToYuan } from '../../shared/domain/money'
import type { AccountingOverviewDto } from '../../shared/types/accounting'
import { Segmented } from '../components/segmented'
import { DatePicker } from '../components/date-picker'
import { Icon } from '../components/icon'
import { todayYmd } from '../../shared/domain/time'

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'msg' in error) {
    return String((error as { msg: unknown }).msg)
  }
  if (error instanceof Error) return error.message
  return String(error)
}

function money(value: number | null): string {
  return value === null ? '—' : `¥${centsToYuan(value)}`
}


function shiftAnchor(anchor: string, kind: string, delta: number): string {
  const [year, month, day] = anchor.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  if (kind === 'year') date.setFullYear(date.getFullYear() + delta)
  else date.setMonth(date.getMonth() + delta)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export interface DashboardPageProps {
  ledgerId: string
  refreshToken?: number
}

/** 记账 · 看板：一期的收支卡 + 支出构成。 */
export function DashboardPage({ ledgerId, refreshToken = 0 }: DashboardPageProps): JSX.Element {
  const [periodKind, setPeriodKind] = useState('month')
  const [anchor, setAnchor] = useState(todayYmd())
  const [data, setData] = useState<AccountingOverviewDto | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    if (!ledgerId) {
      setData(null)
      return
    }
    void (async () => {
      try {
        const overview = await window.api.invoke('accounting_overview', {
          ledgerId,
          periodKind,
          periodKey: anchor,
        })
        if (alive) {
          setData(overview)
          setError('')
        }
      } catch (loadError) {
        if (alive) setError(errorMessage(loadError))
      }
    })()
    return () => {
      alive = false
    }
  }, [anchor, ledgerId, periodKind, refreshToken])

  const maxAmount = Math.max(1, ...(data?.categories.map((item) => item.amount) ?? [0]))

  return (
    <>
      <div className="page-toolbar">
        <div className="m0-actions">
          <Segmented
            testId="dashboard-period"
            value={periodKind}
            onChange={(value) => setPeriodKind(value)}
            options={[
              { value: 'month', label: '月' },
              { value: 'year', label: '年' },
            ]}
          />
          <button
            type="button"
            className="ui-btn ui-btn--text"
            onClick={() => setAnchor((value) => shiftAnchor(value, periodKind, -1))}
          >
            <Icon name="Left" size={14} />
          </button>
          <DatePicker testId="dashboard-date" value={anchor} onChange={(value) => setAnchor(value)} />
          <button
            type="button"
            className="ui-btn ui-btn--text"
            onClick={() => setAnchor((value) => shiftAnchor(value, periodKind, 1))}
          >
            <Icon name="Right" size={14} />
          </button>
          <span className="m0-muted" data-testid="period-label">
            {data?.period.label ?? ''}
          </span>
        </div>
      </div>

      {error ? (
        <p className="m0-error" data-testid="dashboard-error">
          {error}
        </p>
      ) : null}

      <div className="dashboard-grid">
        <section className="dashboard-card">
          <h3>收支</h3>
          <div className="dashboard-row">
            <span className="m0-muted">支出</span>
            <strong data-testid="stat-expense">{money(data?.cards.expense ?? null)}</strong>
          </div>
          <div className="dashboard-row">
            <span className="m0-muted">收入</span>
            <strong data-testid="stat-income">{money(data?.cards.income ?? null)}</strong>
          </div>
          <div className="dashboard-row">
            <span className="m0-muted">结余</span>
            <strong data-testid="stat-balance">{money(data?.cards.balance ?? null)}</strong>
          </div>
        </section>

        <section className="dashboard-card">
          <h3>支出构成</h3>
          {data && data.categories.length > 0 ? (
            <ul className="m0-slices" data-testid="dashboard-slices">
              {data.categories.map((item) => (
                <li key={`${item.label}-${item.isOther ? 'other' : 'cat'}`} className="m0-slice">
                  <span className="m0-slice-label">{item.label}</span>
                  <span className="m0-slice-bar">
                    <span
                      className="m0-slice-fill"
                      style={{ width: `${Math.max(4, (item.amount / maxAmount) * 100)}%` }}
                    />
                  </span>
                  <span className="m0-slice-amount">
                    ¥{centsToYuan(item.amount)} · {item.count} 笔
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m0-muted" data-testid="dashboard-empty">
              {ledgerId ? '本期没有支出' : '请先创建/选择账本'}
            </p>
          )}
        </section>
      </div>
    </>
  )
}
