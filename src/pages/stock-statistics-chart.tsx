import { useEffect, useRef, type JSX } from 'react'

import { Chart } from '@antv/g2'
import { Modal } from 'antd'

import { formatTimestamp } from '../../shared/domain/time'
import type { StockStatisticsPointDto } from '../../shared/types/stock-statistics'
import { Button } from '../components/button'
import { Icon } from '../components/icon'
import { Segmented } from '../components/segmented'
import { chartTextTokens } from '../theme/chart-text'
import { profitLossColor } from '../theme/chart-colors'
import { CHART_DRAW_ANIMATION, shouldAnimateDraw } from '../theme/motion'
import { useThemeMode } from '../theme/theme-mode'

export type MetricKey =
  | 'total_pnl'
  | 'win_rate'
  | 'avg_win'
  | 'avg_loss'
  | 'pnl_ratio'
  | 'expectancy'
  | 'max_drawdown'

type MetricKind = 'money' | 'percent' | 'ratio'

const METRICS: Array<{ key: MetricKey; label: string; kind: MetricKind }> = [
  { key: 'total_pnl', label: '累计盈亏', kind: 'money' },
  { key: 'win_rate', label: '胜率', kind: 'percent' },
  { key: 'avg_win', label: '平均盈利', kind: 'money' },
  { key: 'avg_loss', label: '平均亏损', kind: 'money' },
  { key: 'pnl_ratio', label: '盈亏比', kind: 'ratio' },
  { key: 'expectancy', label: '期望值', kind: 'money' },
  { key: 'max_drawdown', label: '最大回撤', kind: 'percent' },
]

export function metricLabel(metric: MetricKey, grouped: boolean): string {
  if (metric === 'total_pnl' && grouped) return '分组盈亏'
  return METRICS.find((item) => item.key === metric)?.label ?? '累计盈亏'
}

/** 曲线取值：金额换到元，百分比/倍数保持原口径。 */
export function metricValue(point: StockStatisticsPointDto, metric: MetricKey): number {
  switch (metric) {
    case 'total_pnl':
      return point.totalPnl / 100
    case 'win_rate':
      return point.winRate
    case 'avg_win':
      return point.avgWin / 100
    case 'avg_loss':
      return -point.avgLoss / 100
    case 'pnl_ratio':
      return point.pnlRatio ?? 0
    case 'expectancy':
      return point.expectancy / 100
    case 'max_drawdown':
      return point.maxDrawdownPct
  }
}

/**
 * 轴标签上的整数：`(-0.4).toFixed(0)` 是 `'-0'`，画在轴上像一个坏值。
 * 归到 `0` —— 轴刻度本来就不该出现「负零」。
 */
function fixedInt(value: number): string {
  const text = value.toFixed(0)
  return text === '-0' ? '0' : text
}

export function axisText(value: number, metric: MetricKey): string {
  const kind = METRICS.find((item) => item.key === metric)?.kind
  if (kind === 'percent') {
    if (metric === 'max_drawdown') {
      // 回撤保留两位再抹掉尾零（0.79% 不是 1%），同样把「负零」并到 0
      const trimmed = value.toFixed(2).replace(/\.?0+$/, '')
      return `${trimmed === '-0' ? '0' : trimmed}%`
    }
    return `${fixedInt(value)}%`
  }
  return fixedInt(value)
}

export function tooltipText(value: number, metric: MetricKey): string {
  const kind = METRICS.find((item) => item.key === metric)?.kind
  if (kind === 'percent') return `${value.toFixed(2)}%`
  if (kind === 'ratio') return value.toFixed(2)
  return `${value < 0 ? '-' : ''}¥${Math.abs(value).toFixed(2)}`
}

function ChartBox({
  points,
  metric,
  label,
  tall = false,
}: {
  points: StockStatisticsPointDto[]
  metric: MetricKey
  label: string
  tall?: boolean
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  // 画布读不到 CSS 变量，也不跟着主题重画 —— 换主题要自己重取一次色。
  const mode = useThemeMode()

  useEffect(() => {
    const container = ref.current
    if (!container || points.length === 0) return
    const rows = points.map((point, index) => {
      const value = metricValue(point, metric)
      return {
        x: index,
        label: `第${point.sequence}笔 ${formatTimestamp(point.closedAt, 'MM-DD')}`,
        value,
        sign: metric === 'max_drawdown' ? '亏损' : value >= 0 ? '盈利' : '亏损',
        stock: `${point.stockName} ${point.stockCode}`,
      }
    })
    // 折线/面积在**零点**切开：0 轴上方红、下方绿。只在数据点的正负号之间切
    // 会把"从盈利回落到 0"的那块面积整片染成绿色，所以先线性插出穿零点，
    // 再把跨零段拆成红/绿两段；穿零点同时是两段的端点，线仍然连续。
    const segments: Array<{ sign: string; rows: typeof rows }> = []
    if (metric === 'max_drawdown') {
      segments.push({ sign: '亏损', rows })
    } else {
      let current: typeof rows = []
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index]
        if (index === 0) {
          current.push(row)
          continue
        }
        const previous = rows[index - 1]
        if (
          (previous.value > 0 && row.value < 0) ||
          (previous.value < 0 && row.value > 0)
        ) {
          const ratio = previous.value / (previous.value - row.value)
          const crossing = {
            ...row,
            x: previous.x + ratio,
            value: 0,
            sign: previous.value > 0 ? '盈利' : '亏损',
          }
          current.push(crossing)
          const firstNonZero = current.find((item) => item.value !== 0)
          segments.push({
            sign: firstNonZero && firstNonZero.value < 0 ? '亏损' : '盈利',
            rows: current,
          })
          current = [crossing]
        }
        current.push(row)
      }
      if (current.length > 0) {
        const firstNonZero = current.find((item) => item.value !== 0)
        segments.push({
          sign: firstNonZero && firstNonZero.value < 0 ? '亏损' : '盈利',
          rows: current,
        })
      }
    }
    const seriesRows = segments.flatMap((segment, index) =>
      segment.rows.map((row) => ({ ...row, series: `segment-${index}` })),
    )
    const seriesColors = segments.map((segment) =>
      segment.sign === '盈利' ? profitLossColor('profit') : profitLossColor('loss'),
    )
    const colorDomain = [...segments.map((_, index) => `segment-${index}`), '盈利', '亏损']
    const colorRange = [
      ...seriesColors,
      profitLossColor('profit'),
      profitLossColor('loss'),
    ]
    const xMax = Math.max(1, rows.length - 1)
    const chart = new Chart({
      container,
      autoFit: true,
      paddingLeft: 56,
      paddingRight: 20,
      paddingTop: 16,
      paddingBottom: 36,
    })
    chart.data(rows)
    chart.scale('x', { type: 'linear', domain: [0, xMax], nice: false })
    chart.scale(
      'y',
      metric === 'win_rate' ? { nice: true, domain: [0, 100] } : { nice: true },
    )
    chart.scale('color', { domain: colorDomain, range: colorRange })
    const text = chartTextTokens()
    chart.axis('x', {
      title: false,
      labelFill: text.labelFill,
      labelFontFamily: text.fontFamily,
      labelFontSize: 11,
      line: false,
      tick: false,
      labelFormatter: (value: string | number) => {
        const numeric = Number(value)
        const index = Math.round(numeric)
        if (Math.abs(numeric - index) > 1e-6 || !rows[index]) return ''
        return rows[index].label
      },
    })
    chart.axis('y', {
      title: false,
      labelFill: text.labelFill,
      labelFontFamily: text.fontFamily,
      labelFontSize: 11,
      line: false,
      tick: false,
      grid: true,
      gridStroke: text.gridStroke,
      gridStrokeOpacity: 1,
      gridLineWidth: 1,
      labelFormatter: (value: string | number) => axisText(Number(value), metric),
    })
    chart.legend(false)
    const tooltip = {
      title: (datum: Record<string, unknown>) =>
        `${String(datum.label ?? '')}${datum.stock ? ` · ${String(datum.stock)}` : ''}`,
      items: [
        (datum: Record<string, unknown>) => ({
          name: label,
          value: tooltipText(Number(datum.value), metric),
          color:
            datum.sign === '盈利'
              ? 'var(--transactions-color-expense)'
              : 'var(--transactions-color-income)',
        }),
      ],
    }
    // 采样点太密时不描线也不做面积的进场：620ms 里画不完几百段，只看到面积在闪。
    const animated = shouldAnimateDraw(rows.length)
    const area = chart
      .area()
      .data(seriesRows)
      .encode('x', 'x')
      .encode('y', 'value')
      .encode('color', 'series')
      .style('opacity', 0.18)
      .tooltip(tooltip)
    if (!animated) area.animate(false)
    /* 数据落定那一拍：曲线沿路径自己画出来（与分析页同一份时长与缓动）。
     * 面积只做淡入 —— 它是曲线脚下的阴影，不该跟着逐段描边。 */
    const line = chart
      .line()
      .data(seriesRows)
      .encode('x', 'x')
      .encode('y', 'value')
      .encode('color', 'series')
      .style('lineWidth', 2)
      .tooltip(tooltip)
    if (animated) {
      line.animate('enter', CHART_DRAW_ANIMATION)
    } else {
      line.animate(false)
    }
    /* 与分析页同一套采样点：小的实心圆、与它那条线同色。
     * G2 的 point 标记默认形状是 `hollow` —— 3px 半径下只剩一道白环，看着像还没加载完的占位。 */
    chart
      .point()
      .data(rows)
      .encode('x', 'x')
      .encode('y', 'value')
      .encode('color', 'sign')
      .style('shape', 'circle')
      .style('r', 2.5)
      .style('fillOpacity', 1)
      .tooltip(tooltip)
      .animate(false)
    chart.render()
    return () => chart.destroy()
  }, [metric, points, mode])

  return (
    <div
      className={`stock-curve${tall ? ' stock-curve--tall' : ''}`}
      ref={ref}
      role="img"
      aria-label={`${label}统计曲线`}
    />
  )
}

export interface StockStatisticsChartSectionProps {
  points: StockStatisticsPointDto[]
  metric: MetricKey
  /** 分组口径只影响指标文案（「累计盈亏」→「分组盈亏」） */
  grouped: boolean
  onMetricChange: (metric: MetricKey) => void
  onExpand: () => void
}

/** 统计页「统计曲线」区块：展开按钮 + 指标切换 + 画布。 */
export function StockStatisticsChartSection({
  points,
  metric,
  grouped,
  onMetricChange,
  onExpand,
}: StockStatisticsChartSectionProps): JSX.Element {
  return (
    <section className="stock-statistics-section stock-statistics-section--chart">
      <header className="stock-statistics-section__head stock-chart-head">
        <div className="stock-chart-head__title">
          <h2 className="stock-section__title">统计曲线</h2>
          <Button
            variant="text"
            size="sm"
            testId="stock-chart-expand"
            aria-label="展开统计曲线"
            title="展开"
            icon={<Icon name="Expand" size={14} />}
            onClick={onExpand}
          />
        </div>
        <Segmented
          testId="statistics-metric"
          value={metric}
          onChange={(value) => onMetricChange(value as MetricKey)}
          options={METRICS.map((item) => ({
            value: item.key,
            label: metricLabel(item.key, grouped),
          }))}
        />
      </header>
      <ChartBox points={points} metric={metric} label={metricLabel(metric, grouped)} />
    </section>
  )
}

export interface StockStatisticsChartModalProps {
  open: boolean
  points: StockStatisticsPointDto[]
  metric: MetricKey
  grouped: boolean
  onMetricChange: (metric: MetricKey) => void
  onClose: () => void
}

/** 放大后的统计曲线：关掉就销毁，避免两张 G2 画布同时重绘。 */
export function StockStatisticsChartModal({
  open,
  points,
  metric,
  grouped,
  onMetricChange,
  onClose,
}: StockStatisticsChartModalProps): JSX.Element {
  return (
    <Modal
      open={open}
      title="统计曲线"
      width="90vw"
      centered
      footer={null}
      /* 关掉就销毁。不销毁的话这张大图会一直挂在 DOM 里：之后每次换指标、换范围、
       * 换口径都要把**两张** G2 画布重画一遍（实测多出一整份 syncHierarchy + render）。 */
      destroyOnHidden
      onCancel={onClose}
    >
      <div className="stock-chart-modal">
        <div className="stock-chart-metrics">
          <Segmented
            testId="statistics-metric-expanded"
            value={metric}
            onChange={(value) => onMetricChange(value as MetricKey)}
            options={METRICS.map((item) => ({
              value: item.key,
              label: metricLabel(item.key, grouped),
            }))}
          />
        </div>
        <ChartBox points={points} metric={metric} label={metricLabel(metric, grouped)} tall />
      </div>
    </Modal>
  )
}
