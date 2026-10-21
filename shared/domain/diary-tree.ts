/**
 * 日记目录树：把日期列表按 年 → 月 → 日 分组，并给出三种树节点的 DOM id。
 *
 * 日记树构建。三条规则值得能被断言：
 *
 * * **分组与排序**：年 / 月键按**升序**迭代（与 Rust `BTreeMap` 一致，渲染侧从后往前读
 *   就是"新的在前"）；同一天内的多个日期按 `date` 字符串**降序**
 *   （`YYYY-MM-DD` 的字典序就是时间序）；解析不出的日期直接跳过；
 * * **节点 id**：渲染侧与"滚动定位"侧必须用**同一份**规则（滚动靠 id 反查元素），
 *   从前这三条规则分居两个文件，改一处忘一处就表现为"定位不到那天"。
 */

import { parseYmd } from './calendar'
import type { DiaryDateItem } from './models'

/** 一个日期节点。 */
export interface DayNode {
  date: string
  day: number
  wordCount: number
  mood: string
}

/** 年 → 月 → 日的分组结果（键的迭代顺序为升序，等价于 Rust 的 `BTreeMap`）。 */
export type TreeMap = Map<number, Map<number, DayNode[]>>

/**
 * 把日期列表按年/月分组（年、月键升序，同月内的日降序）。
 *
 * 解析不出的日期（`坏日期`、空串、`2026-13-01`）直接跳过：宁可少一个节点，
 * 也不能 panic 或塞进错的那一年。
 */
export function buildTree(items: readonly DiaryDateItem[]): TreeMap {
  const grouped = new Map<number, Map<number, DayNode[]>>()
  for (const item of items) {
    const date = parseYmd(item.date)
    if (date === null) continue
    let months = grouped.get(date.year)
    if (months === undefined) {
      months = new Map()
      grouped.set(date.year, months)
    }
    let days = months.get(date.month)
    if (days === undefined) {
      days = []
      months.set(date.month, days)
    }
    days.push({
      date: item.date,
      day: date.day,
      wordCount: item.wordCount,
      mood: item.mood,
    })
  }

  for (const months of grouped.values()) {
    for (const days of months.values()) {
      // 降序；`Array.prototype.sort` 稳定，同日期保持入参顺序（与 Rust 的稳定排序一致）
      days.sort((left, right) => {
        if (left.date === right.date) return 0
        return left.date < right.date ? 1 : -1
      })
    }
  }

  // Rust `BTreeMap` 的迭代顺序是键升序；JS `Map` 是插入顺序，所以这里重建一份
  const sorted: TreeMap = new Map()
  const years = [...grouped.entries()].sort((left, right) => left[0] - right[0])
  for (const [year, months] of years) {
    const sortedMonths = new Map<number, DayNode[]>()
    const monthEntries = [...months.entries()].sort((left, right) => left[0] - right[0])
    for (const [month, days] of monthEntries) sortedMonths.set(month, days)
    sorted.set(year, sortedMonths)
  }
  return sorted
}

/** 年节点的 DOM id。 */
export function yearNodeId(year: number): string {
  return `diary-tree-year-${year}`
}

/** 月节点的 DOM id。 */
export function monthNodeId(year: number, month: number): string {
  return `diary-tree-month-${year}-${month}`
}

/** 日节点的 DOM id。 */
export function dayNodeId(date: string): string {
  return `diary-tree-day-${date}`
}
