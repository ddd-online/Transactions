/**
 * 股票资金流水的口径：现金链怎么走、可用现金怎么取、支取超限怎么说。
 *
 * 这里只放判据；写入本身的组织归 `stock/write`（现金链复算在服务层）。
 */

import { centsToYuan } from './money'

/** 支取超限时给用户看的整句（用户可见文案，改动即影响界面/接口）。 */
export function withdrawLimitMessage(availableCash: number): string {
  return `支取金额不能超过可用现金（${centsToYuan(availableCash)} 元）`
}

/**
 * 追加 / 支取前的可用现金：取现金链末条的余额；链还是空的才用当前本金。
 * 余额 0 是余额，不是缺失。
 */
export function cashBefore(latestBalance: number | null, principal: number): number {
  return latestBalance ?? principal
}

/** 现金链上的一条：链序键 + 本次变动。 */
export interface CashChange {
  /** 资金变化的发生日期（YYYY-MM-DD，按字典序比） */
  recordDate: string
  /** 录入时间（Unix 秒；同一天的按它比） */
  createdAt: number
  /** 记录 id（uuid 字符串，字典序；同刻的按它兜底定序） */
  id: string
  /** 带符号的变动额（分） */
  amountChange: number
}

/**
 * 现金链：从 `base` 起算，按 (日期, 创建时间, id) 升序逐条累加，返回**与入参同序**的余额。
 *
 * 链序是"资金变化发生的先后"，不是"录入的先后"；倒填的记录也照样进链。
 * 链末条（日期最大那条）的余额 = base + Σ amountChange，与录入顺序无关。
 */
export function cashChain(base: number, entries: readonly CashChange[]): number[] {
  const order = entries.map((_, index) => index)
  order.sort((left, right) => {
    const a = entries[left]
    const b = entries[right]
    if (a.recordDate !== b.recordDate) return a.recordDate < b.recordDate ? -1 : 1
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt
    if (a.id !== b.id) return a.id < b.id ? -1 : 1
    return 0
  })

  const balances = new Array<number>(entries.length).fill(base)
  let cash = base
  for (const index of order) {
    cash += entries[index].amountChange
    balances[index] = cash
  }
  return balances
}
