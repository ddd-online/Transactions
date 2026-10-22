import { describe, expect, it } from 'vitest'

import {
  addDays,
  addMonths,
  daysBetween,
  daysInMonth,
  formatYmdCn,
  isSixDays,
  mondayOffset,
  monthSpan,
  normalizeRange,
  padded,
  parseYmd,
  parseYearMonth,
  shiftPeriod,
  weekBounds,
  weekdayCn,
  yearSpan,
  type Ymd,
} from '../../shared/domain/calendar'

/** 月长：闰年规则四条分支都要走到（含"百年不闰、四百年又闰"）。 */
describe('daysInMonth', () => {
  it('follows the gregorian leap rule', () => {
    expect(daysInMonth(2024, 2), '4 年一闰').toBe(29)
    expect(daysInMonth(2025, 2)).toBe(28)
    expect(daysInMonth(1900, 2), '100 年不闰').toBe(28)
    expect(daysInMonth(2000, 2), '400 年又闰').toBe(29)
    expect(daysInMonth(2026, 4)).toBe(30)
    expect(daysInMonth(2026, 1)).toBe(31)
    expect(daysInMonth(2026, 12)).toBe(31)
  })
})

describe('addMonths', () => {
  it('wraps across years and handles negative deltas', () => {
    expect(addMonths(2026, 1, -1)).toEqual([2025, 12])
    expect(addMonths(2026, 12, 1)).toEqual([2027, 1])
    expect(addMonths(2026, 3, -14)).toEqual([2025, 1])
    expect(addMonths(2026, 6, 0)).toEqual([2026, 6])
    expect(addMonths(2026, 1, 12)).toEqual([2027, 1])
  })
})

/** 日序号是这一切的底座：往返必须恒等（跨闰年、跨世纪都要对）。 */
describe('day numbers', () => {
  it('round trip over two centuries', () => {
    let date: Ymd = { year: 1900, month: 1, day: 1 }
    // 从 1900-01-01 起连续走 200 年：每一步都要求"序号 → 日期"回到原处
    // （`addDays(..., 0)` 的往返就是 dayNumber → dateFromDayNumber）
    for (let step = 0; step < 73_049; step += 1) {
      const text = padded(date)
      expect(addDays(text, 0), JSON.stringify(date)).toBe(text)
      const year = date.year
      const month = date.month
      date.day += 1
      if (date.day > daysInMonth(year, month)) {
        date.day = 1
        const [nextYear, nextMonth] = addMonths(year, month, 1)
        date.year = nextYear
        date.month = nextMonth
      }
    }
    expect(date.year, '走了 200 年').toBe(2100)
  })
})

describe('parseYmd', () => {
  it('is strict about the shape but tolerant about padding', () => {
    expect(parseYmd('2026-06-19')).toEqual({ year: 2026, month: 6, day: 19 })
    expect(parseYmd('2026-6-9'), '不补零也认（既有行为）').toEqual({
      year: 2026,
      month: 6,
      day: 9,
    })
    expect(parseYmd(' 2026-06-19 '), '两侧空白忽略').toEqual(parseYmd('2026-06-19'))
    expect(parseYmd('2026-13-01'), '月份越界').toBeNull()
    expect(parseYmd('2026-06-32'), '日子越界').toBeNull()
    expect(parseYmd('2026-06'), '缺日').toBeNull()
    expect(parseYmd('2026-06-19-1'), '多一段').toBeNull()
    expect(parseYmd('')).toBeNull()

    // 年月解析：只取前两段，第三段内容不校验；但形状必须有两段以上
    expect(parseYearMonth('2026-06-19')).toEqual([2026, 6])
    expect(parseYearMonth('2026-06-xx'), '日非法不影响年月').toEqual([2026, 6])
    expect(parseYearMonth('2026-06'), '只有年月：与既有行为一致').toBeNull()
    expect(parseYearMonth('2026')).toBeNull()
    expect(parseYearMonth('2026-13'), '月份越界').toBeNull()
  })
})

/** 星期是公历事实（取几个公认的锚点）。 */
describe('weekdays', () => {
  it('are gregorian facts', () => {
    expect(weekdayCn('1970-01-01')).toBe('星期四')
    expect(weekdayCn('2000-01-01')).toBe('星期六')
    expect(weekdayCn('2024-02-29')).toBe('星期四')
    expect(weekdayCn('2026-01-01')).toBe('星期四')
    expect(weekdayCn('2026-06-19')).toBe('星期五')
    expect(weekdayCn('坏日期')).toBe('')
    // 周一起始：周一到周日依次是 一…日
    expect(weekdayCn('2026-06-15')).toBe('星期一')
    expect(weekdayCn('2026-06-21')).toBe('星期日')
    expect(mondayOffset(2026, 6), '2026-06-01 是周一').toBe(0)
    expect(mondayOffset(2026, 2), '2026-02-01 是周日').toBe(6)
  })
})

describe('formatYmdCn', () => {
  it('falls back to the input', () => {
    expect(formatYmdCn('2026-06-19')).toBe('2026年6月19日')
    expect(formatYmdCn('2026-06-09')).toBe('2026年6月9日')
    expect(formatYmdCn('不是日期')).toBe('不是日期')
  })
})

describe('addDays', () => {
  it('crosses months and years', () => {
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2024-02-28', 1), '闰年').toBe('2024-02-29')
    expect(addDays('2025-02-28', 1)).toBe('2025-03-01')
    expect(addDays('2026-06-19', 7)).toBe('2026-06-26')
    expect(addDays('2026-06-19', -6)).toBe('2026-06-13')
    expect(addDays('nope', 1)).toBeNull()
  })
})

describe('isSixDays', () => {
  it('counts calendar days', () => {
    expect(isSixDays('2026-06-15', '2026-06-21'), '周一 ~ 周日').toBe(true)
    expect(isSixDays('2026-06-19', '2026-06-19'), '同一天').toBe(false)
    expect(isSixDays('2026-06-14', '2026-06-21'), '7 天').toBe(false)
    expect(isSixDays('2026-01-30', '2026-02-05'), '跨月').toBe(true)
    expect(isSixDays('2024-02-26', '2024-03-03'), '跨闰日').toBe(true)
    expect(isSixDays('坏', '2026-06-21')).toBe(false)
  })
})

describe('bounds', () => {
  it('align to month, year and week', () => {
    expect(monthSpan(2026, 2)).toEqual(['2026-02-01', '2026-02-28'])
    expect(monthSpan(2024, 2)).toEqual(['2024-02-01', '2024-02-29'])
    expect(yearSpan(2026)).toEqual(['2026-01-01', '2026-12-31'])
    expect(weekBounds('2026-06-19')).toEqual(['2026-06-15', '2026-06-21'])
    expect(weekBounds('2026-06-15'), '周一自己').toEqual(['2026-06-15', '2026-06-21'])
    expect(weekBounds('2026-06-21'), '周日自己').toEqual(['2026-06-15', '2026-06-21'])
    expect(weekBounds('坏')).toBeNull()
  })
})

describe('daysBetween', () => {
  it('is signed and calendar based', () => {
    expect(daysBetween('2026-06-15', '2026-06-21')).toBe(6)
    expect(daysBetween('2026-06-21', '2026-06-15')).toBe(-6)
    expect(daysBetween('2026-06-19', '2026-06-19')).toBe(0)
    expect(daysBetween('2024-02-28', '2024-03-01'), '闰日算一天').toBe(2)
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1)
    expect(daysBetween('坏', '2026-01-01')).toBeNull()
  })
})

describe('normalizeRange', () => {
  it('aligns or stays put', () => {
    expect(normalizeRange('2026-02-15', '2026-03-02', 'month')).toEqual([
      '2026-02-01',
      '2026-03-31',
    ])
    expect(normalizeRange('2026-02-15', '2026-03-02', 'year')).toEqual([
      '2026-01-01',
      '2026-12-31',
    ])
    expect(normalizeRange('2026-02-15', '2026-03-02', 'date'), '日粒度不动').toEqual([
      '2026-02-15',
      '2026-03-02',
    ])
    // 反过来的区间（起点晚于终点）原样返回，交给调用方当"待选"处理
    expect(normalizeRange('2026-03-02', '2026-02-15', 'month')).toEqual([
      '2026-03-02',
      '2026-02-15',
    ])
    expect(normalizeRange('坏', '2026-02-15', 'month')).toEqual(['坏', '2026-02-15'])
  })
})

describe('shiftPeriod', () => {
  it('moves one unit unless it is a whole week', () => {
    // 月粒度：月初 / 月末都跟着粒度走（2 月要夹到 28 天）
    expect(shiftPeriod('2026-01-01', '2026-01-31', 'month', 1)).toEqual([
      '2026-02-01',
      '2026-02-28',
    ])
    expect(shiftPeriod('2026-01-01', '2026-01-31', 'month', -1)).toEqual([
      '2025-12-01',
      '2025-12-31',
    ])
    // 年粒度
    expect(shiftPeriod('2026-01-01', '2026-12-31', 'year', 1)).toEqual([
      '2027-01-01',
      '2027-12-31',
    ])
    // 日粒度：整周挪 7 天，否则挪 1 天
    expect(shiftPeriod('2026-06-15', '2026-06-21', 'date', 1)).toEqual([
      '2026-06-22',
      '2026-06-28',
    ])
    expect(shiftPeriod('2026-06-19', '2026-06-19', 'date', 1)).toEqual([
      '2026-06-20',
      '2026-06-20',
    ])
    expect(shiftPeriod('2026-06-15', '2026-06-21', 'date', -1)).toEqual([
      '2026-06-08',
      '2026-06-14',
    ])
    // 解析失败原样返回
    expect(shiftPeriod('坏', '2026-06-21', 'month', 1)).toEqual(['坏', '2026-06-21'])
    expect(shiftPeriod('坏', '2026-06-21', 'date', 1)).toEqual(['坏', '2026-06-21'])
  })
})
