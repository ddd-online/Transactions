/**
 * 金额换算：**金额一律以整数分存储**，界面层负责分/元换算。
 *
 * 这几个函数是"金额恒为整数分"纪律的守门人，行为是硬契约（含负号、`.5` 这类输入）。
 *
 * **价格是另一套单位：整数厘（1/1000 元）**。ETF / LOF / REITs 这些场内基金的交易所报价单位
 * 就是 0.001 元（实测 `510300` = 4.389），按"分"存会把 `4.389` 变成 `4.39`。
 * 所以：**金额走分、价格走厘**，两者只在算成交额时相遇（`amountOf` 折那一次）。
 *
 * 两条"元 → 分"的分工要看清，**别互相替换**：
 * * `yuanToCents`：走**字符串**（界面输入框里的金额文本）；
 * * `priceYuanToMilli`：走**浮点**（wire 上的价格是元，落库为厘）。
 */

export class MoneyError extends Error {
  readonly kind: 'invalid' | 'overflow'

  constructor(kind: 'invalid' | 'overflow') {
    super(kind === 'invalid' ? '无效的金额格式' : '金额超出范围')
    this.name = 'MoneyError'
    this.kind = kind
  }
}

function isAsciiDigits(value: string): boolean {
  return value.length > 0 && /^[0-9]+$/.test(value)
}

/** 分 → 元字符串，固定两位小数、**不做千分位分组**。 */
export function centsToYuan(cents: number): string {
  const abs = Math.abs(cents)
  const body = `${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
  return cents < 0 ? `-${body}` : body
}

/**
 * 元字符串 → 分：
 * 允许前导/尾随空格与负号；整数部分可省略（`.5`）；小数最多取 3 位，第 3 位四舍五入到分；
 * 非数字输入抛 `MoneyError('invalid')`，超出安全整数范围抛 `MoneyError('overflow')`。
 */
export function yuanToCents(input: string): number {
  const trimmed = input.trim()
  const negative = trimmed.startsWith('-')
  const body = negative ? trimmed.slice(1) : trimmed

  const dot = body.indexOf('.')
  const integerRaw = dot >= 0 ? body.slice(0, dot) : body
  const decimalsRaw = dot >= 0 ? body.slice(dot + 1) : ''
  const integerPart = integerRaw.length === 0 ? '0' : integerRaw

  if (!isAsciiDigits(integerPart) || (decimalsRaw.length > 0 && !isAsciiDigits(decimalsRaw))) {
    throw new MoneyError('invalid')
  }

  const digits = [decimalsRaw[0] ?? '0', decimalsRaw[1] ?? '0', decimalsRaw[2] ?? '0']
  let cents = Number(digits[0]) * 10 + Number(digits[1])
  if (digits[2] >= '5') cents += 1

  const integer = Number(integerPart)
  if (!Number.isSafeInteger(integer)) throw new MoneyError('overflow')
  const total = integer * 100 + cents
  if (!Number.isSafeInteger(total)) throw new MoneyError('overflow')

  return negative ? -total : total
}

/** 厘 → 元字符串：能整除分时两位小数，带厘位时三位小数（照实反映存下来的精度）。 */
export function milliToYuan(milli: number): string {
  if (milli % 10 === 0) return centsToYuan(milli / 10)

  const abs = Math.abs(milli)
  const body = `${Math.trunc(abs / 1000)}.${String(abs % 1000).padStart(3, '0')}`
  return milli < 0 ? `-${body}` : body
}

/** `f64::round`：四舍五入、远离零。JS `Math.round` 对负数半值朝 +∞，不能直接用。 */
function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value)
}

/** 价格（元，浮点）→ 厘（1/1000 元），四舍五入到整数厘。 */
export function priceYuanToMilli(priceYuan: number): number {
  return roundHalfAwayFromZero(priceYuan * 1000)
}

/** 厘 → 价格（元，浮点）：`priceYuanToMilli` 的逆。 */
export function milliToPriceYuan(milli: number): number {
  return milli / 1000
}
