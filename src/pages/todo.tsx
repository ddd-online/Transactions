import { useCallback, useEffect, useState, type JSX } from 'react'

import type { TodoCardDto, TodoHistoryDto } from '../../shared/types/todo'
import { EmptyState } from '../components/empty-state'
import { Progress } from '../components/progress'

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

export interface TodoPageProps {
  ledgerId: string
}

export function TodoPage({ ledgerId }: TodoPageProps): JSX.Element {
  const [cards, setCards] = useState<TodoCardDto[]>([])
  const [dragCardId, setDragCardId] = useState<string | null>(null)
  const [history, setHistory] = useState<TodoHistoryDto[]>([])
  const [cardTitle, setCardTitle] = useState('')
  const [itemTitles, setItemTitles] = useState<Record<string, string>>({})
  const [progressText, setProgressText] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    if (!ledgerId) {
      setCards([])
      setHistory([])
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
    }
  }, [ledgerId])

  useEffect(() => {
    void load()
  }, [load])

  const createCard = useCallback(async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      await window.api.invoke('todo_card_create', { ledger_id: ledgerId, title: cardTitle })
      setCardTitle('')
      await load()
    } catch (createError) {
      setError(errorMessage(createError))
    } finally {
      setBusy(false)
    }
  }, [cardTitle, ledgerId, load])

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

  return (
    <section className="m0-card m0-card--wide">
      <div className="m0-card-head">
        <h2>待办</h2>
        <div className="m0-actions m0-period">
          <input
            className="m0-input"
            data-testid="todo-card-title"
            placeholder="新主题"
            value={cardTitle}
            onChange={(event) => setCardTitle(event.target.value)}
          />
          <button
            type="button"
            className="m0-primary"
            data-testid="todo-card-create"
            disabled={!ledgerId || busy}
            onClick={() => void createCard()}
          >
            新建主题
          </button>
        </div>
      </div>

      {error ? (
        <p className="m0-error" data-testid="todo-error">
          {error}
        </p>
      ) : null}

      {cards.length === 0 ? (
        <EmptyState
          testId="todo-empty"
          title={ledgerId ? '还没有待办主题' : '请先创建/选择账本'}
        />
      ) : (
        <div className="m0-todo-cards">
          {cards.map((card) => (
            <div
              key={card.id}
              className="m0-todo-card"
              data-testid="todo-card"
              draggable
              onDragStart={() => setDragCardId(card.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (dragCardId) void moveCard(dragCardId, card.id)
                setDragCardId(null)
              }}
            >
              <div className="m0-card-head">
                <span className="ui-drag-handle" title="拖动排序">
                  ⠿
                </span>
                <h3>{card.title}</h3>
                <button
                  type="button"
                  className="m0-link"
                  data-testid="todo-card-delete"
                  onClick={() => void removeCard(card.id)}
                >
                  删除主题
                </button>
              </div>
              <div className="m0-actions">
                <input
                  className="m0-input"
                  data-testid="todo-item-title"
                  placeholder="新事项"
                  value={itemTitles[card.id] ?? ''}
                  onChange={(event) =>
                    setItemTitles((current) => ({ ...current, [card.id]: event.target.value }))
                  }
                />
                <button
                  type="button"
                  className="m0-link"
                  data-testid="todo-item-create"
                  disabled={busy}
                  onClick={() => void createItem(card.id)}
                >
                  添加事项
                </button>
              </div>

              {card.items.length === 0 ? (
                <p className="m0-muted">没有进行中的事项</p>
              ) : (
                <ul className="m0-todo-items">
                  {card.items.map((item) => (
                    <li key={item.id} data-testid="todo-item">
                      <div className="m0-card-head">
                        <span>{item.title}</span>
                        <span className="m0-muted">
                          {LEVEL_LABELS[item.urgency] ?? item.urgency}/
                          {LEVEL_LABELS[item.importance] ?? item.importance}
                        </span>
                      </div>
                      <Progress
                        done={item.progress.filter((progress) => progress.done).length}
                        total={item.progress.length}
                      />
                      <div className="m0-actions">
                        <button
                          type="button"
                          className="m0-link"
                          data-testid="todo-item-done"
                          onClick={() => void setStatus(item.id, 'done')}
                        >
                          完成
                        </button>
                        <button
                          type="button"
                          className="m0-link"
                          data-testid="todo-item-delete"
                          onClick={() => void removeItem(item.id)}
                        >
                          删除
                        </button>
                      </div>
                      {item.progress.length > 0 ? (
                        <ul className="m0-todo-progress">
                          {item.progress.map((progress) => (
                            <li key={progress.id}>
                              <label>
                                <input
                                  type="checkbox"
                                  data-testid="todo-progress-done"
                                  checked={progress.done}
                                  onChange={(event) =>
                                    void toggleProgress(progress.id, event.target.checked)
                                  }
                                />
                                {progress.content}
                              </label>
                              <button
                                type="button"
                                className="m0-link"
                                data-testid="todo-progress-delete"
                                onClick={() => void removeProgress(progress.id)}
                              >
                                删除
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      <div className="m0-actions">
                        <input
                          className="m0-input"
                          data-testid="todo-progress-input"
                          placeholder="记进度"
                          value={progressText[item.id] ?? ''}
                          onChange={(event) =>
                            setProgressText((current) => ({
                              ...current,
                              [item.id]: event.target.value,
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="m0-link"
                          data-testid="todo-progress-add"
                          onClick={() => void addProgress(item.id)}
                        >
                          添加进度
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      <h3 className="m0-subtitle">历史</h3>
      {history.length === 0 ? (
        <EmptyState testId="todo-history-empty" title="还没有已完成事项" />
      ) : (
        <ul className="m0-todo-history">
          {history.map((item) => (
            <li key={item.id} data-testid="todo-history-item">
              {item.cardTitle} · {item.title}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}






