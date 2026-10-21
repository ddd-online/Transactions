import { useCallback, useEffect, useState, type JSX } from 'react'
import { PageLayout } from '../components/page-layout'

import type { TransactionTemplateDto } from '../../shared/types/template'

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

/** 记账 · 模板：列出本账本模板，可在记录页保存新模板。 */
export function TemplatePage({ ledgerId }: TemplatePageProps): JSX.Element {
  const [templates, setTemplates] = useState<TransactionTemplateDto[]>([])
  const [error, setError] = useState('')

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

  const remove = useCallback(
    async (id: string): Promise<void> => {
      setError('')
      try {
        await window.api.invoke('template_delete', { id })
        await load()
      } catch (deleteError) {
        setError(errorMessage(deleteError))
      }
    },
    [load],
  )

  return (
    <PageLayout>
      <div className="m0-card-head">
        <h2>记账 · 模板</h2>
        <div className="m0-actions m0-period">
          <span className="m0-muted">{templates.length} 个模板</span>
          <button type="button" className="m0-link" data-testid="template-refresh" onClick={() => void load()}>
            刷新
          </button>
        </div>
      </div>
      <p className="m0-muted">在「记录」页填好一笔后点「存为模板」，这里管理已有模板。</p>
      {error ? (
        <p className="m0-error" data-testid="template-page-error">
          {error}
        </p>
      ) : null}
      {templates.length === 0 ? (
        <p className="m0-muted" data-testid="template-page-empty">
          {ledgerId ? '还没有模板' : '请先创建/选择账本'}
        </p>
      ) : (
        <table className="m0-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>类型</th>
              <th>分类</th>
              <th>标签</th>
              <th>备注</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {templates.map((template) => (
              <tr key={template.templateId} data-testid="template-row">
                <td>{template.templateName}</td>
                <td>{template.transactionType}</td>
                <td>{template.category}</td>
                <td>{template.tags.join('、')}</td>
                <td>{template.description}</td>
                <td className="m0-right">
                  <button
                    type="button"
                    className="m0-link"
                    data-testid="template-delete"
                    onClick={() => void remove(template.templateId)}
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </PageLayout>
  )
}


