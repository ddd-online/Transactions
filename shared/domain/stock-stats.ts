/**
 * 股票统计的**指标规则**：七档指标各自的取值、Y 轴语义与上下界、是否画 0 轴参考线。
 *
 * 股票统计指标定义。
 * 它们是这条曲线图的口径：
 *
 * * {@link metricKind} —— 取值语义（金额 / 百分比 / 倍数）决定刻度与 tooltip 的格式化；
 * * {@link metricYBounds} —— **只有天生有边界的指标才给上下界**：胜率是 0..100（出现负数时
 *   -100..100），不给的话自动挑刻度会把"数据正好压在 100%"当成"上界还要再大一档"，
 *   于是多画一条 150% 的网格线；最大回撤同样是百分比但没有天花板，交给按数据自动挑；
 * * {@link metricHasReference} —— 金额类且可能为负的指标才画 y=0 虚线；
 * * {@link metricValue} —— 从统计点里取这一档的值（平均亏损**取负**，曲线画在 0 轴下方）；
 * * {@link metricKey} / {@link metricLabelIn} —— 界面记住的是 **key**，显示的是**随统计口径变**
 *   的文案：分组口径下「累计盈亏」叫「分组盈亏」（那个点的值是**本组**的盈亏合计，不是自起点
 *   累计），其余六档的口径天然跟着统计点走，名字不必变；
 * * {@link metricHint} —— "这个指标在说什么"的一句话（**只写人话，不写公式**：公式在卡片副标题里）。
 *   只有六档有：`TotalPnl` 是合计位那个数，它自己带着"截至 …"的副标题，再挂一句释义只会跟
 *   副标题抢位置 —— 界面按 `null` 决定要不要画那颗 ⓘ。名字与释义都从这里取，卡 / 曲线选择器 /
 *   明细表头因此不会各说各话；
 * * {@link pointSpanLabel} —— 统计点在横轴上的覆盖范围（分组口径下是"第 a-b 笔"）。
 */

import { ChartValueKind } from './chart'
import { type StatisticsStrategy } from './statistics'
import { type StockStatisticsPointDto } from './stock-dto'

/**
 * 统计曲线的七档指标（顺序即界面上的顺序）。
 *
 * 取值就是 {@link metricKey} 的稳定标识：文案会随统计口径变，标识不能是文案。
 */
export const Metric = {
  TotalPnl: 'total_pnl',
  WinRate: 'win_rate',
  AvgWin: 'avg_win',
  AvgLoss: 'avg_loss',
  PnlRatio: 'pnl_ratio',
  Expectancy: 'expectancy',
  MaxDrawdown: 'max_drawdown',
} as const

/** 七档指标之一（对应 的 `Metric` 枚举）。 */
export type Metric = (typeof Metric)[keyof typeof Metric]

/** 全部指标（顺序即渲染顺序）。对应 的 `Metric::ALL`。 */
export const METRICS: readonly Metric[] = [
  Metric.TotalPnl,
  Metric.WinRate,
  Metric.AvgWin,
  Metric.AvgLoss,
  Metric.PnlRatio,
  Metric.Expectancy,
  Metric.MaxDrawdown,
]

/** 界面上显示的名字（逐笔累计口径下；分组口径见 {@link metricLabelIn}）。 */
export function metricLabel(metric: Metric): string {
  switch (metric) {
    case Metric.TotalPnl:
      return '累计盈亏'
    case Metric.WinRate:
      return '胜率'
    case Metric.AvgWin:
      return '平均盈利'
    case Metric.AvgLoss:
      return '平均亏损'
    case Metric.PnlRatio:
      return '盈亏比'
    case Metric.Expectancy:
      return '期望值'
    case Metric.MaxDrawdown:
      return '最大回撤'
  }
}

/**
 * 稳定标识（**界面按它记住选中项**）：文案会随统计口径变，标识不能是文案。
 *
 * TS 里指标本身就是这七个字符串之一，故直接返回它；{@link Metric} 的取值因此就是 key 的
 * 唯一来源。
 */
export function metricKey(metric: Metric): string {
  return metric
}

/**
 * 某个统计口径下的显示名。
 *
 * 只有「累计盈亏」要改：分组口径下它是**本组**的盈亏合计（`totalPnl` 在组点上就是组内求和），
 * 写成"累计"会让人以为曲线仍是自起点累计的那条。
 */
export function metricLabelIn(metric: Metric, strategy: StatisticsStrategy): string {
  return metric === Metric.TotalPnl && strategy === 'grouped' ? '分组盈亏' : metricLabel(metric)
}

/**
 * 「这个指标在说什么」的一句话（见模块文档）。
 *
 * 写的是**读法**不是算法：算法在卡片副标题（"盈利均值 ÷ 亏损均值"）与统计服务里，
 * 这里只回答"我该拿它判断什么"。一句话不带句号、不换行 —— 它是气泡里的一行字，不是段落。
 */
export function metricHint(metric: Metric): string | null {
  switch (metric) {
    // 合计位那个数的不写：它自己带着"截至 … · 第 N 笔结算"的副标题
    case Metric.TotalPnl:
      return null
    case Metric.WinRate:
      return '我赢的次数够不够多'
    case Metric.AvgWin:
      return '赢的时候能赢多少'
    case Metric.AvgLoss:
      return '输的时候会输多少'
    case Metric.PnlRatio:
      return '赢一次的收获等于几次的代价'
    case Metric.Expectancy:
      return '每开一笔，长期平均赚多少'
    case Metric.MaxDrawdown:
      return '最坏的时候我要忍多少'
  }
}

/** 取值语义（决定 Y 轴刻度与 tooltip 的格式化）。 */
export function metricKind(metric: Metric): ChartValueKind {
  switch (metric) {
    case Metric.WinRate:
    case Metric.MaxDrawdown:
      return ChartValueKind.Percent
    case Metric.PnlRatio:
      return ChartValueKind.Ratio
    default:
      return ChartValueKind.Money
  }
}

/**
 * Y 轴上下界：只有**天生有边界**的指标才给（见模块文档）。
 *
 * 返回 `null` = 交给按数据自动挑刻度。
 */
export function metricYBounds(
  metric: Metric,
  values: readonly number[],
): readonly [low: number, high: number] | null {
  if (metric !== Metric.WinRate) return null
  return values.some((value) => value < 0) ? [-100, 100] : [0, 100]
}

/** 是否画 y=0 虚线参考线（金额类且可能为负的指标才画）。 */
export function metricHasReference(metric: Metric): boolean {
  return metric === Metric.TotalPnl || metric === Metric.Expectancy
}

/** 曲线取值（分 / 百分数 / 倍数）。 */
export function metricValue(metric: Metric, point: StockStatisticsPointDto): number {
  switch (metric) {
    case Metric.TotalPnl:
      return point.totalPnl
    case Metric.WinRate:
      return point.winRate
    case Metric.AvgWin:
      return point.avgWin
    // 平均亏损取负（曲线在 0 轴下方）
    case Metric.AvgLoss:
      return -point.avgLoss
    case Metric.PnlRatio:
      return point.pnlRatio ?? 0
    case Metric.Expectancy:
      return point.expectancy
    case Metric.MaxDrawdown:
      return point.maxDrawdownPct
  }
}

/**
 * 一个统计点在横轴上的覆盖范围文案。
 *
 * * 逐笔累计口径：`第 5 笔` —— 那个点覆盖 1..=5，但横轴读作"打到第 5 笔为止"
 *   （`span === sequence`，写成"第 1-5 笔"反而每次都在变）；
 * * 分组口径：`第 1-5 笔` / `第 6-10 笔` —— 分组是不重叠的区间，范围本身才是信息。
 */
export function pointSpanLabel(
  strategy: StatisticsStrategy,
  sequence: number,
  span: number,
): string {
  const first = sequence - span + 1
  if (strategy === 'grouped' && span > 1 && first >= 1) {
    return `第${first}-${sequence}笔`
  }
  return `第${sequence}笔`
}
