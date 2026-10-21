import { useCallback, useEffect, useState, type JSX } from 'react'

import { centsToYuan } from '../../shared/domain/money'
import { formatTimestamp } from '../../shared/domain/time'
import type { StockStatisticsDto } from '../../shared/types/stock-statistics'
import { Input, Select, Table } from 'antd'
import type { HTMLAttributes } from 'react'

import { EmptyState } from '../components/empty-state'

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'msg' in error) {
    return String((error as { msg: unknown }).msg)
  }
  if (error instanceof Error) return error.message
  return String(error)
}

function money(cents: number): string {
  return `¥${centsToYuan(cents)}`
}

export interface StockStatisticsPanelProps {
  ledgerId: string
}

/** 股票 · 统计：逐笔 / 分组口径 + 最近 N 笔 / 标签筛选。 */
export function StockStatisticsPanel({ ledgerId }: StockStatisticsPanelProps): JSX.Element {
  const [strategy, setStrategy] = useState<'cumulative' | 'grouped'>('cumulative')
  const [groupSize, setGroupSize] = useState('5')
  const [recent, setRecent] = useState('')
  const [tag, setTag] = useState('')
  const [data, setData] = useState<StockStatisticsDto | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async (): Promise<void> => {
    if (!ledgerId) {
      setData(null)
      return
    }
    try {
      const rows = await window.api.invoke('stock_statistics', {
        ledger_id: ledgerId,
        start_month: '',
        end_month: '',
        recent: recent === '' ? null : recent,
        tag,
        strategy,
        group_size: strategy === 'grouped' ? Number(groupSize) : null,
      })
      setData(rows)
      setError('')
    } catch (loadError) {
      setError(errorMessage(loadError))
    }
  }, [groupSize, ledgerId, recent, strategy, tag])

  useEffect(() => {
    void load()
  }, [load])

  const points = strategy === 'grouped' ? (data?.groups ?? []) : (data?.points ?? [])
  const latest = points[points.length - 1]

  return (
    <section className="m0-card m0-card--wide">
      <div className="m0-card-head">
        <h2>股票 · 统计</h2>
        <span className="m0-muted" data-testid="stock-statistics-count">
          {data ? `${data.roundCount} 笔结算` : ''}
        </span>
      </div>

      <div className="m0-actions m0-new-record">
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
        {strategy === 'grouped' ? (
          <Input
            data-testid="statistics-group-size"
            inputMode="numeric"
            value={groupSize}
            style={{ width: 100 }}
            onChange={(event) => setGroupSize(event.target.value)}
          />
        ) : null}
        <Input
          data-testid="statistics-recent"
          inputMode="numeric"
          placeholder="最近 N 笔（可空）"
          value={recent}
          onChange={(event) => setRecent(event.target.value)}
        />
        <Input
          data-testid="statistics-tag"
          placeholder="标签（可空）"
          value={tag}
          onChange={(event) => setTag(event.target.value)}
        />
      </div>

      {error ? (
        <p className="m0-error" data-testid="stock-statistics-error">
          {error}
        </p>
      ) : null}

      {latest ? (
        <div className="m0-stats m0-stock-stats" data-testid="stock-statistics-summary">
          <div className="m0-stat">
            <span className="m0-muted">累计盈亏</span>
            <strong>{money(latest.totalPnl)}</strong>
          </div>
          <div className="m0-stat">
            <span className="m0-muted">胜率</span>
            <strong>{latest.winRate.toFixed(2)}%</strong>
          </div>
          <div className="m0-stat">
            <span className="m0-muted">盈亏比</span>
            <strong>{latest.pnlRatio === null ? '—' : latest.pnlRatio.toFixed(2)}</strong>
          </div>
          <div className="m0-stat">
            <span className="m0-muted">最大回撤</span>
            <strong>
              {money(latest.maxDrawdown)} · {latest.maxDrawdownPct.toFixed(2)}%
            </strong>
          </div>
        </div>
      ) : null}

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
              width: 110,
              render: (value: number) => formatTimestamp(value, 'YYYY-MM-DD'),
            },
            { title: '股票', render: (_, row) => `${row.stockName} ${row.stockCode}` },
            { title: '盈亏', dataIndex: 'pnl', align: 'right', render: (value: number) => money(value) },
            { title: '累计', dataIndex: 'totalPnl', align: 'right', render: (value: number) => money(value) },
            {
              title: '胜率',
              dataIndex: 'winRate',
              align: 'right',
              render: (value: number) => `${value.toFixed(2)}%`,
            },
            {
              title: '回撤',
              dataIndex: 'maxDrawdownPct',
              align: 'right',
              render: (value: number) => `${value.toFixed(2)}%`,
            },
          ]}
        />
      )}
    </section>
  )
}


