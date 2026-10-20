import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'

import { centsToYuan } from '../../shared/domain/money'
import type { ChartDto } from '../../shared/types/chart'
import type { ChartQueryResponse } from '../../shared/types/transaction'

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'msg' in error) {
    return String((error as { msg: unknown }).msg)
  }
  if (error instanceof Error) return error.message
  return String(error)
}

const COLORS = ['#3964fe', '#f59e0b', '#12b76a', '#d92d20', '#7c3aed', '#0891b2']

export interface ChartsPageProps {
  ledgerId: string
}

/** 记账 · 图表：预设曲线 + 月度/年度分桶。 */
export function ChartsPage({ ledgerId }: ChartsPageProps): JSX.Element {
  const [charts, setCharts] = useState<ChartDto[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [granularity, setGranularity] = useState('month')
  const [data, setData] = useState<ChartQueryResponse | null>(null)
  const [error, setError] = useState('')
  const [newTitle, setNewTitle] = useState('')

  useEffect(() => {
    let alive = true
    if (!ledgerId) {
      setCharts([])
      return
    }
    void (async () => {
      try {
        const rows = await window.api.invoke('chart_list', { ledgerId: ledgerId })
        if (!alive) return
        setCharts(rows)
        setSelectedId((current) =>
          rows.some((row) => row.chartId === current) ? current : (rows[0]?.chartId ?? ''),
        )
      } catch (loadError) {
        if (alive) setError(errorMessage(loadError))
      }
    })()
    return () => {
      alive = false
    }
  }, [ledgerId])

  const selected = charts.find((chart) => chart.chartId === selectedId) ?? null

  const createChart = useCallback(async (): Promise<void> => {
    if (!ledgerId) return
    setError('')
    try {
      const created = await window.api.invoke('chart_create', {
        ledgerId,
        title: newTitle.trim() || '自定义图表',
        granularity,
        chartType: 'line',
        lines: [{ label: '支出', transactionType: 'expense', includeOutlier: true, conditions: [] }],
      })
      setNewTitle('')
      const rows = await window.api.invoke('chart_list', { ledgerId })
      setCharts(rows)
      setSelectedId(created.chartId)
    } catch (createError) {
      setError(errorMessage(createError))
    }
  }, [granularity, ledgerId, newTitle])

  const deleteChart = useCallback(async (): Promise<void> => {
    if (!selectedId) return
    setError('')
    try {
      await window.api.invoke('chart_delete', { chartId: selectedId })
      const rows = await window.api.invoke('chart_list', { ledgerId })
      setCharts(rows)
      setSelectedId(rows[0]?.chartId ?? '')
    } catch (deleteError) {
      setError(errorMessage(deleteError))
    }
  }, [ledgerId, selectedId])

  useEffect(() => {
    let alive = true
    if (!ledgerId || !selected) {
      setData(null)
      return
    }
    void (async () => {
      try {
        const end = Math.trunc(Date.now() / 1000)
        const startDate = new Date()
        startDate.setMonth(startDate.getMonth() - 11)
        startDate.setDate(1)
        startDate.setHours(0, 0, 0, 0)
        const result = await window.api.invoke('tr_chart_data', {
          ledgerId,
          tsRange: [Math.trunc(startDate.getTime() / 1000), end],
          granularity,
          lines: selected.lines.map((line) => ({
            label: line.label,
            transactionType: line.transactionType,
            includeOutlier: line.includeOutlier,
            conditions: line.conditions,
          })),
        })
        if (alive) {
          setData(result)
          setError('')
        }
      } catch (loadError) {
        if (alive) setError(errorMessage(loadError))
      }
    })()
    return () => {
      alive = false
    }
  }, [granularity, ledgerId, selected])

  const geometry = useMemo(() => {
    const lines = data?.lines ?? []
    const max = Math.max(1, ...lines.flatMap((line) => line.data.map((point) => point.amount)))
    const width = 880
    const height = 260
    const padding = { left: 64, right: 16, top: 16, bottom: 28 }
    const innerW = width - padding.left - padding.right
    const innerH = height - padding.top - padding.bottom
    const count = Math.max(1, ...lines.map((line) => line.data.length))
    return lines.map((line, index) => {
      const points = line.data.map((point, pointIndex) => {
        const x = padding.left + (count === 1 ? innerW / 2 : (pointIndex / (count - 1)) * innerW)
        const y = padding.top + innerH - (point.amount / max) * innerH
        return { x, y, point }
      })
      return {
        label: line.label,
        color: COLORS[index % COLORS.length],
        points,
        polyline: points.map((item) => `${item.x},${item.y}`).join(' '),
      }
    })
  }, [data])

  return (
    <section className="m0-card m0-card--wide">
      <div className="m0-card-head">
        <h2>记账 · 图表</h2>
        <div className="m0-actions m0-period">
          <select
            className="m0-input"
            data-testid="chart-select"
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            {charts.map((chart) => (
              <option key={chart.chartId} value={chart.chartId}>
                {chart.title}
              </option>
            ))}
          </select>
          <select
            className="m0-input"
            data-testid="chart-granularity"
            value={granularity}
            onChange={(event) => setGranularity(event.target.value)}
          >
            <option value="month">按月</option>
            <option value="year">按年</option>
          </select>
          <input
            className="m0-input"
            data-testid="chart-title"
            placeholder="新图表名称"
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
          />
          <button type="button" className="m0-link" data-testid="chart-create" onClick={() => void createChart()}>
            新建
          </button>
          <button type="button" className="m0-link" data-testid="chart-delete" onClick={() => void deleteChart()}>
            删除
          </button>
        </div>
      </div>

      {error ? (
        <p className="m0-error" data-testid="chart-error">
          {error}
        </p>
      ) : null}

      {!ledgerId || charts.length === 0 ? (
        <p className="m0-muted" data-testid="chart-empty">
          {ledgerId ? '还没有图表' : '请先创建/选择账本'}
        </p>
      ) : (
        <>
          {geometry.length > 0 && geometry.some((line) => line.points.length > 0) ? (
            <svg
              className="m0-chart"
              data-testid="chart-svg"
              viewBox="0 0 880 260"
              role="img"
              aria-label={selected?.title ?? '图表'}
            >
              <line x1="64" y1="232" x2="864" y2="232" stroke="#e5e6eb" />
              <line x1="64" y1="16" x2="64" y2="232" stroke="#e5e6eb" />
              {geometry.map((line) => (
                <g key={line.label}>
                  <polyline
                    points={line.polyline}
                    fill="none"
                    stroke={line.color}
                    strokeWidth="2"
                    data-testid="chart-line"
                  />
                  {line.points.map((item) => (
                    <circle
                      key={`${line.label}-${item.point.time}`}
                      cx={item.x}
                      cy={item.y}
                      r="3"
                      fill={line.color}
                    />
                  ))}
                </g>
              ))}
            </svg>
          ) : (
            <p className="m0-muted" data-testid="chart-empty">
              这一期还没有数据
            </p>
          )}

          <ul className="m0-chart-legend">
            {geometry.map((line) => (
              <li key={line.label}>
                <span className="m0-chart-dot" style={{ background: line.color }} />
                {line.label}
              </li>
            ))}
          </ul>

          {data?.statistics ? (
            <p className="m0-muted" data-testid="chart-statistics">
              合计支出 ¥{centsToYuan(data.statistics.expense ?? 0)} · 合计收入 ¥
              {centsToYuan(data.statistics.income ?? 0)}
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}




