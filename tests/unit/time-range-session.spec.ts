import { beforeEach, describe, expect, it } from 'vitest'

import {
  forgetTimeRanges,
  rememberedTimeRange,
  rememberTimeRange,
} from '../../src/state/time-range-session'

describe('time range session memory', () => {
  beforeEach(() => forgetTimeRanges())

  it('remembers a range per page key', () => {
    rememberTimeRange('charts', { mode: 'month', start: '2026-01-01', end: '2026-12-31' })
    rememberTimeRange('records', { mode: 'date', start: '2026-11-06', end: '2026-11-06' })

    expect(rememberedTimeRange('charts')).toEqual({
      mode: 'month',
      start: '2026-01-01',
      end: '2026-12-31',
    })
    expect(rememberedTimeRange('records')).toEqual({
      mode: 'date',
      start: '2026-11-06',
      end: '2026-11-06',
    })
    // 没去过的页面没有记忆，调用方用自己的默认值
    expect(rememberedTimeRange('events')).toBeUndefined()
  })

  it('overwrites the same key instead of growing a history', () => {
    rememberTimeRange('charts', { mode: 'month', start: '2026-01-01', end: '2026-12-31' })
    rememberTimeRange('charts', { mode: 'year', start: '2025-01-01', end: '2025-12-31' })

    expect(rememberedTimeRange('charts')).toEqual({
      mode: 'year',
      start: '2025-01-01',
      end: '2025-12-31',
    })
  })

  it('forgets everything when the session ends', () => {
    rememberTimeRange('charts', { mode: 'month', start: '2026-01-01', end: '2026-12-31' })
    forgetTimeRanges()

    expect(rememberedTimeRange('charts')).toBeUndefined()
  })
})
