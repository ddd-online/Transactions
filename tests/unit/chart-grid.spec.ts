import { describe, expect, it } from 'vitest'

import { pieEmptyDescription } from '../../src/pages/chart-grid'
import type { ChartDto } from '../../shared/types/chart'
import type { ChartPieResponse } from '../../shared/types/transaction'

function chart(overrides: Partial<ChartDto> = {}): ChartDto {
  return {
    chartId: 'chart-1',
    ledgerId: 'ledger-1',
    title: '饼图',
    granularity: '',
    lines: [],
    chartType: 'pie',
    groupField: 'tag',
    groupTransactionType: 'expense',
    groupCategory: '餐饮美食',
    isPreset: false,
    sortOrder: 0,
    ...overrides,
  }
}

function pie(overrides: Partial<ChartPieResponse> = {}): ChartPieResponse {
  return {
    slices: [],
    total: 0,
    rangeRecords: 3,
    filteredRecords: 3,
    filteredTotal: 0,
    ...overrides,
  }
}

describe('pieEmptyDescription', () => {
  it('没有数据时先让用户换范围', () => {
    expect(pieEmptyDescription(null, chart())).toBe('这个时间范围里没有记录，换一个范围试试。')
    expect(pieEmptyDescription(pie({ rangeRecords: 0 }), chart())).toBe(
      '这个时间范围里没有记录，换一个范围试试。',
    )
  })

  it('按标签分组时把交易类型与分类都说出来', () => {
    expect(pieEmptyDescription(pie({ filteredRecords: 0 }), chart())).toBe(
      '这个范围里没有「支出 · 餐饮美食」记录，换一种交易类型或分类看看。',
    )
  })

  it('按分类分组时只说交易类型', () => {
    expect(
      pieEmptyDescription(pie({ filteredRecords: 0 }), chart({ groupField: 'category' })),
    ).toBe('这个范围里没有「支出」记录，换一种交易类型看看。')
  })

  it('按交易类型分组时用通用说法', () => {
    expect(
      pieEmptyDescription(pie({ filteredRecords: 0 }), chart({ groupField: 'transactionType' })),
    ).toBe('这个范围里没有可统计的记录，换一个范围试试。')
  })

  it('有记录但按标签分组时都没有标签：让用户去加标签', () => {
    expect(pieEmptyDescription(pie(), chart())).toBe(
      '这个范围里「支出 · 餐饮美食」的记录都没有标签，先给记录加上标签。',
    )
  })

  it('有记录但没有可统计的：还是让用户换范围', () => {
    expect(pieEmptyDescription(pie(), chart({ groupField: 'category' }))).toBe(
      '这个范围里没有可统计的记录，换一个范围试试。',
    )
  })
})
