import type { JSX } from 'react'

import { Input, Modal, Select } from 'antd'

import { TODO_LEVELS, TODO_LEVEL_LABELS } from '../../shared/domain/consts'
import { Button } from '../components/button'
import { DatePicker } from '../components/date-picker'

const LEVEL_OPTIONS = TODO_LEVELS.map((value, index) => ({
  value,
  label: TODO_LEVEL_LABELS[index],
}))

/**
 * 新建 / 编辑事项的同一张表单：标题、开始与截止日期、紧急度、重要度。
 *
 * 表单值、校验与提交都在页面（页面持有状态、调 `window.api`）；这里只画字段并把输入与
 * 「保存 / 取消」回传。`editing` 只决定标题文案，不影响字段。
 */
export interface TodoItemEditorProps {
  open: boolean
  editing: boolean
  title: string
  start: string
  due: string
  urgency: number
  importance: number
  error: string
  busy: boolean
  /** 没有账本时禁用保存 */
  saveDisabled: boolean
  onTitleChange: (value: string) => void
  onStartChange: (value: string) => void
  onDueChange: (value: string) => void
  onUrgencyChange: (value: number) => void
  onImportanceChange: (value: number) => void
  onCancel: () => void
  onSubmit: () => void
}

export function TodoItemEditor({
  open,
  editing,
  title,
  start,
  due,
  urgency,
  importance,
  error,
  busy,
  saveDisabled,
  onTitleChange,
  onStartChange,
  onDueChange,
  onUrgencyChange,
  onImportanceChange,
  onCancel,
  onSubmit,
}: TodoItemEditorProps): JSX.Element {
  return (
    <Modal
      open={open}
      title={editing ? '编辑事项' : '添加事项'}
      width={520}
      centered
      destroyOnHidden
      footer={null}
      onCancel={onCancel}
    >
      <div className="tr-modal-form todo-item-form">
        <div className="tr-modal-field">
          <span className="tr-modal-label">事项</span>
          <Input
            aria-label="事项"
            autoFocus
            data-testid="todo-item-title"
            maxLength={500}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'todo-item-error' : undefined}
            placeholder="例如：写周报"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            onPressEnter={onSubmit}
          />
        </div>
        <div className="tr-modal-row">
          <div className="tr-modal-field">
            <span className="tr-modal-label">开始时间</span>
            <DatePicker
              testId="todo-item-start"
              ariaLabel="开始时间"
              allowClear
              value={start}
              onChange={onStartChange}
            />
          </div>
          <div className="tr-modal-field">
            <span className="tr-modal-label">截止时间</span>
            <DatePicker
              testId="todo-item-due"
              ariaLabel="截止时间"
              allowClear
              value={due}
              onChange={onDueChange}
            />
          </div>
        </div>
        <div className="tr-modal-row">
          <div className="tr-modal-field">
            <span className="tr-modal-label">紧急度</span>
            <Select
              data-testid="todo-item-urgency"
              aria-label="紧急度"
              value={urgency}
              options={LEVEL_OPTIONS}
              onChange={onUrgencyChange}
            />
          </div>
          <div className="tr-modal-field">
            <span className="tr-modal-label">重要度</span>
            <Select
              data-testid="todo-item-importance"
              aria-label="重要度"
              value={importance}
              options={LEVEL_OPTIONS}
              onChange={onImportanceChange}
            />
          </div>
        </div>
        {error ? (
          <p
            role="alert"
            id="todo-item-error"
            className="todo-modal__error"
            data-testid="todo-item-error"
          >
            {error}
          </p>
        ) : null}
        <div className="todo-modal__actions">
          <Button variant="secondary" testId="todo-item-cancel" onClick={onCancel}>
            取消
          </Button>
          <Button
            variant="primary"
            testId="todo-item-create"
            loading={busy}
            disabled={saveDisabled}
            onClick={onSubmit}
          >
            保存
          </Button>
        </div>
      </div>
    </Modal>
  )
}
