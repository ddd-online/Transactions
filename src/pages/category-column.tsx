import { useState, type JSX } from 'react'

import type { CategoryDto } from '../../shared/types/category'
import { Button } from '../components/button'
import { Icon } from '../components/icon'
import { ScrollArea } from '../components/scroll-area'

export interface CategoryColumnProps {
  categories: CategoryDto[]
  /** 当前选中的分类名；空串表示没选 */
  selectedName: string
  hasLedger: boolean
  onSelect: (name: string) => void
  onAdd: () => void
  onDelete: (name: string) => void
  onMove: (from: number, to: number) => void
}

/** 左栏：分类列表、选中、新增 / 删除入口与拖拽排序回传。 */
export function CategoryColumn({
  categories,
  selectedName,
  hasLedger,
  onSelect,
  onAdd,
  onDelete,
  onMove,
}: CategoryColumnProps): JSX.Element {
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  return (
    <section className="ct-column ct-column--categories">
      <div className="ct-column-header">
        <span className="ct-column-title">分类</span>
        <span className="ct-column-count">{categories.length}</span>
        <Button
          variant="primary"
          size="sm"
          className="ct-add-btn"
          testId="category-open-create"
          disabled={!hasLedger}
          icon={
            <span className="ct-add-btn-icon">
              <Icon name="Plus" size={14} />
            </span>
          }
          onClick={onAdd}
        >
          新增分类
        </Button>
      </div>
      <div className="ct-column-body-wrap">
        {!hasLedger ? (
          <div className="ct-column-empty">
            <span>请先选择工作空间</span>
          </div>
        ) : categories.length === 0 ? (
          <div className="ct-column-empty">
            <span>暂无分类</span>
          </div>
        ) : (
          <ScrollArea className="ct-column-body">
            {categories.map((category, index) => (
              <div
                key={category.name}
                className={`ct-drag-item ui-drag-item${dragFrom === index ? ' is-dragging' : ''}${dragOver === index ? ' is-over' : ''}`}
                data-testid="category-item"
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
                <div
                  className={`ct-list-item${selectedName === category.name ? ' is-active' : ''}`}
                  onClick={() => onSelect(category.name)}
                >
                  <span className="ui-drag-handle" title="拖动排序">
                    <Icon name="DragHandle" size={16} />
                  </span>
                  <div className="ct-item-main">
                    <span className="ct-item-name">{category.name}</span>
                    {category.recordCount !== 0 ? (
                      <span className="ct-item-badge">{category.recordCount}</span>
                    ) : null}
                  </div>
                  <div className="ct-item-actions">
                    <button
                      type="button"
                      className="tr-icon-btn is-danger"
                      data-testid="category-delete"
                      aria-label={`删除分类 ${category.name}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        onDelete(category.name)
                      }}
                    >
                      <Icon name="Trash" size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </ScrollArea>
        )}
      </div>
    </section>
  )
}
