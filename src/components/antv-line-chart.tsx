import { memo, useEffect, useRef, type JSX } from 'react'
import { Chart } from '@antv/g2'

import type { ChartLineData } from '../../shared/types/transaction'
import { chartTextTokens } from '../theme/chart-text'

export interface AntvLineChartProps {
  lines: ChartLineData[]
  colors: string[]
}

/** AntV G2 折线图：只负责把后端返回的曲线画出来。
 *
 * `memo` 是必须的：建图 effect 依赖 `lines` / `colors`，而 G2 建图是"销毁 + 重建 + 重画"
 * （一个 canvas、一堆 DOM、一次完整绘制）。页面里任何无关的状态变化（重命名弹窗里打字、
 * 拖排序、切选中项）都会让父组件重渲染，没有 `memo` 时整张图跟着重画一遍。 */
export const AntvLineChart = memo(function AntvLineChart({
  lines,
  colors,
}: AntvLineChartProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const rows = lines.flatMap((line) =>
      line.data.map((point) => ({
        time: point.time,
        label: line.label,
        amount: point.amount / 100,
      })),
    )
    const times = lines[0]?.data.map((point) => point.time) ?? []
    const chart = new Chart({
      container,
      autoFit: true,
      paddingLeft: 48,
      paddingRight: 24,
      paddingTop: 12,
      paddingBottom: 32,
    })
    chart.data(rows)
    chart.scale('x', { domain: times, type: 'point' })
    chart.scale('y', { domainMin: 0, nice: true })
    chart.scale('color', { range: colors.slice(0, lines.length) })
    const text = chartTextTokens()
    chart.axis('x', {
      title: false,
      labelFill: text.labelFill,
      labelFontFamily: text.fontFamily,
      labelFontSize: 12,
      line: false,
      tick: false,
    })
    chart.axis('y', {
      title: false,
      labelFill: text.labelFill,
      labelFontFamily: text.fontFamily,
      labelFontSize: 12,
      line: false,
      tick: false,
      grid: true,
      gridStroke: text.gridStroke,
      gridStrokeOpacity: 1,
      gridLineWidth: 1,
      gridLineDash: [0, 0],
    })
    chart.legend(false)
    /* 提示框只留一张表：标题是"哪个月"，下面一条一行（支出 / 收入 / 转账）。
     * 不给折线配置 items 时，G2 会把同一个月上所有曲线的值按 color 分组列出来 —— 正是要的；
     * 但折线本身点不到，跟着画的散点（`point()`）若不关掉提示，会再补一栏原始字段
     * （`time` / `amount`），于是同一张提示框里出现两套数据：用户截图里被圈出来的那一块。 */
    const tooltip = {
      title: (datum: Record<string, unknown>) => String(datum.time ?? ''),
      /* 金额一律两位小数：G2 默认按"有效数字"精简（15000 / 22798.87 / 0 混排），
       * 与全站金额（15000.00）对不上。 */
      items: [
        { channel: 'y', valueFormatter: (value: number) => Number(value).toFixed(2) },
      ],
    }
    chart
      .line()
      .data(rows)
      .encode('x', 'time')
      .encode('y', 'amount')
      .encode('color', 'label')
      .style('lineWidth', 2)
      .tooltip(tooltip)
    chart
      .point()
      .data(rows)
      .encode('x', 'time')
      .encode('y', 'amount')
      .encode('color', 'label')
      .style('r', 3)
      .tooltip(false)
    chart.render()
    return () => {
      chart.destroy()
    }
  }, [colors, lines])

  return <div className="antv-chart" data-testid="chart-svg" ref={containerRef} />
})
