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

function money(cents: number): string {
  return `¥${centsToYuan(cents)}`
}

function ChartBox({ points, tall = false }: { points: StockStatisticsPointDto[]; tall?: boolean }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = ref.current
    if (!container || points.length === 0) return
    const rows = points.map((point) => ({
      label: `第${point.sequence}笔 ${formatTimestamp(point.openedAt, 'MM-DD')}`,
      value: point.totalPnl / 100,
      sign: point.totalPnl >= 0 ? '盈利' : '亏损',
      stock: `${point.stockName} ${point.stockCode}`,
    }))
    const chart = new Chart({
      container,
      autoFit: true,
      paddingLeft: 56,
      paddingRight: 20,
      paddingTop: 16,
      paddingBottom: 36,
    })
    chart.data(rows)
    chart.scale('x', { type: 'point' })
    chart.scale('y', { nice: true })
    chart.scale('color', { range: ['#e5484d', '#16a34a'], domain: ['盈利', '亏损'] })
    chart.axis('x', {
      title: false,
      labelFill: '#8c8c8c',
      labelFontSize: 11,
      line: false,
      tick: false,
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
    })
    chart.legend(false)
    chart
      .area()
      .data(rows)
      .encode('x', 'label')
      .encode('y', 'value')
      .encode('color', 'sign')
      .style('opacity', 0.18)
      .style('shape', 'smooth')
    chart
      .line()
      .data(rows)
      .encode('x', 'label')
      .encode('y', 'value')
      .encode('color', 'sign')
      .style('lineWidth', 2)
      .style('shape', 'smooth')
    chart
      .point()
      .data(rows)
      .encode('x', 'label')
      .encode('y', 'value')
      .encode('color', 'sign')
      .style('r', 3)
    chart.render()
    return () => chart.destroy()
  }, [points])

  return <div className={`stock-curve${tall ? ' stock-curve--tall' : ''}`} ref={ref} />
}

export function StockStatisticsPanel({ ledgerId }: StockStatisticsPanelProps): JSX.Element {
  const [strategy, setStrategy] = useState<'cumulative' | 'grouped'>('cumulative')
  const [rangeMode, setRangeMode] = useState<RangeMode>('all')
  const [recent, setRecent] = useState('')
  const [tag, setTag] = useState('')
  const [startMonth, setStartMonth] = useState('')
  const [endMonth, setEndMonth] = useState('')
  const [tabs, setTabs] = useState<'summary' | 'detail'>('summary')
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
                  <small>按建仓时间 · 截至 {stockDate(latest.openedAt)} · 第 {latest.sequence} 笔结算</small>
                </div>
                <div className="stock-stat-cell">
                  <span className="stock-label">胜率</span>
                  <strong>{stockPercent(latest.winRate)}</strong>
                  <small>
                    {latest.winCount} 胜 · {latest.lossCount} 负
                  </small>
                </div>
                <div className="stock-stat-cell">
                  <span className="stock-label">盈亏比</span>
                  <strong>{latest.pnlRatio === null ? '—' : latest.pnlRatio.toFixed(2)}</strong>
                  <small>盈利均值 ÷ 亏损均值</small>
                </div>
                <div className="stock-stat-cell">
                  <span className="stock-label">期望值</span>
                  <strong className={stockPnlClass(latest.expectancy)}>
                    {money(latest.expectancy)}
                  </strong>
                  <small>每笔均值</small>
                </div>
                <div className="stock-stat-cell">
                  <span className="stock-label">最大回撤</span>
                  <strong>{stockPercent(latest.maxDrawdownPct)}</strong>
                  <small>从高点回落 {money(latest.maxDrawdown)}</small>
                </div>
                <div className="stock-stat-cell">
                  <span className="stock-label">平均盈利</span>
                  <strong className="is-up">{money(latest.avgWin)}</strong>
                  <small>{latest.winCount} 笔盈利</small>
                </div>
                <div className="stock-stat-cell">
                  <span className="stock-label">平均亏损</span>
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
              <header className="stock-statistics-section__head">
                <h3 className="stock-section__title">统计曲线</h3>
                <Button
                  variant="text"
                  size="sm"
                  testId="stock-chart-expand"
                  icon={<Icon name="Expand" size={14} />}
                  onClick={() => setExpandedChart(true)}
                >
                  展开
                </Button>
              </header>
              <div className="stock-chart-legend">
                <span className={stockPnlClass(latest?.totalPnl ?? 0)}>
                  累计盈亏 {money(latest?.totalPnl ?? 0)}
                </span>
              </div>
              <ChartBox points={points} />
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
              className="tr-table"
              rowKey={(row) => `${row.sequence}-${row.stockCode}`}
              pagination={false}
              size="middle"
              dataSource={points}
              onRow={() => ({ 'data-testid': 'stock-statistics-point' }) as HTMLAttributes<HTMLElement>}
              columns={[
                { title: '#', dataIndex: 'sequence', align: 'right', width: 56 },
                {
                  title: '建仓',
                  dataIndex: 'openedAt',
                  width: 120,
                  render: (value: number) => stockDate(value),
                },
                { title: '股票', render: (_, row) => `${row.stockName} ${row.stockCode}` },
                {
                  title: '盈亏',
                  dataIndex: 'pnl',
                  align: 'right',
                  render: (value: number) => (
                    <span className={stockPnlClass(value)}>{money(value)}</span>
                  ),
                },
                {
                  title: '累计',
                  dataIndex: 'totalPnl',
                  align: 'right',
                  render: (value: number) => money(value),
                },
                {
                  title: '胜率',
                  dataIndex: 'winRate',
                  align: 'right',
                  render: (value: number) => stockPercent(value),
                },
                {
                  title: '回撤',
                  dataIndex: 'maxDrawdownPct',
                  align: 'right',
                  render: (value: number) => stockPercent(value),
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
          <p className="stock-muted">全部 · 共 {points.length} 笔结算</p>
          <ChartBox points={points} tall />
        </div>
      </Modal>
      </div>
    </ScrollArea>
  )
}
