import { useEffect, useMemo, useRef, useState, type JSX } from 'react'

import {
  daysInMonth,
  mondayOffset,
  padded,
  parseYmd,
  weekdayCn,
} from '../../shared/domain/calendar'

export interface DatePickerProps {
  value: string
  onChange: (value: string) => void
  testId?: string
  disabled?: boolean
  className?: string
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

/** 旧版日历风格的日期输入：可直接输入 YYYY-MM-DD，也可点开日历选择。 */
export function DatePicker({
  value,
  onChange,
  testId,
  disabled = false,
  className = 'm0-input',
}: DatePickerProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(() => value.slice(0, 7))

  useEffect(() => {
    if (parseYmd(value)) setMonth(value.slice(0, 7))
  }, [value])

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const parsedMonth = parseYmd(`${month}-01`)
  const year = parsedMonth?.year ?? new Date().getFullYear()
  const monthNumber = parsedMonth?.month ?? new Date().getMonth() + 1
  const offset = mondayOffset(year, monthNumber)
  const total = daysInMonth(year, monthNumber)
  const today = new Date()
  const todayKey = `${today.getFullYear()}-${padded({ year: today.getFullYear(), month: today.getMonth() + 1, day: today.getDate() })}`

  const cells = useMemo(() => {
    const result: Array<string | null> = []
    for (let index = 0; index < offset; index += 1) result.push(null)
    for (let day = 1; day <= total; day += 1) {
      result.push(padded({ year, month: monthNumber, day }))
    }
    return result
  }, [monthNumber, offset, total, year])

  const shiftMonth = (delta: number): void => {
    const next = new Date(year, monthNumber - 1 + delta, 1)
    setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`)
  }

  return (
    <div className="date-picker" ref={rootRef}>
      <input
        className={className}
        data-testid={testId}
        value={value}
        disabled={disabled}
        placeholder="YYYY-MM-DD"
        inputMode="numeric"
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setOpen(true)}
      />
      <button
        type="button"
        className="date-picker-toggle"
        data-testid={testId ? `${testId}-toggle` : undefined}
        disabled={disabled}
        title="选择日期"
        onClick={() => setOpen((current) => !current)}
      >
        ▦
      </button>
      {open ? (
        <div className="date-picker-popover" role="dialog" aria-label="选择日期">
          <div className="date-picker-head">
            <button type="button" className="ui-btn ui-btn--text" onClick={() => shiftMonth(-1)}>
              ‹
            </button>
            <strong>
              {year} 年 {monthNumber} 月
            </strong>
            <button type="button" className="ui-btn ui-btn--text" onClick={() => shiftMonth(1)}>
              ›
            </button>
          </div>
          <div className="date-picker-week">
            {WEEKDAYS.map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>
          <div className="date-picker-grid">
            {cells.map((cell, index) =>
              cell ? (
                <button
                  key={cell}
                  type="button"
                  data-testid={`date-picker-day-${cell}`}
                  className={`date-picker-day${cell === value ? ' is-active' : ''}${
                    cell === todayKey ? ' is-today' : ''
                  }`}
                  title={weekdayCn(cell)}
                  onClick={() => {
                    onChange(cell)
                    setOpen(false)
                  }}
                >
                  {Number(cell.slice(8))}
                </button>
              ) : (
                <span key={`blank-${index}`} />
              ),
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

