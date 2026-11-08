import { useEffect, useState, type JSX } from 'react'
import { Modal } from 'antd'

import { errorMessage } from '../../shared/errors'
import type { ChartDto } from '../../shared/types/chart'
import type { CategoryDto, TagDto } from '../../shared/types/category'
import { notify } from '../components/toast'
import { categoryNamesFor } from './chart-options'
import { updateChartLines } from './chart-write'
import { CreateChartDialog, RenameChartDialog } from './chart-editor-dialogs'
import {
  ChartLineForm,
  EMPTY_LINE_FORM,
  chartLineOf,
  lineFormOf,
  type LineForm,
} from './chart-editor-line-form'

/**
 * 图表编辑器：新增 / 重命名 / 曲线的增改，三张弹窗一个 module。
 *
 * 页面只递一份 request（要开哪一张、改哪一张、改第几条曲线），编辑器自己的草稿、
 * 校验、IPC 与失败文案都在里面；存下来之后按结果回三句话：建好了（给 id）、
 * 曲线换了（给新的那一份图表）、改名了（页面重拉）。
 */

export type ChartEditorRequest =
  | { kind: 'create' }
  | { kind: 'rename'; chart: ChartDto }
  | { kind: 'line'; chart: ChartDto; index: number | null }

export interface ChartEditorProps {
  ledgerId: string
  /** 要开哪一张：`null` 表示都关着 */
  request: ChartEditorRequest | null
  /** 分类与标签：新建饼图、曲线条件都要从这两份里挑 */
  categories: CategoryDto[]
  tags: TagDto[]
  /** 建好了：页面选中它并重拉列表 */
  onCreated: (chartId: string) => Promise<void> | void
  /** 曲线换了：页面把列表里那一行换成这一份 */
  onChartUpdated: (chart: ChartDto) => void
  /** 改名了：页面重拉列表 */
  onRenamed: () => Promise<void> | void
  onClose: () => void
}

export function ChartEditor({
  ledgerId,
  request,
  categories,
  tags,
  onCreated,
  onChartUpdated,
  onRenamed,
  onClose,
}: ChartEditorProps): JSX.Element {
  const [createTitle, setCreateTitle] = useState('')
  const [createType, setCreateType] = useState('line')
  const [createGranularity, setCreateGranularity] = useState('year')
  const [createGroupField, setCreateGroupField] = useState('category')
  const [createGroupType, setCreateGroupType] = useState('expense')
  const [createGroupCategory, setCreateGroupCategory] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const [renameTitle, setRenameTitle] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameError, setRenameError] = useState('')

  const [lineIndex, setLineIndex] = useState<number | null>(null)
  const [lineForm, setLineForm] = useState<LineForm>(EMPTY_LINE_FORM)
  const [lineError, setLineError] = useState('')
  const [savingLine, setSavingLine] = useState(false)

  // 每次换一张弹窗（或换一条曲线）都从干净草稿开始 —— request 是调用方新建的对象，
  // 只在「打开」那一刻变化，所以这个 effect 不会把用户正在写的内容冲掉。
  useEffect(() => {
    if (!request) return
    if (request.kind === 'create') {
      setCreateTitle('')
      setCreateType('line')
      setCreateGranularity('year')
      setCreateGroupField('category')
      setCreateGroupType('expense')
      setCreateGroupCategory('')
      setCreateError('')
      return
    }
    if (request.kind === 'rename') {
      setRenameTitle(request.chart.title)
      setRenameError('')
      return
    }
    setLineIndex(request.index)
    setLineForm(
      request.index === null
        ? EMPTY_LINE_FORM
        : lineFormOf(request.chart.lines[request.index] ?? request.chart.lines[0]),
    )
    setLineError('')
  }, [request])

  const createChart = async (): Promise<void> => {
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
      notify('图表创建成功')
      onClose()
      await onCreated(created.chartId)
    } catch (failure) {
      setCreateError(errorMessage(failure))
    } finally {
      setCreating(false)
    }
  }

  const renameChart = async (): Promise<void> => {
    const chart = request?.kind === 'rename' ? request.chart : null
    if (!chart || renaming) return
    const title = renameTitle.trim()
    if (!title) {
      setRenameError('请输入图表名称')
      return
    }
    setRenaming(true)
    setRenameError('')
    try {
      await window.api.invoke('chart_update', {
        chartId: chart.chartId,
        title,
        granularity: chart.granularity,
        lines: chart.lines,
        chartType: chart.chartType,
        groupField: chart.groupField,
        groupTransactionType: chart.groupTransactionType,
        groupCategory: chart.groupCategory,
        sortOrder: chart.sortOrder,
      })
      notify('图表更新成功')
      onClose()
      await onRenamed()
    } catch (failure) {
      setRenameError(errorMessage(failure))
    } finally {
      setRenaming(false)
    }
  }

  const submitLine = async (): Promise<void> => {
    const chart = request?.kind === 'line' ? request.chart : null
    if (!chart || savingLine) return
    const line = chartLineOf(lineForm)
    if (!line.label) {
      setLineError('请输入曲线名称')
      return
    }
    const others = chart.lines.filter((_item, index) => index !== lineIndex)
    if (others.some((item) => item.label === line.label)) {
      setLineError(`已经有名为「${line.label}」的曲线`)
      return
    }
    const next =
      lineIndex === null
        ? [...chart.lines, line]
        : chart.lines.map((item, index) => (index === lineIndex ? line : item))
    setSavingLine(true)
    setLineError('')
    try {
      const updated = await updateChartLines(chart, next)
      notify(lineIndex === null ? '曲线已添加' : '曲线已保存')
      onChartUpdated(updated)
      onClose()
    } catch (failure) {
      setLineError(errorMessage(failure))
    } finally {
      setSavingLine(false)
    }
  }

  /** 换分组字段：按标签分组时，分类落到该类型的第一个。 */
  const changeGroupField = (field: string): void => {
    setCreateGroupField(field)
    if (field === 'tag' && !createGroupCategory) {
      setCreateGroupCategory(categoryNamesFor(categories, createGroupType)[0] ?? '')
    }
  }

  /** 换分组交易类型：分类挂在类型下，换类型就把分类落到新类型的第一个。 */
  const changeGroupType = (groupType: string): void => {
    setCreateGroupType(groupType)
    setCreateGroupCategory(categoryNamesFor(categories, groupType)[0] ?? '')
  }

  return (
    <>
      <CreateChartDialog
        open={request?.kind === 'create'}
        title={createTitle}
        type={createType}
        granularity={createGranularity}
        groupField={createGroupField}
        groupType={createGroupType}
        groupCategory={createGroupCategory}
        categories={categories}
        creating={creating}
        error={createError}
        onTitleChange={setCreateTitle}
        onTypeChange={setCreateType}
        onGranularityChange={setCreateGranularity}
        onGroupFieldChange={changeGroupField}
        onGroupTypeChange={changeGroupType}
        onGroupCategoryChange={setCreateGroupCategory}
        onCancel={onClose}
        onCreate={() => void createChart()}
      />

      <RenameChartDialog
        open={request?.kind === 'rename'}
        title={renameTitle}
        error={renameError}
        renaming={renaming}
        onTitleChange={setRenameTitle}
        onCancel={onClose}
        onRename={() => void renameChart()}
      />

      <Modal
        open={request?.kind === 'line'}
        title={lineIndex === null ? '添加曲线' : '编辑曲线'}
        width={560}
        centered
        destroyOnHidden
        footer={null}
        onCancel={onClose}
      >
        <ChartLineForm
          form={lineForm}
          lineIndex={lineIndex}
          error={lineError}
          saving={savingLine}
          categories={categories}
          tags={tags}
          onChange={setLineForm}
          onSubmit={() => void submitLine()}
          onCancel={onClose}
        />
      </Modal>
    </>
  )
}
