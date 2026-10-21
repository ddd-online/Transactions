import { describe, expect, it } from 'vitest'

import {
  ChartValueKind,
  TOOLTIP_GAP,
  Y_AXIS_MAX_SPLITS,
  Y_SPLITS,
  anchorFillAtZero,
  assembleGeometry,
  chartGeometry,
  chartSeries,
  displayValue,
  formatValue,
  groupIsSeries,
  groupNegativeTickLabels,
  hitIndex,
  niceAxisRange,
  paintBySign,
  placeTooltip,
  pointsAt,
  rowsAt,
  solidDots,
  thinLabels,
  xExtent,
  yOf,
  yRange,
  type MeasuredPoints,
} from '../../shared/domain/chart'

// 图表几何与取数断言：
// 测试名、SVG 探针、断言里的字符串与数字都与 Rust 版一致。
// Rust 的 `assert_eq!(option, Some(x))` 在这里是 `expect(...).toBe(x)`，`None` 是 `toBeNull()`。
// `f32::EPSILON` 不是 `Number.EPSILON`（后者是 f64 的），单独写出来。
const F32_EPSILON = 1.1920928955078125e-7

/** charts-rs 1.0.0 的真实输出（裁剪版）：900×320、Y 轴 -100000..100000 共 4 段、数据 -20000 / -5000 / 60000。 */
const PROBE_SVG = '<svg width="900" height="320" viewBox="0 0 900 320" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="900" height="320" fill="#FFFFFF"/><g stroke="#E0E6F2"><line stroke-width="1" x1="64" y1="8" x2="858" y2="8"/><line stroke-width="1" x1="64" y1="147" x2="858" y2="147"/><line stroke-width="1" x1="64" y1="286" x2="858" y2="286"/></g><path d="M 196.3 174.8 L 461 153.9 L 725.7 63.6 L 725.7 286 L 196.3 286 L 196.3 174.8" fill="#5470C6" fill-opacity="0.4"/><g><path d="M 196.3 174.8 L 461 153.9 L 725.7 63.6" stroke-width="2" fill="none" stroke="#5470C6"/><circle cx="196.3" cy="174.8" r="2.5" stroke-width="2" stroke="#5470C6" fill="none"/></g></svg>'

/** charts-rs 1.0.0 的真实刻度文字输出（8 个 `<text>` 节点，其余裁掉）。 */
const TICK_PROBE_SVG = `<g>
<text font-size="12" x="5" y="12" font-family="ui-monospace, Consolas, monospace" fill="#667085">
100,000
</text>
<text font-size="12" x="12" y="81.5" font-family="ui-monospace, Consolas, monospace" fill="#667085">
50,000
</text>
<text font-size="12" x="43" y="151" font-family="ui-monospace, Consolas, monospace" fill="#667085">
0
</text>
<text font-size="12" x="11" y="220.5" font-family="ui-monospace, Consolas, monospace" fill="#667085">
-50000
</text>
<text font-size="12" x="4" y="290" font-family="ui-monospace, Consolas, monospace" fill="#667085">
-100000
</text>
<text font-size="12" x="169.3" y="306" font-family="ui-monospace, Consolas, monospace" fill="#667085">
2026-01
</text>
<text font-size="12" x="435" y="306" font-family="ui-monospace, Consolas, monospace" fill="#667085">
2026-02
</text>
<text font-size="12" x="702.2" y="306" font-family="ui-monospace, Consolas, monospace" fill="#667085">
2026-03
</text>
</g>`

/** 把范围展开成刻度（与图表库的取法一致：`min + i × (max-min)/splits`）。 */
function ticks(min: number, max: number, splits: number): number[] {
  const step = (max - min) / splits
  return Array.from({ length: splits + 1 }, (_, index) => min + step * index)
}

/** Rust 测试里的 `.unwrap()`：算不出范围就让测试直接失败。 */
function unwrapRange(
  range: readonly [number, number, number] | null,
): readonly [number, number, number] {
  if (range === null) throw new Error('算不出范围')
  return range
}

/** 从改写后的 SVG 里取填充 path 的 `d`。 */
function fillPathD(svg: string): string {
  const tag = svg.split('<path ').find((part) => part.includes('fill-opacity'))
  if (tag === undefined) throw new Error('SVG 里应该有填充 path')
  const match = /(?:^|\s)d="([^"]*)"/.exec(tag)
  if (match === null) throw new Error('填充 path 必须有 d')
  return match[1]
}

describe('chart', () => {
  it('solid_dots_only_touches_circles', () => {
    const svg =
      '<path d="M0 0 L1 1" stroke="#DC2626" fill="none"/>' +
      '<circle cx="1" cy="1" r="2.5" stroke-width="2" stroke="#DC2626" fill="none"/>' +
      '<circle cx="3" cy="3" r="5.5" stroke-width="2" stroke="#16A34A" fill="#16A34A"/>'
    const hexes = ['#DC2626', '#16A34A']
    const out = solidDots(svg, hexes)
    // 折线路径**不许**被填成面积
    expect(out).toContain('<path d="M0 0 L1 1" stroke="#DC2626" fill="none"/>')
    // 数据点变成实心
    expect(out).toContain(
      '<circle cx="1" cy="1" r="2.5" stroke-width="2" stroke="#DC2626" fill="#DC2626"/>',
    )
    // 图例标记本来就是实心，保持原样
    expect(out).toContain(
      '<circle cx="3" cy="3" r="5.5" stroke-width="2" stroke="#16A34A" fill="#16A34A"/>',
    )
    // 认不出的色号不动它：序列色不在调色板里时保持原样，不会被填错色
    const untouched = solidDots(
      '<circle cx="9" cy="9" r="2" stroke="#000000" fill="none"/>',
      hexes,
    )
    expect(untouched).toContain('stroke="#000000" fill="none"/>')
  })

  it('thin_labels_keeps_first_and_last', () => {
    const categories = Array.from({ length: 12 }, (_, index) => `2026-${String(index).padStart(2, '0')}`)
    const narrow = thinLabels(categories, 320)
    expect(narrow.length).toBe(categories.length)
    expect(narrow[0]).toBe(categories[0])
    expect(narrow[11]).toBe(categories[11])
    expect(narrow.filter((label) => label.length > 0).length).toBeLessThan(categories.length)
    const wide = thinLabels(categories, 2400)
    expect(wide.filter((label) => label.length > 0).length).toBe(categories.length)
  })

  it('money_is_drawn_in_yuan', () => {
    expect(Math.abs(displayValue(123_456, ChartValueKind.Money) - 1234.56)).toBeLessThan(0.01)
    expect(Math.abs(displayValue(50, ChartValueKind.Percent) - 50)).toBeLessThan(F32_EPSILON)
    expect(Math.abs(displayValue(7, ChartValueKind.Count) - 7)).toBeLessThan(F32_EPSILON)
  })

  it('tooltip_rows_are_formatted_per_kind', () => {
    expect(formatValue(123_456, ChartValueKind.Money, true)).toBe('¥1234.56')
    expect(formatValue(12_500, ChartValueKind.Percent, true)).toBe('12500.00%')
    // 百分数**不除 100**：后端给的就是"已是百分数"的值，所以只有 Money 那条分支做分 → 元换算。
    expect(formatValue(125, ChartValueKind.Percent, true)).toBe('125.00%')
    expect(formatValue(3, ChartValueKind.Count, true)).toBe('3')
  })

  it('hit_index_picks_nearest_category', () => {
    const geometry = chartGeometry({ xs: [10, 50, 90] })
    expect(hitIndex(geometry, 12)).toBe(0)
    expect(hitIndex(geometry, 48)).toBe(1)
    expect(hitIndex(geometry, 200)).toBe(2)
    expect(hitIndex(chartGeometry(), 12)).toBeNull()
  })

  /** tooltip 必须**跟着鼠标**（用户报的缺陷：它一直钉在图表顶部）。 */
  it('tooltip_follows_the_pointer_vertically', () => {
    // 同一根竖线上，鼠标在上半部 vs 下半部 → 浮层的 top 必须跟着走
    // （浮层高度取 40：60px 处上方放得下，才走"在指针上方"那条分支；
    //   放不下要翻到下方，见本测试最后一段）
    const high = placeTooltip([400, 60], 800, 200, 40)
    const low = placeTooltip([400, 300], 800, 200, 40)
    expect(low.top, `浮层要跟着鼠标往下走（high=${high.top}, low=${low.top}）`).toBeGreaterThan(
      high.top,
    )
    // 鼠标在上方时浮层在其**上方**（`translateY(-100%)`），在下方时也仍在上方（y 够）
    expect(high.translateY).toBe(-100)
    expect(high.top).toBe(60 - TOOLTIP_GAP)
    expect(low.translateY).toBe(-100)
    // 贴着画布顶边放不下 → 翻到指针下方
    const atTop = placeTooltip([400, 20], 800, 200, 80)
    expect(atTop.translateY).toBe(0)
    expect(atTop.top).toBe(20 + TOOLTIP_GAP)
  })

  it('tooltip_stays_inside_the_canvas_horizontally', () => {
    // 中间：以指针为中心
    const center = placeTooltip([400, 300], 800, 200, 80)
    expect([center.left, center.translateX]).toEqual([400, 50])
    // 贴左边：贴住左边缘（完整可见）
    const left = placeTooltip([30, 300], 800, 200, 80)
    expect([left.left, left.translateX]).toEqual([0, 0])
    // 贴右边：贴住右边缘
    const right = placeTooltip([790, 300], 800, 200, 80)
    expect([right.left, right.translateX]).toEqual([800, 100])
    // 画布比浮层窄：居中，没有可挪的余地
    const narrow = placeTooltip([40, 300], 120, 200, 80)
    expect([narrow.left, narrow.translateX]).toEqual([60, 50])
    // 首帧量不到宽度（0）时按兜底宽度算，不会算出 NaN / 负值
    const unmeasured = placeTooltip([400, 300], 800, 0, 0)
    expect(unmeasured.translateX).toBe(50)
    expect(Number.isFinite(unmeasured.left) && unmeasured.left >= 0).toBe(true)
  })

  /**
   * 只有一组数据时，tooltip 也必须能出来（实测缺陷：单点图 hover 没反应）。
   *
   * 根因是"每个序列至少两个圆才算序列"那条判定把单点序列整条丢掉了。
   */
  it('single_point_series_still_yields_geometry', () => {
    // 判定本身：一个圆也算序列
    expect(groupIsSeries(1, 1), '单点序列必须被收下').toBe(true)
    expect(groupIsSeries(1, 0), '没有数据点的分组才算无效').toBe(false)
    expect(groupIsSeries(0, 1), '没有路径的分组算无效').toBe(false)

    // 单点几何：3 个序列各 1 个点、同一个类目
    const points: MeasuredPoints = [
      [['#DC2626', 100, 40]],
      [['#16A34A', 100, 55]],
      [['#3964FE', 100, 90]],
    ]
    const categories = ['2022-04']
    const series = [
      chartSeries('支出', '#DC2626', [10_400]),
      chartSeries('收入', '#16A34A', [8_000]),
      chartSeries('转账', '#3964FE', [0]),
    ]
    const geometry = assembleGeometry(points, categories, series, ChartValueKind.Money)

    expect(geometry.xs, '单类目也要有一个 x').toEqual([100])
    expect(geometry.categories.length).toBe(1)
    // tooltip 的内容来自 `rowsAt`：单点上三个序列都要在
    const rows = rowsAt(geometry, 0)
    expect(rows.length, '三个序列都应出现在 tooltip 里').toBe(3)
    expect(rows.some(([label]) => label === '支出')).toBe(true)
    // 命中：鼠标落在那个点上（唯一类目）
    expect(hitIndex(geometry, 100)).toBe(0)
    expect(hitIndex(geometry, 40), '唯一类目怎么指都是它').toBe(0)
  })

  it('reference_line_uses_affine_mapping', () => {
    // 金额图：`valueAxis` 存的是**元**（0 元 → y=100，100 元 → y=0），
    // 而 `yOf` 收的是**分**（50 元 = 5000 分 → y=50）。
    const geometry = chartGeometry({
      valueAxis: [0, 100, 100, 0],
      kind: ChartValueKind.Money,
    })
    expect(yOf(geometry, 5_000)).toBe(50)
    expect(yOf(geometry, 0)).toBe(100)
    expect(yOf(geometry, 10_000)).toBe(0)
    expect(yOf(chartGeometry(), 0)).toBeNull()
  })

  it('geometry_assembles_rows_and_axis', () => {
    const categories = ['a', 'b']
    const series = [chartSeries('支出', 'var(--x)', [100, 300])]
    const measured: MeasuredPoints = [
      [
        ['#dc2626', 10, 90],
        ['#dc2626', 20, 70],
      ],
    ]
    const geometry = assembleGeometry(measured, categories, series, ChartValueKind.Money)
    expect(geometry.xs).toEqual([10, 20])
    expect(xExtent(geometry)).toEqual([10, 20])
    expect(yRange(geometry)).toEqual([70, 90])
    expect(rowsAt(geometry, 0).length).toBe(1)
    expect(pointsAt(geometry, 1).length).toBe(1)
    // 1.00 元 → y=90，3.00 元 → y=70 ⇒ 2.00 元（200 分）→ y=80
    expect(yOf(geometry, 200)).toBe(80)
  })

  // ---------------------------------------------------------------- Y 轴范围

  it('axis_ticks_are_round_numbers_for_positive_money', () => {
    // 用户报的那张图：月支出最高约 3.6 万 —— 以前是 9,500 / 19,000 / 28,500 / 38,000
    const [min, max, splits] = unwrapRange(niceAxisRange(0, 36_000, null))
    expect(ticks(min, max, splits)).toEqual([0, 10_000, 20_000, 30_000, 40_000])
  })

  it('axis_range_hugs_the_data_when_it_crosses_zero', () => {
    // 跨零**不**做上下对称：期望值那张图（-35..90）曾经被撑成 ±100，底下 50 的空白里
    // 一个数据点都没有 —— 现在各自贴住数据两侧，0 依然落在刻度上。
    const crossing = unwrapRange(niceAxisRange(-35, 90, null))
    expect(ticks(...crossing)).toEqual([-50, 0, 50, 100])

    // 数据自己对称时范围仍然对称（不是被强制的）
    const symmetric = unwrapRange(niceAxisRange(-3_000, 3_000, null))
    expect(ticks(...symmetric)).toEqual([-4_000, -2_000, 0, 2_000, 4_000])

    // 一边高一边矮：各按自己的数据贴边（0 仍是一条刻度）
    const lopsided = unwrapRange(niceAxisRange(-1_000, 5_000, null))
    expect(ticks(...lopsided)).toEqual([-2_000, 0, 2_000, 4_000, 6_000])

    // 只到 0（不跨零）时从 0 起算即可。
    // 这里顺带钉住"上界那格"的代价：数据最大值 5000 恰好是 1000 的整数倍，而自定义上界
    // 必须**严格**大于它，于是 1000 的步长要 6 段（0…6000）—— 超过 5 段的上限，
    // 这一档只能让位给 2000 的步长（宁可网格粗一档，也不超段数）。
    const positive = unwrapRange(niceAxisRange(0, 5_000, null))
    expect(ticks(...positive)).toEqual([0, 2_000, 4_000, 6_000])
  })

  it('percent_bounds_hold_the_axis_within_one_hundred', () => {
    // 胜率：数据打到 100% 时上界也停在 100 —— 只抬一个刻度文字里看不见的微量
    // （图表库要求 `axis_max` 严格大于数据最大值；刻度按一位小数格式化）。
    const [min, max, splits] = unwrapRange(niceAxisRange(0, 100, [0, 100]))
    expect(min).toBe(0)
    expect(max, '上界不该跑出 100').toBeGreaterThan(100)
    expect(max, '上界不该跑出 100').toBeLessThan(100.1)
    expect(splits).toBe(Y_SPLITS)
    // 刻度按**一位小数**取整后必须是 25 的整数倍 —— 图表库就是这么格式化刻度文字的
    // （`format_float`：一位小数、去掉 `.0`），所以那点微量不会出现在轴上。
    const rounded = ticks(min, max, splits).map((value) => Math.round(value * 10) / 10)
    expect(rounded).toEqual([0, 25, 50, 75, 100])

    // 有负数（亏损笔）时给 -100..100
    const signed = unwrapRange(niceAxisRange(-30, 40, [-100, 100]))
    expect(ticks(...signed)).toEqual([-100, -50, 0, 50, 100])

    // 数据超出给定上下界时不信边界（防御）：退回按数据挑
    const [, overMax] = unwrapRange(niceAxisRange(-30, 140, [0, 100]))
    expect(overMax, '数据超界时必须按数据挑').toBeGreaterThan(140)
  })

  it('ratio_and_percent_keep_two_decimals', () => {
    // 用户报的那张图：盈亏比 0.81 被取整成 1（曲线一直是平的）
    expect(formatValue(0.8129, ChartValueKind.Ratio, true)).toBe('0.81')
    expect(formatValue(1, ChartValueKind.Ratio, true)).toBe('1.00')
    expect(formatValue(83.333, ChartValueKind.Percent, true)).toBe('83.33%')
    expect(formatValue(12_345, ChartValueKind.Money, true)).toBe('¥123.45')
  })

  it('axis_range_covers_the_data_and_keeps_a_strict_upper_bound', () => {
    // 图表库只在 `axis_max > 数据最大值` 时才认这个自定义上界，否则退回它自己的阶梯；
    // 数据最大值恰好落在刻度上时（36000 是 1000 的整数倍）也必须抬一格。
    for (const [dataMin, dataMax] of [
      [0, 36_000],
      [0, 40_000],
      [0, 0],
      [-3_000, 3_000],
      [-1_000, 5_000],
      [-900, -100],
      [0, 100],
      [0, 2.5],
      [4_000, 4_000],
      [12_345.67, 98_765.43],
    ] as const) {
      const [min, max, splits] = unwrapRange(niceAxisRange(dataMin, dataMax, null))
      expect(min, `${min} 没盖住下界 ${dataMin}`).toBeLessThanOrEqual(dataMin)
      expect(Math.fround(max), `${max} 没有严格大于上界 ${dataMax}`).toBeGreaterThan(
        Math.fround(dataMax),
      )
      expect(splits).toBeGreaterThanOrEqual(1)
      expect(splits).toBeLessThanOrEqual(Y_AXIS_MAX_SPLITS)
      // 每条刻度都是步长的整数倍（也就是"大整数"）
      const step = (max - min) / splits
      for (const value of ticks(min, max, splits)) {
        const units = value / step
        expect(
          Math.abs(units - Math.round(units)),
          `刻度 ${value} 不是步长 ${step} 的整数倍`,
        ).toBeLessThan(1e-6)
      }
    }
  })

  // ---------------------------------------------------------------- 面积填充基线

  it('fill_baseline_moves_to_the_zero_axis', () => {
    // 跨零：填充的两个收尾点必须落在 0 刻度（y=147）上，折线各点与"回到首点"保持不变
    const svg = anchorFillAtZero(PROBE_SVG, [-100_000, 100_000, 4])
    expect(fillPathD(svg)).toBe(
      'M 196.3 174.8 L 461 153.9 L 725.7 63.6 L 725.7 147 L 196.3 147 L 196.3 174.8',
    )
    // 折线 path 与数据点圆**一个字节都不许动**（它们同样以 `<path `/`<circle` 开头）
    expect(svg).toContain(
      '<path d="M 196.3 174.8 L 461 153.9 L 725.7 63.6" stroke-width="2" fill="none"',
    )
    expect(svg).toContain('<circle cx="196.3" cy="174.8" r="2.5"')
    // 网格线与其余部分原样
    expect(svg).toContain('<line stroke-width="1" x1="64" y1="147" x2="858" y2="147"/>')
    expect(svg.length, '只该改数字，不该改变长度以外的结构').toBe(PROBE_SVG.length)
  })

  it('fill_baseline_is_untouched_when_zero_is_an_edge_of_the_axis', () => {
    // 全正：0 就在绘图区底边 —— 基线本来就在 0 上，改写结果必须与原来一致
    const positive = anchorFillAtZero(PROBE_SVG, [0, 40_000, 4])
    expect(fillPathD(positive)).toBe(fillPathD(PROBE_SVG))

    // 全负：0 在绘图区**顶边**（y=8），面积应该向上长
    const negative = anchorFillAtZero(PROBE_SVG, [-1_000, 0, 5])
    expect(fillPathD(negative)).toBe(
      'M 196.3 174.8 L 461 153.9 L 725.7 63.6 L 725.7 8 L 196.3 8 L 196.3 174.8',
    )
  })

  it('fill_baseline_is_left_alone_without_a_trustworthy_axis', () => {
    // 没有我们自己的范围（`niceAxisRange` 兜底失败）⇒ 不知道 0 在哪儿，不许动
    expect(anchorFillAtZero(PROBE_SVG, null)).toBe(PROBE_SVG)
    // 退化范围同样不动
    expect(anchorFillAtZero(PROBE_SVG, [1, 1, 4])).toBe(PROBE_SVG)
    // 多段路径（数据有空洞时图表库会拆段）「最后三个点是基线」不再成立 ⇒ 宁可不动
    const multi = PROBE_SVG.replaceAll(
      'L 725.7 63.6 L 725.7 286',
      'L 725.7 63.6 M 461 100 L 725.7 286',
    )
    expect(anchorFillAtZero(multi, [-100_000, 100_000, 4])).toBe(multi)
  })

  it('zero_axis_geometry_agrees_with_the_data_points', () => {
    // 基线的 y 是**反推**出来的（`bottom + H×min/(max−min)`），这里拿探针 SVG 里的
    // 数据点做交叉验证：-20000 → y=174.8、60000 → y=63.6 定出的映射，0 必须落在同一条 0 轴上。
    const [yA, vA] = [174.8, -20_000]
    const [yB, vB] = [63.6, 60_000]
    const fromPoints = yA + ((0 - vA) * (yB - yA)) / (vB - vA)
    const svg = anchorFillAtZero(PROBE_SVG, [-100_000, 100_000, 4])
    const tokens = fillPathD(svg)
      .split(/\s+/)
      .map((token) => Number(token))
      .filter((value) => Number.isFinite(value))
    expect(tokens.length, 'd 里应该有 8 个数').toBeGreaterThan(7)
    const baseline = tokens[7] // 第 4 个点的 y（收尾基线）
    expect(
      Math.abs(baseline - fromPoints),
      `反推的 0 轴 ${baseline} 与数据点定出的 ${fromPoints} 不一致`,
    ).toBeLessThan(0.5)
  })

  // ---------------------------------------------------------------- 0 轴分色
  //
  // 用户报的那张「累计盈亏」：面积整块一个颜色，0 轴上下的部分看不出盈亏。
  // 探针 SVG 的三点跨零（-20000 / -5000 / 60000，0 轴在 y=147），正好覆盖这一档。

  it('fill_and_line_split_at_the_zero_axis', () => {
    const svg = paintBySign(PROBE_SVG, [-100_000, 100_000, 4], '#DC2626', '#16A34A')
    // 面积：0 轴之下（y > 147）那段绿、之上（y < 147）那段红，各自闭到 0 轴
    const belowFill =
      '<path d="M 196.3 174.8 L 461 153.9 L 481.2 147 L 196.3 147"' +
      ' fill="#16A34A" fill-opacity="0.4"/>'
    const aboveFill =
      '<path d="M 481.2 147 L 725.7 63.6 L 725.7 147 L 481.2 147"' +
      ' fill="#DC2626" fill-opacity="0.4"/>'
    expect(svg, svg).toContain(belowFill)
    expect(svg, svg).toContain(aboveFill)
    // 折线同色：交点（481.2, 147）是两段共用的端点
    const belowLine =
      '<path d="M 196.3 174.8 L 461 153.9 L 481.2 147"' +
      ' stroke-width="2" fill="none" stroke="#16A34A"/>'
    const aboveLine =
      '<path d="M 481.2 147 L 725.7 63.6"' +
      ' stroke-width="2" fill="none" stroke="#DC2626"/>'
    expect(svg, svg).toContain(belowLine)
    expect(svg, svg).toContain(aboveLine)
    // 数据点按圆心落在哪一侧着色（`stroke` 与 `fill` 一起换，边框与实心色一致）
    const dot =
      '<circle cx="196.3" cy="174.8" r="2.5" stroke-width="2"' +
      ' stroke="#16A34A" fill="#16A34A"/>'
    expect(svg, svg).toContain(dot)
    // 网格线一个字节都不动
    expect(svg).toContain('<line stroke-width="1" x1="64" y1="147" x2="858" y2="147"/>')
  })

  it('split_stays_untouched_without_a_trustworthy_zero_axis', () => {
    // 没有自己算出的范围 ⇒ 不知道 0 在哪儿，整条保持单色
    expect(paintBySign(PROBE_SVG, null, '#DC2626', '#16A34A')).toBe(PROBE_SVG)
    expect(paintBySign(PROBE_SVG, [1, 1, 4], '#DC2626', '#16A34A')).toBe(PROBE_SVG)
  })

  // ---------------------------------------------------------------- Y 轴负刻度的千分位

  it('negative_tick_labels_get_thousands_separators', () => {
    const out = groupNegativeTickLabels(TICK_PROBE_SVG)
    expect(out, out).toContain('>\n-50,000\n</text>')
    expect(out, out).toContain('>\n-100,000\n</text>')
    // 正数（图表库自己就分好组了）、0、类目轴文字保持原样
    expect(out, out).toContain('>\n100,000\n</text>')
    expect(out, out).toContain('>\n50,000\n</text>')
    expect(out, out).toContain('>\n0\n</text>')
    expect(out, out).toContain('>\n2026-03\n</text>')
    // 唯一的差别是**多了两个逗号**：属性、换行、其余文字都不许动
    expect(out.replaceAll(',', '')).toBe(TICK_PROBE_SVG.replaceAll(',', ''))
    expect(out.length).toBe(TICK_PROBE_SVG.length + 2)
    // 幂等：已经分好组的不会再被改一次
    expect(groupNegativeTickLabels(out)).toBe(out)
  })

  it('tick_grouping_leaves_everything_else_alone', () => {
    // 不到 4 位的负数本来就不该分组（`-500` 与 `500` 是同一个写法）
    const short = '<text x="1">\n-500\n</text>'
    expect(groupNegativeTickLabels(short)).toBe(short)
    // 百分比轴：后缀要保住
    expect(groupNegativeTickLabels('<text x="1">-50000%</text>')).toBe(
      '<text x="1">-50,000%</text>',
    )
    // 类目那种"负号打头的多段数字"不碰（后缀里出现数字就不认）
    const category = '<text x="1">-2026-01</text>'
    expect(groupNegativeTickLabels(category)).toBe(category)
    // 一个文字节点都没有 ⇒ 逐字节相同（探针 SVG 里只有路径与圆）
    expect(groupNegativeTickLabels(PROBE_SVG)).toBe(PROBE_SVG)
    // 标签不成对 ⇒ 宁可不动
    const broken = '<text x="1">-50000'
    expect(groupNegativeTickLabels(broken)).toBe(broken)
  })
})
