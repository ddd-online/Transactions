import { useCallback, useEffect, useState, type JSX } from 'react'
import { Table } from 'antd'
import type { HTMLAttributes } from 'react'

import { Button } from '../components/button'
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
          <Button variant="text" testId="template-refresh" onClick={() => void load()}>
            刷新
          </Button>
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
        <Table
          className="tr-table"
          rowKey="templateId"
          pagination={false}
          size="middle"
          dataSource={templates}
          onRow={() => ({ 'data-testid': 'template-row' }) as HTMLAttributes<HTMLElement>}
          columns={[
            { title: '名称', dataIndex: 'templateName' },
            { title: '类型', dataIndex: 'transactionType', width: 90 },
            { title: '分类', dataIndex: 'category', width: 120 },
            { title: '标签', dataIndex: 'tags', render: (value: string[]) => value.join('、') },
            { title: '备注', dataIndex: 'description', ellipsis: true },
            {
              title: '',
              width: 72,
              align: 'right',
              render: (_, row) => (
                <Button
                  variant="text-danger"
                  size="sm"
                  testId="template-delete"
                  onClick={() => void remove(row.templateId)}
                >
                  删除
                </Button>
              ),
            },
          ]}
        />
      )}
    </PageLayout>
  )
}


