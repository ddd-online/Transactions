import { todayYmd } from './time'

/** 截止日相对今天的三种状态；没有截止日返回 null。 */
export type TodoDueState = 'overdue' | 'today' | 'future' | null

/**
 * 只比较 `YYYY-MM-DD` 字符串：待办的起止日期本来就是日粒度，
 * 字符串序与日期序一致，不需要再经过 Date（也避免时区把今天算错）。
 */
export function todoDueState(dueDate: string, today: string = todayYmd()): TodoDueState {
  if (!dueDate) return null
  if (dueDate < today) return 'overdue'
  if (dueDate === today) return 'today'
  return 'future'
}
