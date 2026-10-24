import { useCallback, useEffect, useRef, useState, type JSX } from 'react'

import { Chart } from '@antv/g2'
import { Input, Modal, Select, Table } from 'antd'
import type { HTMLAttributes } from 'react'

import { centsToYuan } from '../../shared/domain/money'
import { formatTimestamp } from '../../shared/domain/time'
import type {
  StockStatisticsDto,
  StockStatisticsPointDto,
} from '../../shared/types/stock-statistics'
import { Button } from '../components/button'
import { EmptyState } from '../components/empty-state'
import { Icon } from '../components/icon'
import { ScrollArea } from '../components/scroll-area'
import { Segmented } from '../components/segmented'
import { Tooltip } from '../components/tooltip'
import {
  stockDate,
  stockErrorMessage,
  stockPercent,
  stockPnlClass,
} from './stock-format'

export interface StockStatisticsPanelProps {
  ledgerId: string
}

type RangeMode = 'all' | 'time' | 'recent'

type MetricKey =
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

function metricLabel(metric: MetricKey, grouped: boolean): string {
  if (metric === 'total_pnl' && grouped) return '分组盈亏'
  return METRICS.find((item) => item.key === metric)?.label ?? '累计盈亏'
}

/** 曲线取值：金额换到元，百分比/倍数保持原口径。 */
function metricValue(point: StockStatisticsPointDto, metric: MetricKey): number {
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

function axisText(value: number, metric: MetricKey): string {
  const kind = METRICS.find((item) => item.key === metric)?.kind
  if (kind === 'percent') return `${value.toFixed(0)}%`
  if (kind === 'ratio') return value.toFixed(0)
  return `${value.toFixed(0)}`
}

function StatLabel({ text, hint }: { text: string; hint?: string }): JSX.Element {
  return (
    <span className="stock-stat-label">
      {text}
      {hint ? (
        <Tooltip text={hint}>
          <span
            className="stock-stat-hint"
            tabIndex={0}
            aria-label={`${text}：${hint}`}
          >
            <Icon name="InfoCircle" size={12} />
          </span>
        </Tooltip>
      ) : null}
    </span>
  )
}

function money(cents: number): string {
  return `¥${centsToYuan(cents)}`
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

  useEffect(() => {
    const container = ref.current
    if (!container || points.length === 0) return
    const rows = points.map((point, index) => {
      const value = metricValue(point, metric)
      return {
        x: index,
        label: `第${point.sequence}笔 ${formatTimestamp(point.openedAt, 'MM-DD')}`,
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
      segment.sign === '盈利' ? '#e5484d' : '#16a34a',
    )
    const colorDomain = [...segments.map((_, index) => `segment-${index}`), '盈利', '亏损']
    const colorRange = [...seriesColors, '#e5484d', '#16a34a']
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
    chart.axis('x', {
      title: false,
      labelFill: '#8c8c8c',
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
      labelFill: '#8c8c8c',
      labelFontSize: 11,
      line: false,
      tick: false,
      grid: true,
      gridStroke: '#ececec',
      gridStrokeOpacity: 1,
      gridLineWidth: 1,
      labelFormatter: (value: string | number) => axisText(Number(value), metric),
    })
    chart.legend(false)
    chart
      .area()
      .data(seriesRows)
      .encode('x', 'x')
      .encode('y', 'value')
      .encode('color', 'series')
      .style('opacity', 0.18)
    chart
      .line()
      .data(seriesRows)
      .encode('x', 'x')
      .encode('y', 'value')
      .encode('color', 'series')
      .style('lineWidth', 2)
    chart
      .point()
      .data(rows)
      .encode('x', 'x')
      .encode('y', 'value')
      .encode('color', 'sign')
      .style('r', 3)
    chart.render()
    return () => chart.destroy()
  }, [metric, points])

  return (
    <div
      className={`stock-curve${tall ? ' stock-curve--tall' : ''}`}
      ref={ref}
      role="img"
      aria-label={`${label}统计曲线`}
    />
  )
}

export function StockStatisticsPanel({ ledgerId }: StockStatisticsPanelProps): JSX.Element {
  const [strategy, setStrategy] = useState<'cumulative' | 'grouped'>('cumulative')
  const [rangeMode, setRangeMode] = useState<RangeMode>('all')
  const [recent, setRecent] = useState('')
  const [tag, setTag] = useState('')
  const [startMonth, setStartMonth] = useState('')
  const [endMonth, setEndMonth] = useState('')
  const [tabs, setTabs] = useState<'summary' | 'detail'>('summary')
  const [metric, setMetric] = useState<MetricKey>('total_pnl')
  const [data, setData] = useState<StockStatisticsDto | null>(null)
  const [tagOptions, setTagOptions] = useState<string[]>([])
  const [expandedChart, setExpandedChart] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (): Promise<void> => {
    if (!ledgerId) {
      setData(null)
      return
    }
    try {
      const result = await window.api.invoke('stock_statistics', {
        ledger_id: ledgerId,
        start_month: rangeMode === 'time' ? startMonth : '',
        end_month: rangeMode === 'time' ? endMonth : '',
        recent: rangeMode === 'recent' && recent !== '' ? recent : null,
        tag,
        strategy,
        group_size: strategy === 'grouped' ? 5 : null,
      })
      setData(result)
      setError('')
    } catch (loadError) {
      setError(stockErrorMessage(loadError))
    }
  }, [endMonth, ledgerId, rangeMode, recent, startMonth, strategy, tag])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!ledgerId) return
    void window.api
      .invoke('stock_tag_settings_get', { ledger_id: ledgerId })
      .then((settings) => setTagOptions(settings.tags))
      .catch(() => setTagOptions([]))
  }, [ledgerId])

  const points = strategy === 'grouped' ? (data?.groups ?? []) : (data?.points ?? [])
  const latest = points[points.length - 1]
  const selectedMetricLabel = metricLabel(metric, strategy === 'grouped')

  return (
    <ScrollArea className="stock-statistics-scroll">
      <div className="stock-statistics-view">
      <div className="stock-statistics-toolbar">
        <Segmented
          testId="statistics-tab"
          value={tabs}
          onChange={(value) => setTabs(value as 'summary' | 'detail')}
          options={[
            { value: 'summary', label: '统计' },
            { value: 'detail', label: '明细' },
          ]}
        />
        <div className="stock-statistics-filters">
          <Segmented
            testId="statistics-range"
            value={rangeMode}
            onChange={(value) => setRangeMode(value as RangeMode)}
            options={[
              { value: 'all', label: '全部' },
              { value: 'time', label: '按时间' },
              { value: 'recent', label: '最近 N 笔' },
            ]}
          />
          {rangeMode === 'time' ? (
            <>
              <Input
                value={startMonth}
                placeholder="YYYY-MM"
                style={{ width: 110 }}
                onChange={(event) => setStartMonth(event.target.value)}
              />
              <Input
                value={endMonth}
                placeholder="YYYY-MM"
                style={{ width: 110 }}
                onChange={(event) => setEndMonth(event.target.value)}
              />
            </>
          ) : null}
          {rangeMode === 'recent' ? (
            <Input
              data-testid="statistics-recent"
              value={recent}
              inputMode="numeric"
              placeholder="N"
              style={{ width: 90 }}
              onChange={(event) => setRecent(event.target.value)}
            />
          ) : null}
          <Select
            data-testid="statistics-strategy"
            value={strategy}
            style={{ width: 130 }}
            onChange={(value) => setStrategy(value)}
            options={[
              { value: 'cumulative', label: '逐笔累计' },
              { value: 'grouped', label: '分组统计' },
            ]}
          />
          <Select
            value={tag}
            style={{ width: 150 }}
            onChange={(value) => setTag(value)}
            options={[{ value: '', label: '全部标签' }, ...tagOptions.map((item) => ({ value: item, label: item }))]}
          />
        </div>
      </div>

      {error ? (
        <p className="m0-error stock-inline-error" data-testid="stock-statistics-error">
          {error}
        </p>
      ) : null}

      {tabs === 'summary' ? (
        <>
          <section className="stock-statistics-section">
            <h3 className="stock-section__title">结算统计</h3>
            {latest ? (
              <div className="stock-stat-grid" data-testid="stock-statistics-summary">
                <div className="stock-stat-cell">
                  <span className="stock-label">已实现盈亏</span>
                  <strong className={stockPnlClass(latest.totalPnl)}>
                    {money(latest.totalPnl)}
                  </strong>
                </div>
                <div className="stock-stat-cell">
                  <StatLabel text="胜率" hint="我赢的次数够不够多" />
                  <strong>{stockPercent(latest.winRate)}</strong>
                  <small>
                    {latest.winCount} 胜 · {latest.lossCount} 负
                  </small>
                </div>
                <div className="stock-stat-cell">
                  <StatLabel text="盈亏比" hint="赢一次的收获等于几次的代价" />
                  <strong>{latest.pnlRatio === null ? '—' : latest.pnlRatio.toFixed(2)}</strong>
                  <small>盈利均值 ÷ 亏损均值</small>
                </div>
                <div className="stock-stat-cell">
                  <StatLabel text="期望值" hint="每开一笔，长期平均赚多少" />
                  <strong className={stockPnlClass(latest.expectancy)}>
                    {money(latest.expectancy)}
                  </strong>
                  <small>每笔均值</small>
                </div>
                <div className="stock-stat-cell">
                  <StatLabel text="最大回撤" hint="最坏的时候我要忍多少" />
                  <strong>{stockPercent(latest.maxDrawdownPct)}</strong>
                  <small>从高点回落 {money(latest.maxDrawdown)}</small>
                </div>
                <div className="stock-stat-cell">
                  <StatLabel text="平均盈利" hint="赢的时候能赢多少" />
                  <strong className="is-up">{money(latest.avgWin)}</strong>
                  <small>{latest.winCount} 笔盈利</small>
                </div>
                <div className="stock-stat-cell">
                  <StatLabel text="平均亏损" hint="输的时候会输多少" />
                  <strong className="is-down">{money(latest.avgLoss)}</strong>
                  <small>{latest.lossCount} 笔亏损</small>
                </div>
              </div>
            ) : (
              <EmptyState
                testId="stock-statistics-empty"
                title={ledgerId ? '还没有已结算的轮次' : '请先创建/选择账本'}
              />
            )}
          </section>

          {points.length > 0 ? (
            <section className="stock-statistics-section">
              <header className="stock-statistics-section__head stock-chart-head">
                <div className="stock-chart-head__title">
                  <h3 className="stock-section__title">统计曲线</h3>
                  <Button
                    variant="text"
                    size="sm"
                    testId="stock-chart-expand"
                    aria-label="展开统计曲线"
                    title="展开"
                    icon={<Icon name="Expand" size={14} />}
                    onClick={() => setExpandedChart(true)}
                  />
                </div>
                <Segmented
                  testId="statistics-metric"
                  value={metric}
                  onChange={(value) => setMetric(value as MetricKey)}
                  options={METRICS.map((item) => ({
                    value: item.key,
                    label: metricLabel(item.key, strategy === 'grouped'),
                  }))}
                />
              </header>
              <ChartBox points={points} metric={metric} label={selectedMetricLabel} />
            </section>
          ) : null}
        </>
      ) : (
        <section className="stock-statistics-section">
          <div className="stock-statistics-section__head">
            <h3 className="stock-section__title">结算明细</h3>
            <span className="stock-muted" data-testid="stock-statistics-count">
              {points.length} 笔结算
            </span>
          </div>
          {points.length === 0 ? (
            <EmptyState
              testId="stock-statistics-empty"
              title={ledgerId ? '还没有已结算的轮次' : '请先创建/选择账本'}
            />
          ) : (
            <Table
              className="tr-table stock-statistics-table"
              rowKey={(row) => `${row.sequence}-${row.stockCode}`}
              pagination={false}
              size="middle"
              scroll={{ x: 1280 }}
              dataSource={points}
              onRow={() => ({ 'data-testid': 'stock-statistics-point' }) as HTMLAttributes<HTMLElement>}
              columns={[
                { title: '#', dataIndex: 'sequence', align: 'right', width: 48 },
                {
                  title: '建仓',
                  dataIndex: 'openedAt',
                  width: 96,
                  render: (value: number) => stockDate(value),
                },
                {
                  title: '清仓',
                  dataIndex: 'closedAt',
                  width: 96,
                  render: (value: number) => stockDate(value),
                },
                {
                  title: '股票',
                  width: 150,
                  render: (_, row) => `${row.stockName} ${row.stockCode}`,
                },
                {
                  title: '标签',
                  dataIndex: 'tag',
                  width: 72,
                  render: (value: string) =>
                    value ? <span className="ui-tag">{value}</span> : '—',
                },
                {
                  title: '盈亏',
                  dataIndex: 'pnl',
                  align: 'right',
                  width: 96,
                  render: (value: number) => (
                    <span className={stockPnlClass(value)}>{money(value)}</span>
                  ),
                },
                {
                  title: '累计',
                  dataIndex: 'totalPnl',
                  align: 'right',
                  width: 96,
                  render: (value: number) => money(value),
                },
                {
                  title: '胜负',
                  width: 80,
                  render: (_, row) => `${row.winCount} 胜 ${row.lossCount} 负`,
                },
                {
                  title: '胜率',
                  dataIndex: 'winRate',
                  align: 'right',
                  width: 64,
                  render: (value: number) => stockPercent(value),
                },
                {
                  title: '平均盈利',
                  dataIndex: 'avgWin',
                  align: 'right',
                  width: 88,
                  render: (value: number) =>
                    value > 0 ? <span className="is-up">{money(value)}</span> : '—',
                },
                {
                  title: '平均亏损',
                  dataIndex: 'avgLoss',
                  align: 'right',
                  width: 88,
                  render: (value: number) =>
                    value > 0 ? <span className="is-down">-¥{(value / 100).toFixed(2)}</span> : '—',
                },
                {
                  title: '盈亏比',
                  dataIndex: 'pnlRatio',
                  align: 'right',
                  width: 72,
                  render: (value: number | null) => (value === null ? '—' : value.toFixed(2)),
                },
                {
                  title: '期望值',
                  dataIndex: 'expectancy',
                  align: 'right',
                  width: 88,
                  render: (value: number) => (
                    <span className={stockPnlClass(value)}>{money(value)}</span>
                  ),
                },
                {
                  title: '回撤',
                  dataIndex: 'maxDrawdownPct',
                  align: 'right',
                  width: 100,
                  render: (value: number, row) => (
                    <span className="is-down">
                      {stockPercent(value)} {money(row.maxDrawdown)}
                    </span>
                  ),
                },
              ]}
            />
          )}
        </section>
      )}

      <Modal
        open={expandedChart}
        title="统计曲线"
        width="90vw"
        centered
        footer={null}
        onCancel={() => setExpandedChart(false)}
      >
        <div className="stock-chart-modal">
          <div className="stock-chart-metrics">
            <Segmented
              testId="statistics-metric-expanded"
              value={metric}
              onChange={(value) => setMetric(value as MetricKey)}
              options={METRICS.map((item) => ({
                value: item.key,
                label: metricLabel(item.key, strategy === 'grouped'),
              }))}
            />
          </div>
          <ChartBox points={points} metric={metric} label={selectedMetricLabel} tall />
        </div>
      </Modal>
      </div>
    </ScrollArea>
  )
}
