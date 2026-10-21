import { describe, expect, it } from 'vitest'

import { reorderWithChanges } from '../../shared/domain/list-order'

interface Row {
  name: string
  sortOrder: number
}

function rows(names: readonly string[]): Row[] {
  return names.map((name, index) => ({ name, sortOrder: index }))
}

function key(row: Row): string {
  return row.name
}

function order(row: Row): number {
  return row.sortOrder
}

function names(list: readonly Row[]): string[] {
  return list.map((row) => row.name)
}

/** 测试里的 `.unwrap()`：测试数据都该拿到结果。 */
function unwrap<T>(value: T | null): T {
  if (value === null) throw new Error('expected a reorder result')
  return value
}

describe('reorderWithChanges', () => {
  // 把第一项拖到最后：新顺序对了，且**只有序号变了的那几项**要落库。
  it('dragging reports only the rows whose order changed', () => {
    const list = rows(['a', 'b', 'c', 'd'])
    const [reordered, changed] = unwrap(reorderWithChanges(list, 0, 3, key, order))
    expect(names(reordered)).toEqual(['b', 'c', 'd', 'a'])
    // 新下标：b=0 c=1 d=2 a=3；旧序号里 b/c/d 的分别是 1/2/3 → 与 0/1/2 都不等，四项都要落库
    expect(changed).toEqual([
      [0, 'b'],
      [1, 'c'],
      [2, 'd'],
      [3, 'a'],
    ])
  })

  // 相邻交换：只有这两项的序号变了。
  it('swapping neighbours touches only those two', () => {
    const list = rows(['a', 'b', 'c', 'd'])
    const [reordered, changed] = unwrap(reorderWithChanges(list, 1, 2, key, order))
    expect(names(reordered)).toEqual(['a', 'c', 'b', 'd'])
    expect(changed, 'a(0) 与 d(3) 的序号没变，不该发请求').toEqual([
      [1, 'c'],
      [2, 'b'],
    ])
  })

  // 已经排好的列表：原位拖拽什么都不做；序号与下标原本就对得上时，只有被挪动区间内那几项需要落库。
  it('a list that was already renumbered yields no changes', () => {
    // 先把顺序改成 b a c d 并"落库"（sortOrder 跟着新下标）
    const list: Row[] = [
      { name: 'b', sortOrder: 0 },
      { name: 'a', sortOrder: 1 },
      { name: 'c', sortOrder: 2 },
    ]
    expect(reorderWithChanges(list, 0, 0, key, order), '原位拖拽什么都不做').toBeNull()
    const [reordered, changed] = unwrap(reorderWithChanges(list, 0, 1, key, order))
    expect(names(reordered)).toEqual(['a', 'b', 'c'])
    expect(changed, 'c 的序号仍是 2，不必落库').toEqual([
      [0, 'a'],
      [1, 'b'],
    ])
  })

  // 脏数据（序号与下标大面积不一致）会把不一致的全报上来 —— 这正是"顺手修好"的机会。
  it('a dirty list reports every mismatch', () => {
    const list: Row[] = [
      { name: 'a', sortOrder: 5 },
      { name: 'b', sortOrder: 5 },
      { name: 'c', sortOrder: 5 },
    ]
    const [, changed] = unwrap(reorderWithChanges(list, 0, 1, key, order))
    expect(changed.length, '三项的序号都对不上新下标').toBe(3)
  })

  // 越界 / 原位：`null`（调用方据此不发请求，也不改本地列表）。
  it('out-of-range drags do nothing', () => {
    const list = rows(['a', 'b', 'c'])
    expect(reorderWithChanges(list, 0, 0, key, order)).toBeNull()
    expect(reorderWithChanges(list, 3, 1, key, order)).toBeNull()
    expect(reorderWithChanges(list, 1, 3, key, order)).toBeNull()
    expect(reorderWithChanges([], 0, 0, key, order)).toBeNull()
    // 单项列表：任何拖动都是原位
    expect(reorderWithChanges(rows(['only']), 0, 0, key, order)).toBeNull()
  })
})
