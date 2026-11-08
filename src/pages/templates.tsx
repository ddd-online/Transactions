import { useCallback, useEffect, useState, type JSX } from 'react'

import { reorderWithChanges } from '../../shared/domain/list-order'
import type { TransactionTemplateDto } from '../../shared/types/template'
import { Button } from '../components/button'
import { Icon } from '../components/icon'
import { PageLayout } from '../components/page-layout'
import { notify } from '../components/toast'
import { TemplateForm } from './template-form'
import { TemplateList } from './template-list'

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'msg' in error) {
    return String((error as { msg: unknown }).msg)
  }
  if (error instanceof Error) return error.message
  return String(error)
}

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
          <p role="alert" className="m0-error" data-testid="template-page-error">
            {error}
          </p>
        ) : null}

        <TemplateList
          templates={templates}
          hasLedger={Boolean(ledgerId)}
          onMove={(from, to) => void move(from, to)}
          onDelete={(templateId) => void remove(templateId)}
        />
      </div>

      <TemplateForm
        open={createOpen}
        name={formName}
        type={formType}
        category={formCategory}
        tags={formTags}
        description={formDescription}
        outlier={formOutlier}
        error={formError}
        saving={saving}
        categories={categories}
        tagNames={tagNames}
        hasLedger={Boolean(ledgerId)}
        onNameChange={setFormName}
        onTypeChange={changeType}
        onCategoryChange={changeCategory}
        onTagsChange={setFormTags}
        onDescriptionChange={setFormDescription}
        onOutlierChange={setFormOutlier}
        onClose={closeCreate}
        onSubmit={() => void submit()}
      />
    </PageLayout>
  )
}
