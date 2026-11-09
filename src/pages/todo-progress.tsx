import { useState, type JSX } from 'react'

import { Input, Popconfirm } from 'antd'

import { TODO_PROGRESS_MAX } from '../../shared/domain/consts'
import type { TodoProgressDto } from '../../shared/types/todo'
import { Button } from '../components/button'
import { Icon } from '../components/icon'
import { formatMoment } from './todo-format'

/**
 * 一条进度就地订正时的输入行：Enter 保存、Esc 取消，另配两枚图标键（保存 / 取消）。
 *
 * 卡片视图与历史弹层共用它（行的外壳、勾选框各画各的），输入框与图标键因此只有一份样式。
 */
export interface TodoProgressEditorProps {
  /** 输入框与两颗图标键的 testid 前缀（卡片视图 / 历史弹层各一套） */
  testId: string
  value: string
  saving: boolean
  onChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
}

export function TodoProgressEditor({
  testId,
  value,
  saving,
  onChange,
  onSave,
  onCancel,
}: TodoProgressEditorProps): JSX.Element {
  return (
    <span className="todo-progress-editor">
      <Input
        size="small"
        autoFocus
        maxLength={TODO_PROGRESS_MAX}
        className="todo-progress-editor__input"
        aria-label="编辑进度"
        data-testid={`${testId}-editor`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onPressEnter={onSave}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          // Esc 先归这次编辑：不让它继续冒泡到历史弹层，变成「关掉整个弹层」
          event.preventDefault()
          event.stopPropagation()
          onCancel()
        }}
      />
      <button
        type="button"
        className="tr-icon-btn todo-progress-editor__save"
        data-testid={`${testId}-save`}
        aria-label="保存进度"
        title="保存"
        disabled={saving || value.trim() === ''}
        onClick={onSave}
      >
        <Icon name="Check" size={12} />
      </button>
      <button
        type="button"
        className="tr-icon-btn todo-progress-editor__cancel"
        data-testid={`${testId}-cancel`}
        aria-label="取消编辑"
        title="取消"
        onClick={onCancel}
      >
        <Icon name="Close" size={12} />
      </button>
    </span>
  )
}

/**
 * 事项展开后的进度面板：进度条目列表 + 一条新进度的输入行。
 *
 * 只负责画与把动作回传（勾选 / 订正 / 删除 / 新增）；读写库与「输入框草稿」都在页面。
 * 「正在订正哪一条」是这块自己的临时状态，不进页面。
 */
export interface TodoProgressPanelProps {
  progress: TodoProgressDto[]
  /** 这一条事项还没提交的进度草稿（页面按事项分别保存） */
  text: string
  onTextChange: (value: string) => void
  onAdd: () => void
  onToggleDone: (id: string, done: boolean) => void
  /** 订正正文；失败时抛出，面板留在编辑态、正文不丢（错误由页面统一报） */
  onEdit: (id: string, content: string) => Promise<void>
  onRemove: (id: string) => void
}

export function TodoProgressPanel({
  progress,
  text,
  onTextChange,
  onAdd,
  onToggleDone,
  onEdit,
  onRemove,
}: TodoProgressPanelProps): JSX.Element {
  /** 正在订正的那一条（`null` = 全部是读态）；草稿只在编辑期间存在 */
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const startEdit = (entry: TodoProgressDto): void => {
    setEditingId(entry.id)
    setDraft(entry.content)
  }

  const cancelEdit = (): void => {
    setEditingId(null)
    setDraft('')
  }

  const saveEdit = async (): Promise<void> => {
    if (editingId === null || saving || draft.trim() === '') return
    setSaving(true)
    try {
      await onEdit(editingId, draft)
      cancelEdit()
    } catch {
      // 失败留在编辑态：刚改的字还在框里，页面已经报了错
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="todo-progress">
      {progress.length > 0 ? (
        <ul className="todo-progress__list">
          {progress.map((entry) => {
            const editing = editingId === entry.id
            return (
              <li
                key={entry.id}
                className={`todo-progress__row${entry.done ? ' is-done' : ''}`}
                data-testid="todo-progress-row"
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
                {editing ? (
                  <TodoProgressEditor
                    testId="todo-progress"
                    value={draft}
                    saving={saving}
                    onChange={setDraft}
                    onSave={() => void saveEdit()}
                    onCancel={cancelEdit}
                  />
                ) : (
                  <>
                    <span className="todo-progress__text">{entry.content}</span>
                    <span className="todo-progress__time">
                      {formatMoment(entry.createdAt, true)}
                    </span>
                    <button
                      type="button"
                      className="tr-icon-btn todo-progress-edit"
                      data-testid="todo-progress-edit"
                      aria-label="编辑这条进度"
                      title="编辑进度"
                      onClick={() => startEdit(entry)}
                    >
                      <Icon name="Edit" size={12} />
                    </button>
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
                  </>
                )}
              </li>
            )
          })}
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
