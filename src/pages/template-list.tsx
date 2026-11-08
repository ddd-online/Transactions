import { useState, type JSX } from 'react'
import { Popconfirm } from 'antd'

import type { TransactionTemplateDto } from '../../shared/types/template'
import { EmptyState } from '../components/empty-state'
import { Icon } from '../components/icon'
import { ScrollArea } from '../components/scroll-area'

function typeLabel(transactionType: string): string {
  if (transactionType === 'income') return '收入'
  if (transactionType === 'expense') return '支出'
  if (transactionType === 'transfer') return '转账'
  return transactionType
}

export interface TemplateListProps {
  templates: TransactionTemplateDto[]
  hasLedger: boolean
  onMove: (from: number, to: number) => void
  onDelete: (templateId: string) => void
}

/** 模板列表：表格行渲染、拖拽排序与删除入口。 */
export function TemplateList({
  templates,
  hasLedger,
  onMove,
  onDelete,
}: TemplateListProps): JSX.Element {
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  return (
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
            title={hasLedger ? '暂无模板' : '请先创建/选择账本'}
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
                if (dragFrom === null) return
                setDragFrom(null)
                setDragOver(null)
                onMove(dragFrom, index)
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
                  onConfirm={() => onDelete(template.templateId)}
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
  )
}
