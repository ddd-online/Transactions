import { describe, expect, it } from 'vitest'

import type { ChartLine } from '../../shared/domain/models'
import {
  EMPTY_LINE_FORM,
  chartLineOf,
  lineFormOf,
  type LineForm,
} from '../../src/pages/chart-editor-line-form'

/** 一份曲线草稿；不传的字段与「什么都没填」一致。 */
function form(overrides: Partial<LineForm> = {}): LineForm {
  return { ...EMPTY_LINE_FORM, ...overrides }
}

describe('chartLineOf', () => {
  it('空条件就是「不限」：不写 conditions', () => {
    expect(chartLineOf(form({ label: '支出' }))).toEqual({
      label: '支出',
      transactionType: 'expense',
      includeOutlier: true,
      conditions: [],
    })
  })

  it('只填标签：条件里只带标签，交易类型跟着曲线走，空白标签丢掉', () => {
    const line = chartLineOf(
      form({ label: '外食', transactionType: 'income', tags: ['外食', '  '] }),
    )
    expect(line.conditions).toEqual([
      {
        transactionType: 'income',
        category: '',
        tags: ['外食'],
        tagPolicy: 'any',
        tagNot: false,
        description: '',
      },
    ])
  })

  it('只填分类：条件里只带分类，首尾空白去掉', () => {
    const line = chartLineOf(form({ label: '餐饮', category: ' 餐饮 ' }))
    expect(line.conditions).toEqual([
      {
        transactionType: 'expense',
        category: '餐饮',
        tags: [],
        tagPolicy: 'any',
        tagNot: false,
        description: '',
      },
    ])
  })

  it('策略与描述写回条件，曲线名去空白', () => {
    const line = chartLineOf(
      form({
        label: ' 聚餐 ',
        category: '餐饮',
        tags: ['外食'],
        tagPolicy: 'all',
        description: ' 午饭 ',
        includeOutlier: false,
      }),
    )
    expect(line).toEqual({
      label: '聚餐',
      transactionType: 'expense',
      includeOutlier: false,
      conditions: [
        {
          transactionType: 'expense',
          category: '餐饮',
          tags: ['外食'],
          tagPolicy: 'all',
          tagNot: false,
          description: '午饭',
        },
      ],
    })
  })
})

function line(overrides: Partial<ChartLine> = {}): ChartLine {
  return {
    label: '支出',
    transactionType: 'expense',
    includeOutlier: true,
    conditions: [],
    ...overrides,
  }
}

describe('lineFormOf', () => {
  it('没有条件就是空表单：标签为空数组、策略回落 any', () => {
    expect(lineFormOf(line({ transactionType: 'transfer' }))).toEqual({
      label: '支出',
      transactionType: 'transfer',
      category: '',
      tags: [],
      tagPolicy: 'any',
      description: '',
      includeOutlier: true,
    })
  })

  it('条件读回分类 / 标签 / 策略 / 描述，标签是拷贝', () => {
    const source = line({
      conditions: [
        {
          transactionType: 'expense',
          category: '餐饮',
          tags: ['外食'],
          tagPolicy: 'all',
          tagNot: false,
          description: '午饭',
        },
      ],
    })
    const draft = lineFormOf(source)
    expect(draft).toEqual({
      label: '支出',
      transactionType: 'expense',
      category: '餐饮',
      tags: ['外食'],
      tagPolicy: 'all',
      description: '午饭',
      includeOutlier: true,
    })
    draft.tags.push('聚餐')
    expect(source.conditions[0].tags).toEqual(['外食'])
  })
})
