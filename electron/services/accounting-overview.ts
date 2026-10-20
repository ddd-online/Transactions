import type { Db } from '../db/driver'
import {
  queryStatistics,
  sumExpenseByCategory,
} from '../db/dao/transaction-record'
import type {
  AccountingOverviewDto,
  AccountingOverviewRequest,
  OverviewPeriodDto,
  OverviewSliceDto,
} from '../../shared/types/accounting'

/**
 * 记账 · 看板：把「一期」的结论一次算完。
 *
 * 口径：支出 = 全部 expense 合计；收入 = income 合计；结余 = 收入 − 支出（与卡片同一期）；
 * 转账不参与。构成是支出的下钻，金额降序取前 8 项，其余并成「其他」。
 */

const TOP_SLICES = 8
const OTHER_LABEL = '其他'

interface Period {
  kind: 'month' | 'year'
  year: number
  key: string
  label: string
  isCurrent: boolean
  throughDay: number | null
  start: number
  end: number
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function localStart(year: number, month: number, day: number): number {
  return Math.trunc(new Date(year, month - 1, day, 0, 0, 0).getTime() / 1000)
}

function localEnd(year: number, month: number, day: number): number {
  return Math.trunc(new Date(year, month - 1, day, 23, 59, 59).getTime() / 1000)
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function parseMonthKey(key: string): { year: number; month: number } | null {
  const match = /^(\d+)-(\d+)$/.exec(key)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (!Number.isInteger(year) || !Number.isInteger(month)) return null
  if (month < 1 || month > 12) return null
  return { year, month }
}

function parseYearKey(key: string): number | null {
  const year = Number(key)
  return Number.isInteger(year) && year > 0 ? year : null
}

function resolvePeriod(request: AccountingOverviewRequest, today = new Date()): Period {
  const kind = request.periodKind === 'year' ? 'year' : 'month'
  const todayYear = today.getFullYear()
  const todayMonth = today.getMonth() + 1
  const todayDay = today.getDate()

  if (kind === 'year') {
    const year = parseYearKey(request.periodKey) ?? todayYear
    const isCurrent = year === todayYear
    return {
      kind,
      year,
      key: String(year),
      label: `${year}年`,
      isCurrent,
      throughDay: null,
      start: localStart(year, 1, 1),
      end: isCurrent ? localEnd(todayYear, todayMonth, todayDay) : localEnd(year, 12, 31),
    }
  }

  const key = parseMonthKey(request.periodKey)
  const year = key?.year ?? todayYear
  const month = key?.month ?? todayMonth
  const isCurrent = year === todayYear && month === todayMonth
  const lastDay = isCurrent ? todayDay : daysInMonth(year, month)
  return {
    kind,
    year,
    key: `${year}-${pad2(month)}`,
    label: `${year}年${month}月`,
    isCurrent,
    throughDay: isCurrent ? todayDay : null,
    start: localStart(year, month, 1),
    end: localEnd(year, month, lastDay),
  }
}

function slices(
  rows: Array<{ category: string; amountCents: number; count: number }>,
): OverviewSliceDto[] {
  const mapped = rows.map((row) => ({
    label: row.category,
    amount: row.amountCents,
    count: row.count,
  }))
  if (mapped.length <= TOP_SLICES) {
    return mapped.map((row) => ({ ...row, isOther: false }))
  }
  const out = mapped.slice(0, TOP_SLICES).map((row) => ({ ...row, isOther: false }))
  const rest = mapped.slice(TOP_SLICES)
  out.push({
    label: OTHER_LABEL,
    amount: rest.reduce((sum, row) => sum + row.amount, 0),
    count: rest.reduce((sum, row) => sum + row.count, 0),
    isOther: true,
  })
  return out
}

export function accountingOverview(
  db: Db,
  request: AccountingOverviewRequest,
): AccountingOverviewDto {
  const period = resolvePeriod(request)
  const range = [period.start, period.end]
  const stats = queryStatistics(db, request.ledgerId, range)
  const empty = stats.income === 0 && stats.expense === 0 && stats.transfer === 0

  const periodDto: OverviewPeriodDto = {
    kind: period.kind,
    key: period.key,
    label: period.label,
    isCurrent: period.isCurrent,
    throughDay: period.throughDay,
    year: period.year,
  }

  return {
    period: periodDto,
    cards: empty
      ? { expense: null, income: null, balance: null }
      : {
          expense: stats.expense,
          income: stats.income,
          balance: stats.income - stats.expense,
        },
    categories: slices(sumExpenseByCategory(db, request.ledgerId, range)),
  }
}
