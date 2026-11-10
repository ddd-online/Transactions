import { useState, type JSX } from 'react'

import { Modal, Popconfirm } from 'antd'

import type { TodoHistoryDto, TodoProgressDto } from '../../shared/types/todo'
import { Button } from '../components/button'
import { EmptyState } from '../components/empty-state'
import { Icon } from '../components/icon'
import { TablePager } from '../components/pagination'
import { TodoSkeleton } from './todo-card-columns'
import { doneCountOf, formatMoment } from './todo-format'
import { TodoProgressEditor, useProgressEditFocus } from './todo-progress'

/** 历史表每页条数与可选项：分页行与资金变化记录同一条，条数按历史表的密度定。 */
const DEFAULT_PAGE_SIZE = 15
const PAGE_SIZE_OPTIONS = [15, 20, 30]

/**
 * 历史视图：已完成事项的表格，以及「进度记录」弹窗。
 *
 * 表格里「回到待办」与删除都回传页面；弹窗只显示打开的那一条（`null` 时关闭），
 * 弹窗里只做一件事 —— 订正进度正文（勾选 / 删除 / 新增仍旧只在待办视图里）。
 *
 * 分页是本视图自己的事：数据本来就整份取回来（完成事项的量级不需要再分一次 IPC），
 * 翻页只是切一份切片。切到待办视图再回来会回到第一页，和收起状态的寿命一致。
 */
export interface TodoHistoryViewProps {
  history: TodoHistoryDto[]
  loaded: boolean
  onOpenProgress: (item: TodoHistoryDto) => void
  onReopen: (id: string) => void
  onRemove: (id: string) => void
}

export function TodoHistoryView({
  history,
  loaded,
  onOpenProgress,
  onReopen,
  onRemove,
}: TodoHistoryViewProps): JSX.Element {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  if (!loaded) return <TodoSkeleton />
  if (history.length === 0) {
    return (
      <EmptyState
        testId="todo-history-empty"
        title="还没有已完成事项"
        description="完成的事项会在这里留档。"
      />
    )
  }

  // 删掉末页最后一条时总页数会变小：按总页数夹一下，别停在一张空表上
  const pageCount = Math.max(1, Math.ceil(history.length / pageSize))
  const pageNo = Math.min(page, pageCount)
  const rows = history.slice((pageNo - 1) * pageSize, pageNo * pageSize)

  return (
    <div className="todo-history">
      <table className="todo-table">
        <thead>
          <tr>
            <th className="is-center">完成时间</th>
            <th>主题</th>
            <th>事项</th>
            <th className="is-center">进度</th>
            <th className="is-center">操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.id} data-testid="todo-history-item">
              <td className="is-center todo-table__time">
                <span className="todo-table__done">
                  <span className="todo-table__done-icon">
                    <Icon name="Check" size={12} />
                  </span>
                  {formatMoment(item.completedAt)}
                </span>
              </td>
              <td className="todo-table__card" title={item.cardTitle}>
                {item.cardTitle}
              </td>
              <td className="todo-table__title">{item.title}</td>
              <td className="is-center todo-table__progress">
                {item.progress.length > 0 ? (
                  <Button
                    variant="text"
                    size="sm"
                    className="todo-history-progress-trigger"
                    testId="todo-history-progress"
                    aria-label={`查看「${item.title}」的进度记录`}
                    title="查看进度记录"
                    onClick={() => onOpenProgress(item)}
                  >
                    {`${doneCountOf(item.progress)}/${item.progress.length}`}
                  </Button>
                ) : (
                  '—'
                )}
              </td>
              <td className="is-center">
                <div className="todo-table__actions">
                  <Button
                    variant="text"
                    size="sm"
                    testId="todo-history-reopen"
                    onClick={() => onReopen(item.id)}
                  >
                    回到待办
                  </Button>
                  <Popconfirm
                    title={`删除事项「${item.title}」？`}
                    okText="删除"
                    cancelText="取消"
                    okType="danger"
                    onConfirm={() => onRemove(item.id)}
                  >
                    <span className="todo-history__delete">
                      <Button
                        variant="text-danger"
                        size="sm"
                        testId="todo-history-delete"
                        title="删除事项"
                      >
                        删除
                      </Button>
                    </span>
                  </Popconfirm>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <TablePager
        total={history.length}
        page={pageNo}
        pageSize={pageSize}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        onChange={(nextPage, nextSize) => {
          // 换每页条数就回第一页：停在原来的页码上只会看到空白或错位。
          if (nextSize !== pageSize) {
            setPageSize(nextSize)
            setPage(1)
            return
          }
          setPage(nextPage)
        }}
        testId="todo-history-foot"
        pagerTestId="todo-history"
      />
    </div>
  )
}

/** 把订正后的那一行换进历史弹层手里的拷贝（弹层不跟着整表刷新）。 */
export function withProgressRow(item: TodoHistoryDto, row: TodoProgressDto): TodoHistoryDto {
  return {
    ...item,
    progress: item.progress.map((entry) => (entry.id === row.id ? row : entry)),
  }
}

export interface TodoHistoryProgressModalProps {
  item: TodoHistoryDto | null
  /** 页面级错误：订正失败时也要在弹层里念出来，不能只报在它背后的页面上 */
  error: string
  /** 订正正文；失败时抛出，弹层留在编辑态、正文不丢（错误由页面统一报） */
  onEdit: (id: string, content: string) => Promise<void>
  onClose: () => void
}

export function TodoHistoryProgressModal({
  item,
  error,
  onEdit,
  onClose,
}: TodoHistoryProgressModalProps): JSX.Element {
  /** 正在订正的那一条（`null` = 全部是读态）；草稿只在编辑期间存在 */
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const { pencilRef, restoreFocus } = useProgressEditFocus()

  const startEdit = (entry: TodoProgressDto): void => {
    setEditingId(entry.id)
    setDraft(entry.content)
  }

  /** 收起编辑态；`restore` 为假时（关弹层）不把焦点送回正在消失的行 */
  const stopEdit = (restore = true): void => {
    if (restore && editingId !== null) restoreFocus(editingId)
    setEditingId(null)
    setDraft('')
  }

  /** Esc / ✕：保存已经发出去了就别再取消 —— 那一笔改不回来，收起编辑态只会骗人 */
  const cancelEdit = (): void => {
    if (saving) return
    stopEdit()
  }

  const saveEdit = async (): Promise<void> => {
    if (editingId === null || saving || draft.trim() === '') return
    setSaving(true)
    try {
      await onEdit(editingId, draft)
      stopEdit()
    } catch {
      // 失败留在编辑态：刚改的字还在框里，页面已经报了错
    } finally {
      setSaving(false)
    }
  }

  const close = (): void => {
    stopEdit(false)
    onClose()
  }

  return (
    <Modal
      open={item !== null}
      title="进度记录"
      width={520}
      centered
      destroyOnHidden
      footer={null}
      onCancel={close}
    >
      {item ? (
        <div className="todo-history-progress" data-testid="todo-history-progress-modal">
          <p className="todo-history-progress__meta">
            <span>{item.cardTitle}</span>
            <span aria-hidden="true">·</span>
            <span>{item.title}</span>
            <span aria-hidden="true">·</span>
            <span>完成于 {formatMoment(item.completedAt)}</span>
          </p>
          {error ? (
            <p
              role="alert"
              className="todo-history-progress__error"
              data-testid="todo-history-progress-error"
            >
              {error}
            </p>
          ) : null}
          {item.progress.length > 0 ? (
            <ul className="todo-history-progress__list">
              {item.progress.map((entry) => (
                <li
                  key={entry.id}
                  className={`todo-history-progress__row${entry.done ? ' is-done' : ''}`}
                  data-testid="todo-history-progress-row"
                >
                  <span className="todo-history-progress__check" aria-hidden="true">
                    {entry.done ? <Icon name="Check" size={10} /> : null}
                  </span>
                  {editingId === entry.id ? (
                    <TodoProgressEditor
                      testId="todo-history-progress"
                      value={draft}
                      saving={saving}
                      onChange={setDraft}
                      onSave={() => void saveEdit()}
                      onCancel={cancelEdit}
                    />
                  ) : (
                    <>
                      <span className="todo-history-progress__text">{entry.content}</span>
                      <span className="todo-history-progress__time">
                        {formatMoment(entry.createdAt, true)}
                      </span>
                      <button
                        type="button"
                        className="tr-icon-btn todo-progress-edit"
                        data-testid="todo-history-progress-edit"
                        aria-label="编辑这条进度"
                        title="编辑进度"
                        ref={pencilRef(entry.id)}
                        onClick={() => startEdit(entry)}
                      >
                        <Icon name="Edit" size={12} />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="todo-history-progress__empty">还没有进度记录</p>
          )}
        </div>
      ) : null}
    </Modal>
  )
}
