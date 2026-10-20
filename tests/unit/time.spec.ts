import { describe, expect, it } from 'vitest'

import { formatTimestamp, rangeToSeconds, todayYmd, ymdToSeconds } from '../../shared/domain/time'

describe('formatTimestamp', () => {
  it('formats all placeholders in local time', () => {
    const date = new Date(2026, 5, 19, 13, 4, 5)
    const timestamp = Math.trunc(date.getTime() / 1000)
    expect(formatTimestamp(timestamp, 'YYYY-MM-DD')).toBe('2026-06-19')
    expect(formatTimestamp(timestamp, 'MM-DD')).toBe('06-19')
    expect(formatTimestamp(timestamp, 'HH:mm:ss')).toBe('13:04:05')
    expect(formatTimestamp(timestamp, 'YYYY/MM/DD HH:mm')).toBe('2026/06/19 13:04')
    expect(formatTimestamp(timestamp, '')).toBe('2026-06-19')
  })

  it('does not re-hit shorter placeholders inside longer ones', () => {
    const date = new Date(2026, 0, 2, 3, 4, 5)
    const timestamp = Math.trunc(date.getTime() / 1000)
    expect(formatTimestamp(timestamp, 'YYYYYY')).toBe('2026YY')
  })
})

describe('ymd conversions', () => {
  it('parses a date to local midnight seconds', () => {
    expect(ymdToSeconds('2026-06-19')).toBe(
      Math.trunc(new Date(2026, 5, 19).getTime() / 1000),
    )
    expect(ymdToSeconds('nope')).toBeNull()
  })

  it('builds a closed range ending at 23:59:59', () => {
    const range = rangeToSeconds('2026-06-01', '2026-06-02')
    expect(range).not.toBeNull()
    const [start, end] = range as [number, number]
    expect(end - start).toBe(86_400 + 86_399)
  })

  it('today is a valid YYYY-MM-DD', () => {
    expect(todayYmd()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
