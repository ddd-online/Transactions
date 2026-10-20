/**
 * 展示层格式化（金额、交易类型文案、股票卡片上的盈亏文字与标尺）。
 *
 * 从 Rust 版 `tr-draw/src/format.rs` 移植：这里全是**纯函数** —— 只要有值就能算，
 * 与宿主、DOM、信号都无关，所以它们的测试面是 `tests/unit/format.spec.ts`，
 * 而不是"真开一次窗口看像素"。
 *
 * **金额换算必须走 `./money`**：那是"金额恒为整数分"纪律的唯一守门人，
 * 任何地方都不得自行实现 `/100`。本模块只负责加上符号、类型文案与紧凑写法。
 */

import { centsToYuan, milliToYuan } from './money'
import { type RoundFee } from './models'

/** 每手股数（A 股口径）。 */
const SHARES_PER_LOT = 100

// ---------------------------------------------------------------- 记账域

/** 交易类型 → 中文标签：income→收入、expense→支出、transfer→转账。 */
export function transactionTypeLabel(transactionType: string): string {
  switch (transactionType) {
    case 'income':
      return '收入'
    case 'expense':
      return '支出'
    case 'transfer':
      return '转账'
    // 未知类型回落到原始字符串，这里交给调用方处理（返回空串表示"未知"）
    default:
      return ''
  }
}

/** 交易类型标签，未知类型回落到原始值。 */
export function transactionTypeText(transactionType: string): string {
  const label = transactionTypeLabel(transactionType)
  return label.length === 0 ? transactionType : label
}

/** 分 → 元（两位小数，**不做千分位分组**）。 */
export function amount(cents: number): string {
  return centsToYuan(cents)
}

/**
 * 千分位金额（看板卡片用）：`groupedAmount(1_234_567)` → `"¥12,345.67"`。
 *
 * 负号写在 `¥` **之前**（`-¥12,345.67`），不写成 `¥-12,345.67`。
 * 与 {@link amount} 的区别只有这一条：整数部分加千分位。看板一屏要同时读四个五六位数，
 * 不加分隔符时 `¥248630.59` 与 `¥24863.59` 得靠数位才分得清。
 */
export function groupedAmount(cents: number): string {
  // 换元只走 `centsToYuan`（金额换算唯一入口），这里只负责插分隔符
  const text = centsToYuan(cents)
  const negative = text.startsWith('-')
  const body = negative ? text.slice(1) : text
  const dot = body.indexOf('.')
  const integer = dot >= 0 ? body.slice(0, dot) : body
  const fraction = dot >= 0 ? body.slice(dot + 1) : '00'

  let grouped = ''
  for (let index = 0; index < integer.length; index += 1) {
    if (index > 0 && (integer.length - index) % 3 === 0) grouped += ','
    grouped += integer[index]
  }
  return `${negative ? '-' : ''}¥${grouped}.${fraction}`
}

/**
 * 带符号金额：支出前缀 `-`、收入前缀 `+`、转账不加符号。
 *
 * 符号由**交易类型**决定，而不是由金额正负决定（与 {@link signedYuan} 相反）。
 */
export function signedAmount(transactionType: string, cents: number): string {
  switch (transactionType) {
    case 'expense':
      return `-${centsToYuan(cents)}`
    case 'income':
      return `+${centsToYuan(cents)}`
    default:
      return centsToYuan(cents)
  }
}

/** 金额语义色类名（`app.css` 的 `.tr-cell-price.price-*`）。 */
export function amountClass(transactionType: string): string {
  switch (transactionType) {
    case 'income':
      return 'price-income'
    case 'expense':
      return 'price-expense'
    case 'transfer':
      return 'price-transfer'
    default:
      return ''
  }
}

/** 交易类型行底色类名（`row-type-*`）。 */
export function rowClass(transactionType: string): string {
  return `row-type-${transactionType}`
}

/** 交易类型文字色类名（`app.css` 的 `.tr-cell-type.type-*`）。 */
export function typeClass(transactionType: string): string {
  return `type-${transactionType}`
}

// ---------------------------------------------------------------- 股票域 / 通用

/**
 * 带符号金额（元）：`>0` 加 `+`、`<0` 由 {@link amount} 自带 `-`、`0` 不加。
 *
 * 符号由**正负**决定（与 {@link signedAmount} 按交易类型决定符号不同），值为绝对值。
 */
export function signedYuan(cents: number): string {
  if (cents > 0) return `+${amount(cents)}`
  if (cents < 0) return `-${amount(Math.abs(cents))}`
  return amount(0)
}

/**
 * 盈亏着色类名（**A 股红涨绿跌**，股票页 CSS 会把两个类反向映射）。
 *
 * `>0` → `amount-income`、`<0` → `amount-expense`、`0` → 空串（继承默认色）。
 */
export function pnlClass(cents: number): string {
  if (cents > 0) return 'amount-income'
  if (cents < 0) return 'amount-expense'
  return ''
}

/** 百分比（两位小数）：`rateText(12.345)` → `"12.35%"`（**不加正号**，统计页用）。 */
export function rateText(percent: number): string {
  return Number.isFinite(percent) ? `${percent.toFixed(2)}%` : '0.00%'
}

/** 百分比（两位小数，正数带 `+`）：`signedPercent(12.345)` → `"+12.35%"`（股票页用）。 */
export function signedPercent(percent: number): string {
  if (!Number.isFinite(percent)) return '0.00%'
  return percent >= 0 ? `+${percent.toFixed(2)}%` : `${percent.toFixed(2)}%`
}

/** 可选百分比：`null` → `"—"`（行情缺失时的占位）。 */
export function optionalSignedPercent(percent: number | null): string {
  return percent === null ? '—' : signedPercent(percent)
}

/**
 * 可选百分比（**不带正号**）：`null` → `"—"`（仓位这类"分母可能不存在"的指标）。
 */
export function optionalRateText(percent: number | null): string {
  return percent === null ? '—' : rateText(percent)
}

/** 盈亏比：`null`（尚无亏损样本）→ `∞`，否则两位小数。 */
export function ratioText(ratio: number | null): string {
  return ratio === null || !Number.isFinite(ratio) ? '∞' : ratio.toFixed(2)
}

/**
 * 紧凑金额（股票卡片用）：亿 / 万 / 元，
 * `compactYuan(12_345_678_900)` → `"¥1.2亿"`；0 → `"¥0"`。
 */
export function compactYuan(cents: number): string {
  const yuan = Math.abs(cents) / 100
  if (yuan >= 1e8) return `¥${(yuan / 1e8).toFixed(1)}亿`
  if (yuan >= 1e4) return `¥${(yuan / 1e4).toFixed(1)}万`
  return `¥${yuan.toFixed(0)}`
}

/** 盈亏文字（股票卡片）：`盈/亏/平` + 紧凑金额。 */
export function pnlText(cents: number): string {
  const label = cents > 0 ? '盈' : cents < 0 ? '亏' : '平'
  return `${label} ${compactYuan(cents)}`
}

/**
 * 价格（**厘** / 股）文字：能整除分时两位小数、带厘位时三位（`100000 -> "100.00"`、`4389 -> "4.389"`）。
 *
 * **价格与金额是两套单位**（价格走厘、金额走分）：成交价、现价、当日涨跌都用它，
 * 金额、市值、费用、盈亏仍然用 {@link amount}。
 */
export function price(milli: number): string {
  return milliToYuan(milli)
}

/** 带符号价格（当日涨跌这类差值）：`>0` 加 `+`、`<0` 自带 `-`、`0` 不加。 */
export function signedPrice(milli: number): string {
  if (milli > 0) return `+${price(milli)}`
  if (milli < 0) return `-${price(Math.abs(milli))}`
  return price(0)
}

/** 现货价格文字：行情缺失（`null` 或 `<= 0`）→ `-`。 */
export function quoteText(latestPrice: number | null): string {
  return latestPrice !== null && latestPrice > 0 ? `¥${price(latestPrice)}` : '-'
}

/** 是否有有效行情（存在且大于 0）。 */
export function hasQuote(latestPrice: number | null): boolean {
  return latestPrice !== null && latestPrice > 0
}

/** 股数 → 手数（1 手 = 100 股，**向下取整**）。 */
export function lotsOf(shares: number): number {
  return Math.floor(shares / SHARES_PER_LOT)
}

/** Rust `f64::round`：四舍五入、远离零。JS `Math.round` 对负数半值朝 +∞，不能直接用。 */
function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value)
}

/** Rust `format!("{value}")` 的 `-0` 表现（JS 的 `String(-0)` 会吞掉负号）。 */
function formatF64(value: number): string {
  return Object.is(value, -0) ? '-0' : String(value)
}

/**
 * 按 `scale` 换算并格式化：先按 `scale` 换算，再四舍五入到 `digits` 位小数，最后去掉多余的 0。
 *
 * 统计页的标尺（张数 / 金额缩放）用它。
 */
export function scaledText(value: number, scale: number, digits: number): string {
  const factor = 10 ** digits
  const rounded = roundHalfAwayFromZero(value * scale * factor) / factor
  return formatF64(rounded)
}

/**
 * **一轮（建仓时）的费用设置**只读摘要：`佣金 万0.5 · 最低 ¥0 · 印花税 0% · 过户费 0%`。
 *
 * 费率按**万分之**、最低佣金按元、印花税与过户费按**百分比**显示（与设置页的输入单位一致）；
 * `null` = 这一轮没有快照（老数据）⇒ 界面据此显示"沿用系统配置"。
 */
export function roundFeeText(fee: RoundFee | null): string {
  if (fee === null) return '沿用系统配置（本轮没有记录）'
  return (
    `佣金 万${trimZeros(scaledText(fee.commissionRate, 10_000, 4))}` +
    ` · 最低 ¥${amount(fee.minCommission)}` +
    ` · 印花税 ${trimZeros(scaledText(fee.stampDutyRate, 100, 4))}%` +
    ` · 过户费 ${trimZeros(scaledText(fee.transferFeeRate, 100, 4))}%`
  )
}

/** 去掉小数末尾多余的 0（`"0.5000"` → `"0.5"`、`"0.0000"` → `"0"`）。 */
function trimZeros(text: string): string {
  if (!text.includes('.')) return text
  const trimmed = text.replace(/0+$/, '').replace(/\.$/, '')
  return trimmed.length === 0 ? '0' : trimmed
}

/** 股票类型 → 中文标签（未知值回落到原始字符串）。 */
export function tradeTypeLabel(tradeType: string): string {
  switch (tradeType) {
    case 'open':
      return '建仓'
    case 'add':
      return '加仓'
    case 'reduce':
      return '减仓'
    case 'close':
      return '清仓'
    default:
      return tradeType
  }
}

/** 是否为买入方向（`open` / `add`）。 */
export function isBuy(tradeType: string): boolean {
  // 判据只有一份：与 Rust `tr_domain::stock::is_buy` 一致（用成交类型常量，不是裸字面量）
  return tradeType === 'open' || tradeType === 'add'
}

/** 轮次盈亏结果标签：`盈利` / `亏损` / `平`。 */
export function resultLabel(pnl: number): string {
  if (pnl > 0) return '盈利'
  if (pnl < 0) return '亏损'
  return '平'
}

/** 轮次结果徽标的类名后缀（`result-win` / `result-loss` / `result-even`）。 */
export function resultClass(pnl: number): string {
  if (pnl > 0) return 'result-win'
  if (pnl < 0) return 'result-loss'
  return 'result-even'
}

/** Rust `parse::<u32>()`：可选 `+`、纯 ASCII 数字、且不超过 `u32` 上界。 */
function parseU32(text: string): number | null {
  if (!/^\+?[0-9]+$/.test(text)) return null
  const value = Number(text)
  return Number.isInteger(value) && value <= 0xffff_ffff ? value : null
}

/** `YYYY-MM-DD` → `M-D`（事件列表的短日期；解析失败原样返回）。 */
export function shortDate(date: string): string {
  const parts = date.split('-')
  if (parts.length !== 3) return date
  const month = parseU32(parts[1]) ?? 1
  const day = parseU32(parts[2]) ?? 1
  return `${month}-${day}`
}

/** 截断文本（超出时补 `…`，按**字符**计数，规则与 Rust `tr_domain::util` 一致）。 */
export function truncate(text: string, max: number): string {
  const chars = Array.from(text)
  if (chars.length <= max) return text
  return `${chars.slice(0, max).join('')}…`
}
