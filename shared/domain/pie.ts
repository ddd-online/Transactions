/**
 * 饼图的纯逻辑：把"每组一个扇区"折成"最多 N 个扇区 + 其他"。
 *
 * 属于渲染层规则，不认识 DOM、也不认识图表库：输入是已按金额倒序的切片，
 * 输出是同一形状的切片（多一片「其他」）。图上与右侧合计列读的是**同一份**结果 ——
 * 两处各折一次，就会出现「图里 11 片、列里 30 行」这种对不上的样子。
 */

/** 一片：`key` 是原始分组值，`label` 是展示文案，`amount` 是分。 */
export interface PieSlice {
  key: string
  label: string
  amount: number
}

/** 图上最多画几片（不含「其他」）。再多就是一圈细得看不见的缝。 */
export const PIE_MAX_SLICES = 10

/** 折叠出来的那一片的 key（颜色由调用方给中性色，标签由调用方补上组数）。 */
export const PIE_OTHER_KEY = '__other__'

export interface FoldedPie {
  /** 不超过 `max + 1` 片；折叠时最后一片是「其他」 */
  slices: PieSlice[]
  /** 被折进「其他」的组数（0 表示没折） */
  folded: number
}

/**
 * 超过 `max` 组时取前 `max` 组，其余合成一片「其他」。
 *
 * 输入按金额倒序（服务层已排好），这里不再排序：折叠保留原有次序，
 * 前 N 组的颜色与顺序在两次查询之间不会因为折叠而改变。
 */
export function foldPieSlices(slices: readonly PieSlice[], max = PIE_MAX_SLICES): FoldedPie {
  if (slices.length <= max) return { slices: [...slices], folded: 0 }
  const head = slices.slice(0, max)
  const tail = slices.slice(max)
  const amount = tail.reduce((sum, slice) => sum + slice.amount, 0)
  return {
    slices: [...head, { key: PIE_OTHER_KEY, label: '其他', amount }],
    folded: tail.length,
  }
}
