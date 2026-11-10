import { describe, expect, it } from 'vitest'

import { tagNamesForCategory, tagNamesForFilter } from '../../shared/domain/tag-names'

/** 一行标签（库里按 `分类:类型` 归档）。 */
function tag(name: string, category: string, type: string) {
  return { name, categoryTransactionType: `${category}:${type}` }
}

const rows = [
  tag('三餐', '餐饮美食', 'expense'),
  tag('外卖', '餐饮美食', 'expense'),
  tag('打车', '交通出行', 'expense'),
  tag('工资', '工资奖金', 'income'),
]

describe('tagNamesForFilter', () => {
  it('分类与类型都不限时给出全部标签（去重）', () => {
    expect(tagNamesForFilter(rows, '', '')).toEqual(['三餐', '外卖', '打车', '工资'])
  })

  it('选了分类就只给这个分类的标签；类型不限时含该分类所有类型', () => {
    expect(tagNamesForFilter(rows, '餐饮美食', '')).toEqual(['三餐', '外卖'])
    expect(tagNamesForFilter(rows, '餐饮美食', 'expense')).toEqual(['三餐', '外卖'])
    expect(tagNamesForFilter(rows, '餐饮美食', 'income')).toEqual([])
  })

  it('只选类型时列出这类记录的全部标签', () => {
    expect(tagNamesForFilter(rows, '', 'income')).toEqual(['工资'])
    expect(tagNamesForFilter(rows, '', 'transfer')).toEqual([])
  })

  it('分类名去空白，与 tagNamesForCategory 同一口径', () => {
    expect(tagNamesForFilter(rows, ' 餐饮美食 ', 'expense')).toEqual(['三餐', '外卖'])
  })

  it('同一分类下重名标签只出现一次', () => {
    const duplicated = [tag('三餐', '餐饮美食', 'expense'), tag('三餐', '餐饮美食', 'expense')]
    expect(tagNamesForFilter(duplicated, '餐饮美食', '')).toEqual(['三餐'])
  })
})

describe('tagNamesForCategory', () => {
  it('按分类 + 类型精确归档', () => {
    expect(tagNamesForCategory(rows, '餐饮美食', 'expense')).toEqual(['三餐', '外卖'])
    expect(tagNamesForCategory(rows, '餐饮美食', 'income')).toEqual([])
  })

  it('空分类是「还没有分类」，不给标签（新建表单的口径）', () => {
    expect(tagNamesForCategory(rows, '', 'expense')).toEqual([])
  })
})
