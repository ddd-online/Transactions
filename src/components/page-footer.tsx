/**
 * 常驻底栏的页面插槽。
 *
 * 页面自己的底栏（记录页的收支合计、股票记录的汇总、天梯的汇总）不再画在页面主列里，
 * 而是由 `PageLayout` 用 portal 投进外壳底栏的这块 DOM；外壳底栏因此是唯一的一条底边，
 * 没有页面时只剩最右的「?」。
 *
 * 这里只传节点：插槽在挂载后才有值，`PageLayout` 拿到之后才 portal，首帧不会丢内容。
 */
import { createContext, useContext } from 'react'

export const PageFooterSlotContext = createContext<HTMLElement | null>(null)

/** 外壳底栏里的页面插槽；不在外壳里时返回 null。 */
export function usePageFooterSlot(): HTMLElement | null {
  return useContext(PageFooterSlotContext)
}
