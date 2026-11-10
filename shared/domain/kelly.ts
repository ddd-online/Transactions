/**
 * 凯利值：按胜率与盈亏比算出的最佳下注比例（凯利公式）。
 *
 * ```text
 * f* = p − (1 − p) / b
 * ```
 *
 * `p` 是胜率（0..1）、`b` 是盈亏比（平均盈利 ÷ 平均亏损）。它回答的是"这笔钱里该拿
 * 多大比例去冒这一次险"，与账户里现在有多少钱无关 —— 所以单位是**占本金的比例**，
 * 不是金额。
 *
 * 口径跟着统计点走，不另算一遍：平局计入分母（与卡片上的「胜率」同一个 `span`），
 * 盈亏比取点上那个**未取整**的 `pnlRatio`。用已取整的 66.67% 与 1.43 再反推，
 * 会和卡片上的数差出百分位 —— 两次取整就是两个答案。
 *
 * 返回**百分数**（`64.2857` 表示 64.2857%），保留几位由界面定。
 *
 * 结果可以是负数：没有正期望时凯利公式给的就是"不该下注"。这里**不夹到 0** ——
 * 夹到 0 会让"刚好没有边际"和"边际很负"看起来一模一样，而后者才是要改策略的那一种。
 */

export interface KellyInput {
  /** 本点覆盖的结算笔数（含平局） */
  span: number
  /** 其中盈利的笔数 */
  winCount: number
  /** 盈亏比（平均盈利 ÷ 平均亏损）；任一侧没有样本时为 `null` */
  pnlRatio: number | null
}

/**
 * 凯利值（%）；`null` = 没有答案。
 *
 * 没有亏损样本时赔率是无穷、没有盈利样本时公式给的是无穷负，两种都不是一个百分数，
 * 所以只要 `pnlRatio` 为 `null` 就返回 `null`（界面显示占位符）。
 */
export function kellyPercent(point: KellyInput): number | null {
  if (point.pnlRatio === null || point.span <= 0) return null
  const win = point.winCount / point.span
  return (win - (1 - win) / point.pnlRatio) * 100
}
