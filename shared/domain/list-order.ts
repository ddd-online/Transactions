/**
 * 列表重排（拖拽排序）的纯算法：新顺序是什么、**哪些行需要落库**。
 *
 * 它决定的是"发几条写请求"：
 * 先把被拖动的项从 `from` 取出、插到 `to`，随后**全量重排** `sortOrder`，
 * 但只把 `sortOrder` 与新下标不一致的项放进结果 —— 调用方据此发请求。
 *
 * 两个取值函数由调用方给（`key` 用来告诉调用方"这一项是谁"，`sortOrder` 读它当前的序号）：
 * 本模块不认识任何具体 DTO，也就不必为了排序去依赖页面类型。
 */

/** 需要落库的一项：新下标 + 该项的键。 */
export type SortChange = readonly [index: number, key: string]

/**
 * 重排列表并算出"需要落库的项"。
 *
 * 返回 `[新顺序, 需要落库的项]`；下标越界或原位返回 `null`（调用方据此什么都不做）。
 * `key` / `sortOrder` 直接对应旧实现里的闭包，`sortOrder` 用与下标相同的整数口径。
 */
export function reorderWithChanges<T>(
  list: readonly T[],
  from: number,
  to: number,
  key: (item: T) => string,
  sortOrder: (item: T) => number,
): readonly [T[], SortChange[]] | null {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
    return null
  }

  const reordered = [...list]
  const [moved] = reordered.splice(from, 1)
  reordered.splice(to, 0, moved)

  const changed: SortChange[] = []
  reordered.forEach((item, index) => {
    if (sortOrder(item) !== index) {
      changed.push([index, key(item)])
    }
  })
  return [reordered, changed]
}
