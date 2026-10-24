import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { Input, Modal, Popconfirm, Select, Table } from 'antd'

import { centsToYuan } from '../../shared/domain/money'
import { reorderWithChanges } from '../../shared/domain/list-order'
import { addMonths, monthSpan, parseYearMonth } from '../../shared/domain/calendar'
import { rangeToSeconds, todayYmd } from '../../shared/domain/time'
import type { ChartLine } from '../../shared/domain/models'
import type { ChartDto } from '../../shared/types/chart'
import type { ChartLineData, ChartQueryResponse } from '../../shared/types/transaction'
import { AntvLineChart } from '../components/antv-line-chart'
import { Button } from '../components/button'
import { EmptyState } from '../components/empty-state'
import { Icon } from '../components/icon'
import { PageLayout } from '../components/page-layout'
import { ScrollArea } from '../components/scroll-area'
import { Spin } from '../components/spin'
import { TimeRangePicker, type TimeRangeMode } from '../components/time-range-picker'
import { notify } from '../components/toast'

const COLORS = ['#3964fe', '#f59e0b', '#12b76a', '#d92d20', '#7c3aed', '#0891b2']

const GRANULARITIES = [
  { value: 'month', label: '月' },
  { value: 'year', label: '年' },
]

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'msg' in error) {
    return String((error as { msg: unknown }).msg)
  }
  if (error instanceof Error) return error.message
  return String(error)
}

function typeLabel(transactionType: string): string {
  if (transactionType === 'income') return '收入'
  if (transactionType === 'expense') return '支出'
  if (transactionType === 'transfer') return '转账'
  return transactionType
}

function conditionSummary(line: ChartLine): string {
  if (line.conditions.length === 0) return '不限'
  return line.conditions
    .map((condition) => {
      const parts: string[] = []
      if (condition.transactionType) parts.push(typeLabel(condition.transactionType))
      if (condition.category) parts.push(condition.category)
      if (condition.tags.length > 0) parts.push(condition.tags.join('/'))
      if (condition.description) parts.push(`“${condition.description}”`)
      return parts.join(' · ') || '不限'
    })
    .join('；')
}

/** 分析页默认看最近 12 个月（与迁移前一致），记录页仍默认今天。 */
function lastYearRange(): { start: string; end: string } {
  const today = todayYmd()
  const parsed = parseYearMonth(today)
  if (!parsed) return { start: today, end: today }
  const [startYear, startMonth] = addMonths(parsed[0], parsed[1], -11)
  return {
    start: monthSpan(startYear, startMonth)[0],
    end: monthSpan(parsed[0], parsed[1])[1],
  }
}

export interface ChartsPageProps {
  ledgerId: string
}

/** 记账 · 分析：图表列表 + AntV 折线图 + 曲线配置。 */
export function ChartsPage({ ledgerId }: ChartsPageProps): JSX.Element {
  const [charts, setCharts] = useState<ChartDto[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [data, setData] = useState<ChartQueryResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [createOpen, setCreateOpen] = useState(false)
  const [createTitle, setCreateTitle] = useState('')
  const [createGranularity, setCreateGranularity] = useState('year')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const [renameOpen, setRenameOpen] = useState(false)
  const [renameTitle, setRenameTitle] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameError, setRenameError] = useState('')

  const [rangeMode, setRangeMode] = useState<TimeRangeMode>('month')
  const [rangeStart, setRangeStart] = useState(() => lastYearRange().start)
  const [rangeEnd, setRangeEnd] = useState(() => lastYearRange().end)
  const [committedRange, setCommittedRange] = useState(() => lastYearRange())

  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  /** 右侧「曲线合计」的收起状态：存在配置 JSON 里，重开应用/重新进入分析页都保持。 */
  const [summaryCollapsed, setSummaryCollapsed] = useState(false)
  const collapseToggleRef = useRef<HTMLButtonElement>(null)
  const expandToggleRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const snapshot = await window.api.invoke('config_get')
        if (alive) setSummaryCollapsed(snapshot.chartSummaryCollapsed)
      } catch {
        // 配置读取失败按展开处理，不阻塞图表
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const changeSummaryCollapsed = useCallback((collapsed: boolean): void => {
    setSummaryCollapsed(collapsed)
    // 收起/展开后原按钮会卸载，把焦点交给新出现的那个，键盘用户不会掉回页面开头
    requestAnimationFrame(() => {
      const nextToggle = collapsed ? expandToggleRef.current : collapseToggleRef.current
      nextToggle?.focus()
    })
    void window.api
      .invoke('config_set_chart_summary_collapsed', { collapsed })
      .catch((configError: unknown) => {
        setSummaryCollapsed(!collapsed)
        notify(`保存收起状态失败：${errorMessage(configError)}`, 'error')
      })
  }, [])

  useEffect(() => {
    if (rangeStart && rangeEnd) {
      setCommittedRange({ start: rangeStart, end: rangeEnd })
    }
  }, [rangeStart, rangeEnd])

  const load = useCallback(async (): Promise<void> => {
    if (!ledgerId) {
      setCharts([])
      return
    }
    try {
      const rows = await window.api.invoke('chart_list', { ledgerId })
      setCharts(rows)
      setSelectedId((current) =>
        rows.some((row) => row.chartId === current) ? current : (rows[0]?.chartId ?? ''),
      )
      setError('')
    } catch (loadError) {
      setError(errorMessage(loadError))
    }
  }, [ledgerId])

  useEffect(() => {
    void load()
  }, [load])

  const selected = charts.find((chart) => chart.chartId === selectedId) ?? null

  useEffect(() => {
    let alive = true
    if (!ledgerId || !selected) {
      setData(null)
      return
    }
    const range = rangeToSeconds(committedRange.start, committedRange.end)
    if (!range) {
      setData(null)
      return
    }
    setLoading(true)
    void (async () => {
      try {
        const result = await window.api.invoke('tr_chart_data', {
          ledgerId,
          tsRange: range,
          granularity: selected.granularity,
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
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [committedRange.end, committedRange.start, ledgerId, selected])

  const openCreate = useCallback((): void => {
    setCreateTitle('')
    setCreateGranularity('year')
    setCreateError('')
    setCreateOpen(true)
  }, [])

  const closeCreate = useCallback((): void => {
    setCreateOpen(false)
    setCreateError('')
  }, [])

  const createChart = useCallback(async (): Promise<void> => {
    if (!ledgerId || creating) return
    const title = createTitle.trim()
    if (!title) {
      setCreateError('请输入图表名称')
      return
    }
    setCreating(true)
    setCreateError('')
    try {
      const created = await window.api.invoke('chart_create', {
        ledgerId,
        title,
        granularity: createGranularity,
        chartType: 'line',
        lines: [
          {
            label: '支出',
            transactionType: 'expense',
            includeOutlier: true,
            conditions: [],
          },
        ],
      })
      setSelectedId(created.chartId)
      setCreateOpen(false)
      notify('图表创建成功')
      await load()
    } catch (createFailure) {
      setCreateError(errorMessage(createFailure))
    } finally {
      setCreating(false)
    }
  }, [createGranularity, createTitle, creating, ledgerId, load])

  const openRename = useCallback((): void => {
    if (!selected) return
    setRenameTitle(selected.title)
    setRenameError('')
    setRenameOpen(true)
  }, [selected])

  const closeRename = useCallback((): void => {
    setRenameOpen(false)
    setRenameError('')
  }, [])

  const renameChart = useCallback(async (): Promise<void> => {
    if (!selected || renaming) return
    const title = renameTitle.trim()
    if (!title) {
      setRenameError('请输入图表名称')
      return
    }
    setRenaming(true)
    setRenameError('')
    try {
      await window.api.invoke('chart_update', {
        chartId: selected.chartId,
        title,
        granularity: selected.granularity,
        lines: selected.lines,
        chartType: selected.chartType,
        sortOrder: selected.sortOrder,
      })
      setRenameOpen(false)
      notify('图表更新成功')
      await load()
    } catch (renameFailure) {
      setRenameError(errorMessage(renameFailure))
    } finally {
      setRenaming(false)
    }
  }, [load, renameTitle, renaming, selected])

  const changeGranularity = useCallback(
    async (granularity: string): Promise<void> => {
      if (!selected || selected.isPreset) return
      setError('')
      try {
        await window.api.invoke('chart_update', {
          chartId: selected.chartId,
          title: selected.title,
          granularity,
          lines: selected.lines,
          chartType: selected.chartType,
          sortOrder: selected.sortOrder,
        })
        await load()
      } catch (updateError) {
        setError(errorMessage(updateError))
      }
    },
    [load, selected],
  )

  const removeChart = useCallback(
    async (chartId: string): Promise<void> => {
      setError('')
      try {
        await window.api.invoke('chart_delete', { chartId })
        notify('图表已删除')
        await load()
      } catch (deleteError) {
        setError(errorMessage(deleteError))
      }
    },
    [load],
  )

  const moveChart = useCallback(
    async (from: number, to: number): Promise<void> => {
      setDragFrom(null)
      setDragOver(null)
      const result = reorderWithChanges(
        charts,
        from,
        to,
        (chart) => chart.chartId,
        (chart) => chart.sortOrder,
      )
      if (!result) return
      const [next, changed] = result
      setCharts(next.map((chart, index) => ({ ...chart, sortOrder: index })))
      try {
        await Promise.all(
          changed.map(([index, chartId]) =>
            window.api.invoke('chart_update_sort', { chartId, sortOrder: index }),
          ),
        )
      } catch (sortError) {
        setError(errorMessage(sortError))
        await load()
      }
    },
    [charts, load],
  )

  const responseLines: ChartLineData[] = data?.lines ?? []
  const hasValues = responseLines.some((line) => line.data.some((point) => point.amount !== 0))
  /* 颜色表按曲线条数记忆：`AntvLineChart` 的建图 effect 依赖这个数组，
   * 以前每次渲染都 `slice()` 出一个新数组 → 重命名弹窗里每敲一个字都销毁重画整张图
   * （实测 20 个字 = 20 次重建、926ms）。数组现在只在条数变化时换新。 */
  const lineCount = responseLines.length
  const colors = useMemo(() => COLORS.slice(0, Math.max(1, lineCount)), [lineCount])
  const lineRows = selected?.lines ?? []

  return (
    <PageLayout
      contentClassName="da-page-content"
      toolbar={
        <>
          <TimeRangePicker
            testId="chart-time"
            mode={rangeMode}
            start={rangeStart}
            end={rangeEnd}
            onModeChange={setRangeMode}
            onRangeChange={(start, end) => {
              setRangeStart(start)
              setRangeEnd(end)
            }}
          />
          <Button
            variant="primary"
            testId="chart-open-create"
            icon={<Icon name="Plus" size={14} />}
            onClick={openCreate}
          >
            新增图表
          </Button>
        </>
      }
    >
      {error ? (
        <p className="m0-error da-error" data-testid="chart-error">
          {error}
        </p>
      ) : null}

      <div className="da-main">
        <ScrollArea className="da-sidebar">
          <div className="da-list">
            {charts.length === 0 ? (
              <div className="da-list__empty" data-testid="chart-empty">
                暂无图表
              </div>
            ) : (
              charts.map((chart, index) => (
                <div
                  key={chart.chartId}
                  className={`da-list__row ui-drag-item${dragFrom === index ? ' is-dragging' : ''}${dragOver === index ? ' is-over' : ''}`}
                  draggable
                  onDragStart={() => setDragFrom(index)}
                  onDragOver={(event) => {
                    event.preventDefault()
                    setDragOver(index)
                  }}
                  onDrop={() => {
                    if (dragFrom !== null) void moveChart(dragFrom, index)
                  }}
                  onDragEnd={() => {
                    setDragFrom(null)
                    setDragOver(null)
                  }}
                >
                  <div
                    className={`da-list__item${chart.chartId === selectedId ? ' is-active' : ''}`}
                    data-testid="chart-item"
                    onClick={() => setSelectedId(chart.chartId)}
                  >
                    <span className="ui-drag-handle" title="拖动排序">
                      <Icon name="DragHandle" size={16} />
                    </span>
                    <span className="da-list__title" title={chart.title}>
                      {chart.title}
                    </span>
                    <Popconfirm
                      title={`删除图表「${chart.title}」？`}
                      okText="删除"
                      cancelText="取消"
                      okType="danger"
                      placement="topRight"
                      onConfirm={() => void removeChart(chart.chartId)}
                    >
                      <button
                        type="button"
                        className="tr-icon-btn is-danger-static da-list__delete"
                        data-testid="chart-delete"
                        aria-label={`删除图表 ${chart.title}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Icon name="Trash" size={14} />
                      </button>
                    </Popconfirm>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        <div className="da-content">
          {!selected ? (
            <div className="da-empty">
              <EmptyState
                testId="chart-selection-empty"
                title="请选择左侧图表，或点右上角「新增图表」"
              />
            </div>
          ) : (
            <div className="da-chart">
              <div className="da-chart__header">
                <h2 className="da-chart__title">{selected.title}</h2>
                <div className="da-chart__meta">
                  <Select
                    data-testid="chart-granularity"
                    aria-label="曲线粒度"
                    size="small"
                    value={selected.granularity}
                    disabled={selected.isPreset}
                    onChange={(value) => void changeGranularity(value)}
                    options={GRANULARITIES}
                    style={{ width: 72 }}
                  />
                  <Button variant="secondary" size="sm" testId="chart-rename" onClick={openRename}>
                    重命名
                  </Button>
                </div>
              </div>

              <div className="da-chart__body">
                <div className="da-chart__canvas">
                  {loading && !data ? (
                    <div className="da-chart__loading">
                      <Spin />
                    </div>
                  ) : hasValues ? (
                    <>
                      <ul className="da-chart__legend">
                        {responseLines.map((line, index) => (
                          <li key={line.label}>
                            <span
                              className="da-chart__legend-dot"
                              style={{ background: colors[index % colors.length] }}
                            />
                            <span>{line.label}</span>
                          </li>
                        ))}
                      </ul>
                      <AntvLineChart lines={responseLines} colors={colors} />
                    </>
                  ) : (
                    <div className="da-chart__empty" data-testid="chart-data-empty">
                      <EmptyState
                        title="暂无数据"
                        description="这个时间范围里没有可统计的记录，换一个范围试试。"
                      />
                    </div>
                  )}
                </div>

                {hasValues ? (
                  summaryCollapsed ? (
                    <aside className="da-chart__sums da-chart__sums--collapsed">
                      <button
                        type="button"
                        className="da-chart__sums-rail"
                        ref={expandToggleRef}
                        data-testid="chart-sums-expand"
                        aria-label="展开曲线合计"
                        title="展开曲线合计"
                        onClick={() => changeSummaryCollapsed(false)}
                      >
                        <Icon name="ChevronLeft" size={14} className="da-chart__sums-chevron" />
                        <span className="da-chart__sums-rail-title">曲线合计</span>
                      </button>
                    </aside>
                  ) : (
                    <aside className="da-chart__sums" data-testid="chart-sums">
                      <div className="da-chart__sums-head">
                        <h4 className="da-chart__sums-title">曲线合计</h4>
                        <button
                          type="button"
                          className="tr-icon-btn"
                          ref={collapseToggleRef}
                          data-testid="chart-sums-collapse"
                          aria-label="收起曲线合计"
                          title="收起曲线合计"
                          onClick={() => changeSummaryCollapsed(true)}
                        >
                          <Icon name="ChevronRight" size={14} className="da-chart__sums-chevron" />
                        </button>
                      </div>
                      {responseLines.map((line, index) => {
                        const total = line.data.reduce((sum, point) => sum + point.amount, 0)
                        return (
                          <div className="da-chart__sum-row" key={line.label}>
                            <span
                              className="da-list__dot"
                              style={{ background: colors[index % colors.length] }}
                            />
                            <span className="da-chart__sum-label">{line.label}</span>
                            <span className="da-chart__sum-value">{centsToYuan(total)}</span>
                          </div>
                        )
                      })}
                    </aside>
                  )
                ) : null}
              </div>

              <div className="da-chart__lines">
                <div className="da-chart__lines-head">
                  <h4 className="da-panel__title">曲线配置</h4>
                </div>
                <Table<ChartLine>
                  className="tr-table da-table"
                  rowKey={(line) => line.label}
                  pagination={false}
                  size="small"
                  dataSource={lineRows}
                  locale={{ emptyText: '还没有曲线' }}
                  columns={[
                    { title: '曲线名称', dataIndex: 'label' },
                    {
                      title: '交易类型',
                      dataIndex: 'transactionType',
                      width: 100,
                      align: 'center',
                      render: (value: string) => (
                        <span className={`ui-tag ui-tag--${value}`}>{typeLabel(value)}</span>
                      ),
                    },
                    {
                      title: '包含离群值',
                      dataIndex: 'includeOutlier',
                      width: 120,
                      align: 'center',
                      render: (value: boolean) => (value ? '是' : '否'),
                    },
                    {
                      title: '筛选条件',
                      dataIndex: 'conditions',
                      render: (_: unknown, line: ChartLine) => conditionSummary(line),
                    },
                  ]}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={createOpen}
        title="新增图表"
        width={400}
        centered
        destroyOnHidden
        footer={null}
        onCancel={closeCreate}
      >
        <div className="tr-modal-form">
          <div className="tr-modal-field">
            <span className="tr-modal-label">图表名称</span>
            <Input
              data-testid="chart-title"
              placeholder="图表名称"
              value={createTitle}
              onChange={(event) => setCreateTitle(event.target.value)}
              onPressEnter={() => void createChart()}
            />
          </div>
          <div className="tr-modal-field">
            <span className="tr-modal-label">时间粒度</span>
            <Select
              data-testid="chart-create-granularity"
              aria-label="时间粒度"
              value={createGranularity}
              onChange={setCreateGranularity}
              options={GRANULARITIES}
            />
          </div>
          {createError ? (
            <p className="m0-error" data-testid="chart-create-error">
              {createError}
            </p>
          ) : null}
          <div className="tr-modal-footer">
            <Button variant="secondary" testId="chart-create-cancel" onClick={closeCreate}>
              取消
            </Button>
            <Button
              variant="primary"
              testId="chart-create"
              loading={creating}
              disabled={creating}
              onClick={() => void createChart()}
            >
              新增
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={renameOpen}
        title="重命名图表"
        width={400}
        centered
        destroyOnHidden
        footer={null}
        onCancel={closeRename}
      >
        <div className="tr-modal-form">
          <div className="tr-modal-field">
            <span className="tr-modal-label">图表名称</span>
            <Input
              data-testid="chart-rename-input"
              placeholder="图表名称"
              value={renameTitle}
              onChange={(event) => setRenameTitle(event.target.value)}
              onPressEnter={() => void renameChart()}
            />
          </div>
          {renameError ? (
            <p className="m0-error" data-testid="chart-rename-error">
              {renameError}
            </p>
          ) : null}
          <div className="tr-modal-footer">
            <Button variant="secondary" testId="chart-rename-cancel" onClick={closeRename}>
              取消
            </Button>
            <Button
              variant="primary"
              testId="chart-rename-save"
              loading={renaming}
              disabled={renaming}
              onClick={() => void renameChart()}
            >
              重命名
            </Button>
          </div>
        </div>
      </Modal>
    </PageLayout>
  )
}
