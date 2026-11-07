import { centsToYuan, milliToYuan } from '../../shared/domain/money'
import { formatTimestamp } from '../../shared/domain/time'

/** 与外壳、设置页共用同一句「把 IPC 失败翻成话」的实现（`shared/errors.errorMessage`）。 */
export { errorMessage as stockErrorMessage } from '../../shared/errors'

export function stockMoney(cents: number): string {
  return `¥${centsToYuan(cents)}`
}

/** 带符号的金额：`+¥120.00` / `-¥35.50`（资金变动那一列用）。 */
export function stockSignedMoney(cents: number): string {
  return `${cents >= 0 ? '+' : '-'}¥${centsToYuan(Math.abs(cents))}`
}

/**
 * 一轮的成交费用合计：只算真正成交的行（`shares > 0`），费用恒为整数分、加完再格式化。
 *
 * 记录页的轮次头与持仓详情的「费用合计」读同一条规则 —— 前者按可见成交过滤、
 * 后者拿到的本来就是过滤过的那批，写在一处才不会有一天两处对不上。
 */
export function stockRoundFee(trades: ReadonlyArray<{ shares: number; fee: number }>): number {
  return trades.filter((trade) => trade.shares > 0).reduce((total, trade) => total + trade.fee, 0)
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
