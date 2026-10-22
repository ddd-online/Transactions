import { useEffect, useMemo, useRef, useState, type JSX } from 'react'

import {
  addDays,
  addMonths,
  mondayOffset,
  monthSpan,
  normalizeRange,
  parseYmd,
  parseYearMonth,
  shiftPeriod,
  weekBounds,
  yearSpan,
} from '../../shared/domain/calendar'
import { todayYmd } from '../../shared/domain/time'

import { Icon } from './icon'
import { Segmented } from './segmented'

export type TimeRangeMode = 'date' | 'month' | 'year'

export interface TimeRangePickerProps {
  testId: string
  mode: TimeRangeMode
  start: string
  end: string
  onModeChange: (mode: TimeRangeMode) => void
  onRangeChange: (start: string, end: string) => void
}

interface Preset {
  label: string
  from: string
  to: string
}

interface VisibleMonth {
  year: number
  month: number
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function rangeText(start: string, end: string, mode: TimeRangeMode): string {
  if (!start) return '请选择时间范围'
  const label = (ymd: string): string => {
    if (mode === 'date') return ymd
    const parsed = parseYearMonth(ymd)
    if (!parsed) return ymd
    return mode === 'month' ? `${parsed[0]}-${pad2(parsed[1])}` : String(parsed[0])
  }
  const from = label(start)
  if (!end) return `${from} ~`
  const to = label(end)
  return from === to ? from : `${from} ~ ${to}`
}

function presetRanges(mode: TimeRangeMode): Preset[] {
  const today = todayYmd()
  const parsed = parseYearMonth(today)
  if (!parsed) return []
  const [year, month] = parsed
  const monthAgo = (back: number): [string, string] => {
    const [targetYear, targetMonth] = addMonths(year, month, -back)
    return monthSpan(targetYear, targetMonth)
  }

  if (mode === 'month') {
    return [
      { label: '本月', ...toPreset(monthSpan(year, month)) },
      { label: '上月', ...toPreset(monthAgo(1)) },
      { label: '近 6 个月', from: monthAgo(5)[0], to: monthSpan(year, month)[1] },
      { label: '今年', ...toPreset(yearSpan(year)) },
    ]
  }
  if (mode === 'year') {
    return [
      { label: '今年', ...toPreset(yearSpan(year)) },
      { label: '去年', ...toPreset(yearSpan(year - 1)) },
    ]
  }
  const presets: Preset[] = [{ label: '今天', from: today, to: today }]
  const weekAgo = addDays(today, -6)
  if (weekAgo) presets.push({ label: '近 7 天', from: weekAgo, to: today })
  const week = weekBounds(today)
  if (week) presets.push({ label: '本周', from: week[0], to: week[1] })
  const monthRange = monthSpan(year, month)
  presets.push({ label: '本月', from: monthRange[0], to: monthRange[1] })
  const lastMonth = monthAgo(1)
  presets.push({ label: '上月', from: lastMonth[0], to: lastMonth[1] })
  return presets
}

function toPreset(range: [string, string]): { from: string; to: string } {
  return { from: range[0], to: range[1] }
}

function fromStart(start: string): VisibleMonth {
  const parsed = parseYearMonth(start)
  if (parsed) return { year: parsed[0], month: parsed[1] }
  const today = parseYmd(todayYmd())
  return { year: today?.year ?? 1970, month: today?.month ?? 1 }
}

/** 共享时间范围选择器：粒度 + 区间 + 前后周期 + 快捷区间。 */
export function TimeRangePicker({
  testId,
  mode,
  start,
  end,
  onModeChange,
  onRangeChange,
}: TimeRangePickerProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [visible, setVisible] = useState<VisibleMonth>(() => fromStart(start))
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setVisible(fromStart(start))
  }, [open, start])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const presets = useMemo(() => presetRanges(mode), [mode, start, end])

  const changeMode = (next: string): void => {
    const nextMode = next as TimeRangeMode
    if (!start) {
      onModeChange(nextMode)
      return
    }
    if (!end) {
      const [normalized] = normalizeRange(start, start, nextMode)
      onRangeChange(normalized, '')
    } else {
      const [from, to] = normalizeRange(start, end, nextMode)
      onRangeChange(from, to)
    }
    onModeChange(nextMode)
  }

  const shift = (direction: number): void => {
    const [from, to] = shiftPeriod(start, end, mode, direction)
    onRangeChange(from, to)
  }

  const applyPreset = (preset: Preset): void => {
    const [from, to] = normalizeRange(preset.from, preset.to, mode)
    onRangeChange(from, to)
  }

  const pickPeriod = (from: string, to: string): void => {
    if (!start || end) {
      onRangeChange(from, '')
    } else if (from < start) {
      onRangeChange(from, start)
    } else {
      onRangeChange(start, to)
    }
  }

  const pickDay = (ymd: string): void => {
    const picked = parseYmd(ymd)
    if (picked && (picked.year !== visible.year || picked.month !== visible.month)) {
      setVisible({ year: picked.year, month: picked.month })
    }
    pickPeriod(ymd, ymd)
  }

  const shiftMonth = (delta: number): void => {
    setVisible((current) => {
      const [year, month] = addMonths(current.year, current.month, delta)
      return { year, month }
    })
  }

  const shiftYear = (delta: number): void => {
    setVisible((current) => ({ ...current, year: current.year + delta }))
  }

  const shiftDecade = (delta: number): void => {
    setVisible((current) => ({ ...current, year: current.year + delta * 10 }))
  }

  const monthDays = (): string[] => {
    const first = monthSpan(visible.year, visible.month)[0]
    const gridStart = addDays(first, -mondayOffset(visible.year, visible.month)) ?? first
    return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index) ?? '')
  }

  return (
    <div className="ui-time" data-testid={testId} ref={rootRef}>
      <Segmented
        testId={`${testId}-mode`}
        value={mode}
        onChange={changeMode}
        options={[
          { value: 'date', label: '日' },
          { value: 'month', label: '月' },
          { value: 'year', label: '年' },
        ]}
      />
      <button
        type="button"
        className="tr-icon-btn"
        aria-label="上一周期"
        onClick={() => shift(-1)}
      >
        <Icon name="Left" size={14} />
      </button>

      <div className={`ui-time__field${open ? ' is-open' : ''}`}>
        <button
          type="button"
          className="ui-time__trigger"
          data-testid={`${testId}-trigger`}
          onClick={() => setOpen((current) => !current)}
        >
          <Icon name="ClockCircle" size={16} />
          <span className="ui-time__value">{rangeText(start, end, mode)}</span>
        </button>

        {open ? (
          <>
            <div className="ui-time__panel" data-testid={`${testId}-panel`}>
              {mode === 'date' ? (
                <>
                  <div className="ui-time__panel-head">
                    <button
                      type="button"
                      className="tr-icon-btn"
                      aria-label="上个月"
                      onClick={() => shiftMonth(-1)}
                    >
                      <Icon name="Left" size={14} />
                    </button>
                    <span className="ui-time__panel-title">
                      {visible.year}年{visible.month}月
                    </span>
                    <button
                      type="button"
                      className="tr-icon-btn"
                      aria-label="下个月"
                      onClick={() => shiftMonth(1)}
                    >
                      <Icon name="Right" size={14} />
                    </button>
                  </div>
                  <div className="ui-time__cal-weekdays">
                    {WEEKDAYS.map((label) => (
                      <span key={label}>{label}</span>
                    ))}
                  </div>
                  <div className="ui-time__cal-grid">
                    {monthDays().map((ymd, index) => {
                      const parsed = parseYmd(ymd)
                      const outside =
                        !parsed || parsed.year !== visible.year || parsed.month !== visible.month
                      const selectedStart = Boolean(start) && ymd === start
                      const selectedEnd = Boolean(end) && ymd === end
                      const inRange = Boolean(start && end && ymd > start && ymd < end)
                      const isToday = ymd === todayYmd()
                      return (
                        <button
                          key={`${ymd}-${index}`}
                          type="button"
                          data-testid={`${testId}-day-${ymd}`}
                          className={`ui-time__cal-cell${outside ? ' is-outside' : ''}${isToday ? ' is-today' : ''}${selectedStart || selectedEnd ? ' is-start' : ''}${inRange ? ' is-in-range' : ''}`}
                          title={ymd}
                          onClick={() => pickDay(ymd)}
                        >
                          {parsed?.day ?? ''}
                        </button>
                      )
                    })}
                  </div>
                </>
              ) : mode === 'month' ? (
                <>
                  <div className="ui-time__panel-head">
                    <button
                      type="button"
                      className="tr-icon-btn"
                      aria-label="上一年"
                      onClick={() => shiftYear(-1)}
                    >
                      <Icon name="Left" size={14} />
                    </button>
                    <span className="ui-time__panel-title">{visible.year} 年</span>
                    <button
                      type="button"
                      className="tr-icon-btn"
                      aria-label="下一年"
                      onClick={() => shiftYear(1)}
                    >
                      <Icon name="Right" size={14} />
                    </button>
                  </div>
                  <div className="ui-time__grid ui-time__grid--month">
                    {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => {
                      const [from, to] = monthSpan(visible.year, month)
                      const isStart = Boolean(start) && start === from
                      const isEnd = Boolean(end) && end === to
                      const inRange = Boolean(start && end && from > start && to < end)
                      return (
                        <button
                          key={month}
                          type="button"
                          data-testid={`${testId}-month-${visible.year}-${pad2(month)}`}
                          className={`ui-time__cell${isStart || isEnd ? ' is-start' : ''}${inRange ? ' is-in-range' : ''}`}
                          onClick={() => pickPeriod(from, to)}
                        >
                          {month} 月
                        </button>
                      )
                    })}
                  </div>
                </>
              ) : (
                <>
                  <div className="ui-time__panel-head">
                    <button
                      type="button"
                      className="tr-icon-btn"
                      aria-label="上一个十年"
                      onClick={() => shiftDecade(-1)}
                    >
                      <Icon name="Left" size={14} />
                    </button>
                    <span className="ui-time__panel-title">
                      {Math.floor(visible.year / 10) * 10} – {Math.floor(visible.year / 10) * 10 + 9}
                    </span>
                    <button
                      type="button"
                      className="tr-icon-btn"
                      aria-label="下一个十年"
                      onClick={() => shiftDecade(1)}
                    >
                      <Icon name="Right" size={14} />
                    </button>
                  </div>
                  <div className="ui-time__grid ui-time__grid--year">
                    {Array.from(
                      { length: 10 },
                      (_, index) => Math.floor(visible.year / 10) * 10 + index,
                    ).map((year) => {
                      const [from, to] = yearSpan(year)
                      const isStart = Boolean(start) && start === from
                      const isEnd = Boolean(end) && end === to
                      const inRange = Boolean(start && end && from > start && to < end)
                      return (
                        <button
                          key={year}
                          type="button"
                          data-testid={`${testId}-year-${year}`}
                          className={`ui-time__cell${isStart || isEnd ? ' is-start' : ''}${inRange ? ' is-in-range' : ''}`}
                          onClick={() => pickPeriod(from, to)}
                        >
                          {year} 年
                        </button>
                      )
                    })}
                  </div>
                </>
              )}

              <div className="ui-time__presets">
                {presets.map((preset) => {
                  const active = start === preset.from && end === preset.to
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      className={`ui-time__preset${active ? ' is-active' : ''}`}
                      data-testid={`${testId}-preset-${preset.label}`}
                      onClick={() => applyPreset(preset)}
                    >
                      {preset.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        ) : null}
      </div>

      <button
        type="button"
        className="tr-icon-btn"
        aria-label="下一周期"
        onClick={() => shift(1)}
      >
        <Icon name="Right" size={14} />
      </button>
    </div>
  )
}
