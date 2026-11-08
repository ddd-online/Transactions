import { describe, expect, it } from 'vitest'

import type { TodoProgressDto } from '../../shared/types/todo'
import { doneCountOf, formatItemDates, formatMoment } from '../../src/pages/todo-format'

function progress(done: boolean): TodoProgressDto {
  return { id: 'p', itemId: 'i', content: '一条进度', done, createdAt: 0 }
}

describe('formatMoment', () => {
  it('没有时间戳时返回空串', () => {
    expect(formatMoment(0)).toBe('')
  })

  it('按本地时区格式化到分钟', () => {
    const seconds = Math.trunc(new Date(2026, 5, 19, 13, 4).getTime() / 1000)
    expect(formatMoment(seconds)).toBe('2026-06-19 13:04')
    expect(formatMoment(seconds, true)).toBe('06-19 13:04')
  })
})

describe('doneCountOf', () => {
  it('只数打了勾的进度', () => {
    expect(doneCountOf([])).toBe(0)
    expect(doneCountOf([progress(true), progress(false), progress(true)])).toBe(2)
  })
})

describe('formatItemDates', () => {
  it('没有起止日期时返回空串', () => {
    expect(formatItemDates('', '', 'future')).toBe('')
  })

  it('只有开始日期', () => {
    expect(formatItemDates('2026-01-05', '', 'future')).toBe('2026-01-05 起')
  })

  it('只有截止日期', () => {
    expect(formatItemDates('', '2026-01-09', 'future')).toBe('2026-01-09 截止')
    expect(formatItemDates('', '2026-01-09', 'today')).toBe('今天截止')
  })

  it('起止日期都有', () => {
    expect(formatItemDates('2026-01-05', '2026-01-09', 'future')).toBe(
      '2026-01-05 → 2026-01-09',
    )
    expect(formatItemDates('2026-01-05', '2026-01-09', 'today')).toBe('2026-01-05 → 今天截止')
    expect(formatItemDates('2026-01-05', '2026-01-09', 'overdue')).toBe(
      '2026-01-05 → 2026-01-09',
    )
  })
})
