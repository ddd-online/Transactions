/**
 * 记录表单（composer）：新增 / 编辑一条记录的唯一入口。
 *
 * 页面只递一份 request（新建，或编辑哪一条）与回执，表单自己开、自己关、自己持有一份草稿；
 * 草稿映射、校验与"建一条 → 关联事件 → 删旧一条"的保存编排都在 `record-draft`（纯逻辑、
 * 可单测），这里只做渲染与命令调用。表单碰到的外部世界只有 `window.api` 与三个回执。
 */

import { useCallback, useMemo, useState, type JSX } from 'react'

import { AutoComplete, Input, Modal, Select } from 'antd'

import type { CategoryDto, TagDto } from '../../shared/types/category'
import type { TransactionTemplateDto } from '../../shared/types/template'
import { errorMessage } from '../../shared/errors'
import { Button } from '../components/button'
import { DatePicker } from '../components/date-picker'
import { Segmented } from '../components/segmented'
import { notify } from '../components/toast'
import {
  type ComposerRequest,
  type DraftErrorField,
  type RecordDraft,
  type RecordSavePorts,
  categoryOptions,
  draftAfterTemplate,
  draftOfRecord,
  draftWithCategoryOrType,
  initialDraft,
  saveDraft,
  tagOptionsForCategory,
  templateRequestOf,
} from './record-draft'

/** 表单里的类型顺序（与筛选里的「支出 / 收入 / 转账」不同，这是既有行为）。 */
const COMPOSER_TYPE_OPTIONS = [
  { value: 'income', label: '收入' },
  { value: 'expense', label: '支出' },
  { value: 'transfer', label: '转账' },
]


interface ComposerError {
  message: string
  /** 出错的是哪个字段（`''` = 动作级，挂不到具体输入框上） */
  field: DraftErrorField | ''
}

export interface RecordComposerProps {
  ledgerId: string
  /** `null` = 关着；换一份请求就打开一份对应的草稿 */
  request: ComposerRequest | null
  categories: readonly CategoryDto[]
  /** 标签按 `分类:交易类型` 归档，候选只在当前组合里挑 */
  tagRows: readonly TagDto[]
  templates: readonly TransactionTemplateDto[]
  /** 列表正在加载：加载期间禁用保存（既有行为） */
  listLoading: boolean
  /** 保存成功：页面负责关窗、回第一页、刷新列表 */
  onSaved: () => void
  /** 点了取消 / 关闭 */
  onRequestClose: () => void
  /** 「保存为模板」之后，页面刷新候选 */
  onTemplatesChanged: (rows: TransactionTemplateDto[]) => void
}

export function RecordComposer({
  ledgerId,
  request,
  categories,
  tagRows,
  templates,
  listLoading,
  onSaved,
  onRequestClose,
  onTemplatesChanged,
}: RecordComposerProps): JSX.Element {
  const [draft, setDraft] = useState<RecordDraft>(() => initialDraft(''))
  const [editingId, setEditingId] = useState<string | null>(null)
  const [templateId, setTemplateId] = useState('')
  const [error, setError] = useState<ComposerError | null>(null)
  const [saving, setSaving] = useState(false)
  const [seenRequest, setSeenRequest] = useState<ComposerRequest | null>(null)

  // 换一份请求 = 换一份草稿。在**渲染期**做（而不是 effect 里）：打开的第一帧就是新草稿，
  // 不会先闪一下上一次的内容。
  if (request !== seenRequest) {
    setSeenRequest(request)
    if (request) {
      setDraft(
        request.mode === 'edit' ? draftOfRecord(request.record) : initialDraft(request.defaultDate),
      )
      setEditingId(request.mode === 'edit' ? request.record.transactionId : null)
      setTemplateId('')
      setError(null)
    }
  }

  const patch = useCallback((next: Partial<RecordDraft>): void => {
    setDraft((current) => ({ ...current, ...next }))
  }, [])

  const changeCategoryOrType = useCallback(
    (next: Partial<Pick<RecordDraft, 'category' | 'type'>>): void => {
      setDraft((current) => draftWithCategoryOrType(current, next, tagRows))
    },
    [tagRows],
  )

  const applyTemplate = useCallback(
    (nextId: string): void => {
      setTemplateId(nextId)
      if (!nextId) return
      const template = templates.find((item) => item.templateId === nextId)
      if (!template) return
      setDraft((current) => draftAfterTemplate(current, template))
    },
    [templates],
  )

  const saveTemplate = useCallback(async (): Promise<void> => {
    setError(null)
    if (!ledgerId) {
      setError({ message: '请先选择账本', field: 'ledger' })
      return
    }
    try {
      const createdId = await window.api.invoke(
        'template_create',
        templateRequestOf(draft, ledgerId, templates.length),
      )
      const rows = await window.api.invoke('template_list', { ledger_id: ledgerId })
      onTemplatesChanged(rows)
      setTemplateId(createdId)
      notify('模板已保存')
    } catch (templateError) {
      setError({ message: errorMessage(templateError), field: '' })
    }
  }, [draft, ledgerId, onTemplatesChanged, templates.length])

  const save = useCallback(async (): Promise<void> => {
    if (saving) return
    setError(null)
    setSaving(true)
    // 表单只认三个命令：真实实现在这里包成 `window.api.invoke`，`record-draft` 不碰 IPC。
    const ports: RecordSavePorts = {
      create: (next) => window.api.invoke('tr_create', next),
      linkEvent: async (transactionId, date) => {
        await window.api.invoke('tr_link', { transaction_id: transactionId, date })
      },
      deleteRecord: async (id) => {
        await window.api.invoke('tr_delete', { id })
      },
    }
    try {
      const outcome = await saveDraft(ports, draft, ledgerId, editingId)
      if (outcome.status === 'failed') {
        setError({ message: outcome.message, field: outcome.field ?? '' })
        return
      }
      notify(editingId === null ? '已记一笔' : '记录已更新')
      onSaved()
    } finally {
      setSaving(false)
    }
  }, [draft, editingId, ledgerId, onSaved, saving])

  const categoryChoices = useMemo(
    () => categoryOptions(categories, draft.type),
    [categories, draft.type],
  )
  const tagChoices = useMemo(
    () => tagOptionsForCategory(tagRows, draft.category, draft.type),
    [draft.category, draft.type, tagRows],
  )

  const amountError = error?.field === 'amount' ? error.message : ''
  const categoryError = error?.field === 'category' ? error.message : ''
  const open = request !== null

  return (
    <Modal
      open={open}
      title={request?.mode === 'edit' ? '编辑记录' : '新增记录'}
      width={640}
      centered
      destroyOnHidden
      footer={null}
      onCancel={onRequestClose}
    >
      <div className="tr-modal-form">
        <div className="tr-modal-field">
          <span className="tr-modal-label">模板</span>
          <div className="tr-modal-template">
            <Select
              aria-label="模板"
              className="tr-modal-template-select"
              data-testid="tr-template-select"
              value={templateId || undefined}
              placeholder="选择模板"
              allowClear
              popupMatchSelectWidth={false}
              onChange={(value: string | undefined) => applyTemplate(value ?? '')}
              options={templates.map((template) => ({
                value: template.templateId,
                label: template.templateName,
              }))}
            />
            <Button
              variant="secondary"
              testId="tr-template-save"
              disabled={!ledgerId}
              onClick={() => void saveTemplate()}
            >
              保存为模板
            </Button>
          </div>
        </div>

        <div className="tr-modal-row">
          <div className="tr-modal-field">
            <span className="tr-modal-label">日期</span>
            <DatePicker
              testId="tr-date"
              value={draft.date}
              onChange={(date) => patch({ date })}
              ariaLabel="日期"
            />
          </div>

          <div className="tr-modal-field">
            <span className="tr-modal-label">类型</span>
            <Segmented
              ariaLabel="类型"
              testId="tr-new-type"
              block
              value={draft.type}
              onChange={(next: string) => changeCategoryOrType({ type: next })}
              options={COMPOSER_TYPE_OPTIONS}
            />
          </div>
        </div>

        <div className="tr-modal-row">
          <div className="tr-modal-field">
            <span className="tr-modal-label">分类</span>
            <AutoComplete
              value={draft.category}
              options={categoryChoices}
              filterOption
              onChange={(next: string) => changeCategoryOrType({ category: next })}
            >
              <Input
                aria-label="分类"
                aria-invalid={Boolean(categoryError)}
                aria-describedby={categoryError ? 'tr-composer-error' : undefined}
                data-testid="tr-category"
                placeholder="选择或输入分类"
              />
            </AutoComplete>
          </div>

          <div className="tr-modal-field">
            <span className="tr-modal-label">标签</span>
            <Select
              aria-label="标签"
              data-testid="tr-tags"
              mode="tags"
              allowClear
              virtual={false}
              placeholder="选择一个或多个标签"
              value={draft.tags}
              onChange={(value: string[]) => patch({ tags: value })}
              options={tagChoices}
              notFoundContent={
                draft.category.trim() ? '该分类下暂无标签' : '先填写分类，再选择标签'
              }
            />
          </div>
        </div>

        <div className="tr-modal-row">
          <div className="tr-modal-field">
            <span className="tr-modal-label">标记</span>
            <Select
              aria-label="标记"
              data-testid="tr-outlier"
              mode="multiple"
              allowClear
              placeholder="选择标记"
              value={draft.outlier ? ['outlier'] : []}
              onChange={(values: string[]) => patch({ outlier: values.includes('outlier') })}
              options={[{ value: 'outlier', label: '离群值' }]}
            />
          </div>

          <div className="tr-modal-field">
            <span className="tr-modal-label">关联事件日期</span>
            <DatePicker
              ariaLabel="关联事件日期"
              testId="tr-event-date"
              value={draft.eventDate}
              onChange={(date) => patch({ eventDate: date })}
              allowClear
            />
          </div>
        </div>

        <div className="tr-modal-field">
          <span className="tr-modal-label">描述</span>
          <Input
            aria-label="描述"
            data-testid="tr-description"
            placeholder="描述消费内容"
            value={draft.description}
            onChange={(event) => patch({ description: event.target.value })}
          />
        </div>

        <div className="tr-modal-field">
          <span className="tr-modal-label">金额</span>
          <Input
            aria-label="金额"
            aria-invalid={Boolean(amountError)}
            aria-describedby={amountError ? 'tr-composer-error' : undefined}
            data-testid="tr-amount"
            inputMode="decimal"
            placeholder="0.00"
            value={draft.amount}
            onChange={(event) => patch({ amount: event.target.value })}
          />
        </div>

        {error ? (
          <p role="alert" id="tr-composer-error" className="m0-error" data-testid="tr-error">
            {error.message}
          </p>
        ) : null}

        <div className="tr-modal-footer">
          <Button variant="secondary" testId="tr-cancel" onClick={onRequestClose}>
            取消
          </Button>
          <Button
            variant="primary"
            testId="tr-save"
            loading={saving}
            disabled={!ledgerId || saving || listLoading}
            onClick={() => void save()}
          >
            保存
          </Button>
        </div>
      </div>
    </Modal>
  )
}
