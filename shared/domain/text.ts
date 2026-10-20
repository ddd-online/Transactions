/**
 * 用户输入文本 → 数值：金额（分）与费率。
 *
 * 它们是**输入校验规则**，而规则算错的代价是"保存被拦下"或"存进去一个错的数"。
 * 从前两份实现分散在消费记录页（`parse_price`，自带中文文案）与股票页
 * （`parse_number`，费率）—— 现在各有名字、都在单测的覆盖里。
 */

import { yuanToCents } from './money'

/**
 * 金额文本 → **分**（消费记录页的输入口径）。
 *
 * 规则：`^(0|[1-9]\d*)(\.\d{1,2})?$`（不许前导零、最多两位小数、不许负数），
 * 通过后再交给 `yuanToCents`。
 *
 * 文案是用户可见的（调用方直接把它弹进提示）：
 * * 空串 → 「请输入金额」
 * * 形状不对 → 「请输入不小于 0 的金额，最多两位小数」
 * * 形状对但换算不过（越界等）→ `MoneyError` 自己那句
 */
export function parseAmountCents(input: string): number {
  const text = input.trim()
  if (text === '') {
    throw new Error('请输入金额')
  }
  const dot = text.indexOf('.')
  const integer = dot >= 0 ? text.slice(0, dot) : text
  const decimals = dot >= 0 ? text.slice(dot + 1) : null

  const integerOk =
    integer === '0' ||
    (integer !== '' && !integer.startsWith('0') && /^[0-9]+$/.test(integer))
  const decimalsOk =
    decimals === null ||
    (decimals !== '' && decimals.length <= 2 && /^[0-9]+$/.test(decimals))
  if (!integerOk || !decimalsOk) {
    throw new Error('请输入不小于 0 的金额，最多两位小数')
  }
  return yuanToCents(text)
}

/**
 * 费率文本 → `number`（股票费用设置：佣金率 / 印花税率 / 过户费率）。
 *
 * 非数字、非有限值（`NaN` / `Infinity`）与空串一律 `null` —— 调用方据此提示"费率不合法"。
 * 接受的记法与 Rust `f64::from_str` 的十进制文法一致（不接受 `0x10` 这类 JS 扩展记法）。
 */
export function parseRate(input: string): number | null {
  const trimmed = input.trim()
  if (trimmed === '') {
    return null
  }
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) {
    return null
  }
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}

/**
 * `YYYY` → 年；空串或非法（含 `<= 0`）一律 `null`（表示"不限"）。
 *
 * 应用设置里的"自定义年份"筛选用它 —— 空 = 不限是这条规则的一半。
 */
export function parseYearBound(input: string): number | null {
  const trimmed = input.trim()
  if (trimmed === '') {
    return null
  }
  if (!/^[+-]?[0-9]+$/.test(trimmed)) {
    return null
  }
  const value = Number(trimmed)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

/**
 * `YYYY-MM` → `[年, 月]`；空串或非法一律 `[null, null]`（表示"不限"）。
 *
 * 只填年份时按"按年"处理（月份留空），与界面上的分段选择一致。
 */
export function parseYearMonthBound(input: string): readonly [number | null, number | null] {
  const trimmed = input.trim()
  if (trimmed === '') {
    return [null, null]
  }
  const dash = trimmed.indexOf('-')
  if (dash < 0) {
    return [parseYearBound(trimmed), null]
  }
  return [parseYearBound(trimmed.slice(0, dash)), parseYearBound(trimmed.slice(dash + 1))]
}

/**
 * 第 `line` 行（0 起）**行末**在 UTF-16 里的下标 —— `setSelectionRange` 要的单位。
 *
 * 复盘弹窗打开时模板刚预填进文本域，光标该落在**第一行末尾**（「买入理由：」之后）：
 * 文首会写在标签前面，文末会写在「交易心得：」之后，两者都要用户先挪一次光标。
 * `line` 越界（或文本没有那么多行）时返回文末 —— 退化成"跟在文末"，不抛错。
 */
export function lineEndCaret(text: string, line: number): number {
  let units = 0
  const segments = text.split('\n')
  for (let index = 0; index < segments.length; index += 1) {
    if (index === line) {
      return units + segments[index].length
    }
    // 换行符本身也占一个 UTF-16 码元
    units += segments[index].length + 1
  }
  return text.length
}
