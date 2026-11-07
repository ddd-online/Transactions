import { centsToYuan, milliToYuan } from '../../shared/domain/money'
import { formatTimestamp } from '../../shared/domain/time'

/** 与外壳、设置页共用同一句「把 IPC 失败翻成话」的实现（`shared/errors.errorMessage`）。 */
export { errorMessage as stockErrorMessage } from '../../shared/errors'

export function stockMoney(cents: number): string {
  return `¥${centsToYuan(cents)}`
}

export function stockPrice(milli: number | undefined): string {
  return milli === undefined ? '—' : milliToYuan(milli)
}

export function stockPercent(value: number, digits = 2): string {
  return `${value.toFixed(digits)}%`
}

export function stockDate(seconds: number): string {
  return formatTimestamp(seconds, 'YYYY-MM-DD')
}

export function stockDateTime(seconds: number): string {
  return formatTimestamp(seconds, 'YYYY-MM-DD HH:mm')
}

export function stockPnlClass(value: number): string {
  if (value > 0) return 'is-up'
  if (value < 0) return 'is-down'
  return ''
}

export function stockRoundRate(
  latest: number | undefined,
  prevClose: number | undefined,
): { change: string; percent: string; up: boolean } {
  if (latest === undefined || prevClose === undefined || prevClose === 0) {
    return { change: '—', percent: '—', up: true }
  }
  const changeMilli = latest - prevClose
  const percent = (changeMilli / prevClose) * 100
  return {
    change: `${changeMilli >= 0 ? '+' : ''}${milliToYuan(changeMilli)}`,
    percent: `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`,
    up: changeMilli >= 0,
  }
}

export function stockTradeTypeLabel(type: string): string {
  return (
    {
      open: '建仓',
      add: '加仓',
      reduce: '减仓',
      close: '清仓',
    }[type] ?? type
  )
}
