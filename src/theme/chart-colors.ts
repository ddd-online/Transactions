/**
 * 图表的颜色。
 *
 * 图表画在 Canvas 上，读不到 CSS 变量的继承 —— 所以每一项颜色都在建图前从根元素解析一次
 * （`readToken`），深色主题换一套值；取不到时落回浅色那组的字面量（单元测试里没有 DOM）。
 *
 * 两条规矩：
 * 1. `CHART_PALETTE` 的**前 6 色不可动、不可换序**：折线图按「第 N 条曲线 = 第 N 色」上色，
 *    换一下顺序，用户积攒下来的直觉就白费了。
 * 2. 饼图**不取这个色板**。曲线是 2px 的线，靠色度站住；饼图是几百像素的实心面积，
 *    同一分量铺满半张纸就是「刺眼」。面积另有一套 `--transactions-color-pie-*`（面积档）：
 *    色度砍到一半、明度收进一条窄带、两档交替，见 DESIGN.md「Pie palette」。
 *
 * 所以这里有两个分量，别混：
 * - 线档 `CHART_PALETTE`：折线图与曲线配置表里的色块，位置即颜色。
 * - 面积档 `piePaletteColor` / `pieTypeColor`：饼图，第 N 名取第 N 色；按交易类型分组时取
 *   语义色的面积档（支出红 / 收入绿 / 转账蓝的柔和版），记录页的金额文字仍然是原语义值。
 */

import { PIE_OTHER_KEY } from '../../shared/domain/pie'

/** 曲线色板（12 色）：折线图的唯一取值来源 —— 画布读的是这张表，不是 `--transactions-color-chart-*`。 */
export const CHART_PALETTE = [
  '#3964fe',
  '#f59e0b',
  '#12b76a',
  '#d92d20',
  '#7c3aed',
  '#0891b2',
  '#ec4899',
  '#84cc16',
  '#f97316',
  '#0ea5e9',
  '#14b8a6',
  '#a16207',
]

/** 饼图正好这么多槽位：`PIE_MAX_SLICES` 是 10，第 11 组起折成「其他」。 */
const PIE_SLOT_COUNT = 10

/** 面积档的浅色取值，同时是取不到令牌时的兜底。 */
const PIE_FALLBACKS = [
  '#6d8acf',
  '#a7593d',
  '#04a19b',
  '#a0557b',
  '#139cb6',
  '#9d621e',
  '#5f9e61',
  '#8e5b99',
  '#c66f76',
  '#7165ad',
]

const PIE_OTHER_FALLBACK = '#8b919a'

/** 交易类型的语义色在面积档里的取值（同色相，轻一档）。 */
const PIE_TYPE_FALLBACKS: Record<string, string> = {
  expense: '#bb756a',
  income: '#5c9b72',
  transfer: '#698cc1',
}

function readToken(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

/** 第 N 名的扇区颜色；超出槽位的取模（正常到不了：超过 10 组就折成「其他」）。 */
export function piePaletteColor(index: number): string {
  const slot = index % PIE_SLOT_COUNT
  return readToken(`--transactions-color-pie-${slot + 1}`, PIE_FALLBACKS[slot])
}

/** 「其他」那一片：中性灰，明确不是某一个分类。 */
function pieOtherColor(): string {
  return readToken('--transactions-color-pie-other', PIE_OTHER_FALLBACK)
}

/** 交易类型的面积色（柔和档）；认不出的类型落到正文次要色。 */
export function pieTypeColor(transactionType: string): string {
  const fallback = PIE_TYPE_FALLBACKS[transactionType]
  if (!fallback) return readToken('--transactions-color-text-secondary', '#61666b')
  return readToken(`--transactions-color-pie-${transactionType}`, fallback)
}

/**
 * 饼图每一片的颜色：按分类 / 标签分组走面积色板（按金额名次），按交易类型分组走语义色的面积档。
 *
 * 颜色只跟这一片属于谁有关；「其他」永远是中性灰。返回数组与 `slices` 一一对应 ——
 * 图上的扇区与右侧合计列的点读同一份，不会错位。
 */
export function pieSliceColors(
  slices: readonly { key: string }[],
  groupField: string,
): string[] {
  return slices.map((slice, index) => {
    if (slice.key === PIE_OTHER_KEY) return pieOtherColor()
    // 分类与标签都没有内在色：按金额名次取色板。只有交易类型有语义色。
    if (groupField === 'category' || groupField === 'tag') return piePaletteColor(index)
    return pieTypeColor(slice.key)
  })
}
