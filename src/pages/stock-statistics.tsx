import { useCallback, useEffect, useState, type JSX } from 'react'
import { createPortal } from 'react-dom'

import { Input, Select, Table } from 'antd'
import type { HTMLAttributes } from 'react'

import { centsToYuan } from '../../shared/domain/money'
import { detailRowsNewestFirst } from '../../shared/domain/stock-stats'
import type { StockStatisticsDto } from '../../shared/types/stock-statistics'
import { EmptyState } from '../components/empty-state'
import { Pagination } from '../components/pagination'
import { ScrollArea } from '../components/scroll-area'
import { Segmented } from '../components/segmented'
import { TimeRangePicker, type TimeRangeMode } from '../components/time-range-picker'
import { stockDate, stockErrorMessage, stockPercent, stockPnlClass } from './stock-format'
import {
  StockStatisticsChartModal,
  StockStatisticsChartSection,
  type MetricKey,
} from './stock-statistics-chart'
import { StockStatisticsSummary } from './stock-statistics-summary'

export interface StockStatisticsPanelProps {
  ledgerId: string
  /** 明细里点股票时，跳到记录页的对应轮次 */
  onOpenRound?: (target: { code: string; roundId: string }) => void
  /** 外层 `PageLayout.toolbar` 里的空槽；筛选条用 portal 渲染进去 */
  toolbarHost?: HTMLElement | null
}

type RangeMode = 'all' | 'time' | 'recent'

/** 明细表每页条数（与记账明细的默认 15 条保持一致）。 */
const DETAIL_PAGE_SIZE = 15

function money(cents: number): string {
  return `¥${centsToYuan(cents)}`
}

export function StockStatisticsPanel({
  ledgerId,
  onOpenRound,
  toolbarHost = null,
}: StockStatisticsPanelProps): JSX.Element {
  const [strategy, setStrategy] = useState<'cumulative' | 'grouped'>('cumulative')
  const [rangeMode, setRangeMode] = useState<RangeMode>('all')
  const [recent, setRecent] = useState('5')
  /* 输入框里的字与「已经生效的 N」是两件事：每敲一位就重算一次曲线，等于把一次输入
   * 拆成三次 IPC + 三遍数据库查询 + 三遍整图重绘（实测三位数 101ms 脚本）。
   * 停下 250ms 再提交 —— 下拉、分段这些一击即中的筛选不经过这条。 */
  const [recentText, setRecentText] = useState('5')
  const [tag, setTag] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [timeMode, setTimeMode] = useState<TimeRangeMode>('date')
  const [tabs, setTabs] = useState<'summary' | 'detail'>('summary')
  const [metric, setMetric] = useState<MetricKey>('total_pnl')
  const [data, setData] = useState<StockStatisticsDto | null>(null)
  const [tagOptions, setTagOptions] = useState<string[]>([])
  const [expandedChart, setExpandedChart] = useState(false)
  const [detailPage, setDetailPage] = useState(1)
  const [error, setError] = useState('')

  const load = useCallback(async (): Promise<void> => {
    if (!ledgerId) {
      setData(null)
      return
    }
    try {
      const result = await window.api.invoke('stock_statistics', {
        ledger_id: ledgerId,
        start_month: rangeMode === 'time' ? startDate.slice(0, 7) : '',
        end_month: rangeMode === 'time' ? endDate.slice(0, 7) : '',
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
  }, [endDate, ledgerId, rangeMode, recent, startDate, strategy, tag])

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

  // 「最近 N 笔」的提交：打字停下 250ms 才生效，中途不重算。
  useEffect(() => {
    const timer = window.setTimeout(() => setRecent(recentText), 250)
    return () => window.clearTimeout(timer)
  }, [recentText])

  // 筛选条件一变就回到第 1 页（避免停在一个已经不存在的页码上）。
  useEffect(() => {
    setDetailPage(1)
  }, [rangeMode, recent, tag, startDate, endDate])

  // 「明细」是逐笔结算的清单：口径恒为逐笔累计（分组点是给曲线用的，一行一格不是结算）。
  const detailRows = data?.points ?? []
  const points = strategy === 'grouped' ? (data?.groups ?? []) : detailRows
  // 顶部合计始终读全量逐笔点，不跟着分组口径变成最后一组。
  const latest = detailRows[detailRows.length - 1]
  const detailPoints = detailRowsNewestFirst(detailRows)
  const detailPageCount = Math.max(1, Math.ceil(detailPoints.length / DETAIL_PAGE_SIZE))
  const detailPageNo = Math.min(detailPage, detailPageCount)
  const detailPageRows = detailPoints.slice(
    (detailPageNo - 1) * DETAIL_PAGE_SIZE,
    detailPageNo * DETAIL_PAGE_SIZE,
  )

  const toolbar = (
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
          <TimeRangePicker
            testId="statistics-time"
            mode={timeMode}
            start={startDate}
            end={endDate}
            onModeChange={setTimeMode}
            onRangeChange={(start, end) => {
              setStartDate(start)
              setEndDate(end)
            }}
          />
        ) : null}
        {rangeMode === 'recent' ? (
          <Input
            data-testid="statistics-recent"
            value={recentText}
            inputMode="numeric"
            placeholder="N"
            style={{ width: 90 }}
            onChange={(event) => setRecentText(event.target.value)}
          />
        ) : null}
        {/* 明细恒为逐笔结算：分组口径只影响曲线，进「明细」就收起这个下拉，
            免得看起来“选了没反应”。 */}
        {tabs === 'summary' ? (
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
        ) : null}
        <Select
          data-testid="statistics-tag"
          value={tag}
          style={{ width: 150 }}
          onChange={(value) => setTag(value)}
          options={[{ value: '', label: '全部标签' }, ...tagOptions.map((item) => ({ value: item, label: item }))]}
        />
      </div>
    </div>
  )

  return (
    <ScrollArea className="stock-statistics-scroll">
      <div className="stock-statistics-view">
        {toolbarHost ? createPortal(toolbar, toolbarHost) : null}
      {error ? (
        <p role="alert" className="m0-error stock-inline-error" data-testid="stock-statistics-error">
          {error}
        </p>
      ) : null}

      {tabs === 'summary' ? (
        <>
          <StockStatisticsSummary ledgerId={ledgerId} latest={latest} />

          {points.length > 0 ? (
            <StockStatisticsChartSection
              points={points}
              metric={metric}
              grouped={strategy === 'grouped'}
              onMetricChange={setMetric}
              onExpand={() => setExpandedChart(true)}
            />
          ) : null}
        </>
      ) : (
        <section
          className={`stock-statistics-section${detailPoints.length === 0 ? ' stock-statistics-section--empty' : ''}`}
        >
          {detailPoints.length === 0 ? (
            <EmptyState
              testId="stock-statistics-empty"
              title={ledgerId ? '还没有已结算的轮次' : '请先创建/选择账本'}
            />
          ) : (
            <>
              <Table
                className="tr-table stock-statistics-table"
                rowKey={(row) => `${row.sequence}-${row.stockCode}`}
                pagination={false}
                size="middle"
                tableLayout="fixed"
                dataSource={detailPageRows}
                onRow={() => ({ 'data-testid': 'stock-statistics-point' }) as HTMLAttributes<HTMLElement>}
                columns={[
                  {
                    title: '建仓',
                    dataIndex: 'openedAt',
                    align: 'center',
                    width: '7%',
                    className: 'stock-stats-date',
                    render: (value: number) => stockDate(value),
                  },
                  {
                    title: '清仓',
                    dataIndex: 'closedAt',
                    align: 'center',
                    width: '7%',
                    className: 'stock-stats-date',
                    render: (value: number) => stockDate(value),
                  },
                  {
                    title: '股票',
                    align: 'right',
                    width: '12%',
                    render: (_, row) => {
                      const label = `${row.stockName} ${row.stockCode}`
                      if (!row.roundId || !onOpenRound) return label
                      return (
                        <button
                          type="button"
                          className="stock-stats-stock"
                          data-testid="statistics-detail-stock"
                          title="查看这一轮交易"
                          onClick={() => onOpenRound({ code: row.stockCode, roundId: row.roundId })}
                        >
                          {label}
                        </button>
                      )
                    },
                  },
                  {
                    title: '标签',
                    dataIndex: 'tag',
                    align: 'center',
                    width: '5%',
                    render: (value: string) =>
                      value ? <span className="ui-tag">{value}</span> : '—',
                  },
                  {
                    title: '盈亏',
                    dataIndex: 'pnl',
                    align: 'right',
                    width: '8%',
                    render: (value: number) => (
                      <span className={stockPnlClass(value)}>{money(value)}</span>
                    ),
                  },
                  {
                    title: '累计',
                    dataIndex: 'totalPnl',
                    align: 'right',
                    width: '8%',
                    render: (value: number) => money(value),
                  },
                  {
                    title: '胜负',
                    align: 'right',
                    width: '8%',
                    render: (_, row) =>
                      `${row.winCount} 胜 ${row.lossCount} 负${
                        row.tieCount > 0 ? ` ${row.tieCount} 平` : ''
                      }`,
                  },
                  {
                    title: '胜率',
                    dataIndex: 'winRate',
                    align: 'right',
                    width: '6%',
                    render: (value: number) => stockPercent(value),
                  },
                  {
                    title: '平均盈利',
                    dataIndex: 'avgWin',
                    align: 'right',
                    width: '8%',
                    render: (value: number) =>
                      value > 0 ? <span className="is-up">{money(value)}</span> : '—',
                  },
                  {
                    title: '平均亏损',
                    dataIndex: 'avgLoss',
                    align: 'right',
                    width: '8%',
                    render: (value: number) =>
                      value > 0 ? <span className="is-down">-¥{(value / 100).toFixed(2)}</span> : '—',
                  },
                  {
                    title: '盈亏比',
                    dataIndex: 'pnlRatio',
                    align: 'right',
                    width: '6%',
                    render: (value: number | null) => (value === null ? '—' : value.toFixed(2)),
                  },
                  {
                    title: '期望值',
                    dataIndex: 'expectancy',
                    align: 'right',
                    width: '7%',
                    render: (value: number) => (
                      <span className={stockPnlClass(value)}>{money(value)}</span>
                    ),
                  },
                  {
                    title: '回撤',
                    dataIndex: 'maxDrawdownPct',
                    align: 'right',
                    width: '10%',
                    render: (value: number, row) => (
                      <span className="stock-stats-drawdown is-down">
                        <span>{stockPercent(value)}</span>
                        <span>{money(row.maxDrawdown)}</span>
                      </span>
                    ),
                  },
                ]}
              />
              <div className="stock-table-foot" data-testid="stock-statistics-detail-foot">
                <span className="stock-muted">共 {detailPoints.length} 笔</span>
                <Pagination
                  page={detailPageNo}
                  totalPages={detailPageCount}
                  showSummary={false}
                  testId="stock-statistics-detail"
                  onChange={setDetailPage}
                />
              </div>
            </>
          )}
        </section>
      )}

      <StockStatisticsChartModal
        open={expandedChart}
        points={points}
        metric={metric}
        grouped={strategy === 'grouped'}
        onMetricChange={setMetric}
        onClose={() => setExpandedChart(false)}
      />
      </div>
    </ScrollArea>
  )
}
