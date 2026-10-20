import { describe, expect, it } from 'vitest'

import { ChartValueKind } from '../../shared/domain/chart'
import {
  STATISTICS_STRATEGIES,
  type StatisticsStrategy,
} from '../../shared/domain/statistics'
import { type StockStatisticsPointDto } from '../../shared/domain/stock-dto'
import {
  METRICS,
  Metric,
  metricHasReference,
  metricHint,
  metricKey,
  metricKind,
  metricLabel,
  metricLabelIn,
  metricValue,
  metricYBounds,
  pointSpanLabel,
} from '../../shared/domain/stock-stats'

/** 一个统计点（对应 Rust 测试里的 `point()`；只填七档指标读的字段）。 */
function point(): StockStatisticsPointDto {
  return {
    totalPnl: 123_456,
    winRate: 62.5,
    avgWin: 8_800,
    avgLoss: 4_400,
    pnlRatio: 2,
    expectancy: 1_100,
    maxDrawdownPct: 7.5,
  }
}

/** Rust 测试里的 `.expect(…)`：六档释义都该在。 */
function hintOf(metric: Metric): string {
  const hint = metricHint(metric)
  if (hint === null) throw new Error(`expected a hint for ${metric}`)
  return hint
}

/** `labels` / `keys` 去重后的条数（Rust 测试的 sort + dedup）。 */
function uniqueCount(values: readonly string[]): number {
  return new Set(values).size
}

describe('metric values', () => {
  it('values come from the point per metric', () => {
    const sample = point()
    expect(metricValue(Metric.TotalPnl, sample)).toBe(123_456)
    expect(metricValue(Metric.WinRate, sample)).toBe(62.5)
    expect(metricValue(Metric.AvgWin, sample)).toBe(8_800)
    expect(metricValue(Metric.AvgLoss, sample), '平均亏损取负').toBe(-4_400)
    expect(metricValue(Metric.PnlRatio, sample)).toBe(2)
    expect(metricValue(Metric.Expectancy, sample)).toBe(1_100)
    expect(metricValue(Metric.MaxDrawdown, sample)).toBe(7.5)
  })

  // 没有亏损样本时盈亏比缺省 0（曲线画 0，而不是断一条）。
  it('a missing ratio reads as zero', () => {
    const sample: StockStatisticsPointDto = { ...point(), pnlRatio: null }
    expect(metricValue(Metric.PnlRatio, sample)).toBe(0)
  })
})

describe('metric axes', () => {
  it('only win rate pins its axis', () => {
    expect(metricYBounds(Metric.WinRate, [10, 90])).toEqual([0, 100])
    expect(
      metricYBounds(Metric.WinRate, [-10, 90]),
      '出现负数时轴要能容纳负的一半',
    ).toEqual([-100, 100])
    for (const metric of METRICS.filter((item) => item !== Metric.WinRate)) {
      expect(metricYBounds(metric, [1, 2]), `${metricLabel(metric)} 交给按数据自动挑`).toBeNull()
    }
  })

  it('reference line only for money metrics that can go negative', () => {
    expect(metricHasReference(Metric.TotalPnl)).toBe(true)
    expect(metricHasReference(Metric.Expectancy)).toBe(true)
    expect(metricHasReference(Metric.WinRate)).toBe(false)
    expect(metricHasReference(Metric.MaxDrawdown)).toBe(false)
    expect(metricHasReference(Metric.AvgWin)).toBe(false)
  })

  it('kinds drive the axis and tooltip formatting', () => {
    expect(metricKind(Metric.WinRate)).toBe(ChartValueKind.Percent)
    expect(metricKind(Metric.MaxDrawdown)).toBe(ChartValueKind.Percent)
    expect(metricKind(Metric.PnlRatio)).toBe(ChartValueKind.Ratio)
    expect(metricKind(Metric.TotalPnl)).toBe(ChartValueKind.Money)
    expect(metricKind(Metric.AvgLoss)).toBe(ChartValueKind.Money)
  })
})

describe('metric naming', () => {
  // 七档都有名字，且名字两两不同。
  it('every metric has a unique label', () => {
    const labels = METRICS.map(metricLabel)
    expect(labels.length).toBe(7)
    expect(labels.every((label) => label.length > 0)).toBe(true)
    expect(uniqueCount(labels), JSON.stringify(labels)).toBe(labels.length)
  })

  // 六档各有"一句话"，累计盈亏没有 —— 界面按 `null` 决定不画那颗 ⓘ。
  it('six metrics carry one plain sentence and the total does not', () => {
    expect(metricHint(Metric.TotalPnl), '合计位那个数不挂释义').toBeNull()
    for (const metric of METRICS.filter((item) => item !== Metric.TotalPnl)) {
      const hint = hintOf(metric)
      expect(hint.trim().length, `${metricLabel(metric)} 的释义是空的`).toBeGreaterThan(0)
      expect(hint.trim(), `${metricLabel(metric)} 的释义首尾不留空白`).toBe(hint)
      expect(hint.endsWith('。'), `一句话不带句号：${hint}`).toBe(false)
      expect(hint.includes('\n') || hint.includes('\r'), `一句话只有一行：${hint}`).toBe(false)
    }
  })

  // 名字里不再有"实际"：盈亏比就是平均盈利 ÷ 平均亏损（旧名「实际盈亏比」已废弃）。
  it('the ratio drops the actual prefix', () => {
    expect(metricLabel(Metric.PnlRatio)).toBe('盈亏比')
    for (const metric of METRICS) {
      expect(metricLabel(metric).includes('实际'), `${metricLabel(metric)} 还带着旧名`).toBe(false)
    }
  })

  // 七档都有稳定的 key，两两不同，且**不随口径变** —— 界面按它记住选中项。
  it('every metric has a unique key', () => {
    const keys = METRICS.map(metricKey)
    expect(keys.length).toBe(7)
    expect(keys.every((key) => key.length > 0)).toBe(true)
    expect(uniqueCount(keys), JSON.stringify(keys)).toBe(keys.length)
  })

  // 显示名只在分组口径下改「累计盈亏」这一档，其余六档两个口径同名。
  it('only the cumulative pnl label follows the strategy', () => {
    for (const metric of METRICS) {
      expect(
        metricLabelIn(metric, 'cumulative'),
        `${metricKey(metric)} 在逐笔累计口径下应当就是本名`,
      ).toBe(metricLabel(metric))
    }
    expect(metricLabelIn(Metric.TotalPnl, 'grouped')).toBe('分组盈亏')
    for (const metric of METRICS.filter((item) => item !== Metric.TotalPnl)) {
      expect(
        metricLabelIn(metric, 'grouped'),
        `${metricKey(metric)} 的口径天然跟着统计点走，名字不必变`,
      ).toBe(metricLabel(metric))
    }
    // 两个口径下七档名字都仍然唯一（界面按文案找选项的那条老路也不会撞）
    for (const strategy of STATISTICS_STRATEGIES) {
      const labels = METRICS.map((metric) => metricLabelIn(metric, strategy))
      expect(uniqueCount(labels), `${strategy} ${JSON.stringify(labels)}`).toBe(labels.length)
    }
  })
})

describe('point span labels', () => {
  // 横轴文案：逐笔累计只报"第 N 笔"（`span` 与 `sequence` 相同也不写成区间），
  // 分组口径报"第 a-b 笔"，单笔的组与末组只剩一笔时退回"第 N 笔"。
  it('span labels show a range only when grouped', () => {
    const cumulative: StatisticsStrategy = 'cumulative'
    const grouped: StatisticsStrategy = 'grouped'
    expect(pointSpanLabel(cumulative, 1, 1)).toBe('第1笔')
    expect(pointSpanLabel(cumulative, 5, 5), '累计点不写区间').toBe('第5笔')
    expect(pointSpanLabel(grouped, 5, 5)).toBe('第1-5笔')
    expect(pointSpanLabel(grouped, 10, 5)).toBe('第6-10笔')
    expect(pointSpanLabel(grouped, 23, 3), '末组不足 N 笔').toBe('第21-23笔')
    expect(pointSpanLabel(grouped, 7, 1), '末组只剩一笔').toBe('第7笔')
    // 序号口径不符（span 比 sequence 还大）时不写出负数开头
    expect(pointSpanLabel(grouped, 1, 5)).toBe('第1笔')
  })
})
