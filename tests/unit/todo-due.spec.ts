import { describe, expect, it } from 'vitest'

import { todoDueState } from '../../shared/domain/todo-due'

describe('todo-due', () => {
  it('没有截止日不标记', () => {
    expect(todoDueState('', '2026-10-28')).toBeNull()
  })

  it('早于今天是逾期', () => {
    expect(todoDueState('2026-10-27', '2026-10-28')).toBe('overdue')
  })

  it('等于今天是今天', () => {
    expect(todoDueState('2026-10-28', '2026-10-28')).toBe('today')
  })

  it('晚于今天是未来', () => {
    expect(todoDueState('2026-10-29', '2026-10-28')).toBe('future')
  })

  it('跨月、跨年按字符串序也正确', () => {
    expect(todoDueState('2025-12-31', '2026-01-01')).toBe('overdue')
    expect(todoDueState('2026-01-01', '2025-12-31')).toBe('future')
  })
})
