/**
 * 分页页码的纯算法：哪些页要显示、哪里折成省略号。
 *
 * 规则（分页控件的界面壳只负责把它们画出来）：
 * 首页、末页、当前页 ±1 必显，其余折叠成 `…`；
 * 靠近两端时多显示几个，避免出现 `1 … 2` 这类空洞。
 *
 * 唯一的使用面是分页控件，但它是**规则**而不是渲染配置：页码收敛算错在界面上
 * 只表现为"少了一个能点的页码"，把它放这儿是为了能在单测里断言。
 */

/**
 * 页码槽位：`null` 表示省略号。
 *
 * 入参越界时按边界收敛（`pages < 1` 当 1，`current` 夹进 `1..=pages`），不抛错。
 */
export function pageSlots(current: number, pages: number): Array<number | null> {
  const pageCount = Math.max(pages, 1)
  const currentPage = Math.min(Math.max(current, 1), pageCount)
  const slots: Array<number | null> = []
  for (let candidate = 1; candidate <= pageCount; candidate += 1) {
    const visible =
      candidate === 1 ||
      candidate === pageCount ||
      Math.abs(candidate - currentPage) <= 1 ||
      (currentPage <= 3 && candidate <= 5) ||
      (currentPage >= pageCount - 2 && candidate >= pageCount - 4)
    if (visible) {
      slots.push(candidate)
    } else if (slots.length === 0 || slots[slots.length - 1] !== null) {
      slots.push(null)
    }
  }
  return slots
}
