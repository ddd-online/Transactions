/**
 * 买点计划：止损 / 止盈相对**买入价**的位置，以及两者的盈亏比。
 *
 * 三个数字只用于展示 —— 台账里存的是用户手写的原文（`stop_loss` / `take_profit` 两列
 * 字符串），买入价由本轮成交算出来。这里把它们换算成百分比与倍数，**不入库、不进 DTO**：
 * 弹窗、只读台账、清仓后归档的那一份读的是同一个 module，改口径只改这一处。
 *
 * ## 口径
 *
 * - 分母是**买入价**（每股平均成交价，不含费用）—— 台账里那个叫「买入成本」的数是总额、
 *   含佣金，拿它对百分比或盈亏比都对不上。同一个分母也让盈亏比与手数无关：它看的是每股赔率。
 * - 盈亏比 = 止盈空间 ÷ 止损空间 = `(止盈 - 买入价) / (买入价 - 止损)`。
 * - 两位小数，四舍五入（与价格、金额同一个取整函数）。正数带 `+`、负数带 `-`，
 *   正好为零写 `0.00%`：零既不是涨也不是跌。
 * - 止损 / 止盈是自由文本（用户可能写「破 15 就走」），只认纯数字、最多三位小数；读不出
 *   数字就当没填。两个字段各自独立：一边写坏不影响另一边的百分比。
 *
 * ## 盈亏比为什么是一个状态而不是空串
 *
 * 「算不出来」有三种完全不同的原因，界面要说三种话：还没填（`missing`）、填了但不是数字
 * （`unreadable`）、两个数字都在但方向不成立（`blocked` —— 止盈不高于买入价，或止损不低于
 * 买入价，保本 / 移动止损就是这一种）。都退化成空串时，弹窗只能对着填满的两个框说「填好
 * 后自动计算」，那是假话；分开之后每一句都能指出下一步。
 */

import { roundHalfAwayFromZero } from './rounding'

/** 盈亏比：`value` 才有数字，另外三种是「为什么还没有」。 */
export type PlanRatio =
  | { kind: 'missing' }
  | { kind: 'unreadable' }
  | { kind: 'blocked' }
  | { kind: 'value'; text: string }

export interface PlanLevels {
  /** 止盈相对买入价，如 `+6.53%`；没填或不是数字时 `null` */
  upside: string | null
  /** 止损相对买入价，如 `-7.64%`；没填或不是数字时 `null` */
  downside: string | null
  riskReward: PlanRatio
}

/** 元文本：可带一个 `+`，整数部分必填，小数最多三位（价格的口径是厘）。 */
const YUAN = /^\+?(\d+)(?:\.(\d{0,3}))?$/

/** 元文本 → 厘；读不出数字或超出安全整数范围时 `null`。 */
function milliOf(text: string): number | null {
  const match = YUAN.exec(text.trim())
  if (!match) return null
  const integer = Number(match[1])
  if (!Number.isSafeInteger(integer)) return null
  const fraction = (match[2] ?? '').padEnd(3, '0')
  const milli = integer * 1000 + Number(fraction)
  return Number.isSafeInteger(milli) ? milli : null
}

/** 百分之一（两位小数的整数表示）→ `x.yz`，不带符号。 */
function fixed2(hundredths: number): string {
  const abs = Math.abs(hundredths)
  return `${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/** 相对成本百分之多少：`level / cost` 折成两位小数、带符号的百分比 */
function percentOf(level: number, cost: number): string {
  const hundredths = roundHalfAwayFromZero(((level - cost) / cost) * 10_000)
  if (hundredths === 0) return '0.00%'
  return `${hundredths > 0 ? '+' : '-'}${fixed2(hundredths)}%`
}

function ratioOf(
  cost: number,
  stop: number | null,
  take: number | null,
  stopText: string,
  takeText: string,
): PlanRatio {
  if (!stopText || !takeText) return { kind: 'missing' }
  if (stop === null || take === null) return { kind: 'unreadable' }
  if (take <= cost || stop >= cost) return { kind: 'blocked' }
  return { kind: 'value', text: fixed2(roundHalfAwayFromZero(((take - cost) * 100) / (cost - stop))) }
}

/**
 * @param buyPrice 台账里的买入价（元字符串，`16.24`）
 * @param stopLoss 台账里手写的止损原文
 * @param takeProfit 台账里手写的止盈原文
 */
export function planLevelsOf(buyPrice: string, stopLoss: string, takeProfit: string): PlanLevels {
  const cost = milliOf(buyPrice)
  if (cost === null || cost <= 0) {
    return { upside: null, downside: null, riskReward: { kind: 'missing' } }
  }

  const take = milliOf(takeProfit)
  const stop = milliOf(stopLoss)
  return {
    upside: take === null ? null : percentOf(take, cost),
    downside: stop === null ? null : percentOf(stop, cost),
    riskReward: ratioOf(cost, stop, take, stopLoss.trim(), takeProfit.trim()),
  }
}
