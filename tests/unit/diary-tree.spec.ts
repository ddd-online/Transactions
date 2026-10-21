import { describe, expect, it } from 'vitest'

import { buildTree, dayNodeId, monthNodeId, yearNodeId } from '../../shared/domain/diary-tree'
import type { DiaryDateItem } from '../../shared/domain/models'

function item(date: string, wordCount: number, mood: string): DiaryDateItem {
  return { date, wordCount, mood }
}

describe('buildTree grouping', () => {
  it('groups days under their year and month', () => {
    const tree = buildTree([
      item('2026-06-19', 10, '开心'),
      item('2026-06-01', 3, ''),
      item('2026-05-31', 7, '平静'),
      item('2025-12-31', 1, ''),
    ])
    expect([...tree.keys()], '年升序（有序映射 顺序）').toEqual([2025, 2026])
    const june = tree.get(2026)!.get(6)!
    expect(june.map((node) => node.date), '同月内日降序').toEqual([
      '2026-06-19',
      '2026-06-01',
    ])
    expect(june[0].day).toBe(19)
    expect(june[0].wordCount).toBe(10)
    expect(june[0].mood).toBe('开心')
    expect([...tree.get(2026)!.keys()], '月升序').toEqual([5, 6])
  })

  /** 解析不出的日期直接跳过（宁可少一个节点，也不能 panic 或塞进错的那一年）。 */
  it('skips unparsable dates', () => {
    const tree = buildTree([
      item('2026-06-19', 10, ''),
      item('坏日期', 5, ''),
      item('', 1, ''),
      item('2026-13-01', 2, ''),
    ])
    expect(tree.size).toBe(1)
    expect(tree.get(2026)!.get(6)!.length).toBe(1)
  })

  it('yields an empty tree for an empty list', () => {
    expect(buildTree([]).size).toBe(0)
  })
})

/** id 规则是渲染与滚动共用的那一份（改这里就是改两处）。 */
describe('node ids', () => {
  it('are stable', () => {
    expect(yearNodeId(2026)).toBe('diary-tree-year-2026')
    expect(monthNodeId(2026, 6)).toBe('diary-tree-month-2026-6')
    expect(dayNodeId('2026-06-19')).toBe('diary-tree-day-2026-06-19')
  })
})
