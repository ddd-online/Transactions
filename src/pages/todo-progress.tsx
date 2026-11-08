import type { JSX } from 'react'

import { Input, Popconfirm } from 'antd'

import type { TodoProgressDto } from '../../shared/types/todo'
import { Button } from '../components/button'
import { Icon } from '../components/icon'
import { formatMoment } from './todo-format'

/**
 * 事项展开后的进度面板：进度条目列表 + 一条新进度的输入行。
 *
 * 只负责画与把动作回传（勾选 / 删除 / 新增）；读写库与「输入框草稿」都在页面。
 */
export interface TodoProgressPanelProps {
  progress: TodoProgressDto[]
  /** 这一条事项还没提交的进度草稿（页面按事项分别保存） */
  text: string
  onTextChange: (value: string) => void
  onAdd: () => void
  onToggleDone: (id: string, done: boolean) => void
  onRemove: (id: string) => void
}

export function TodoProgressPanel({
  progress,
  text,
  onTextChange,
  onAdd,
  onToggleDone,
  onRemove,
}: TodoProgressPanelProps): JSX.Element {
  return (
    <div className="todo-progress">
      {progress.length > 0 ? (
        <ul className="todo-progress__list">
          {progress.map((entry) => (
            <li
              key={entry.id}
              className={`todo-progress__row${entry.done ? ' is-done' : ''}`}
            >
              <button
                type="button"
                className="todo-progress__check"
                data-testid="todo-progress-done"
                aria-label={entry.done ? '取消完成这条进度' : '完成这条进度'}
                aria-pressed={entry.done}
                onClick={() => onToggleDone(entry.id, !entry.done)}
              >
                <Icon name="Check" size={10} />
              </button>
              <span className="todo-progress__text">{entry.content}</span>
              <span className="todo-progress__time">{formatMoment(entry.createdAt, true)}</span>
              <Popconfirm
                title="删除这条进度？"
                okText="删除"
                cancelText="取消"
                okType="danger"
                onConfirm={() => onRemove(entry.id)}
              >
                <button
                  type="button"
                  className="tr-icon-btn is-danger-static todo-progress__delete"
                  data-testid="todo-progress-delete"
                  aria-label="删除进度"
                  title="删除进度"
                >
                  <Icon name="Trash" size={12} />
                </button>
              </Popconfirm>
            </li>
          ))}
        </ul>
      ) : (
        <p className="todo-progress__empty">还没有进度记录</p>
      )}

      <div className="todo-progress__add">
        <Input
          size="small"
          data-testid="todo-progress-input"
          placeholder="记一条进度…"
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          onPressEnter={onAdd}
        />
        <Button variant="secondary" size="sm" testId="todo-progress-add" onClick={onAdd}>
          记录
        </Button>
      </div>
    </div>
  )
}
