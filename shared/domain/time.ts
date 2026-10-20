/**
 * 时间格式化：日期串 ↔ Unix 秒这一段（需要宿主时区的那半）。
 *
 * 全部按宿主本地时区换算，与后端的 Unix 秒语义对应；纯公历算术在 `./calendar`。
 * 支持的占位符：YYYY / MM / DD / HH / mm / ss。
 */

import { parseYmd } from './calendar'

const DAY_SECONDS = 86_400

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** 秒级时间戳 → 本地时间格式化字符串；空格式默认 `YYYY-MM-DD`。 */
export function formatTimestamp(timestamp: number, format: string): string {
  const pattern = format.length === 0 ? 'YYYY-MM-DD' : format
  const date = new Date(timestamp * 1000)
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()

  const chars = Array.from(pattern)
  let out = ''
  let index = 0
  while (index < chars.length) {
    const rest = chars.slice(index)
    if (rest[0] === 'Y' && rest[1] === 'Y' && rest[2] === 'Y' && rest[3] === 'Y') {
      out += String(year)
      index += 4
    } else if (rest[0] === 'M' && rest[1] === 'M') {
      out += pad2(month)
      index += 2
    } else if (rest[0] === 'D' && rest[1] === 'D') {
      out += pad2(day)
      index += 2
    } else if (rest[0] === 'H' && rest[1] === 'H') {
      out += pad2(hour)
      index += 2
    } else if (rest[0] === 'm' && rest[1] === 'm') {
      out += pad2(minute)
      index += 2
    } else if (rest[0] === 's' && rest[1] === 's') {
      out += pad2(second)
      index += 2
    } else {
      out += chars[index]
      index += 1
    }
  }
  return out
}

/** 当前本地日期的 `YYYY-MM-DD`。 */
export function todayYmd(): string {
  return formatTimestamp(nowSeconds(), 'YYYY-MM-DD')
}

/** 当前 Unix 秒。 */
export function nowSeconds(): number {
  return Math.trunc(Date.now() / 1000)
}

/** `YYYY-MM-DD` 串 → 当天 00:00:00（本地时区）的 Unix 秒；解析失败返回 null。 */
export function ymdToSeconds(input: string): number | null {
  const date = parseYmd(input)
  if (!date) return null
  return Math.trunc(new Date(date.year, date.month - 1, date.day).getTime() / 1000)
}

/** `YYYY-MM-DD` 区间 → 闭区间 Unix 秒（起点 00:00:00，终点 23:59:59）。 */
export function rangeToSeconds(from: string, to: string): [number, number] | null {
  const start = ymdToSeconds(from)
  const end = ymdToSeconds(to)
  if (start === null || end === null) return null
  return [start, end + DAY_SECONDS - 1]
}
