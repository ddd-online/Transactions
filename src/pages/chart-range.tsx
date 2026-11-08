import { type JSX } from 'react'

import { parseYearMonth, yearSpan } from '../../shared/domain/calendar'
import { todayYmd } from '../../shared/domain/time'
import { TimeRangePicker } from '../components/time-range-picker'
import { useSessionTimeRange, type SessionTimeRange } from '../state/time-range-session'

/**
 * 分析页默认看本年、按月铺开（`2026-01 ~ 2026-12`），记录页仍默认今天。
 *
 * 以前默认是「最近 12 个月」的滚动窗口，打开时永远不知道自己看的是哪一年；
 * 本年的两端是固定的，换月翻页也有明确的起点。
 */
export function defaultChartRange(): SessionTimeRange {
  const today = todayYmd()
  const parsed = parseYearMonth(today)
  if (!parsed) return { mode: 'month', start: today, end: today }
  const [start, end] = yearSpan(parsed[0])
  return { mode: 'month', start, end }
}

/** 分析页的时间范围：本次运行内跨页记住，默认看本年按月。 */
export function useChartRange(): [
  SessionTimeRange,
  (patch: Partial<SessionTimeRange>) => void,
] {
  return useSessionTimeRange('charts', defaultChartRange)
}

export interface ChartRangePickerProps {
  range: SessionTimeRange
  onChange: (patch: Partial<SessionTimeRange>) => void
}

/** 分析页工具栏里的范围选择：把共享选择器接到会话范围状态上。 */
export function ChartRangePicker({ range, onChange }: ChartRangePickerProps): JSX.Element {
  return (
    <TimeRangePicker
      testId="chart-time"
      mode={range.mode}
      start={range.start}
      end={range.end}
      onModeChange={(mode) => onChange({ mode })}
      onRangeChange={(start, end) => onChange({ start, end })}
    />
  )
}
