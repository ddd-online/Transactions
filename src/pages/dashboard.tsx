import { useEffect, useState, type JSX } from 'react'

import { centsToYuan } from '../../shared/domain/money'
import type { AccountingOverviewDto } from '../../shared/types/accounting'

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

export interface DashboardPageProps {
  ledgerId: string
  refreshToken?: number
}

/** 记账 · 看板：一期的收支卡 + 支出构成。 */
export function DashboardPage({ ledgerId, refreshToken = 0 }: DashboardPageProps): JSX.Element {
  const [periodKind, setPeriodKind] = useState('month')
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
          periodKey: '',
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
  }, [ledgerId, periodKind, refreshToken])

  const maxAmount = Math.max(1, ...(data?.categories.map((item) => item.amount) ?? [0]))

  return (
    <section className="m0-card m0-card--wide">
      <div className="m0-card-head">
        <h2>记账 · 看板</h2>
        <div className="m0-actions m0-period">
          <button
            type="button"
            className={periodKind === 'month' ? 'm0-primary' : 'm0-link'}
            data-testid="period-month"
            onClick={() => setPeriodKind('month')}
          >
            本月
          </button>
          <button
            type="button"
            className={periodKind === 'year' ? 'm0-primary' : 'm0-link'}
            data-testid="period-year"
            onClick={() => setPeriodKind('year')}
          >
            今年
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

      <div className="m0-stats">
        <div className="m0-stat">
          <span className="m0-muted">支出</span>
          <strong data-testid="stat-expense">{money(data?.cards.expense ?? null)}</strong>
        </div>
        <div className="m0-stat">
          <span className="m0-muted">收入</span>
          <strong data-testid="stat-income">{money(data?.cards.income ?? null)}</strong>
        </div>
        <div className="m0-stat">
          <span className="m0-muted">结余</span>
          <strong data-testid="stat-balance">{money(data?.cards.balance ?? null)}</strong>
        </div>
      </div>

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
          {ledgerId ? '这一期还没有支出' : '请先创建/选择账本'}
        </p>
      )}
    </section>
  )
}
