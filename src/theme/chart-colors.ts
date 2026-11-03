/**
 * 图表的颜色：**一套色板，两个图表共用**。
 *
 * 折线图按「第 N 条曲线 = 第 N 色」，饼图按「第 N 名 = 第 N 色」，取的是同一份色板 ——
 * 画布、图例、右侧合计列读同一个索引，所以一条曲线或一片扇区的颜色在哪儿都一样。
 *
 * 色板只有三个色相家族（见 DESIGN.md「Series palette」）：支出红、收入绿、转账蓝，
 * 每族三档轻重（中 / 浅 / 深）。家族之外只有一个中性灰，给饼图折出来的「其他」。
 *
 * 画布读不到 CSS 变量，所以每个值都在建图前从根元素解析一次（`readToken`），深色主题换一套；
 * 取不到时落回浅色那组的字面量（单元测试里没有 DOM）。
 */

import { PIE_OTHER_KEY } from '../../shared/domain/pie'

/** 色板槽位：三个家族 × 三档 —— 正好是饼图的折叠上限（`PIE_MAX_SLICES`）。 */
const SERIES_SLOT_COUNT = 9

/** 浅色取值，同时是取不到令牌时的兜底。 */
const SERIES_FALLBACKS = [
  '#c36d64',
  '#509c67',
  '#5b8bcb',
  '#cf9077',
  '#6ab396',
  '#8e9fd7',
  '#ad5561',
  '#51843e',
  '#277bb2',
]

const SERIES_OTHER_FALLBACK = '#8b919a'

/** 三个家族的中档：支出红 / 收入绿 / 转账蓝 —— 就是色板的第 1–3 位。 */
const PIE_TYPE_SLOTS: Record<string, number> = { expense: 0, income: 1, transfer: 2 }

function readToken(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

/** 整套色板（9 色，顺序即位置）。每次现取，换取主题切换后能重新解析。 */
export function seriesPalette(): string[] {
  return SERIES_FALLBACKS.map((fallback, index) =>
    readToken(`--transactions-color-series-${index + 1}`, fallback),
  )
}

/** 第 N 个位置的颜色；超出槽位取模（多于 9 条曲线时从头再来）。 */
export function seriesColor(index: number): string {
  const slot = index % SERIES_SLOT_COUNT
  return readToken(`--transactions-color-series-${slot + 1}`, SERIES_FALLBACKS[slot])
}

/** 「其他」那一片：中性灰，明确不属于任何一个家族。 */
function seriesOtherColor(): string {
  return readToken('--transactions-color-series-other', SERIES_OTHER_FALLBACK)
}

/** 交易类型对应的家族中档；认不出的类型落到正文次要色。 */
export function pieTypeColor(transactionType: string): string {
  const slot = PIE_TYPE_SLOTS[transactionType]
  if (slot === undefined) return readToken('--transactions-color-text-secondary', '#61666b')
  return seriesColor(slot)
}

/**
 * 饼图每一片的颜色：按分类 / 标签分组按金额名次取色板，按交易类型分组取三个家族的中档。
 *
 * 颜色只跟这一片排第几有关；「其他」永远是中性灰。返回数组与 `slices` 一一对应 ——
 * 图上的扇区与右侧合计列的点读同一份，不会错位。
 */
export function pieSliceColors(
  slices: readonly { key: string }[],
  groupField: string,
): string[] {
  return slices.map((slice, index) => {
    if (slice.key === PIE_OTHER_KEY) return seriesOtherColor()
    // 分类与标签都没有内在色：按金额名次取色板。只有交易类型分到固定的家族。
    if (groupField === 'category' || groupField === 'tag') return seriesColor(index)
    return pieTypeColor(slice.key)
  })
}
