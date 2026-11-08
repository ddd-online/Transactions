import { describe, expect, it } from 'vitest'

import {
  emptyFilter,
  filterSummary,
  toQueryItem,
  type RecordFilter,
} from '../../src/pages/records-filter-bar'

/** 一份筛选条件；不传的字段与「什么都没填」一致。 */
function filter(overrides: Partial<RecordFilter> = {}): RecordFilter {
  return { ...emptyFilter(), ...overrides }
}

describe('filterSummary', () => {
  it('空条件没有摘要', () => {
    expect(filterSummary(filter())).toBe('')
  })

  it('按类型 / 分类 / 标签 / 描述的固定顺序拼摘要', () => {
    expect(
      filterSummary(
        filter({
          transactionType: 'expense',
          category: '餐饮',
          tags: ['外食', '工作日'],
          description: '午',
        }),
      ),
    ).toBe('支出 / 餐饮 / 外食、工作日 / "午"')
  })

  it('类型用中文文案，未知类型回落到原始字符串', () => {
    expect(filterSummary(filter({ transactionType: 'income' }))).toBe('收入')
    expect(filterSummary(filter({ transactionType: 'barter' }))).toBe('barter')
  })

  it('描述去掉首尾空白后再加引号，纯空白不算条件', () => {
    expect(filterSummary(filter({ description: '  午餐  ' }))).toBe('"午餐"')
    expect(filterSummary(filter({ description: '   ' }))).toBe('')
  })
})

describe('toQueryItem', () => {
  it('没选标签时标签策略与取反都不生效', () => {
    expect(toQueryItem(filter({ tagPolicy: 'all', tagNot: true }))).toEqual({
      transactionType: '',
      category: '',
      tags: [],
      tagPolicy: '',
      tagNot: false,
      description: '',
    })
  })

  it('选了标签才带上匹配方式与取反，描述去空白', () => {
    expect(
      toQueryItem(
        filter({
          transactionType: 'income',
          category: '工资',
          tags: ['工资'],
          tagPolicy: 'all',
          tagNot: true,
          description: '  奖金 ',
        }),
      ),
    ).toEqual({
      transactionType: 'income',
      category: '工资',
      tags: ['工资'],
      tagPolicy: 'all',
      tagNot: true,
      description: '奖金',
    })
  })
})
