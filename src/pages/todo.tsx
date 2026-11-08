import { useCallback, useEffect, useState, type JSX } from 'react'

import type {
  TodoCardDto,
  TodoHistoryDto,
  TodoItemDto,
} from '../../shared/types/todo'
import { TODO_LEVELS } from '../../shared/domain/consts'
import { Button } from '../components/button'
import { Icon } from '../components/icon'
import { PageLayout } from '../components/page-layout'
import { ScrollArea } from '../components/scroll-area'
import { Segmented } from '../components/segmented'
import { TodoCardColumns, TodoCardCreateModal, TodoQuadrantView } from './todo-card-columns'
import { TodoHistoryProgressModal, TodoHistoryView } from './todo-history'
import { TodoItemEditor } from './todo-item-editor'

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'msg' in error) {
    return String((error as { msg: unknown }).msg)
  }
  if (error instanceof Error) return error.message
  return String(error)
}

export interface TodoPageProps {
  ledgerId: string
}

export function TodoPage({ ledgerId }: TodoPageProps): JSX.Element {
  const [cards, setCards] = useState<TodoCardDto[]>([])
  const [dragCardId, setDragCardId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [todoMode, setTodoMode] = useState<'cards' | 'history'>('cards')
  const [todoView, setTodoView] = useState<'board' | 'quadrant'>('board')
  const [history, setHistory] = useState<TodoHistoryDto[]>([])
  const [historyProgress, setHistoryProgress] = useState<TodoHistoryDto | null>(null)
  const [cardOpen, setCardOpen] = useState(false)
  const [cardDraft, setCardDraft] = useState('')
  const [cardError, setCardError] = useState('')
  const [itemOpen, setItemOpen] = useState(false)
  const [itemCardId, setItemCardId] = useState('')
  const [itemEditingId, setItemEditingId] = useState('')
  const [itemDraft, setItemDraft] = useState('')
  const [itemStart, setItemStart] = useState('')
  const [itemDue, setItemDue] = useState('')
  const [itemUrgency, setItemUrgency] = useState<number>(TODO_LEVELS[2])
  const [itemImportance, setItemImportance] = useState<number>(TODO_LEVELS[2])
  const [itemError, setItemError] = useState('')
  const [progressText, setProgressText] = useState<Record<string, string>>({})
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({})
  /** 主题默认展开；收起只记在这一次会话里，切页回来重新铺开。 */
  const [collapsedCards, setCollapsedCards] = useState<Record<string, boolean>>({})
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

  const openItemModal = useCallback((cardId: string, item?: TodoItemDto): void => {
    // 往收起的主题里加事项时先展开它，否则新事项落在看不见的地方。
    setCollapsedCards((current) => (current[cardId] ? { ...current, [cardId]: false } : current))
    setItemCardId(cardId)
    setItemEditingId(item?.id ?? '')
    setItemDraft(item?.title ?? '')
    setItemStart(item?.startDate ?? '')
    setItemDue(item?.dueDate ?? '')
    setItemUrgency(item?.urgency ?? TODO_LEVELS[2])
    setItemImportance(item?.importance ?? TODO_LEVELS[2])
    setItemError('')
    setItemOpen(true)
  }, [])

  const closeItemModal = useCallback((): void => {
    setItemOpen(false)
    setItemEditingId('')
    setItemError('')
  }, [])

  const changeItemTitle = (value: string): void => {
    setItemDraft(value)
    setItemError('')
  }

  const changeItemStart = (value: string): void => {
    setItemStart(value)
    setItemError('')
  }

  const changeItemDue = (value: string): void => {
    setItemDue(value)
    setItemError('')
  }

  const changeItemUrgency = (value: number): void => {
    setItemUrgency(value)
    setItemError('')
  }

  const changeItemImportance = (value: number): void => {
    setItemImportance(value)
    setItemError('')
  }

  const createItem = useCallback(async (): Promise<void> => {
    const title = itemDraft.trim()
    if (!title) {
      setItemError('请输入事项')
      return
    }
    if (itemStart !== '' && itemDue !== '' && itemStart > itemDue) {
      setItemError('截止日期不能早于开始日期')
      return
    }
    setBusy(true)
    setItemError('')
    setError('')
    try {
      if (itemEditingId) {
        await window.api.invoke('todo_item_update', {
          ledger_id: ledgerId,
          id: itemEditingId,
          title,
          start_date: itemStart,
          due_date: itemDue,
          urgency: itemUrgency,
          importance: itemImportance,
        })
      } else {
        await window.api.invoke('todo_item_create', {
          ledger_id: ledgerId,
          card_id: itemCardId,
          title,
          start_date: itemStart,
          due_date: itemDue,
          urgency: itemUrgency,
          importance: itemImportance,
        })
      }
      setItemOpen(false)
      setItemEditingId('')
      await load()
    } catch (createError) {
      setItemError(errorMessage(createError))
    } finally {
      setBusy(false)
    }
  }, [
    itemCardId,
    itemDraft,
    itemDue,
    itemEditingId,
    itemImportance,
    itemStart,
    itemUrgency,
    ledgerId,
    load,
  ])

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

  const toggleCard = useCallback((id: string): void => {
    setCollapsedCards((current) => ({ ...current, [id]: !current[id] }))
  }, [])

  const activeCount = cards.reduce((total, card) => total + card.items.length, 0)

  /** 只有装着事项的主题才谈得上收起；空主题没有可收的东西。 */
  const collapsibleCards = cards.filter((card) => card.items.length > 0)
  const collapsedCount = collapsibleCards.filter((card) => collapsedCards[card.id]).length

  const expandAllCards = useCallback((): void => {
    setCollapsedCards({})
  }, [])

  const collapseAllCards = useCallback((): void => {
    setCollapsedCards(
      Object.fromEntries(
        cards.filter((card) => card.items.length > 0).map((card) => [card.id, true]),
      ),
    )
  }, [cards])

  const changeCardDraft = (value: string): void => {
    setCardDraft(value)
    setCardError('')
  }

  const changeProgressText = (itemId: string, value: string): void => {
    setProgressText((current) => ({ ...current, [itemId]: value }))
  }

  const dragStart = (id: string): void => {
    setDragCardId(id)
  }

  const dragEnd = (): void => {
    setDragCardId(null)
    setDragOverId(null)
  }

  const dragOverCard = (id: string): void => {
    if (dragCardId && dragCardId !== id) setDragOverId(id)
  }

  const dragLeaveCard = (id: string): void => {
    setDragOverId((current) => (current === id ? null : current))
  }

  const dropCard = (id: string): void => {
    if (dragCardId) void moveCard(dragCardId, id)
    setDragCardId(null)
    setDragOverId(null)
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
            <Segmented
              testId="todo-view"
              value={todoView}
              onChange={(value) => setTodoView(value as 'board' | 'quadrant')}
              options={[
                { value: 'board', label: '待办视图' },
                { value: 'quadrant', label: '四象限图' },
              ]}
            />
            {todoView === 'board' ? (
              <div className="todo-toolbar-actions">
                <Button
                  variant="text"
                  size="sm"
                  testId="todo-expand-all"
                  disabled={collapsedCount === 0}
                  onClick={expandAllCards}
                >
                  全部展开
                </Button>
                <Button
                  variant="text"
                  size="sm"
                  testId="todo-collapse-all"
                  disabled={collapsedCount >= collapsibleCards.length}
                  onClick={collapseAllCards}
                >
                  全部收起
                </Button>
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
            ) : null}
          </div>
        ) : undefined
      }
      footer={
        todoMode === 'cards' && todoView === 'board' && cards.length > 0 ? (
          <div className="todo-footer">
            <span className="todo-summary" data-testid="todo-summary">
              {cards.length} 个主题 · {activeCount} 项待办
            </span>
          </div>
        ) : undefined
      }
    >
      {error ? (
        <p role="alert" className="m0-error todo-error" data-testid="todo-error">
          {error}
        </p>
      ) : null}

      <div className="todo-body">
        {todoMode === 'cards' && todoView === 'quadrant' ? (
          <TodoQuadrantView cards={cards} loaded={loaded} ledgerId={ledgerId} />
        ) : (
          <ScrollArea className="todo-scroll" axis="both" notifyResize>
            {todoMode === 'cards' ? (
              <TodoCardColumns
                cards={cards}
                loaded={loaded}
                ledgerId={ledgerId}
                collapsedCards={collapsedCards}
                expandedItems={expandedItems}
                dragCardId={dragCardId}
                dragOverId={dragOverId}
                progressText={progressText}
                onToggleCard={toggleCard}
                onToggleItem={toggleItem}
                onDragStart={dragStart}
                onDragOver={dragOverCard}
                onDragLeave={dragLeaveCard}
                onDrop={dropCard}
                onDragEnd={dragEnd}
                onSetStatus={(id, status) => void setStatus(id, status)}
                onEditItem={openItemModal}
                onRemoveItem={(id) => void removeItem(id)}
                onRemoveCard={(id) => void removeCard(id)}
                onAddItem={openItemModal}
                onProgressTextChange={changeProgressText}
                onAddProgress={(itemId) => void addProgress(itemId)}
                onToggleProgress={(id, done) => void toggleProgress(id, done)}
                onRemoveProgress={(id) => void removeProgress(id)}
              />
            ) : (
              <TodoHistoryView
                history={history}
                loaded={loaded}
                onOpenProgress={setHistoryProgress}
                onReopen={(id) => void setStatus(id, 'doing')}
                onRemove={(id) => void removeItem(id)}
              />
            )}
          </ScrollArea>
        )}
      </div>

      <TodoCardCreateModal
        open={cardOpen}
        title={cardDraft}
        error={cardError}
        busy={busy}
        createDisabled={!ledgerId}
        onTitleChange={changeCardDraft}
        onCancel={closeCardModal}
        onSubmit={() => void createCard()}
      />

      <TodoItemEditor
        open={itemOpen}
        editing={itemEditingId !== ''}
        title={itemDraft}
        start={itemStart}
        due={itemDue}
        urgency={itemUrgency}
        importance={itemImportance}
        error={itemError}
        busy={busy}
        saveDisabled={!ledgerId}
        onTitleChange={changeItemTitle}
        onStartChange={changeItemStart}
        onDueChange={changeItemDue}
        onUrgencyChange={changeItemUrgency}
        onImportanceChange={changeItemImportance}
        onCancel={closeItemModal}
        onSubmit={() => void createItem()}
      />

      <TodoHistoryProgressModal
        item={historyProgress}
        onClose={() => setHistoryProgress(null)}
      />
    </PageLayout>
  )
}
