import { useCallback, useEffect, useState, type JSX } from 'react'

import type {
  TodoCardDto,
  TodoHistoryDto,
  TodoItemDto,
  TodoProgressDto,
} from '../../shared/types/todo'
import { Input, Modal, Popconfirm } from 'antd'

import { Button } from '../components/button'
import { EmptyState } from '../components/empty-state'
import { Icon } from '../components/icon'
import { PageLayout } from '../components/page-layout'
import { ScrollArea } from '../components/scroll-area'

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'msg' in error) {
    return String((error as { msg: unknown }).msg)
  }
  if (error instanceof Error) return error.message
  return String(error)
}

const LEVEL_LABELS: Record<number, string> = {
  [-5]: '低',
  [-3]: '中低',
  [-1]: '次低',
  1: '次高',
  3: '中高',
  5: '高',
}

/** 完成时间（历史）/ 进度时间（`short`）—— 都用本地时区、等宽数字排版。 */
function formatMoment(seconds: number, short = false): string {
  if (!seconds) return ''
  const date = new Date(seconds * 1000)
  const pad = (value: number): string => String(value).padStart(2, '0')
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  const day = `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return short ? `${day} ${time}` : `${date.getFullYear()}-${day} ${time}`
}

function doneCountOf(progress: TodoProgressDto[]): number {
  return progress.filter((entry) => entry.done).length
}

export interface TodoPageProps {
  ledgerId: string
}

export function TodoPage({ ledgerId }: TodoPageProps): JSX.Element {
  const [cards, setCards] = useState<TodoCardDto[]>([])
  const [dragCardId, setDragCardId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [todoMode, setTodoMode] = useState<'cards' | 'history'>('cards')
  const [history, setHistory] = useState<TodoHistoryDto[]>([])
  const [historyProgress, setHistoryProgress] = useState<TodoHistoryDto | null>(null)
  const [cardOpen, setCardOpen] = useState(false)
  const [cardDraft, setCardDraft] = useState('')
  const [cardError, setCardError] = useState('')
  const [itemTitles, setItemTitles] = useState<Record<string, string>>({})
  const [progressText, setProgressText] = useState<Record<string, string>>({})
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({})
  const [composerCardId, setComposerCardId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    if (!ledgerId) {
      setCards([])
      setHistory([])
      setLoaded(true)
      return
    }
    try {
      const [cardRows, historyRows] = await Promise.all([
        window.api.invoke('todo_cards', { ledger_id: ledgerId }),
        window.api.invoke('todo_history', { ledger_id: ledgerId }),
      ])
      setCards(cardRows)
      setHistory(historyRows)
    } catch (loadError) {
      setError(errorMessage(loadError))
    } finally {
      setLoaded(true)
    }
  }, [ledgerId])

  useEffect(() => {
    setLoaded(false)
    void load()
  }, [load])

  const openCardModal = useCallback((): void => {
    setCardDraft('')
    setCardError('')
    setCardOpen(true)
  }, [])

  const closeCardModal = useCallback((): void => {
    setCardOpen(false)
    setCardDraft('')
    setCardError('')
  }, [])

  const createCard = useCallback(async (): Promise<void> => {
    const title = cardDraft.trim()
    if (!title) {
      setCardError('请输入主题名称')
      return
    }
    setBusy(true)
    setCardError('')
    setError('')
    try {
      await window.api.invoke('todo_card_create', { ledger_id: ledgerId, title })
      setCardOpen(false)
      setCardDraft('')
      await load()
    } catch (createError) {
      setCardError(errorMessage(createError))
    } finally {
      setBusy(false)
    }
  }, [cardDraft, ledgerId, load])

  const createItem = useCallback(
    async (cardId: string): Promise<void> => {
      const title = (itemTitles[cardId] ?? '').trim()
      if (!title) return
      setBusy(true)
      setError('')
      try {
        await window.api.invoke('todo_item_create', {
          ledger_id: ledgerId,
          card_id: cardId,
          title,
          start_date: '',
          due_date: '',
          urgency: -1,
          importance: -1,
        })
        setItemTitles((current) => ({ ...current, [cardId]: '' }))
        setComposerCardId(null)
        await load()
      } catch (createError) {
        setError(errorMessage(createError))
      } finally {
        setBusy(false)
      }
    },
    [itemTitles, ledgerId, load],
  )

  const setStatus = useCallback(
    async (id: string, status: string): Promise<void> => {
      setError('')
      try {
        await window.api.invoke('todo_item_status', { ledger_id: ledgerId, id, status })
        await load()
      } catch (statusError) {
        setError(errorMessage(statusError))
      }
    },
    [ledgerId, load],
  )

  const removeItem = useCallback(
    async (id: string): Promise<void> => {
      setError('')
      try {
        await window.api.invoke('todo_item_delete', { id })
        await load()
      } catch (deleteError) {
        setError(errorMessage(deleteError))
      }
    },
    [load],
  )

  const removeCard = useCallback(
    async (id: string): Promise<void> => {
      setError('')
      try {
        await window.api.invoke('todo_card_delete', { id })
        await load()
      } catch (deleteError) {
        setError(errorMessage(deleteError))
      }
    },
    [load],
  )

  const moveCard = useCallback(
    async (sourceId: string, targetId: string): Promise<void> => {
      if (sourceId === targetId) return
      const from = cards.findIndex((card) => card.id === sourceId)
      const to = cards.findIndex((card) => card.id === targetId)
      if (from < 0 || to < 0) return
      const next = [...cards]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      setCards(next)
      setError('')
      try {
        await Promise.all(
          next.map((card, index) =>
            window.api.invoke('todo_card_sort', { id: card.id, sort_order: index + 1 }),
          ),
        )
        await load()
      } catch (sortError) {
        setError(errorMessage(sortError))
      }
    },
    [cards, load],
  )

  const removeProgress = useCallback(
    async (id: string): Promise<void> => {
      setError('')
      try {
        await window.api.invoke('todo_progress_delete', { id })
        await load()
      } catch (deleteError) {
        setError(errorMessage(deleteError))
      }
    },
    [load],
  )

  const addProgress = useCallback(
    async (itemId: string): Promise<void> => {
      const content = (progressText[itemId] ?? '').trim()
      if (!content) return
      setError('')
      try {
        await window.api.invoke('todo_progress_add', {
          ledger_id: ledgerId,
          item_id: itemId,
          content,
        })
        setProgressText((current) => ({ ...current, [itemId]: '' }))
        await load()
      } catch (progressError) {
        setError(errorMessage(progressError))
      }
    },
    [ledgerId, load, progressText],
  )

  const toggleProgress = useCallback(
    async (id: string, done: boolean): Promise<void> => {
      setError('')
      try {
        await window.api.invoke('todo_progress_done', { id, done })
        await load()
      } catch (progressError) {
        setError(errorMessage(progressError))
      }
    },
    [load],
  )

  const toggleItem = useCallback((id: string): void => {
    setExpandedItems((current) => ({ ...current, [id]: !current[id] }))
  }, [])

  const activeCount = cards.reduce((total, card) => total + card.items.length, 0)

  /** 首次取数期间画两段骨架，避免先闪一下「还没有待办主题」再出现真实内容。 */
  const renderSkeleton = (): JSX.Element => (
    <div className="todo-skeleton" aria-hidden="true">
      {[0, 1].map((group) => (
        <div className="todo-skeleton__group" key={group}>
          <div className="todo-skeleton__band" />
          <div className="todo-skeleton__row" />
          <div className="todo-skeleton__row" />
        </div>
      ))}
    </div>
  )

  const renderLevels = (item: TodoItemDto): JSX.Element | null => {
    if (item.urgency === -1 && item.importance === -1) return null
    return (
      <span className="todo-item__levels">
        <span className="todo-level">紧急 {LEVEL_LABELS[item.urgency] ?? item.urgency}</span>
        <span className="todo-level">重要 {LEVEL_LABELS[item.importance] ?? item.importance}</span>
      </span>
    )
  }

  const renderItem = (item: TodoItemDto): JSX.Element => {
    const open = Boolean(expandedItems[item.id])
    const doneCount = doneCountOf(item.progress)
    return (
      <li key={item.id} className={`todo-item${open ? ' is-open' : ''}`} data-testid="todo-item">
        <div className="todo-item__row">
          <button
            type="button"
            className="todo-item__check"
            data-testid="todo-item-done"
            aria-label={`标记完成：${item.title}`}
            title="标记完成"
            onClick={() => void setStatus(item.id, 'done')}
          >
            <Icon name="Check" size={12} />
          </button>

          <button
            type="button"
            className="todo-item__main"
            aria-expanded={open}
            onClick={() => toggleItem(item.id)}
          >
            <span className="todo-item__title">{item.title}</span>
            <span className="todo-item__meta">
              {item.progress.length > 0 ? (
                <span className="todo-item__progress">
                  进度 {doneCount}/{item.progress.length}
                </span>
              ) : null}
              {renderLevels(item)}
              {item.dueDate ? <span className="todo-item__due">截止 {item.dueDate}</span> : null}
            </span>
          </button>

          <button
            type="button"
            className={`todo-item__toggle${open ? ' is-open' : ''}`}
            data-testid="todo-item-toggle"
            aria-label={open ? '收起进度' : '展开进度'}
            aria-expanded={open}
            title={open ? '收起进度' : '展开进度'}
            onClick={() => toggleItem(item.id)}
          >
            <Icon name="ChevronRight" size={14} />
          </button>

          <Popconfirm
            title={`删除事项「${item.title}」？`}
            description="它的进度记录会一并删除。"
            okText="删除"
            cancelText="取消"
            okType="danger"
            onConfirm={() => void removeItem(item.id)}
          >
            <button
              type="button"
              className="tr-icon-btn is-danger-static todo-item__delete"
              data-testid="todo-item-delete"
              aria-label={`删除事项 ${item.title}`}
              title="删除事项"
            >
              <Icon name="Trash" size={14} />
            </button>
          </Popconfirm>
        </div>

        {open ? (
          <div className="todo-progress">
            {item.progress.length > 0 ? (
              <ul className="todo-progress__list">
                {item.progress.map((progress) => (
                  <li
                    key={progress.id}
                    className={`todo-progress__row${progress.done ? ' is-done' : ''}`}
                  >
                    <button
                      type="button"
                      className="todo-progress__check"
                      data-testid="todo-progress-done"
                      aria-label={progress.done ? '取消完成这条进度' : '完成这条进度'}
                      aria-pressed={progress.done}
                      onClick={() => void toggleProgress(progress.id, !progress.done)}
                    >
                      <Icon name="Check" size={10} />
                    </button>
                    <span className="todo-progress__text">{progress.content}</span>
                    <span className="todo-progress__time">{formatMoment(progress.createdAt, true)}</span>
                    <Popconfirm
                      title="删除这条进度？"
                      okText="删除"
                      cancelText="取消"
                      okType="danger"
                      onConfirm={() => void removeProgress(progress.id)}
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
                value={progressText[item.id] ?? ''}
                onChange={(event) =>
                  setProgressText((current) => ({ ...current, [item.id]: event.target.value }))
                }
                onPressEnter={() => void addProgress(item.id)}
              />
              <Button variant="secondary" size="sm" testId="todo-progress-add" onClick={() => void addProgress(item.id)}>
                记录
              </Button>
            </div>
          </div>
        ) : null}
      </li>
    )
  }

  return (
    <PageLayout
      contentClassName="todo-page"
      rail={
        <div className="page-rail-nav">
          <button
            type="button"
            className={`page-rail-btn${todoMode === 'cards' ? ' is-active' : ''}`}
            data-testid="todo-tab-cards"
            title="待办"
            aria-label="待办"
            onClick={() => setTodoMode('cards')}
          >
            <span className="page-rail-btn-icon">
              <Icon name="FileText" size={18} />
            </span>
          </button>
          <button
            type="button"
            className={`page-rail-btn${todoMode === 'history' ? ' is-active' : ''}`}
            data-testid="todo-tab-history"
            title="历史"
            aria-label="历史"
            onClick={() => setTodoMode('history')}
          >
            <span className="page-rail-btn-icon">
              <Icon name="History" size={18} />
            </span>
          </button>
        </div>
      }
      toolbar={
        todoMode === 'cards' ? (
          <div className="todo-toolbar">
            <div className="todo-toolbar-actions">
              <Button
                variant="primary"
                testId="todo-card-open"
                icon={<Icon name="Plus" size={14} />}
                disabled={!ledgerId || busy}
                onClick={openCardModal}
              >
                新建主题
              </Button>
            </div>
          </div>
        ) : undefined
      }
      footer={
        todoMode === 'cards' && cards.length > 0 ? (
          <div className="todo-footer">
            <span className="todo-summary" data-testid="todo-summary">
              {cards.length} 个主题 · {activeCount} 项待办
            </span>
          </div>
        ) : undefined
      }
    >
      {error ? (
        <p className="m0-error todo-error" data-testid="todo-error">
          {error}
        </p>
      ) : null}

      <div className="todo-body">
        <ScrollArea className="todo-scroll" axis="both" notifyResize>
          {todoMode === 'cards' ? (
            !loaded ? (
              renderSkeleton()
            ) : cards.length === 0 ? (
              <EmptyState
                testId="todo-empty"
                title={ledgerId ? '还没有待办主题' : '请先创建/选择账本'}
                description={ledgerId ? '先建一个主题，把要做的事一条条放进去。' : undefined}
              />
            ) : (
              <div className="todo-board">
                {cards.map((card) => (
                  <section
                    key={card.id}
                    className={`todo-group${dragCardId === card.id ? ' is-dragging' : ''}${
                      dragOverId === card.id ? ' is-over' : ''
                    }`}
                    data-testid="todo-card"
                    onDragOver={(event) => {
                      event.preventDefault()
                      if (dragCardId && dragCardId !== card.id) setDragOverId(card.id)
                    }}
                    onDragLeave={() =>
                      setDragOverId((current) => (current === card.id ? null : current))
                    }
                    onDrop={() => {
                      if (dragCardId) void moveCard(dragCardId, card.id)
                      setDragCardId(null)
                      setDragOverId(null)
                    }}
                  >
                    <header className="todo-group__head">
                      <span
                        className="todo-group__handle"
                        title="拖动排序"
                        draggable
                        onDragStart={() => setDragCardId(card.id)}
                        onDragEnd={() => {
                          setDragCardId(null)
                          setDragOverId(null)
                        }}
                      >
                        <Icon name="DragHandle" size={16} />
                      </span>
                      <h3 className="todo-group__title" title={card.title}>
                        {card.title}
                      </h3>
                      <span className="todo-group__count">{card.items.length} 项</span>
                      <div className="todo-group__actions">
                        {composerCardId === card.id ? (
                          <div className="todo-group__composer">
                            <Input
                              autoFocus
                              size="small"
                              data-testid="todo-item-title"
                              placeholder="添加事项"
                              title="回车添加，Esc 取消"
                              maxLength={200}
                              value={itemTitles[card.id] ?? ''}
                              onChange={(event) =>
                                setItemTitles((current) => ({
                                  ...current,
                                  [card.id]: event.target.value,
                                }))
                              }
                              onPressEnter={() => void createItem(card.id)}
                              onBlur={(event) => {
                                const next = event.relatedTarget
                                const actions =
                                  event.currentTarget.closest('.todo-group__actions')
                                if (next instanceof Node && actions?.contains(next)) return
                                if (!(itemTitles[card.id] ?? '').trim()) {
                                  setComposerCardId(null)
                                }
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Escape') {
                                  setComposerCardId(null)
                                  setItemTitles((current) => ({ ...current, [card.id]: '' }))
                                }
                              }}
                            />
                            <Button
                              variant="secondary"
                              size="sm"
                              testId="todo-item-create"
                              disabled={busy}
                              onClick={() => void createItem(card.id)}
                            >
                              添加
                            </Button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="tr-icon-btn todo-group__add"
                            data-testid="todo-item-add"
                            aria-label={`添加事项：${card.title}`}
                            title="添加事项"
                            onClick={() => setComposerCardId(card.id)}
                          >
                            <Icon name="Plus" size={14} />
                          </button>
                        )}
                        <Popconfirm
                          title={`删除主题「${card.title}」？`}
                          description="主题下的事项与进度会一并删除。"
                          okText="删除"
                          cancelText="取消"
                          okType="danger"
                          onConfirm={() => void removeCard(card.id)}
                        >
                          <button
                            type="button"
                            className="tr-icon-btn is-danger-static todo-group__delete"
                            data-testid="todo-card-delete"
                            aria-label={`删除主题 ${card.title}`}
                            title="删除主题"
                          >
                            <Icon name="Trash" size={14} />
                          </button>
                        </Popconfirm>
                      </div>
                    </header>

                    {card.items.length === 0 ? (
                      <p className="todo-group__empty">还没有事项</p>
                    ) : (
                      <ul className="todo-items">{card.items.map((item) => renderItem(item))}</ul>
                    )}
                  </section>
                ))}
              </div>
            )
          ) : !loaded ? (
            renderSkeleton()
          ) : history.length === 0 ? (
            <EmptyState
              testId="todo-history-empty"
              title="还没有已完成事项"
              description="完成的事项会在这里留档。"
            />
          ) : (
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
                      <td className="is-center todo-table__time">{formatMoment(item.completedAt)}</td>
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
                            onClick={() => setHistoryProgress(item)}
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
                            onClick={() => void setStatus(item.id, 'doing')}
                          >
                            回到待办
                          </Button>
                          <Popconfirm
                            title={`删除事项「${item.title}」？`}
                            okText="删除"
                            cancelText="取消"
                            okType="danger"
                            onConfirm={() => void removeItem(item.id)}
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
          )}
        </ScrollArea>
      </div>

      <Modal
        open={cardOpen}
        title="新建主题"
        width={520}
        centered
        destroyOnHidden
        footer={null}
        onCancel={closeCardModal}
      >
        <div className="todo-modal">
          <Input
            data-testid="todo-card-title"
            autoFocus
            maxLength={200}
            status={cardError ? 'error' : undefined}
            placeholder="例如：本周工作"
            value={cardDraft}
            onChange={(event) => {
              setCardDraft(event.target.value)
              setCardError('')
            }}
            onPressEnter={() => void createCard()}
          />
          {cardError ? (
            <p className="todo-modal__error" data-testid="todo-card-error">
              {cardError}
            </p>
          ) : null}
          <div className="todo-modal__actions">
            <Button variant="secondary" onClick={closeCardModal}>
              取消
            </Button>
            <Button
              variant="primary"
              testId="todo-card-create"
              loading={busy}
              disabled={!ledgerId}
              onClick={() => void createCard()}
            >
              创建
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={historyProgress !== null}
        title="进度记录"
        width={520}
        centered
        destroyOnHidden
        footer={null}
        onCancel={() => setHistoryProgress(null)}
      >
        {historyProgress ? (
          <div className="todo-history-progress" data-testid="todo-history-progress-modal">
            <p className="todo-history-progress__meta">
              <span>{historyProgress.cardTitle}</span>
              <span aria-hidden="true">·</span>
              <span>{historyProgress.title}</span>
              <span aria-hidden="true">·</span>
              <span>完成于 {formatMoment(historyProgress.completedAt)}</span>
            </p>
            {historyProgress.progress.length > 0 ? (
              <ul className="todo-history-progress__list">
                {historyProgress.progress.map((progress) => (
                  <li
                    key={progress.id}
                    className={`todo-history-progress__row${progress.done ? ' is-done' : ''}`}
                    data-testid="todo-history-progress-row"
                  >
                    <span className="todo-history-progress__check" aria-hidden="true">
                      {progress.done ? <Icon name="Check" size={10} /> : null}
                    </span>
                    <span className="todo-history-progress__text">{progress.content}</span>
                    <span className="todo-history-progress__time">
                      {formatMoment(progress.createdAt, true)}
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
    </PageLayout>
  )
}
