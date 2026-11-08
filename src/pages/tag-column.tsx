import { useState, type JSX } from 'react'

import type { TagDto } from '../../shared/types/category'
import { Button } from '../components/button'
import { Icon } from '../components/icon'
import { ScrollArea } from '../components/scroll-area'

export interface TagColumnProps {
  tags: TagDto[]
  /** 当前选中的分类名：标题显示它，空串时标题回落「标签」 */
  selectedCategory: string
  hasLedger: boolean
  onAdd: () => void
  onDelete: (name: string) => void
  onMove: (from: number, to: number) => void
}

/** 右栏：某分类下的标签列表（按 `分类:类型` 归档）、新增 / 删除入口与拖拽排序回传。 */
export function TagColumn({
  tags,
  selectedCategory,
  hasLedger,
  onAdd,
  onDelete,
  onMove,
}: TagColumnProps): JSX.Element {
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  return (
    <section className="ct-column ct-column--tags">
      <div className="ct-column-header">
        <span className="ct-column-title">{selectedCategory || '标签'}</span>
        <span className="ct-column-count">{tags.length}</span>
        <Button
          variant="secondary"
          size="sm"
          className="ct-add-btn"
          testId="tag-open-create"
          disabled={!hasLedger || !selectedCategory}
          icon={
            <span className="ct-add-btn-icon">
              <Icon name="Plus" size={14} />
            </span>
          }
          onClick={onAdd}
        >
          新增标签
        </Button>
      </div>
      <div className="ct-column-body-wrap">
        {!selectedCategory ? (
          <div className="ct-column-empty">
            <span>选择分类查看标签</span>
          </div>
        ) : tags.length === 0 ? (
          <div className="ct-column-empty">
            <span>暂无标签</span>
          </div>
        ) : (
          <ScrollArea className="ct-column-body">
            {tags.map((tag, index) => (
              <div
                key={tag.name}
                className={`ct-drag-item ui-drag-item${dragFrom === index ? ' is-dragging' : ''}${dragOver === index ? ' is-over' : ''}`}
                data-testid="tag-item"
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
                <div className="ct-list-item">
                  <span className="ui-drag-handle" title="拖动排序">
                    <Icon name="DragHandle" size={16} />
                  </span>
                  <div className="ct-item-main">
                    <span className="ct-item-name">{tag.name}</span>
                    {tag.recordCount !== 0 ? (
                      <span className="ct-item-badge">{tag.recordCount}</span>
                    ) : null}
                  </div>
                  <div className="ct-item-actions">
                    <button
                      type="button"
                      className="tr-icon-btn is-danger"
                      data-testid="tag-delete"
                      aria-label={`删除标签 ${tag.name}`}
                      onClick={() => onDelete(tag.name)}
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
