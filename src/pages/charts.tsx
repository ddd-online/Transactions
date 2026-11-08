import { useCallback, useEffect, useRef, useState, type JSX } from 'react'

import { reorderWithChanges } from '../../shared/domain/list-order'
import { rangeToSeconds } from '../../shared/domain/time'
import type { ChartLine } from '../../shared/domain/models'
import type { ChartDto } from '../../shared/types/chart'
import type { CategoryDto, TagDto } from '../../shared/types/category'
import type { ChartPieResponse, ChartQueryResponse } from '../../shared/types/transaction'
import { ChartEditor, type ChartEditorRequest } from './chart-editor'
import { categoryNamesFor } from './chart-options'
import { updateChartLines } from './chart-write'
import { ChartRangePicker, useChartRange } from './chart-range'
import { ChartGrid } from './chart-grid'
import { Button } from '../components/button'
import { Icon } from '../components/icon'
import { PageLayout } from '../components/page-layout'
import { notify } from '../components/toast'


function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'msg' in error) {
    return String((error as { msg: unknown }).msg)
  }
  if (error instanceof Error) return error.message
  return String(error)
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
  const [pie, setPie] = useState<ChartPieResponse | null>(null)
  const [pieLoading, setPieLoading] = useState(false)
  const [error, setError] = useState('')
  /** 编辑器要开哪一张：null = 都关着 */
  const [editor, setEditor] = useState<ChartEditorRequest | null>(null)



  const [categories, setCategories] = useState<CategoryDto[]>([])
  const [tags, setTags] = useState<TagDto[]>([])

  const [savingLine, setSavingLine] = useState(false)

  const [range, updateRange] = useChartRange()
  const { start: rangeStart, end: rangeEnd } = range
  const [committedRange, setCommittedRange] = useState(() => ({
    start: range.start,
    end: range.end,
  }))

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

  /** 分类 / 标签只是曲线条件的选择项：读取失败不阻塞图表。 */
  useEffect(() => {
    if (!ledgerId) {
      setCategories([])
      setTags([])
      return
    }
    let alive = true
    void (async () => {
      try {
        const [categoryRows, tagRows] = await Promise.all([
          window.api.invoke('category_list', { ledgerId, type: '' }),
          window.api.invoke('tag_list', { ledgerId, categoryTransactionType: '' }),
        ])
        if (!alive) return
        setCategories(categoryRows)
        setTags(tagRows)
      } catch {
        if (alive) {
          setCategories([])
          setTags([])
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [ledgerId])

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
      setPie(null)
      return
    }
    const range = rangeToSeconds(committedRange.start, committedRange.end)
    if (!range) {
      setData(null)
      setPie(null)
      return
    }
    // 饼图问的是构成，折线图问的是趋势：两套数据源，各自一套 loading。
    if (selected.chartType === 'pie') {
      setPieLoading(true)
      void (async () => {
        try {
          const result = await window.api.invoke('tr_chart_pie_data', {
            ledgerId,
            tsRange: range,
            groupField: selected.groupField,
            groupTransactionType: selected.groupTransactionType,
            groupCategory: selected.groupCategory,
          })
          if (alive) {
            setPie(result)
            setError('')
          }
        } catch (loadError) {
          if (alive) setError(errorMessage(loadError))
        } finally {
          if (alive) setPieLoading(false)
        }
      })()
      return () => {
        alive = false
      }
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
          groupField: selected.groupField,
          groupTransactionType: selected.groupTransactionType,
          groupCategory: selected.groupCategory,
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

  /**
   * 改饼图的分组：整行回写（与改粒度同一条路径），写完重拉列表。
   *
   * 三个字段互相牵连：按交易类型分组没有类型过滤；按分类要一种类型；按标签还要一个分类，
   * 而且分类必须属于那种类型（换类型时分类跟着落到该类型的第一个）。
   */
  const changeGrouping = useCallback(
    async (next: { field?: string; type?: string; category?: string }): Promise<void> => {
      if (!selected || selected.isPreset || selected.chartType !== 'pie') return
      const groupField = next.field ?? selected.groupField
      const groupTransactionType =
        groupField === 'transactionType'
          ? ''
          : next.type ?? (selected.groupTransactionType || 'expense')
      let groupCategory = ''
      if (groupField === 'tag') {
        const names = categoryNamesFor(categories, groupTransactionType)
        const wanted = next.category ?? selected.groupCategory
        groupCategory = names.includes(wanted) ? wanted : (names[0] ?? '')
      }
      setError('')
      try {
        await window.api.invoke('chart_update', {
          chartId: selected.chartId,
          title: selected.title,
          granularity: selected.granularity,
          lines: [],
          chartType: 'pie',
          groupField,
          groupTransactionType,
          groupCategory,
          sortOrder: selected.sortOrder,
        })
        await load()
      } catch (updateError) {
        setError(errorMessage(updateError))
      }
    },
    [categories, load, selected],
  )

  // ---------------------------------------------------------------- 曲线的增 / 改 / 删

  /** 整行回写（只换曲线）：本地先换成服务端返回的那一份，图表随之重算。 */
  const applyLines = useCallback(
    async (lines: ChartLine[], message: string): Promise<boolean> => {
      if (!selected || selected.isPreset) return false
      setSavingLine(true)
      setError('')
      try {
        const updated = await updateChartLines(selected, lines)
        setCharts((current) =>
          current.map((chart) => (chart.chartId === updated.chartId ? updated : chart)),
        )
        notify(message)
        return true
      } catch (saveError) {
        setError(errorMessage(saveError))
        await load()
        return false
      } finally {
        setSavingLine(false)
      }
    },
    [load, selected],
  )

  const removeLine = useCallback(
    async (index: number): Promise<void> => {
      if (!selected) return
      await applyLines(
        selected.lines.filter((_item, current) => current !== index),
        '曲线已删除',
      )
    },
    [applyLines, selected],
  )

  const openLineEditor = (index: number | null): void => {
    if (selected) setEditor({ kind: 'line', chart: selected, index })
  }

  return (
    <PageLayout
      contentClassName="da-page-content"
      toolbar={
        <>
          <ChartRangePicker range={range} onChange={updateRange} />
          <Button
            variant="primary"
            testId="chart-open-create"
            icon={<Icon name="Plus" size={14} />}
            onClick={() => setEditor({ kind: 'create' })}
          >
            新增图表
          </Button>
        </>
      }
    >
      {error ? (
        <p role="alert" className="m0-error da-error" data-testid="chart-error">
          {error}
        </p>
      ) : null}

      <ChartGrid
        charts={charts}
        selectedId={selectedId}
        selected={selected}
        onSelect={setSelectedId}
        onDelete={(chartId) => void removeChart(chartId)}
        onMove={(from, to) => void moveChart(from, to)}
        onChangeGranularity={(granularity) => void changeGranularity(granularity)}
        onRename={(chart) => setEditor({ kind: 'rename', chart })}
        onAddLine={() => openLineEditor(null)}
        onEditLine={(index) => openLineEditor(index)}
        onRemoveLine={(index) => void removeLine(index)}
        onChangeGrouping={(next) => void changeGrouping(next)}
        data={data}
        loading={loading}
        pie={pie}
        pieLoading={pieLoading}
        categories={categories}
        savingLine={savingLine}
        summaryCollapsed={summaryCollapsed}
        onToggleSummaryCollapsed={changeSummaryCollapsed}
        collapseToggleRef={collapseToggleRef}
        expandToggleRef={expandToggleRef}
      />

      <ChartEditor
        ledgerId={ledgerId}
        request={editor}
        categories={categories}
        tags={tags}
        onCreated={async (chartId) => {
          setSelectedId(chartId)
          await load()
        }}
        onChartUpdated={(updated) =>
          setCharts((current) =>
            current.map((chart) => (chart.chartId === updated.chartId ? updated : chart)),
          )
        }
        onRenamed={load}
        onClose={() => setEditor(null)}
      />
    </PageLayout>
  )
}
