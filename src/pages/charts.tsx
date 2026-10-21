import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'

import { centsToYuan } from '../../shared/domain/money'
import type { ChartDto } from '../../shared/types/chart'
import type { ChartQueryResponse } from '../../shared/types/transaction'
import { EmptyState } from '../components/empty-state'
import { Segmented } from '../components/segmented'
import { Icon } from '../components/icon'

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
  const [renaming, setRenaming] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const [dragChartId, setDragChartId] = useState<string | null>(null)

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

  const saveRename = useCallback(async (): Promise<void> => {
    if (!selected) return
    const title = renameDraft.trim()
    if (!title) return
    try {
      await window.api.invoke('chart_update', {
        chartId: selected.chartId,
        title,
        granularity: selected.granularity,
        lines: selected.lines,
        chartType: selected.chartType,
        sortOrder: selected.sortOrder,
      })
      setRenaming(false)
      setCharts(await window.api.invoke('chart_list', { ledgerId }))
    } catch (renameError) {
      setError(errorMessage(renameError))
    }
  }, [ledgerId, renameDraft, selected])

  const moveChart = useCallback(async (sourceId: string, targetId: string): Promise<void> => {
    if (sourceId === targetId) return
    const from = charts.findIndex((chart) => chart.chartId === sourceId)
    const to = charts.findIndex((chart) => chart.chartId === targetId)
    if (from < 0 || to < 0) return
    const next = [...charts]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setCharts(next)
    try {
      await Promise.all(
        next.map((chart, index) =>
          window.api.invoke('chart_update_sort', { chartId: chart.chartId, sortOrder: index + 1 }),
        ),
      )
      setCharts(await window.api.invoke('chart_list', { ledgerId }))
    } catch (moveError) {
      setError(errorMessage(moveError))
    }
  }, [charts, ledgerId])

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
    <>
      {error ? (
        <p className="m0-error" data-testid="chart-error">
          {error}
        </p>
      ) : null}

      <div className="charts-layout">
        <aside className="charts-list">
          <div className="charts-create">
            <input
              className="m0-input"
              data-testid="chart-title"
              placeholder="新图表名称"
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
            />
            <button
              type="button"
              className="ui-btn ui-btn--primary"
              data-testid="chart-create"
              onClick={() => void createChart()}
            >
              <Icon name="Plus" size={14} /> 新增图表
            </button>
          </div>

          {charts.map((chart) => (
            <button
              key={chart.chartId}
              type="button"
              className={`chart-item${chart.chartId === selectedId ? ' is-active' : ''}`}
              data-testid="chart-item"
              draggable
              onDragStart={() => setDragChartId(chart.chartId)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (dragChartId) void moveChart(dragChartId, chart.chartId)
                setDragChartId(null)
              }}
              onClick={() => setSelectedId(chart.chartId)}
            >
              <Icon name="LineChart" size={16} />
              <span>{chart.title}</span>
            </button>
          ))}

          <select
            className="sr-only"
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

          {charts.length === 0 ? (
            <EmptyState
              testId="chart-empty"
              title={ledgerId ? '还没有图表' : '请先创建/选择账本'}
            />
          ) : null}
        </aside>

        <section className="charts-main">
          <div className="charts-main-head">
            {renaming ? (
              <div className="m0-actions">
                <input
                  className="m0-input"
                  data-testid="chart-rename-input"
                  value={renameDraft}
                  onChange={(event) => setRenameDraft(event.target.value)}
                />
                <button type="button" className="ui-btn ui-btn--primary" data-testid="chart-rename-save" onClick={() => void saveRename()}>
                  保存
                </button>
                <button type="button" className="ui-btn ui-btn--text" onClick={() => setRenaming(false)}>
                  取消
                </button>
              </div>
            ) : (
              <h2>{selected?.title ?? '图表'}</h2>
            )}
              {!renaming ? (
                <button
                  type="button"
                  className="ui-btn ui-btn--text"
                  data-testid="chart-rename"
                  disabled={!selected}
                  onClick={() => {
                    setRenameDraft(selected?.title ?? '')
                    setRenaming(true)
                  }}
                >
                  重命名
                </button>
              ) : null}
            <div className="m0-actions">
              <Segmented
                testId="chart-granularity"
                value={granularity}
                onChange={(value) => setGranularity(value)}
                options={[
                  { value: 'month', label: '月' },
                  { value: 'year', label: '年' },
                ]}
              />
              <button
                type="button"
                className="ui-btn ui-btn--text"
                data-testid="chart-delete"
                disabled={!selectedId}
                onClick={() => void deleteChart()}
              >
                删除
              </button>
            </div>
          </div>

          {charts.length === 0 ? (
            <EmptyState testId="chart-empty" title="暂无数据" description="先新建一个图表。" />
          ) : geometry.length > 0 && geometry.some((line) => line.points.length > 0) ? (
            <>
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
          ) : (
            <EmptyState
              testId="chart-empty"
              title="暂无数据"
              description="这个时间范围里没有可统计的记录，换一个范围试试。"
            />
          )}

          {selected ? (
            <div className="chart-config">
              <h3>曲线配置</h3>
              <table className="m0-table">
                <thead>
                  <tr>
                    <th>曲线名称</th>
                    <th>交易类型</th>
                    <th>包含离群值</th>
                    <th>筛选条件</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.lines.map((line) => (
                    <tr key={line.label}>
                      <td>{line.label}</td>
                      <td>
                        <span className={`ui-tag ui-tag--${line.transactionType}`}>
                          {line.transactionType === 'expense'
                            ? '支出'
                            : line.transactionType === 'income'
                              ? '收入'
                              : '转账'}
                        </span>
                      </td>
                      <td>{line.includeOutlier ? '是' : '否'}</td>
                      <td>{line.conditions.length === 0 ? '不限' : `${line.conditions.length} 项`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </div>
    </>
  )
}





