import type { JSX } from 'react'

import { Modal, Popconfirm } from 'antd'

import type { TodoHistoryDto } from '../../shared/types/todo'
import { Button } from '../components/button'
import { EmptyState } from '../components/empty-state'
import { Icon } from '../components/icon'
import { TodoSkeleton } from './todo-card-columns'
import { doneCountOf, formatMoment } from './todo-format'

/**
 * 历史视图：已完成事项的表格，以及只读的「进度记录」弹窗。
 *
 * 表格里「回到待办」与删除都回传页面；弹窗只显示打开的那一条（`null` 时关闭）。
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
          {history.map((item) => (
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
    </div>
  )
}

export interface TodoHistoryProgressModalProps {
  item: TodoHistoryDto | null
  onClose: () => void
}

export function TodoHistoryProgressModal({
  item,
  onClose,
}: TodoHistoryProgressModalProps): JSX.Element {
  return (
    <Modal
      open={item !== null}
      title="进度记录"
      width={520}
      centered
      destroyOnHidden
      footer={null}
      onCancel={onClose}
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
                  <span className="todo-history-progress__text">{entry.content}</span>
                  <span className="todo-history-progress__time">
                    {formatMoment(entry.createdAt, true)}
                  </span>
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
