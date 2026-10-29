import { useCallback, useEffect, useState, type JSX } from 'react'

import type {
  TodoCardDto,
  TodoHistoryDto,
  TodoItemDto,
  TodoProgressDto,
} from '../../shared/types/todo'
import { Input, Modal, Popconfirm, Select } from 'antd'

import { TODO_LEVELS, TODO_LEVEL_LABELS, todoLevelLabel } from '../../shared/domain/consts'
import { todoDueState, type TodoDueState } from '../../shared/domain/todo-due'
import { Button } from '../components/button'
import { DatePicker } from '../components/date-picker'
import { EmptyState } from '../components/empty-state'
import { Icon } from '../components/icon'
import { PageLayout } from '../components/page-layout'
import { ScrollArea } from '../components/scroll-area'
import { Segmented } from '../components/segmented'
import { TodoQuadrant } from '../components/todo-quadrant'

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'msg' in error) {
    return String((error as { msg: unknown }).msg)
  }
  if (error instanceof Error) return error.message
  return String(error)
}

const LEVEL_OPTIONS = TODO_LEVELS.map((value, index) => ({
  value,
  label: TODO_LEVEL_LABELS[index],
}))

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

function formatItemDates(
  startDate: string,
  dueDate: string,
  due: TodoDueState,
): string {
  if (!startDate && !dueDate) return ''
  if (startDate && !dueDate) return `${startDate} 起`
  if (!startDate && dueDate) return due === 'today' ? '今天截止' : `${dueDate} 截止`
  return due === 'today' ? `${startDate} → 今天截止` : `${startDate} → ${dueDate}`
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
    if (item.urgency === TODO_LEVELS[2] && item.importance === TODO_LEVELS[2]) return null
    return (
      <span className="todo-item__levels">
        <span className="todo-level">紧急 {todoLevelLabel(item.urgency)}</span>
        <span className="todo-level">重要 {todoLevelLabel(item.importance)}</span>
      </span>
    )
  }

  const renderItem = (item: TodoItemDto): JSX.Element => {
    const open = Boolean(expandedItems[item.id])
    const doneCount = doneCountOf(item.progress)
    const due = todoDueState(item.dueDate)
    const dueText = formatItemDates(item.startDate, item.dueDate, due)
    return (
      <li key={item.id} className={`todo-item${open ? ' is-open' : ''}`} data-testid="todo-item">
        <div
          className="todo-item__row"
          onClick={(event) => {
            // 整条事项都是展开/收起的热区（包括行的留白）；行内按钮各有动作，点它们不再切换
            const target = event.target
            if (target instanceof Element && target.closest('button, a, input, textarea, [role="button"]')) {
              return
            }
            toggleItem(item.id)
          }}
        >
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
                  <span className="todo-item__progress-bar" aria-hidden="true">
                    <span
                      style={{
                        width: `${Math.round((doneCount / Math.max(1, item.progress.length)) * 100)}%`,
                      }}
                    />
                  </span>
                </span>
              ) : null}
              {renderLevels(item)}
              {dueText ? (
                <span
                  className={`todo-item__due${due === 'overdue' ? ' is-overdue' : due === 'today' ? ' is-today' : ''}`}
                >
                  {due === 'overdue' ? '逾期 · ' : ''}
                  {dueText}
                </span>
              ) : null}
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

          <button
            type="button"
            className="tr-icon-btn todo-item__edit"
            data-testid="todo-item-edit"
            aria-label={`编辑事项 ${item.title}`}
            title="编辑事项"
            onClick={() => openItemModal(item.cardId, item)}
          >
            <Icon name="Edit" size={14} />
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
        <p className="m0-error todo-error" data-testid="todo-error">
          {error}
        </p>
      ) : null}

      <div className="todo-body">
        {todoMode === 'cards' && todoView === 'quadrant' ? (
          !loaded ? (
            renderSkeleton()
          ) : activeCount === 0 ? (
            <EmptyState
              testId="todo-quadrant-empty"
              title={ledgerId ? '还没有进行中的事项' : '请先创建/选择账本'}
              description={
                ledgerId
                  ? '把事项的紧急度与重要度填上，这里就会把它们摆进四个象限。'
                  : undefined
              }
            />
          ) : (
            <TodoQuadrant cards={cards} />
          )
        ) : (
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
                  {cards.map((card) => {
                    const collapsed = Boolean(collapsedCards[card.id])
                    return (
                      <section
                        key={card.id}
                        className={`todo-group${collapsed ? ' is-collapsed' : ''}${
                          dragCardId === card.id ? ' is-dragging' : ''
                        }${dragOverId === card.id ? ' is-over' : ''}`}
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
                        <header
                          className={`todo-group__head${card.items.length > 0 ? ' is-collapsible' : ''}`}
                          onClick={(event) => {
                            // 段头整条都能收起/展开（标题、计数、留白）；「＋ / 删除 / chevron」和
                            // 拖拽把手各自有动作，点它们不再切换。空主题没有可收的东西。
                            if (card.items.length === 0) return
                            const target = event.target
                            if (
                              target instanceof Element &&
                              target.closest(
                                'button, a, input, textarea, [role="button"], [draggable="true"]',
                              )
                            ) {
                              return
                            }
                            toggleCard(card.id)
                          }}
                        >
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
                            {/* 空主题没有可收的东西，干脆不出这个按钮 */}
                            {card.items.length > 0 ? (
                              <button
                                type="button"
                                className={`todo-group__toggle${collapsed ? '' : ' is-open'}`}
                                data-testid="todo-card-toggle"
                                aria-expanded={!collapsed}
                                aria-controls={`todo-items-${card.id}`}
                                aria-label={`${collapsed ? '展开' : '收起'}主题 ${card.title}`}
                                title={collapsed ? '展开主题' : '收起主题'}
                                onClick={() => toggleCard(card.id)}
                              >
                                <Icon name="ChevronRight" size={14} />
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="tr-icon-btn todo-group__add"
                              data-testid="todo-item-add"
                              aria-label={`添加事项：${card.title}`}
                              title="添加事项"
                              onClick={() => openItemModal(card.id)}
                            >
                              <Icon name="Plus" size={14} />
                            </button>
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
                          <ul className="todo-items" id={`todo-items-${card.id}`} hidden={collapsed}>
                            {card.items.map((item) => renderItem(item))}
                          </ul>
                        )}
                      </section>
                    )
                  })}
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
        )}
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
        open={itemOpen}
        title={itemEditingId ? '编辑事项' : '添加事项'}
        width={520}
        centered
        destroyOnHidden
        footer={null}
        onCancel={closeItemModal}
      >
        <div className="tr-modal-form todo-item-form">
          <div className="tr-modal-field">
            <span className="tr-modal-label">事项</span>
            <Input
              autoFocus
              data-testid="todo-item-title"
              maxLength={500}
              placeholder="例如：写周报"
              value={itemDraft}
              onChange={(event) => {
                setItemDraft(event.target.value)
                setItemError('')
              }}
              onPressEnter={() => void createItem()}
            />
          </div>
          <div className="tr-modal-row">
            <div className="tr-modal-field">
              <span className="tr-modal-label">开始时间</span>
              <DatePicker
                testId="todo-item-start"
                ariaLabel="开始时间"
                allowClear
                value={itemStart}
                onChange={(value) => {
                  setItemStart(value)
                  setItemError('')
                }}
              />
            </div>
            <div className="tr-modal-field">
              <span className="tr-modal-label">截止时间</span>
              <DatePicker
                testId="todo-item-due"
                ariaLabel="截止时间"
                allowClear
                value={itemDue}
                onChange={(value) => {
                  setItemDue(value)
                  setItemError('')
                }}
              />
            </div>
          </div>
          <div className="tr-modal-row">
            <div className="tr-modal-field">
              <span className="tr-modal-label">紧急度</span>
              <Select
                data-testid="todo-item-urgency"
                aria-label="紧急度"
                value={itemUrgency}
                options={LEVEL_OPTIONS}
                onChange={(value) => {
                  setItemUrgency(value)
                  setItemError('')
                }}
              />
            </div>
            <div className="tr-modal-field">
              <span className="tr-modal-label">重要度</span>
              <Select
                data-testid="todo-item-importance"
                aria-label="重要度"
                value={itemImportance}
                options={LEVEL_OPTIONS}
                onChange={(value) => {
                  setItemImportance(value)
                  setItemError('')
                }}
              />
            </div>
          </div>
          {itemError ? (
            <p className="todo-modal__error" data-testid="todo-item-error">
              {itemError}
            </p>
          ) : null}
          <div className="todo-modal__actions">
            <Button variant="secondary" testId="todo-item-cancel" onClick={closeItemModal}>
              取消
            </Button>
            <Button
              variant="primary"
              testId="todo-item-create"
              loading={busy}
              disabled={!ledgerId}
              onClick={() => void createItem()}
            >
              保存
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
