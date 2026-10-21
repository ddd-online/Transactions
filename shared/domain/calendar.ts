/**
 * 公历日历的纯算法：解析 / 格式化、月长、加减月与天、周与区间对齐、按粒度翻周期。
 *
 * 这里全是**无时区的公历事实**：`2026-06-19` 是星期五、2024 年 2 月有 29 天、
 * `2026-01-30` 到 `2026-02-05` 恰好 6 天 —— 这些答案与宿主在哪个时区、有没有夏令时无关。
 * 从前它们散在界面侧（日期选择器与时间范围选择器用 `Date` 的"下月第 0 天"取月长、
 * 用本地秒差判"整周"），于是既不能在单测里断言，也会在夏令时切换那一周算出错的"整周"
 * 判定（见 {@link isSixDays}）。
 *
 * **留在界面侧的是另一件事**：`时间戳 → 本地时间`（`format_timestamp` / `today_ymd` /
 * `now_seconds` / `ymd_to_seconds`）—— 那需要一个时区数据库，只有宿主有。
 * 分界就是这一条：**日期串之间的算术在这里，日期串与 Unix 秒之间的换算在界面侧。**
 *
 * **本模块禁止用 `Date` 做算术**：`Date` 的毫秒语义会把时区 / 夏令时带进来，
 * 这里只走 Howard Hinnant 的公历日序号整数算法（{@link dayNumber}）。
 *
 * 日期计算纯函数（含越界月份、非补零输入、
 * 解析失败原样返回这些边角）。
 */

/** 一个公历日期（月 / 日都是 1 起）。 */
export interface Ymd {
  year: number
  month: number
  day: number
}

const WEEKDAY_CN = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'] as const

/** Rust `i32` 的取值范围（`parse` 溢出返回 `None`）。 */
const I32_MIN = -2_147_483_648
const I32_MAX = 2_147_483_647
/** Rust `u32` 的取值范围。 */
const U32_MAX = 4_294_967_295

/**
 * 按 Rust 的 `str::parse::<i32>` 口径解析：允许前导 `+` / `-`，纯十进制数字，
 * 不接受空白（整体 `trim` 由调用方负责），越界当解析失败。
 */
function parseI32(raw: string): number | null {
  if (!/^[+-]?[0-9]+$/.test(raw)) return null
  const value = Number(raw)
  if (!Number.isInteger(value) || value < I32_MIN || value > I32_MAX) return null
  return value
}

/** 按 Rust 的 `str::parse::<u32>` 口径解析：不允许负号，越界当解析失败。 */
function parseU32(raw: string): number | null {
  if (!/^\+?[0-9]+$/.test(raw)) return null
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0 || value > U32_MAX) return null
  return value
}

/**
 * 按 Rust 的格式化宽度补零：宽度**包含符号位**（`{:04}` 对 -1 得 `-001`），
 * 数字本身超宽时不截断。负年份只可能来自 {@link addDays} 的下溢。
 */
function padNumber(value: number, width: number): string {
  const negative = value < 0
  const digits = String(Math.abs(value))
  const zeros = Math.max(0, width - digits.length - (negative ? 1 : 0))
  return `${negative ? '-' : ''}${'0'.repeat(zeros)}${digits}`
}

/** `YYYY-MM-DD`（补零；字符串比较即时间先后比较）。 */
export function padded(date: Ymd): string {
  return `${padNumber(date.year, 4)}-${padNumber(date.month, 2)}-${padNumber(date.day, 2)}`
}

/** 解析完整的 `YYYY-MM-DD`；月 / 日越界或段数不对返回 `null`。 */
export function parseYmd(input: string): Ymd | null {
  const trimmed = input.trim()
  const parts = trimmed.split('-')
  if (parts.length !== 3) return null
  const year = parseI32(parts[0])
  const month = parseU32(parts[1])
  const day = parseU32(parts[2])
  if (year === null || month === null || day === null) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return { year, month, day }
}

/**
 * 解析 `年-月-…` 的**前两段**（时间范围选择器的月 / 年粒度只需要年月）。
 *
 * 第三段（日）的内容不校验：`2026-01-xx` → `[2026, 1]`。
 * 但形状必须是两段以上（`2026-06` → `null`）—— 与搬过来之前的实现逐字一致，
 * 调用方拿到的值永远来自日期选择器或本模块的区间对齐，不存在"只有年月"的输入。
 */
export function parseYearMonth(input: string): [number, number] | null {
  const trimmed = input.trim()
  const firstDash = trimmed.indexOf('-')
  if (firstDash < 0) return null
  const rest = trimmed.slice(firstDash + 1)
  const secondDash = rest.indexOf('-')
  if (secondDash < 0) return null
  const year = parseI32(trimmed.slice(0, firstDash))
  const month = parseU32(rest.slice(0, secondDash))
  if (year === null || month === null || month < 1 || month > 12) return null
  return [year, month]
}

/**
 * 解析**只有年月**的 `YYYY-MM`（看板的期间键就是这个形状）。
 *
 * 与 {@link parseYearMonth} 的分工：那个要求「带日」的区间端点（时间范围选择器用），
 * 这个只认两段。两者不能互相顶替 —— 拿 `2026-10` 去喂 `parseYearMonth` 会得到 `null`，
 * 而看板翻页时把 `null` 当成"保持原样"，表现就是**点了箭头没反应**。
 */
export function parseMonth(input: string): [number, number] | null {
  const parts = input.trim().split('-')
  if (parts.length !== 2) return null
  const year = parseI32(parts[0])
  const month = parseU32(parts[1])
  if (year === null || month === null || month < 1 || month > 12) return null
  return [year, month]
}

/**
 * 期间键按粒度前后翻：`month` 走 `YYYY-MM`，`year` 走 `YYYY`。
 *
 * 解析不了就**原样返回**（调用方据此不改变期间）：宁可不动，也不要把 1970 这类
 * 猜出来的期间塞给用户。返回 `(新键, 是否真的翻了)` 之外没有别的信号通道，
 * 所以调用方用"新旧键是否相同"判断有没有翻动。
 */
export function shiftPeriodKey(key: string, mode: string, delta: number): string {
  if (mode === 'year') {
    const year = parseI32(key.trim())
    if (year === null) return key
    return String(year + delta)
  }
  const parsed = parseMonth(key)
  if (parsed === null) return key
  const [year, month] = addMonths(parsed[0], parsed[1], delta)
  return `${year}-${padNumber(month, 2)}`
}

/** `YYYY-MM-DD` → `2026年6月19日`（解析失败原样返回）。 */
export function formatYmdCn(input: string): string {
  const date = parseYmd(input)
  if (date === null) return input
  return `${date.year}年${date.month}月${date.day}日`
}

/** 星期中文名（`YYYY-MM-DD`；解析失败返回空串）。 */
export function weekdayCn(input: string): string {
  const date = parseYmd(input)
  if (date === null) return ''
  return WEEKDAY_CN[weekdayIndex(date.year, date.month, date.day)]
}

/** 某年某月的天数（公历闰年规则：4 年一闰、100 年不闰、400 年又闰）。 */
export function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 1:
    case 3:
    case 5:
    case 7:
    case 8:
    case 10:
    case 12:
      return 31
    case 4:
    case 6:
    case 9:
    case 11:
      return 30
    case 2:
      return isLeapYear(year) ? 29 : 28
    // 非法月份：调用方要么已经校验过，要么会落到"整月对齐"的兜底分支
    default:
      return 30
  }
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/** 月份加减（`delta` 可负）。 */
export function addMonths(year: number, month: number, delta: number): [number, number] {
  const total = year * 12 + (month - 1) + delta
  // Rust 的 div_euclid / rem_euclid：除数为正时就是向下取整与欧几里得余数
  const nextYear = Math.floor(total / 12)
  const nextMonth = (((total % 12) + 12) % 12) + 1
  return [nextYear, nextMonth]
}

/** 某月 1 号是星期几（0 = 周一 … 6 = 周日）—— 月历网格的起始偏移。 */
export function mondayOffset(year: number, month: number): number {
  // `weekdayIndex` 是周日开始的（与 JS 的 `getDay()` 同序），这里换算成周一起始
  return (weekdayIndex(year, month, 1) + 6) % 7
}

/**
 * 星期几（0 = 周日 … 6 = 周六）—— 公历事实，与宿主时区无关。
 *
 * 用 1970-01-01（星期四）当锚点：日序号 0 对应星期四，所以 (日序号 + 4) mod 7 就是星期几。
 */
function weekdayIndex(year: number, month: number, day: number): number {
  return (((dayNumber({ year, month, day }) + 4) % 7) + 7) % 7
}

/**
 * 公历日序号（1970-01-01 = 0）：两个日期相减就是相差的天数。
 *
 * 用 Howard Hinnant 的 days_from_civil：把 3 月当一年之首，闰年那一天落在年末，
 * 就退化成"每 400 年 146097 天"的整数运算 —— 没有循环，也没有时区。
 */
function dayNumber(date: Ymd): number {
  const year = date.month <= 2 ? date.year - 1 : date.year
  // Rust 的整数除法向零截断；负数年份先减 399，保证 era 取到数学上的 floor
  const era = Math.trunc((year >= 0 ? year : year - 399) / 400)
  const yearOfEra = year - era * 400
  const shiftedMonth = (date.month + 9) % 12
  const dayOfYear = Math.floor((153 * shiftedMonth + 2) / 5) + date.day - 1
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear
  return era * 146_097 + dayOfEra - 719_468
}

/** 日序号 → 公历日期（{@link dayNumber} 的逆）。 */
function dateFromDayNumber(days: number): Ymd {
  const shifted = days + 719_468
  const era = Math.trunc((shifted >= 0 ? shifted : shifted - 146_096) / 146_097)
  const dayOfEra = shifted - era * 146_097
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1_460) +
      Math.floor(dayOfEra / 36_524) -
      Math.floor(dayOfEra / 146_096)) /
      365,
  )
  const year = yearOfEra + era * 400
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100))
  const shiftedMonth = Math.floor((5 * dayOfYear + 2) / 153)
  const day = dayOfYear - Math.floor((153 * shiftedMonth + 2) / 5) + 1
  const month = shiftedMonth < 10 ? shiftedMonth + 3 : shiftedMonth - 9
  return { year: year + (month <= 2 ? 1 : 0), month, day }
}

/** 日期串加 / 减天数（跨月跨年由日序号负责；解析失败返回 `null`）。 */
export function addDays(ymd: string, days: number): string | null {
  const date = parseYmd(ymd)
  if (date === null) return null
  return padded(dateFromDayNumber(dayNumber(date) + days))
}

/**
 * 两个日期相差的天数（`to - from`，可为负；解析失败返回 `null`）。
 *
 * 与 {@link isSixDays} 同一口径：按日序号算，不看时刻 —— 界面侧的
 * "已过 N 天"从前也是拿本地秒差除以 86400，夏令时那一周会少算一天。
 */
export function daysBetween(from: string, to: string): number | null {
  const start = parseYmd(from)
  const end = parseYmd(to)
  if (start === null || end === null) return null
  return dayNumber(end) - dayNumber(start)
}

/**
 * 区间是否恰好 6 天（即"整周"）—— 按**日序号差**判，不看时刻。
 *
 * 从前这里算的是"两端本地午夜相差几个 86400 秒"，夏令时切换那一周会少/多一小时，
 * 整数除法把 6 天 23 小时截成 5 ⇒ 整周被判成单日、翻页只挪一天。
 */
export function isSixDays(start: string, end: string): boolean {
  const from = parseYmd(start)
  const to = parseYmd(end)
  if (from === null || to === null) return false
  return dayNumber(to) - dayNumber(from) === 6
}

/** 某月的时间范围（1 号 ~ 月末）。 */
export function monthSpan(year: number, month: number): [string, string] {
  const last = daysInMonth(year, month)
  const prefix = `${padNumber(year, 4)}-${padNumber(month, 2)}`
  return [`${prefix}-01`, `${prefix}-${padNumber(last, 2)}`]
}

/** 某年的时间范围（1 月 1 日 ~ 12 月 31 日）。 */
export function yearSpan(year: number): [string, string] {
  const prefix = padNumber(year, 4)
  return [`${prefix}-01-01`, `${prefix}-12-31`]
}

/** 某天所在周的（周一, 周日）—— 一周从周一算起。 */
export function weekBounds(ymd: string): [string, string] | null {
  const date = parseYmd(ymd)
  if (date === null) return null
  const mondayOffsetDays = (weekdayIndex(date.year, date.month, date.day) + 6) % 7
  const monday = dateFromDayNumber(dayNumber(date) - mondayOffsetDays)
  const sunday = dateFromDayNumber(dayNumber(monday) + 6)
  return [padded(monday), padded(sunday)]
}

/**
 * 按粒度对齐区间：月 → 整月、年 → 整年、日 → 原样。
 *
 * 对齐不出合法区间（解析失败 / 起点晚于终点）时原样返回 —— 调用方据此保持"待选"状态。
 */
export function normalizeRange(start: string, end: string, mode: string): [string, string] {
  const alignStart = (ymd: string): string => {
    const parsed = parseYearMonth(ymd)
    if (parsed === null) return ''
    return mode === 'month' ? monthSpan(parsed[0], parsed[1])[0] : yearSpan(parsed[0])[0]
  }
  const alignEnd = (ymd: string): string => {
    const parsed = parseYearMonth(ymd)
    if (parsed === null) return ''
    return mode === 'month' ? monthSpan(parsed[0], parsed[1])[1] : yearSpan(parsed[0])[1]
  }
  const [from, to] =
    mode === 'month' || mode === 'year'
      ? [alignStart(start), alignEnd(end)]
      : [start, end]
  if (from.length === 0 || to.length === 0 || from > to) return [start, end]
  return [from, to]
}

/**
 * 按粒度前后翻一个周期：
 *
 * * `date`：区间正好 6 天 → 整周（±7 天）；否则 ±1 天
 * * `month`：`start ± 1 月` 的月初 / `end ± 1 月` 的月末
 * * `year`：`start ± 1 年` 的年初 / `end ± 1 年` 的年末
 *
 * 解析失败时原样返回（调用方不必先校验）。
 */
export function shiftPeriod(
  start: string,
  end: string,
  mode: string,
  direction: number,
): [string, string] {
  if (mode === 'month') {
    const startMonth = parseYearMonth(start)
    const endMonth = parseYearMonth(end)
    if (startMonth === null || endMonth === null) return [start, end]
    const [nextStartYear, nextStartMonth] = addMonths(startMonth[0], startMonth[1], direction)
    const [nextEndYear, nextEndMonth] = addMonths(endMonth[0], endMonth[1], direction)
    return [monthSpan(nextStartYear, nextStartMonth)[0], monthSpan(nextEndYear, nextEndMonth)[1]]
  }
  if (mode === 'year') {
    const startMonth = parseYearMonth(start)
    const endMonth = parseYearMonth(end)
    if (startMonth === null || endMonth === null) return [start, end]
    return [yearSpan(startMonth[0] + direction)[0], yearSpan(endMonth[0] + direction)[1]]
  }
  const days = (isSixDays(start, end) ? 7 : 1) * direction
  const from = addDays(start, days)
  const to = addDays(end, days)
  if (from === null || to === null) return [start, end]
  return [from, to]
}
