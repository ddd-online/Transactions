import { useCallback, useEffect, useState, type JSX } from 'react'
import { Checkbox, Input, Modal, Popconfirm, Select } from 'antd'

import { reorderWithChanges } from '../../shared/domain/list-order'
import type { TransactionTemplateDto } from '../../shared/types/template'
import { Button } from '../components/button'
import { EmptyState } from '../components/empty-state'
import { Icon } from '../components/icon'
import { PageLayout } from '../components/page-layout'
import { ScrollArea } from '../components/scroll-area'
import { Segmented } from '../components/segmented'
import { notify } from '../components/toast'

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

const TYPE_OPTIONS = [
  { value: 'expense', label: '支出' },
  { value: 'income', label: '收入' },
  { value: 'transfer', label: '转账' },
]

const NAME_MAX_LENGTH = 20
const DESCRIPTION_MAX_LENGTH = 50

export interface TemplatePageProps {
  ledgerId: string
}

/** 记账 · 模板：列表 + 新建 + 删除 + 拖拽排序。 */
export function TemplatePage({ ledgerId }: TemplatePageProps): JSX.Element {
  const [templates, setTemplates] = useState<TransactionTemplateDto[]>([])
  const [error, setError] = useState('')

  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState('expense')
  const [formCategory, setFormCategory] = useState('')
  const [formTags, setFormTags] = useState<string[]>([])
  const [formDescription, setFormDescription] = useState('')
  const [formOutlier, setFormOutlier] = useState(false)
  const [formError, setFormError] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const [tagNames, setTagNames] = useState<string[]>([])

  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  const load = useCallback(async (): Promise<void> => {
    if (!ledgerId) {
      setTemplates([])
      return
    }
    try {
      setTemplates(await window.api.invoke('template_list', { ledger_id: ledgerId }))
      setError('')
    } catch (loadError) {
      setError(errorMessage(loadError))
    }
  }, [ledgerId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!createOpen || !ledgerId) return
    let alive = true
    void (async () => {
      try {
        const rows = await window.api.invoke('category_list', { ledgerId, type: formType })
        if (!alive) return
        setCategories(rows.map((row) => row.name))
        setFormCategory((current) =>
          current && rows.some((row) => row.name === current) ? current : '',
        )
      } catch (loadError) {
        if (alive) {
          setCategories([])
          setError(errorMessage(loadError))
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [createOpen, formType, ledgerId])

  useEffect(() => {
    if (!createOpen || !ledgerId || !formCategory) {
      setTagNames([])
      return
    }
    let alive = true
    void (async () => {
      try {
        const rows = await window.api.invoke('tag_list', {
          ledgerId,
          categoryTransactionType: `${formCategory}:${formType}`,
        })
        if (alive) setTagNames(rows.map((row) => row.name))
      } catch (loadError) {
        if (alive) {
          setTagNames([])
          setError(errorMessage(loadError))
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [createOpen, formCategory, formType, ledgerId])

  const resetForm = useCallback((): void => {
    setFormName('')
    setFormType('expense')
    setFormCategory('')
    setFormTags([])
    setFormDescription('')
    setFormOutlier(false)
    setFormError('')
    setCategories([])
    setTagNames([])
  }, [])

  const openCreate = useCallback((): void => {
    resetForm()
    setCreateOpen(true)
  }, [resetForm])

  const closeCreate = useCallback((): void => {
    setCreateOpen(false)
    resetForm()
  }, [resetForm])

  const changeType = useCallback((next: string): void => {
    setFormType(next)
    setFormCategory('')
    setFormTags([])
    setTagNames([])
    setCategories([])
    setFormError('')
  }, [])

  const changeCategory = useCallback((next: string | undefined): void => {
    setFormCategory(next ?? '')
    setFormTags([])
    setFormError('')
  }, [])

  const submit = useCallback(async (): Promise<void> => {
    if (saving) return
    if (!ledgerId) {
      setFormError('请先选择工作空间')
      return
    }
    const name = formName.trim()
    if (!name) {
      setFormError('模板名称不能为空')
      return
    }
    if (!formCategory) {
      setFormError('分类不能为空')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      await window.api.invoke('template_create', {
        template_id: '',
        ledger_id: ledgerId,
        template_name: name,
        transaction_type: formType,
        category: formCategory,
        tags: formTags,
        flags: formOutlier ? 'outlier' : '',
        description: formDescription.trim(),
        sort_order: 0,
      })
      notify('保存模板成功')
      closeCreate()
      await load()
    } catch (createError) {
      setFormError(errorMessage(createError))
    } finally {
      setSaving(false)
    }
  }, [
    closeCreate,
    formCategory,
    formDescription,
    formName,
    formOutlier,
    formTags,
    formType,
    ledgerId,
    load,
    saving,
  ])

  const remove = useCallback(
    async (templateId: string): Promise<void> => {
      setError('')
      try {
        await window.api.invoke('template_delete', { id: templateId })
        notify('删除模板成功')
        await load()
      } catch (deleteError) {
        setError(errorMessage(deleteError))
      }
    },
    [load],
  )

  const move = useCallback(
    async (from: number, to: number): Promise<void> => {
      setDragFrom(null)
      setDragOver(null)
      const result = reorderWithChanges(
        templates,
        from,
        to,
        (template) => template.templateId,
        (template) => template.sortOrder,
      )
      if (!result) return
      const [next, changed] = result
      setTemplates(next.map((template, index) => ({ ...template, sortOrder: index })))
      try {
        await Promise.all(
          changed.map(([index, id]) =>
            window.api.invoke('template_update_sort', {
              id,
              ledger_id: ledgerId,
              sortOrder: index,
            }),
          ),
        )
      } catch (sortError) {
        setError(errorMessage(sortError))
        await load()
      }
    },
    [ledgerId, load, templates],
  )

  return (
    <PageLayout
      toolbar={
        <div className="toolbar-end">
          <Button
            variant="primary"
            testId="template-open-create"
            disabled={!ledgerId}
            icon={<Icon name="Plus" size={14} />}
            onClick={openCreate}
          >
            新建模板
          </Button>
        </div>
      }
      contentClassName="tpl-page-content"
    >
      <div className="page-pane tpl-pane">
        {error ? (
          <p className="m0-error" data-testid="template-page-error">
            {error}
          </p>
        ) : null}

        <ScrollArea className="tpl-table">
          <div className="tpl-thead">
            <div className="tpl-th tpl-th--drag" />
            <div className="tpl-th">模板名称</div>
            <div className="tpl-th tpl-th--center">交易类型</div>
            <div className="tpl-th">分类</div>
            <div className="tpl-th">标签</div>
            <div className="tpl-th">标记</div>
            <div className="tpl-th">描述</div>
            <div className="tpl-th tpl-th--center">操作</div>
          </div>

          <div className="tpl-tbody">
            {templates.length === 0 ? (
              <EmptyState
                testId="template-page-empty"
                title={ledgerId ? '暂无模板' : '请先创建/选择账本'}
              />
            ) : (
              templates.map((template, index) => (
                <div
                  key={template.templateId}
                  className={`tpl-tr ui-drag-item${dragFrom === index ? ' is-dragging' : ''}${dragOver === index ? ' is-over' : ''}`}
                  data-testid="template-row"
                  draggable
                  onDragStart={() => setDragFrom(index)}
                  onDragOver={(event) => {
                    event.preventDefault()
                    setDragOver(index)
                  }}
                  onDrop={() => {
                    if (dragFrom !== null) void move(dragFrom, index)
                  }}
                  onDragEnd={() => {
                    setDragFrom(null)
                    setDragOver(null)
                  }}
                >
                  <div className="tpl-td tpl-td--drag">
                    <span className="ui-drag-handle" title="拖动排序">
                      <Icon name="DragHandle" size={16} />
                    </span>
                  </div>

                  <div className="tpl-td">
                    <span className="tpl-cell-ellipsis" title={template.templateName}>
                      {template.templateName}
                    </span>
                  </div>

                  <div className="tpl-td tpl-td--center">
                    <span className={`ui-tag ui-tag--${template.transactionType}`}>
                      {typeLabel(template.transactionType)}
                    </span>
                  </div>

                  <div className="tpl-td">{template.category || '-'}</div>

                  <div className="tpl-td tpl-td--tags">
                    {template.tags.length === 0 ? (
                      <span className="tpl-dash">-</span>
                    ) : (
                      template.tags.map((tag) => (
                        <span key={tag} className="ui-tag">
                          {tag}
                        </span>
                      ))
                    )}
                  </div>

                  <div className="tpl-td">
                    {template.flags ? (
                      <span className="ui-tag ui-tag--outlier">离群值</span>
                    ) : (
                      <span className="tpl-dash">-</span>
                    )}
                  </div>

                  <div className="tpl-td">
                    <span className="tpl-cell-ellipsis" title={template.description}>
                      {template.description || '-'}
                    </span>
                  </div>

                  <div className="tpl-td tpl-td--center">
                    <Popconfirm
                      title={`删除模板「${template.templateName}」？`}
                      okText="删除"
                      cancelText="取消"
                      okType="danger"
                      placement="topRight"
                      onConfirm={() => void remove(template.templateId)}
                    >
                      <button
                        type="button"
                        className="tr-icon-btn is-danger-static"
                        data-testid="template-delete"
                        aria-label={`删除模板 ${template.templateName}`}
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
      </div>

      <Modal
        open={createOpen}
        title="新建模板"
        width={520}
        centered
        destroyOnHidden
        footer={null}
        onCancel={closeCreate}
      >
        <div className="tr-modal-form">
          <div className="tr-modal-field">
            <span className="tr-modal-label">模板名称</span>
            <Input
              data-testid="template-name"
              placeholder="请输入模板名称"
              maxLength={NAME_MAX_LENGTH}
              value={formName}
              onChange={(event) => setFormName(event.target.value)}
            />
          </div>

          <div className="tr-modal-field">
            <span className="tr-modal-label">交易类型</span>
            <Segmented
              testId="template-type"
              value={formType}
              onChange={changeType}
              options={TYPE_OPTIONS}
            />
          </div>

          <div className="tr-modal-field">
            <span className="tr-modal-label">分类</span>
            <Select
              data-testid="template-category"
              value={formCategory || undefined}
              placeholder="选择消费分类"
              allowClear
              showSearch
              optionFilterProp="label"
              popupMatchSelectWidth={false}
              onChange={changeCategory}
              options={categories.map((name) => ({ value: name, label: name }))}
            />
          </div>

          <div className="tr-modal-field">
            <span className="tr-modal-label">标签</span>
            {tagNames.length === 0 ? (
              <span className="page-hint">该分类下暂无标签</span>
            ) : (
              <Checkbox.Group
                value={formTags}
                options={tagNames.map((name) => ({ value: name, label: name }))}
                onChange={(values) => setFormTags(values.map(String))}
              />
            )}
          </div>

          <div className="tr-modal-field">
            <span className="tr-modal-label">描述</span>
            <Input
              data-testid="template-description"
              placeholder="请输入描述"
              maxLength={DESCRIPTION_MAX_LENGTH}
              value={formDescription}
              onChange={(event) => setFormDescription(event.target.value)}
            />
          </div>

          <div className="tr-modal-field">
            <span className="tr-modal-label">标记</span>
            <Checkbox
              data-testid="template-outlier"
              checked={formOutlier}
              onChange={(event) => setFormOutlier(event.target.checked)}
            >
              离群值
            </Checkbox>
          </div>

          {formError ? (
            <p className="m0-error" data-testid="template-modal-error">
              {formError}
            </p>
          ) : null}

          <div className="tr-modal-footer">
            <Button variant="secondary" testId="template-cancel" onClick={closeCreate}>
              取消
            </Button>
            <Button
              variant="primary"
              testId="template-create"
              loading={saving}
              disabled={saving || !ledgerId}
              onClick={() => void submit()}
            >
              保存
            </Button>
          </div>
        </div>
      </Modal>
    </PageLayout>
  )
}
