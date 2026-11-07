import { useEffect, useMemo, useState, type JSX } from 'react'
import { Input, Modal, Select } from 'antd'

import { tagNamesForCategory } from '../../shared/domain/tag-names'
import type { ChartLine } from '../../shared/domain/models'
import { errorMessage } from '../../shared/errors'
import type { ChartDto } from '../../shared/types/chart'
import type { CategoryDto, TagDto } from '../../shared/types/category'
import { Button } from '../components/button'
import { Segmented } from '../components/segmented'
import { Switch } from '../components/switch'
import { notify } from '../components/toast'
import {
  CHART_TYPES,
  GRANULARITIES,
  GROUP_FIELDS,
  LINE_TYPES,
  TAG_POLICIES,
  categoryNamesFor,
  categoryOptionsFor,
} from './chart-options'
import { updateChartLines } from './chart-write'

/**
 * 图表编辑器：新增 / 重命名 / 曲线的增改，三张弹窗一个 module。
 *
 * 页面只递一份 request（要开哪一张、改哪一张、改第几条曲线），编辑器自己的草稿、
 * 校验、IPC 与失败文案都在里面；存下来之后按结果回三句话：建好了（给 id）、
 * 曲线换了（给新的那一份图表）、改名了（页面重拉）。
 */

interface LineForm {
  label: string
  transactionType: string
  category: string
  tags: string[]
  tagPolicy: string
  description: string
  includeOutlier: boolean
}

const EMPTY_LINE_FORM: LineForm = {
  label: '',
  transactionType: 'expense',
  category: '',
  tags: [],
  tagPolicy: 'any',
  description: '',
  includeOutlier: true,
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

  const categoryOptions = useMemo(
    () => categoryOptionsFor(categories, lineForm.transactionType),
    [categories, lineForm.transactionType],
  )
  const tagOptions = useMemo(
    () =>
      tagNamesForCategory(tags, lineForm.category, lineForm.transactionType).map((name) => ({
        value: name,
        label: name,
      })),
    [lineForm.category, lineForm.transactionType, tags],
  )

  /** 换交易类型：分类与标签都跟着失效（标签按 `分类:类型` 归档）。 */
  const changeLineType = (transactionType: string): void => {
    setLineForm((current) => ({ ...current, transactionType, category: '', tags: [] }))
  }

  const changeLineCategory = (category: string): void => {
    const valid = new Set(tagNamesForCategory(tags, category, lineForm.transactionType))
    setLineForm((current) => ({
      ...current,
      category,
      tags: current.tags.filter((tag) => valid.has(tag)),
    }))
  }

  return (
    <>
      <Modal
        open={request?.kind === 'create'}
        title="新增图表"
        width={400}
        centered
        destroyOnHidden
        footer={null}
        onCancel={onClose}
      >
        <div className="tr-modal-form">
          <div className="tr-modal-field">
            <span className="tr-modal-label">图表名称</span>
            <Input
              aria-label="图表名称"
              data-testid="chart-title"
              aria-invalid={Boolean(createError)}
              aria-describedby={createError ? 'chart-create-error' : undefined}
              value={createTitle}
              onChange={(event) => setCreateTitle(event.target.value)}
              onPressEnter={() => void createChart()}
            />
          </div>
          <div className="tr-modal-field">
            <span className="tr-modal-label">图表类型</span>
            <Segmented
              ariaLabel="图表类型"
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
                      setCreateGroupCategory(
                        categoryNamesFor(categories, createGroupType)[0] ?? '',
                      )
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
                      setCreateGroupCategory(categoryNamesFor(categories, value)[0] ?? '')
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
                    options={categoryOptionsFor(categories, createGroupType)}
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
            <p role="alert" id="chart-create-error" className="m0-error" data-testid="chart-create-error">
              {createError}
            </p>
          ) : null}
          <div className="tr-modal-footer">
            <Button variant="secondary" testId="chart-create-cancel" onClick={onClose}>
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
        open={request?.kind === 'rename'}
        title="重命名图表"
        width={400}
        centered
        destroyOnHidden
        footer={null}
        onCancel={onClose}
      >
        <div className="tr-modal-form">
          <div className="tr-modal-field">
            <span className="tr-modal-label">图表名称</span>
            <Input
              aria-label="图表名称"
              data-testid="chart-rename-input"
              aria-invalid={Boolean(renameError)}
              aria-describedby={renameError ? 'chart-rename-error' : undefined}
              value={renameTitle}
              onChange={(event) => setRenameTitle(event.target.value)}
              onPressEnter={() => void renameChart()}
            />
          </div>
          {renameError ? (
            <p
              role="alert"
              id="chart-rename-error"
              className="m0-error"
              data-testid="chart-rename-error"
            >
              {renameError}
            </p>
          ) : null}
          <div className="tr-modal-footer">
            <Button variant="secondary" testId="chart-rename-cancel" onClick={onClose}>
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
        open={request?.kind === 'line'}
        title={lineIndex === null ? '添加曲线' : '编辑曲线'}
        width={560}
        centered
        destroyOnHidden
        footer={null}
        onCancel={onClose}
      >
        <div className="tr-modal-form" data-testid="chart-line-dialog">
          <div className="tr-modal-field">
            <span className="tr-modal-label">曲线名称</span>
            <Input
              aria-label="曲线名称"
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
                aria-label="交易类型"
                data-testid="chart-line-type"
                value={lineForm.transactionType}
                options={LINE_TYPES}
                onChange={(value: string) => changeLineType(value)}
              />
            </div>
            <div className="tr-modal-field">
              <span className="tr-modal-label">分类</span>
              <Select
                aria-label="分类"
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
                aria-label="标签"
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
                aria-label="标签匹配"
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
              aria-label="描述包含"
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
            <Button variant="secondary" testId="chart-line-cancel" onClick={onClose}>
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
    </>
  )
}
