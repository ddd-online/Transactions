/**
 * 图表的颜色。
 *
 * 图表画在 Canvas 上，读不到 CSS 变量的继承 —— 所以折线图的色板是**写死的十六进制**，
 * 而语义色（支出 / 收入 / 转账）在挂载时从 `--transactions-*` 解析一次，深色主题换一套值。
 *
 * 两条规矩：
 * 1. `CHART_PALETTE` 的**前 6 色不可动、不可换序**：折线图按「第 N 条曲线 = 第 N 色」上色，
 *    换一下顺序，用户积攒下来的直觉就白费了。饼图往后接着用，正好够 10 个扇区各一色。
 * 2. 按交易类型分组的饼图不取色板，取**语义色**：支出红、收入绿、转账蓝 —— 和记录页的
 *    金额、曲线配置表里的类型芯片是同一套颜色。类型有颜色，分类没有，所以分类走色板。
 */

import { PIE_OTHER_KEY } from '../../shared/domain/pie'

/** 分类色板（12 色）：前 6 色就是折线图一直用的那 6 个。 */
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

/** 「其他」那一片：中性灰，明确不是某一个分类。 */
const PIE_OTHER_COLOR = '#9aa0a8'

function readToken(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

/** 交易类型的语义色（画布读不到变量，这里解析成当前主题的具体值）。 */
export function typeChartColor(transactionType: string): string {
  switch (transactionType) {
    case 'expense':
      return readToken('--transactions-color-expense', '#dc2626')
    case 'income':
      return readToken('--transactions-color-income', '#16a34a')
    case 'transfer':
      return readToken('--transactions-color-transfer', '#3b82f6')
    default:
      return readToken('--transactions-color-text-secondary', '#61666b')
  }
}

/**
 * 饼图每一片的颜色：按分类分组走色板（按金额名次），按交易类型分组走语义色。
 *
 * 颜色只跟这一片属于谁有关，不跟金额大小以外的东西有关；「其他」永远是中性灰。
 */
export function pieSliceColors(
  slices: readonly { key: string }[],
  groupField: string,
): string[] {
  return slices.map((slice, index) => {
    if (slice.key === PIE_OTHER_KEY) return PIE_OTHER_COLOR
    // 分类与标签都没有内在色：按金额名次取色板。只有交易类型有语义色。
    if (groupField === 'category' || groupField === 'tag') {
      return CHART_PALETTE[index % CHART_PALETTE.length]
    }
    return typeChartColor(slice.key)
  })
}
