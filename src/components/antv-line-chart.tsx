import { useEffect, useRef, type JSX } from 'react'
import { Chart } from '@antv/g2'

import type { ChartLineData } from '../../shared/types/transaction'
import { chartTextTokens } from '../theme/chart-text'

export interface AntvLineChartProps {
  lines: ChartLineData[]
  colors: string[]
}

/** AntV G2 折线图：只负责把后端返回的曲线画出来。 */
export function AntvLineChart({ lines, colors }: AntvLineChartProps): JSX.Element {
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
    chart
      .line()
      .data(rows)
      .encode('x', 'time')
      .encode('y', 'amount')
      .encode('color', 'label')
      .style('lineWidth', 2)
    chart
      .point()
      .data(rows)
      .encode('x', 'time')
      .encode('y', 'amount')
      .encode('color', 'label')
      .style('r', 3)
    chart.render()
    return () => {
      chart.destroy()
    }
  }, [colors, lines])

  return <div className="antv-chart" data-testid="chart-svg" ref={containerRef} />
}
