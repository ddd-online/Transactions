import { useEffect, useState, type JSX } from 'react'

import { Input, Modal, Select } from 'antd'

import { TODO_LEVELS, TODO_LEVEL_LABELS } from '../../shared/domain/consts'
import { errorMessage } from '../../shared/errors'
import type { TodoItemDto } from '../../shared/types/todo'
import { Button } from '../components/button'
import { DatePicker } from '../components/date-picker'

const LEVEL_OPTIONS = TODO_LEVELS.map((value, index) => ({
  value,
  label: TODO_LEVEL_LABELS[index],
}))

/** 打开事项表单的请求：往哪个主题加，或编辑哪一条。 */
export interface TodoItemEditorRequest {
  cardId: string
  item?: TodoItemDto
}

/** 表单校验通过后的提交载荷（页面据此组装 IPC 请求）。 */
export interface TodoItemDraft {
  cardId: string
  /** 编辑时是事项 id；新建时为空串 */
  id: string
  title: string
  startDate: string
  dueDate: string
  urgency: number
  importance: number
}

/**
 * 新建 / 编辑事项的同一张表单：标题、开始与截止日期、紧急度、重要度。
 *
 * 与记录表单（`record-composer`）同一种形状：草稿、校验与错误提示都归表单自己，
 * 打开时从 `request` 重铺；保存把字段回传页面，真正落库（`window.api`）与刷新仍在页面。
 * 失败由页面抛出、表单接住显示。
 */
export interface TodoItemEditorProps {
  /** 非 null 即打开；每次换新对象都重铺草稿 */
  request: TodoItemEditorRequest | null
  busy: boolean
  saveDisabled: boolean
  onSubmit: (draft: TodoItemDraft) => Promise<void>
  onCancel: () => void
}

export function TodoItemEditor({
  request,
  busy,
  saveDisabled,
  onSubmit,
  onCancel,
}: TodoItemEditorProps): JSX.Element {
  const [title, setTitle] = useState('')
  const [start, setStart] = useState('')
  const [due, setDue] = useState('')
  const [urgency, setUrgency] = useState<number>(TODO_LEVELS[2])
  const [importance, setImportance] = useState<number>(TODO_LEVELS[2])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!request) return
    setTitle(request.item?.title ?? '')
    setStart(request.item?.startDate ?? '')
    setDue(request.item?.dueDate ?? '')
    setUrgency(request.item?.urgency ?? TODO_LEVELS[2])
    setImportance(request.item?.importance ?? TODO_LEVELS[2])
    setError('')
  }, [request])

  const change = (apply: () => void): void => {
    apply()
    setError('')
  }

  const submit = async (): Promise<void> => {
    if (!request) return
    const trimmed = title.trim()
    if (!trimmed) {
      setError('请输入事项')
      return
    }
    if (start !== '' && due !== '' && start > due) {
      setError('截止日期不能早于开始日期')
      return
    }
    setError('')
    try {
      await onSubmit({
        cardId: request.cardId,
        id: request.item?.id ?? '',
        title: trimmed,
        startDate: start,
        dueDate: due,
        urgency,
        importance,
      })
    } catch (submitError) {
      setError(errorMessage(submitError))
    }
  }

  return (
    <Modal
      open={request !== null}
      title={request?.item ? '编辑事项' : '添加事项'}
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
            onChange={(event) => change(() => setTitle(event.target.value))}
            onPressEnter={() => void submit()}
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
              onChange={(value) => change(() => setStart(value))}
            />
          </div>
          <div className="tr-modal-field">
            <span className="tr-modal-label">截止时间</span>
            <DatePicker
              testId="todo-item-due"
              ariaLabel="截止时间"
              allowClear
              value={due}
              onChange={(value) => change(() => setDue(value))}
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
              onChange={(value) => change(() => setUrgency(value))}
            />
          </div>
          <div className="tr-modal-field">
            <span className="tr-modal-label">重要度</span>
            <Select
              data-testid="todo-item-importance"
              aria-label="重要度"
              value={importance}
              options={LEVEL_OPTIONS}
              onChange={(value) => change(() => setImportance(value))}
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
            onClick={() => void submit()}
          >
            保存
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export interface TodoCardCreateModalProps {
  open: boolean
  busy: boolean
  createDisabled: boolean
  onSubmit: (title: string) => Promise<void>
  onCancel: () => void
}

/** 新建主题：一个标题字段；草稿与错误都归这张表单，落库与刷新在页面。 */
export function TodoCardCreateModal({
  open,
  busy,
  createDisabled,
  onSubmit,
  onCancel,
}: TodoCardCreateModalProps): JSX.Element {
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setTitle('')
    setError('')
  }, [open])

  const submit = async (): Promise<void> => {
    const trimmed = title.trim()
    if (!trimmed) {
      setError('请输入主题名称')
      return
    }
    setError('')
    try {
      await onSubmit(trimmed)
    } catch (submitError) {
      setError(errorMessage(submitError))
    }
  }

  return (
    <Modal
      open={open}
      title="新建主题"
      width={520}
      centered
      destroyOnHidden
      footer={null}
      onCancel={onCancel}
    >
      <div className="todo-modal">
        <Input
          data-testid="todo-card-title"
          autoFocus
          maxLength={200}
          status={error ? 'error' : undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'todo-card-error' : undefined}
          placeholder="例如：本周工作"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value)
            setError('')
          }}
          onPressEnter={() => void submit()}
        />
        {error ? (
          <p
            role="alert"
            id="todo-card-error"
            className="todo-modal__error"
            data-testid="todo-card-error"
          >
            {error}
          </p>
        ) : null}
        <div className="todo-modal__actions">
          <Button variant="secondary" onClick={onCancel}>
            取消
          </Button>
          <Button
            variant="primary"
            testId="todo-card-create"
            loading={busy}
            disabled={createDisabled}
            onClick={() => void submit()}
          >
            创建
          </Button>
        </div>
      </div>
    </Modal>
  )
}
