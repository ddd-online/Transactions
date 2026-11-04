import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { Input, Modal, Popconfirm, Select, Table } from 'antd'

import { centsToYuan } from '../../shared/domain/money'
import { reorderWithChanges } from '../../shared/domain/list-order'
import { PIE_OTHER_KEY, foldPieSlices } from '../../shared/domain/pie'
import { rateText } from '../../shared/domain/format'
import { tagNamesForCategory } from '../../shared/domain/tag-names'
import { addMonths, monthSpan, parseYearMonth } from '../../shared/domain/calendar'
import { rangeToSeconds, todayYmd } from '../../shared/domain/time'
import type { ChartLine } from '../../shared/domain/models'
import type { ChartDto } from '../../shared/types/chart'
import type { CategoryDto, TagDto } from '../../shared/types/category'
import type {
  ChartLineData,
  ChartPieResponse,
  ChartQueryResponse,
} from '../../shared/types/transaction'
import { AntvLineChart } from '../components/antv-line-chart'
import { AntvPieChart } from '../components/antv-pie-chart'
import { Button } from '../components/button'
import { EmptyState } from '../components/empty-state'
import { Icon } from '../components/icon'
import { PageLayout } from '../components/page-layout'
import { ScrollArea } from '../components/scroll-area'
import { Segmented } from '../components/segmented'
import { Spin } from '../components/spin'
import { Switch } from '../components/switch'
import { TimeRangePicker, type TimeRangeMode } from '../components/time-range-picker'
import { notify } from '../components/toast'
import { pieSliceColors, seriesPalette } from '../theme/chart-colors'
import { useThemeMode } from '../theme/theme-mode'

const CHART_TYPES = [
  { value: 'line', label: '折线图' },
  { value: 'pie', label: '饼图' },
]

/** 饼图的分组字段：分类（一次一种交易类型）或交易类型。 */
const GROUP_FIELDS = [
  { value: 'category', label: '分类' },
  { value: 'tag', label: '标签' },
  { value: 'transactionType', label: '交易类型' },
]

const GRANULARITIES = [
  { value: 'month', label: '月' },
  { value: 'year', label: '年' },
]

const LINE_TYPES = [
  { value: 'expense', label: '支出' },
  { value: 'income', label: '收入' },
  { value: 'transfer', label: '转账' },
]

const TAG_POLICIES = [
  { value: 'any', label: '任意' },
  { value: 'all', label: '全部' },
]

const EMPTY_LINE_FORM: LineForm = {
  label: '',
  transactionType: 'expense',
  category: '',
  tags: [],
  tagPolicy: 'any',
  description: '',
  includeOutlier: true,
}

/** 「添加 / 编辑曲线」弹窗的表单：条件为空时存成不限条件的曲线。 */
interface LineForm {
  label: string
  transactionType: string
  category: string
  tags: string[]
  tagPolicy: string
  description: string
  includeOutlier: boolean
}

function lineFormOf(line: ChartLine): LineForm {
  const condition = line.conditions[0]
  return {
    label: line.label,
    transactionType: line.transactionType,
    category: condition?.category ?? '',
    tags: condition ? [...condition.tags] : [],
    tagPolicy: condition?.tagPolicy === 'all' ? 'all' : 'any',
    description: condition?.description ?? '',
    includeOutlier: line.includeOutlier,
  }
}

/** 表单 → 一条曲线：三项条件都没填就是「不限」。 */
function chartLineOf(form: LineForm): ChartLine {
  const category = form.category.trim()
  const tags = form.tags.map((tag) => tag.trim()).filter((tag) => tag !== '')
  const description = form.description.trim()
  return {
    label: form.label.trim(),
    transactionType: form.transactionType,
    includeOutlier: form.includeOutlier,
    conditions:
      category === '' && tags.length === 0 && description === ''
        ? []
        : [
            {
              transactionType: form.transactionType,
              category,
              tags,
              tagPolicy: form.tagPolicy,
              tagNot: false,
              description,
            },
          ],
  }
}

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

/**
 * 饼图的空态把「为什么空」说清楚，三级各有各的说法：
 * 整个范围没有记录 → 换范围；没有这一种类型 / 分类 → 换类型或分类；
 * 有记录但都没有标签 → 去给记录打标签。
 */
function pieEmptyDescription(pie: ChartPieResponse | null, chart: ChartDto): string {
  if (!pie || pie.rangeRecords === 0) {
    return '这个时间范围里没有记录，换一个范围试试。'
  }
  const scope = typeLabel(chart.groupTransactionType)
  if (pie.filteredRecords === 0) {
    if (chart.groupField === 'tag') {
      return `这个范围里没有「${scope} · ${chart.groupCategory}」记录，换一种交易类型或分类看看。`
    }
    if (chart.groupField === 'category') {
      return `这个范围里没有「${scope}」记录，换一种交易类型看看。`
    }
    return '这个范围里没有可统计的记录，换一个范围试试。'
  }
  if (chart.groupField === 'tag') {
    return `这个范围里「${scope} · ${chart.groupCategory}」的记录都没有标签，先给记录加上标签。`
  }
  return '这个范围里没有可统计的记录，换一个范围试试。'
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
  const [pie, setPie] = useState<ChartPieResponse | null>(null)
  const [pieLoading, setPieLoading] = useState(false)
  const [error, setError] = useState('')

  const [createOpen, setCreateOpen] = useState(false)
  const [createTitle, setCreateTitle] = useState('')
  const [createType, setCreateType] = useState('line')
  const [createGranularity, setCreateGranularity] = useState('year')
  const [createGroupField, setCreateGroupField] = useState('category')
  const [createGroupType, setCreateGroupType] = useState('expense')
  const [createGroupCategory, setCreateGroupCategory] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const [renameOpen, setRenameOpen] = useState(false)
  const [renameTitle, setRenameTitle] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameError, setRenameError] = useState('')

  const [categories, setCategories] = useState<CategoryDto[]>([])
  const [tags, setTags] = useState<TagDto[]>([])

  /** 某一种交易类型下的分类名（新建弹窗与「分组配置」共用）。 */
  const categoryNamesFor = useCallback(
    (transactionType: string): string[] => {
      const names = new Set<string>()
      for (const category of categories) {
        if (category.transactionType === transactionType) names.add(category.name)
      }
      return Array.from(names)
    },
    [categories],
  )

  const categoryOptionsFor = useCallback(
    (transactionType: string): { value: string; label: string }[] =>
      categoryNamesFor(transactionType).map((name) => ({ value: name, label: name })),
    [categoryNamesFor],
  )


  const [lineOpen, setLineOpen] = useState(false)
  /** 正在编辑的曲线下标；`null` 表示新增 */
  const [lineIndex, setLineIndex] = useState<number | null>(null)
  const [lineForm, setLineForm] = useState<LineForm>(EMPTY_LINE_FORM)
  const [lineError, setLineError] = useState('')
  const [savingLine, setSavingLine] = useState(false)

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

  const openCreate = useCallback((): void => {
    setCreateTitle('')
    setCreateType('line')
    setCreateGranularity('year')
    setCreateGroupField('category')
    setCreateGroupType('expense')
    setCreateGroupCategory('')
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
    const pieChart = createType === 'pie'
    if (pieChart && createGroupField !== 'transactionType' && !createGroupType) {
      setCreateError('请选择交易类型')
      return
    }
    if (pieChart && createGroupField === 'tag' && !createGroupCategory) {
      setCreateError('按标签分组时请选择分类')
      return
    }
    setCreating(true)
    setCreateError('')
    try {
      const created = await window.api.invoke('chart_create', {
        ledgerId,
        title,
        // 饼图不分时间桶：粒度留空串，构成由分组字段描述。
        granularity: pieChart ? '' : createGranularity,
        chartType: pieChart ? 'pie' : 'line',
        groupField: pieChart ? createGroupField : '',
        groupTransactionType:
          pieChart && createGroupField !== 'transactionType' ? createGroupType : '',
        groupCategory: pieChart && createGroupField === 'tag' ? createGroupCategory : '',
        lines: pieChart
          ? []
          : [
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
  }, [
    createGranularity,
    createGroupCategory,
    createGroupField,
    createGroupType,
    createTitle,
    createType,
    creating,
    ledgerId,
    load,
  ])

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
        groupField: selected.groupField,
        groupTransactionType: selected.groupTransactionType,
        groupCategory: selected.groupCategory,
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
        const names = categoryNamesFor(groupTransactionType)
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
    [categoryNamesFor, load, selected],
  )

  const responseLines: ChartLineData[] = data?.lines ?? []
  const hasValues = responseLines.some((line) => line.data.some((point) => point.amount !== 0))

  const isPie = selected?.chartType === 'pie'
  const pieTotal = pie?.total ?? 0
  /** 图上与右侧合计列读同一份折叠结果：超过 10 组折成一片「其他（N 组）」。 */
  const pieSlices = useMemo(() => {
    const folded = foldPieSlices(pie?.slices ?? [])
    if (folded.folded === 0) return folded.slices
    return folded.slices.map((slice) =>
      slice.key === PIE_OTHER_KEY ? { ...slice, label: `其他（${folded.folded} 组）` } : slice,
    )
  }, [pie])
  /** 用画布画的图读不到 CSS 变量：主题一变就得重算颜色（`mode` 只用来触发重新解析令牌）。 */
  const mode = useThemeMode()
  /** 折线图与饼图共用这一份色板 —— 第 N 条曲线和第 N 名是同一个颜色。 */
  const seriesColors = useMemo(() => seriesPalette(), [mode])
  const pieColors = useMemo(
    () => pieSliceColors(pieSlices, selected?.groupField ?? ''),
    [pieSlices, selected?.groupField, mode],
  )
  const hasPie = pieSlices.length > 0
  const pieLabel = useMemo(() => {
    if (!selected || selected.chartType !== 'pie') return ''
    if (selected.groupField === 'category') return `${typeLabel(selected.groupTransactionType)}按分类`
    if (selected.groupField === 'tag') {
      return `${typeLabel(selected.groupTransactionType)} · ${selected.groupCategory} 按标签`
    }
    return '按交易类型'
  }, [selected])

  // ---------------------------------------------------------------- 曲线的增 / 改 / 删

  /** 整行回写（只换曲线）：本地先换成服务端返回的那一份，图表随之重算。 */
  const applyLines = useCallback(
    async (lines: ChartLine[], message: string): Promise<boolean> => {
      if (!selected || selected.isPreset) return false
      setSavingLine(true)
      setError('')
      try {
        const updated = await window.api.invoke('chart_update', {
          chartId: selected.chartId,
          title: selected.title,
          granularity: selected.granularity,
          lines,
          chartType: selected.chartType,
          groupField: selected.groupField,
          groupTransactionType: selected.groupTransactionType,
          groupCategory: selected.groupCategory,
          sortOrder: selected.sortOrder,
        })
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

  const openAddLine = useCallback((): void => {
    setLineIndex(null)
    setLineForm(EMPTY_LINE_FORM)
    setLineError('')
    setLineOpen(true)
  }, [])

  const openEditLine = useCallback((index: number): void => {
    const line = selected?.lines[index]
    if (!line) return
    setLineIndex(index)
    setLineForm(lineFormOf(line))
    setLineError('')
    setLineOpen(true)
  }, [selected])

  const closeLine = useCallback((): void => {
    setLineOpen(false)
    setLineError('')
  }, [])

  const submitLine = useCallback(async (): Promise<void> => {
    if (!selected || savingLine) return
    const line = chartLineOf(lineForm)
    if (!line.label) {
      setLineError('请输入曲线名称')
      return
    }
    const others = selected.lines.filter((_item, index) => index !== lineIndex)
    if (others.some((item) => item.label === line.label)) {
      setLineError(`已经有名为「${line.label}」的曲线`)
      return
    }
    const next =
      lineIndex === null
        ? [...selected.lines, line]
        : selected.lines.map((item, index) => (index === lineIndex ? line : item))
    const saved = await applyLines(next, lineIndex === null ? '曲线已添加' : '曲线已保存')
    if (saved) setLineOpen(false)
  }, [applyLines, lineForm, lineIndex, savingLine, selected])

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

  const categoryOptions = useMemo(() => {
    const names = new Set<string>()
    for (const category of categories) {
      if (category.transactionType === lineForm.transactionType) names.add(category.name)
    }
    return Array.from(names).map((name) => ({ value: name, label: name }))
  }, [categories, lineForm.transactionType])

  const tagOptions = useMemo(
    () =>
      tagNamesForCategory(tags, lineForm.category, lineForm.transactionType).map((name) => ({
        value: name,
        label: name,
      })),
    [lineForm.category, lineForm.transactionType, tags],
  )

  /** 换交易类型：分类与标签都跟着失效（标签按 `分类:类型` 归档）。 */
  const changeLineType = useCallback((transactionType: string): void => {
    setLineForm((current) => ({ ...current, transactionType, category: '', tags: [] }))
  }, [])

  const changeLineCategory = useCallback(
    (category: string): void => {
      const valid = new Set(tagNamesForCategory(tags, category, lineForm.transactionType))
      setLineForm((current) => ({
        ...current,
        category,
        tags: current.tags.filter((tag) => valid.has(tag)),
      }))
    },
    [lineForm.transactionType, tags],
  )

  /* 颜色表按曲线条数记忆：`AntvLineChart` 的建图 effect 依赖这个数组，
   * 以前每次渲染都 `slice()` 出一个新数组 → 重命名弹窗里每敲一个字都销毁重画整张图
   * （实测 20 个字 = 20 次重建、926ms）。数组现在只在条数变化时换新。 */
  const lineCount = responseLines.length
  const colors = useMemo(
    () => seriesColors.slice(0, Math.max(1, lineCount)),
    [lineCount, seriesColors],
  )
  const lineRows = selected?.lines ?? []
  const hasLines = lineRows.length > 0

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
        <p role="alert" className="m0-error da-error" data-testid="chart-error">
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
                  {/* 饼图没有时间粒度：构成不按时间分桶，摆一个用不上的选择器只会让人以为它能改。 */}
                  {isPie ? null : (
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
                  )}
                  {selected.isPreset ? null : (
                    <Button variant="secondary" size="sm" testId="chart-rename" onClick={openRename}>
                      重命名
                    </Button>
                  )}
                </div>
              </div>

              <div className="da-chart__body">
                <div className="da-chart__canvas">
                  {isPie ? (
                    pieLoading && !pie ? (
                      <div className="da-chart__loading">
                        <Spin />
                      </div>
                    ) : hasPie ? (
                      <AntvPieChart
                        slices={pieSlices}
                        colors={pieColors}
                        total={pieTotal}
                        label={pieLabel}
                      />
                    ) : (
                      <div className="da-chart__empty" data-testid="chart-data-empty">
                        <EmptyState
                          title="暂无数据"
                          description={pieEmptyDescription(pie, selected)}
                        />
                      </div>
                    )
                  ) : loading && !data ? (
                    <div className="da-chart__loading">
                      <Spin />
                    </div>
                  ) : !hasLines ? (
                    // 一条曲线都没有时，画布不摆第二个空态插画：这里说的不是「没数据」，
                    // 而是「没东西可画」，一句安静的话把眼睛交给下面的曲线配置。
                    <p className="da-chart__canvas-hint" data-testid="chart-canvas-hint">
                      加一条曲线之后，这里会画出趋势。
                    </p>
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

                {isPie ? (
                  hasPie ? (
                    <aside
                      className="da-chart__sums da-chart__sums--pie"
                      data-testid="chart-pie-sums"
                    >
                      <div className="da-chart__sums-head">
                        <h4 className="da-chart__sums-title">分组合计</h4>
                        <span className="da-chart__sums-total">{centsToYuan(pieTotal)}</span>
                      </div>
                      {/* 这一列就是饼图的图例：点 + 名称 + 金额 + 占比，与扇区同一份折叠结果。
                          没有收起态 —— 收起之后没人分得清哪一片是哪一组。 */}
                      <div className="da-chart__pie-list">
                        {pieSlices.map((slice, index) => (
                          <div
                            className="da-chart__pie-row"
                            key={slice.key}
                            data-testid="chart-pie-sum"
                          >
                            <span
                              className="da-list__dot"
                              style={{ background: pieColors[index] }}
                            />
                            <span className="da-chart__pie-name" title={slice.label}>
                              {slice.label}
                            </span>
                            <span className="da-chart__pie-value">{centsToYuan(slice.amount)}</span>
                            <span className="da-chart__pie-share">
                              {rateText(pieTotal > 0 ? (slice.amount / pieTotal) * 100 : 0)}
                            </span>
                          </div>
                        ))}
                      </div>
                      {pie && pie.total > pie.filteredTotal ? (
                        <p className="da-chart__pie-note">多标签的记录会重复计入</p>
                      ) : null}
                    </aside>
                  ) : null
                ) : hasValues ? (
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

              {isPie ? (
                <div className="da-chart__lines" data-testid="chart-group-config">
                  <div className="da-chart__lines-head">
                    <h4 className="da-panel__title">分组配置</h4>
                  </div>
                  <div className="da-group-config">
                    <div className="da-group-config__field">
                      <span className="da-group-config__label">分组字段</span>
                      <Select
                        className="da-group-config__select"
                        data-testid="chart-group-field"
                        aria-label="分组字段"
                        size="small"
                        value={selected.groupField}
                        options={GROUP_FIELDS}
                        onChange={(value: string) => void changeGrouping({ field: value })}
                      />
                    </div>
                    {selected.groupField === 'category' || selected.groupField === 'tag' ? (
                      <div className="da-group-config__field">
                        <span className="da-group-config__label">交易类型</span>
                        <Select
                          className="da-group-config__select"
                          data-testid="chart-group-type"
                          aria-label="交易类型"
                          size="small"
                          value={selected.groupTransactionType || 'expense'}
                          options={LINE_TYPES}
                          onChange={(value: string) => void changeGrouping({ type: value })}
                        />
                      </div>
                    ) : null}
                    {selected.groupField === 'tag' ? (
                      <div className="da-group-config__field">
                        <span className="da-group-config__label">分类</span>
                        <Select
                          className="da-group-config__select"
                          data-testid="chart-group-category"
                          aria-label="分类"
                          size="small"
                          placeholder="选择分类"
                          value={selected.groupCategory || undefined}
                          options={categoryOptionsFor(selected.groupTransactionType || 'expense')}
                          onChange={(value: string) => void changeGrouping({ category: value })}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
              <div className="da-chart__lines">
                <div className="da-chart__lines-head">
                  <h4 className="da-panel__title">曲线配置</h4>
                  {selected.isPreset ? null : (
                    <div className="da-chart__lines-actions">
                      <Button
                        variant="secondary"
                        size="sm"
                        testId="chart-line-add"
                        icon={<Icon name="Plus" size={14} />}
                        loading={savingLine}
                        onClick={openAddLine}
                      >
                        添加曲线
                      </Button>
                    </div>
                  )}
                </div>
                <Table<ChartLine>
                  className="tr-table da-table"
                  rowKey={(line) => line.label}
                  pagination={false}
                  size="small"
                  dataSource={lineRows}
                  // 窄窗里放不下时由表格自己横向滚，别把整页顶出可视区
                  scroll={{ x: 'max-content' }}
                  locale={{
                    emptyText: (
                      <div className="da-chart__lines-empty">
                        <EmptyState
                          testId="chart-lines-empty"
                          title="还没有曲线"
                          description={
                            selected.isPreset
                              ? '预设图表的曲线由系统提供'
                              : '点右上角「添加曲线」建一条'
                          }
                        />
                      </div>
                    ),
                  }}
                  columns={[
                    {
                      title: '曲线名称',
                      dataIndex: 'label',
                      render: (value: string, _line: ChartLine, index: number) => (
                        <span className="da-line-name">
                          <span
                            className="da-line-swatch"
                            style={{ background: seriesColors[index % seriesColors.length] }}
                            aria-hidden="true"
                          />
                          {value}
                        </span>
                      ),
                    },
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
                    ...(selected.isPreset
                      ? []
                      : [
                          {
                            title: '操作',
                            key: 'actions',
                            width: 120,
                            align: 'center' as const,
                            render: (_: unknown, line: ChartLine, index: number) => (
                              <span className="da-line-actions">
                                <Button
                                  variant="text"
                                  size="sm"
                                  testId="chart-line-edit"
                                  disabled={savingLine}
                                  onClick={() => openEditLine(index)}
                                >
                                  编辑
                                </Button>
                                <Popconfirm
                                  title={`删除曲线「${line.label}」？`}
                                  okText="删除"
                                  cancelText="取消"
                                  okType="danger"
                                  placement="topRight"
                                  onConfirm={() => void removeLine(index)}
                                >
                                  <Button
                                    variant="text-danger"
                                    size="sm"
                                    testId="chart-line-delete"
                                    disabled={savingLine}
                                  >
                                    删除
                                  </Button>
                                </Popconfirm>
                              </span>
                            ),
                          },
                        ]),
                  ]}
                />
              </div>
              )}
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
            <span className="tr-modal-label">图表类型</span>
            <Segmented
              testId="chart-create-type"
              block
              value={createType}
              options={CHART_TYPES}
              onChange={setCreateType}
            />
          </div>
          {createType === 'pie' ? (
            <>
              <div className="tr-modal-field">
                <span className="tr-modal-label">分组字段</span>
                <Select
                  data-testid="chart-create-group"
                  aria-label="分组字段"
                  value={createGroupField}
                  onChange={(value: string) => {
                    setCreateGroupField(value)
                    if (value === 'tag' && !createGroupCategory) {
                      setCreateGroupCategory(categoryNamesFor(createGroupType)[0] ?? '')
                    }
                  }}
                  options={GROUP_FIELDS}
                />
              </div>
              {createGroupField !== 'transactionType' ? (
                <div className="tr-modal-field">
                  <span className="tr-modal-label">交易类型</span>
                  <Select
                    data-testid="chart-create-group-type"
                    aria-label="交易类型"
                    value={createGroupType}
                    onChange={(value: string) => {
                      setCreateGroupType(value)
                      // 分类挂在类型下：换类型就把分类落到新类型的第一个
                      setCreateGroupCategory(categoryNamesFor(value)[0] ?? '')
                    }}
                    options={LINE_TYPES}
                  />
                </div>
              ) : null}
              {createGroupField === 'tag' ? (
                <div className="tr-modal-field">
                  <span className="tr-modal-label">分类</span>
                  <Select
                    data-testid="chart-create-group-category"
                    aria-label="分类"
                    placeholder="选择分类"
                    value={createGroupCategory || undefined}
                    onChange={setCreateGroupCategory}
                    options={categoryOptionsFor(createGroupType)}
                  />
                </div>
              ) : null}
            </>
          ) : (
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
          )}
          {createError ? (
            <p role="alert" className="m0-error" data-testid="chart-create-error">
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
            <p role="alert" className="m0-error" data-testid="chart-rename-error">
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

      <Modal
        open={lineOpen}
        title={lineIndex === null ? '添加曲线' : '编辑曲线'}
        width={560}
        centered
        destroyOnHidden
        footer={null}
        onCancel={closeLine}
      >
        <div className="tr-modal-form" data-testid="chart-line-dialog">
          <div className="tr-modal-field">
            <span className="tr-modal-label">曲线名称</span>
            <Input
              data-testid="chart-line-label"
              placeholder="例如：餐饮支出"
              value={lineForm.label}
              maxLength={40}
              onChange={(event) =>
                setLineForm((current) => ({ ...current, label: event.target.value }))
              }
              onPressEnter={() => void submitLine()}
            />
          </div>

          <div className="tr-modal-row">
            <div className="tr-modal-field">
              <span className="tr-modal-label">交易类型</span>
              <Select
                data-testid="chart-line-type"
                value={lineForm.transactionType}
                options={LINE_TYPES}
                onChange={(value: string) => changeLineType(value)}
              />
            </div>
            <div className="tr-modal-field">
              <span className="tr-modal-label">分类</span>
              <Select
                data-testid="chart-line-category"
                value={lineForm.category || undefined}
                placeholder="不限分类"
                allowClear
                options={categoryOptions}
                onChange={(value: string | undefined) => changeLineCategory(value ?? '')}
              />
            </div>
          </div>

          <div className="tr-modal-row">
            <div className="tr-modal-field">
              <span className="tr-modal-label">标签</span>
              <Select
                data-testid="chart-line-tags"
                mode="multiple"
                allowClear
                placeholder="不限标签"
                value={lineForm.tags}
                options={tagOptions}
                onChange={(value: string[]) =>
                  setLineForm((current) => ({ ...current, tags: value }))
                }
              />
            </div>
            <div className="tr-modal-field">
              <span className="tr-modal-label">标签匹配</span>
              <Select
                data-testid="chart-line-policy"
                value={lineForm.tagPolicy}
                options={TAG_POLICIES}
                onChange={(value: string) =>
                  setLineForm((current) => ({ ...current, tagPolicy: value }))
                }
              />
            </div>
          </div>

          <div className="tr-modal-field">
            <span className="tr-modal-label">描述包含</span>
            <Input
              data-testid="chart-line-description"
              placeholder="输入关键词"
              value={lineForm.description}
              onChange={(event) =>
                setLineForm((current) => ({ ...current, description: event.target.value }))
              }
            />
          </div>

          <Switch
            checked={lineForm.includeOutlier}
            testId="chart-line-outlier"
            label="包含离群值"
            onChange={(checked) =>
              setLineForm((current) => ({ ...current, includeOutlier: checked }))
            }
          />

          {lineError ? (
            <p role="alert" className="m0-error" data-testid="chart-line-error">
              {lineError}
            </p>
          ) : null}
          <div className="tr-modal-footer">
            <Button variant="secondary" testId="chart-line-cancel" onClick={closeLine}>
              取消
            </Button>
            <Button
              variant="primary"
              testId="chart-line-submit"
              loading={savingLine}
              disabled={savingLine}
              onClick={() => void submitLine()}
            >
              {lineIndex === null ? '添加' : '保存'}
            </Button>
          </div>
        </div>
      </Modal>
    </PageLayout>
  )
}
