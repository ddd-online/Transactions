import type { TodoProgressDto } from '../../shared/types/todo'
import type { TodoDueState } from '../../shared/domain/todo-due'

/**
 * 待办页的展示格式化：完成时间 / 进度时间、进度计数、事项起止日期文案。
 *
 * 纯函数，按宿主本地时区换算 Unix 秒；历史视图、进度记录与卡片列读同一份实现，
 * 免得三处对「逾期 / 今天」与日期顺序各说各的。
 */

/** 完成时间（历史）/ 进度时间（`short`）—— 都用本地时区、等宽数字排版。 */
export function formatMoment(seconds: number, short = false): string {
  if (!seconds) return ''
  const date = new Date(seconds * 1000)
  const pad = (value: number): string => String(value).padStart(2, '0')
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  const day = `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return short ? `${day} ${time}` : `${date.getFullYear()}-${day} ${time}`
}

export function doneCountOf(progress: TodoProgressDto[]): number {
  return progress.filter((entry) => entry.done).length
}

export function formatItemDates(
  startDate: string,
  dueDate: string,
  due: TodoDueState,
): string {
  if (!startDate && !dueDate) return ''
  if (startDate && !dueDate) return `${startDate} 起`
  if (!startDate && dueDate) return due === 'today' ? '今天截止' : `${dueDate} 截止`
  return due === 'today' ? `${startDate} → 今天截止` : `${startDate} → ${dueDate}`
}
