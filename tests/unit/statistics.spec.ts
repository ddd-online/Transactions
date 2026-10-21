import { describe, expect, it } from 'vitest'

import {
  DEFAULT_STATISTICS_STRATEGY,
  GROUP_SIZE_INVALID,
  GROUP_SIZE_MAX,
  GROUP_SIZE_MIN,
  RANGE_AND_RECENT,
  RECENT_NOT_POSITIVE,
  STATISTICS_STRATEGIES,
  STRATEGY_INVALID,
  createStatisticsFilter,
  defaultStatisticsFilter,
  filterEnd,
  filterStart,
  filterTag,
  isUnfiltered,
  normalizeMonth,
  normalizeRecent,
  parseRecentText,
  parseStrategyWire,
  strategyLabel,
  strategyWire,
  validateFilter,
  withStrategy,
  type StatisticsFilter,
} from '../../shared/domain/statistics'

/** 把 测试里的 `Err(message)` 断言落成"抛的是不是同一句文案"。 */
function thrownMessage(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('expected the call to throw')
}

describe('recent parsing', () => {
  // : missing_blank_and_unparsable_all_mean_no_limit
  it('treats missing, blank and unparsable text as no limit', () => {
    expect(normalizeRecent(null)).toBeNull()
    expect(normalizeRecent(parseRecentText(''))).toBeNull()
    expect(normalizeRecent(parseRecentText('abc'))).toBeNull()
    expect(normalizeRecent(parseRecentText('3.5'))).toBeNull()
    // 模块头点名的契约：非数字串不会报错。
    expect(() => normalizeRecent(parseRecentText('abc'))).not.toThrow()
  })

  // : positive_numbers_are_kept
  it('keeps positive numbers', () => {
    expect(normalizeRecent(parseRecentText('1'))).toBe(1)
    expect(normalizeRecent(parseRecentText('20'))).toBe(20)
    expect(normalizeRecent(7)).toBe(7)
  })

  // : zero_and_negative_are_rejected_with_the_shared_message
  it('rejects zero and negative numbers with the shared message', () => {
    expect(thrownMessage(() => normalizeRecent(0))).toBe(RECENT_NOT_POSITIVE)
    expect(thrownMessage(() => normalizeRecent(-5))).toBe(RECENT_NOT_POSITIVE)
    expect(thrownMessage(() => normalizeRecent(parseRecentText('-1')))).toBe(RECENT_NOT_POSITIVE)
    expect(RECENT_NOT_POSITIVE).toBe('recent 必须为正整数')
  })

  // : text_is_not_trimmed
  it('does not trim recent text', () => {
    expect(parseRecentText(' 5')).toBeNull()
  })

  // : months_are_half_open
  it('normalizes months, letting each end be open', () => {
    expect(normalizeMonth('')).toBeNull()
    expect(normalizeMonth('   ')).toBeNull()
    expect(normalizeMonth('2026-06')).toBe('2026-06')
    expect(normalizeMonth(' 2026-06 ')).toBe('2026-06')
  })
})

describe('filter shape', () => {
  // : an_empty_filter_is_unfiltered
  it('treats an empty filter as unfiltered', () => {
    const filter = defaultStatisticsFilter()
    expect(isUnfiltered(filter)).toBe(true)
    expect(filterStart(filter)).toBeNull()
    expect(filterEnd(filter)).toBeNull()
    expect(filterTag(filter)).toBeNull()
  })

  // : each_part_alone_makes_it_filtered
  it('makes the filter filtered when any single part is set', () => {
    expect(isUnfiltered(createStatisticsFilter('2026-01', '', null, ''))).toBe(false)
    expect(isUnfiltered(createStatisticsFilter('', '2026-12', null, ''))).toBe(false)
    expect(isUnfiltered(createStatisticsFilter('', '', 5, ''))).toBe(false)
    expect(isUnfiltered(createStatisticsFilter('', '', null, '打新'))).toBe(false)
  })

  // : range_and_recent_are_mutually_exclusive
  it('rejects a month range combined with a recent limit', () => {
    expect(
      thrownMessage(() => validateFilter(createStatisticsFilter('2026-01', '2026-06', 5, ''))),
    ).toBe(RANGE_AND_RECENT)
    expect(
      thrownMessage(() => validateFilter(createStatisticsFilter('2026-01', '', 5, ''))),
    ).toBe(RANGE_AND_RECENT)
    expect(
      thrownMessage(() => validateFilter(createStatisticsFilter('', '2026-06', 5, ''))),
    ).toBe(RANGE_AND_RECENT)

    // 各自单独用都合法
    expect(() =>
      validateFilter(createStatisticsFilter('2026-01', '2026-06', null, '')),
    ).not.toThrow()
    expect(() => validateFilter(createStatisticsFilter('', '', 5, ''))).not.toThrow()
    expect(() => validateFilter(defaultStatisticsFilter())).not.toThrow()

    // 带空白的一端正则化为"不限"，于是不再与 recent 冲突
    expect(() => validateFilter(createStatisticsFilter('   ', '', 5, ''))).not.toThrow()
  })

  // : a_negative_recent_is_rejected_wherever_it_comes_from
  it('rejects a negative recent wherever it comes from', () => {
    expect(thrownMessage(() => validateFilter(createStatisticsFilter('', '', -1, '')))).toBe(
      RECENT_NOT_POSITIVE,
    )
  })

  // : the_default_strategy_is_cumulative
  it('defaults to the cumulative strategy', () => {
    expect(createStatisticsFilter('', '', null, '').strategy).toBe('cumulative')
    expect(defaultStatisticsFilter().strategy).toBe('cumulative')
    expect(strategyWire(DEFAULT_STATISTICS_STRATEGY)).toBe('cumulative')
  })
})

describe('statistics strategy', () => {
  // : strategy_wire_text_is_exact
  it('parses the exact wire text', () => {
    expect(parseStrategyWire('')).toBe('cumulative')
    for (const strategy of STATISTICS_STRATEGIES) {
      expect(parseStrategyWire(strategyWire(strategy))).toBe(strategy)
    }
    expect(thrownMessage(() => parseStrategyWire('Grouped'))).toBe(STRATEGY_INVALID)
    expect(thrownMessage(() => parseStrategyWire('batch'))).toBe(STRATEGY_INVALID)
    expect(thrownMessage(() => parseStrategyWire(' '))).toBe(STRATEGY_INVALID)
  })

  // : every_strategy_has_a_name
  it('gives every strategy a distinct non-empty name and wire value', () => {
    const labels = STATISTICS_STRATEGIES.map(strategyLabel)
    expect(labels).toEqual(['逐笔累计', '分组统计'])
    for (const label of labels) expect(label.length).toBeGreaterThan(0)
    expect(new Set(labels).size).toBe(labels.length)

    // wire 取值同样两两不同（否则界面选的与后端认的不是一回事）
    const wires = STATISTICS_STRATEGIES.map(strategyWire)
    expect(wires).toEqual(['cumulative', 'grouped'])
  })

  // : grouped_requires_a_size_in_range
  it('requires a group size within range for grouped statistics', () => {
    const grouped = (size: number | null): StatisticsFilter =>
      withStrategy(createStatisticsFilter('', '', null, ''), 'grouped', size)

    expect(() => validateFilter(grouped(GROUP_SIZE_MIN))).not.toThrow()
    expect(() => validateFilter(grouped(50))).not.toThrow()
    expect(() => validateFilter(grouped(GROUP_SIZE_MAX))).not.toThrow()

    expect(thrownMessage(() => validateFilter(grouped(1)))).toBe(GROUP_SIZE_INVALID)
    expect(thrownMessage(() => validateFilter(grouped(0)))).toBe(GROUP_SIZE_INVALID)
    expect(thrownMessage(() => validateFilter(grouped(-5)))).toBe(GROUP_SIZE_INVALID)
    expect(thrownMessage(() => validateFilter(grouped(GROUP_SIZE_MAX + 1)))).toBe(
      GROUP_SIZE_INVALID,
    )
    // 分组却没给笔数
    expect(thrownMessage(() => validateFilter(grouped(null)))).toBe(GROUP_SIZE_INVALID)
  })

  // : a_size_is_ignored_under_cumulative
  it('ignores the group size under cumulative statistics', () => {
    const filter = withStrategy(createStatisticsFilter('', '', null, ''), 'cumulative', 1)
    expect(() => validateFilter(filter)).not.toThrow()

    expect(() =>
      validateFilter(
        withStrategy(createStatisticsFilter('', '', 5, ''), 'cumulative', 999_999),
      ),
    ).not.toThrow()
  })

  // : grouping_does_not_make_a_filter
  it('does not treat grouping as filtering', () => {
    const filter = withStrategy(createStatisticsFilter('', '', null, ''), 'grouped', 5)
    expect(isUnfiltered(filter)).toBe(true)
    expect(() => validateFilter(filter)).not.toThrow()

    // 三条规则可以同时踩：区间 + 笔数先报
    expect(
      thrownMessage(() =>
        validateFilter(
          withStrategy(createStatisticsFilter('2026-01', '2026-06', 5, ''), 'grouped', 1),
        ),
      ),
    ).toBe(RANGE_AND_RECENT)
  })
})
