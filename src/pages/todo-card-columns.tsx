import type { JSX } from 'react'

import { Input, Modal, Popconfirm } from 'antd'

import { TODO_LEVELS, todoLevelLabel } from '../../shared/domain/consts'
import { todoDueState } from '../../shared/domain/todo-due'
import type { TodoCardDto, TodoItemDto } from '../../shared/types/todo'
import { Button } from '../components/button'
import { EmptyState } from '../components/empty-state'
import { Icon } from '../components/icon'
import { TodoQuadrant } from '../components/todo-quadrant'
import { doneCountOf, formatItemDates } from './todo-format'
import { TodoProgressPanel } from './todo-progress'

/**
 * 待办页的两种卡片视图与新建主题表单。
 *
 * 四象限图（`TodoQuadrantView`）与卡片列（`TodoCardColumns`）都只画页面递下来的数据；
 * 勾选、展开 / 收起、拖拽排序、删除都通过显式回调回传页面。拖拽中的两个 id 由页面持有
 * ——它们是「拖到哪了」的交互状态，排序落库也在页面。
 */
export interface TodoQuadrantViewProps {
  cards: TodoCardDto[]
  loaded: boolean
  ledgerId: string
}

export function TodoQuadrantView({
  cards,
  loaded,
  ledgerId,
}: TodoQuadrantViewProps): JSX.Element {
  const activeCount = cards.reduce((total, card) => total + card.items.length, 0)
  if (!loaded) return <TodoSkeleton />
  if (activeCount === 0) {
    return (
      <EmptyState
        testId="todo-quadrant-empty"
        title={ledgerId ? '还没有进行中的事项' : '请先创建/选择账本'}
        description={
          ledgerId
            ? '把事项的紧急度与重要度填上，这里就会把它们摆进四个象限。'
            : undefined
        }
      />
    )
  }
  return <TodoQuadrant cards={cards} />
}

export interface TodoCardColumnsProps {
  cards: TodoCardDto[]
  loaded: boolean
  ledgerId: string
  collapsedCards: Record<string, boolean>
  expandedItems: Record<string, boolean>
  dragCardId: string | null
  dragOverId: string | null
  progressText: Record<string, string>
  onToggleCard: (id: string) => void
  onToggleItem: (id: string) => void
  onDragStart: (id: string) => void
  onDragOver: (id: string) => void
  onDragLeave: (id: string) => void
  onDrop: (id: string) => void
  onDragEnd: () => void
  onSetStatus: (id: string, status: string) => void
  onEditItem: (cardId: string, item: TodoItemDto) => void
  onRemoveItem: (id: string) => void
  onRemoveCard: (id: string) => void
  onAddItem: (cardId: string) => void
  onProgressTextChange: (itemId: string, value: string) => void
  onAddProgress: (itemId: string) => void
  onToggleProgress: (id: string, done: boolean) => void
  onRemoveProgress: (id: string) => void
}

export function TodoCardColumns({
  cards,
  loaded,
  ledgerId,
  collapsedCards,
  expandedItems,
  dragCardId,
  dragOverId,
  progressText,
  onToggleCard,
  onToggleItem,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onSetStatus,
  onEditItem,
  onRemoveItem,
  onRemoveCard,
  onAddItem,
  onProgressTextChange,
  onAddProgress,
  onToggleProgress,
  onRemoveProgress,
}: TodoCardColumnsProps): JSX.Element {
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
            onToggleItem(item.id)
          }}
        >
          <button
            type="button"
            className="todo-item__check"
            data-testid="todo-item-done"
            aria-label={`标记完成：${item.title}`}
            title="标记完成"
            onClick={() => onSetStatus(item.id, 'done')}
          >
            <Icon name="Check" size={12} />
          </button>

          <button
            type="button"
            className="todo-item__main"
            aria-expanded={open}
            onClick={() => onToggleItem(item.id)}
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
            onClick={() => onToggleItem(item.id)}
          >
            <Icon name="ChevronRight" size={14} />
          </button>

          <button
            type="button"
            className="tr-icon-btn todo-item__edit"
            data-testid="todo-item-edit"
            aria-label={`编辑事项 ${item.title}`}
            title="编辑事项"
            onClick={() => onEditItem(item.cardId, item)}
          >
            <Icon name="Edit" size={14} />
          </button>

          <Popconfirm
            title={`删除事项「${item.title}」？`}
            description="它的进度记录会一并删除。"
            okText="删除"
            cancelText="取消"
            okType="danger"
            onConfirm={() => onRemoveItem(item.id)}
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
          <TodoProgressPanel
            progress={item.progress}
            text={progressText[item.id] ?? ''}
            onTextChange={(value) => onProgressTextChange(item.id, value)}
            onAdd={() => onAddProgress(item.id)}
            onToggleDone={onToggleProgress}
            onRemove={onRemoveProgress}
          />
        ) : null}
      </li>
    )
  }

  if (!loaded) return <TodoSkeleton />
  if (cards.length === 0) {
    return (
      <EmptyState
        testId="todo-empty"
        title={ledgerId ? '还没有待办主题' : '请先创建/选择账本'}
        description={ledgerId ? '先建一个主题，把要做的事一条条放进去。' : undefined}
      />
    )
  }

  return (
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
              onDragOver(card.id)
            }}
            onDragLeave={() => onDragLeave(card.id)}
            onDrop={() => onDrop(card.id)}
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
                onToggleCard(card.id)
              }}
            >
              <span
                className="todo-group__handle"
                title="拖动排序"
                draggable
                onDragStart={() => onDragStart(card.id)}
                onDragEnd={onDragEnd}
              >
                <Icon name="DragHandle" size={16} />
              </span>
              <h2 className="todo-group__title" title={card.title}>
                {card.title}
              </h2>
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
                    onClick={() => onToggleCard(card.id)}
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
                  onClick={() => onAddItem(card.id)}
                >
                  <Icon name="Plus" size={14} />
                </button>
                <Popconfirm
                  title={`删除主题「${card.title}」？`}
                  description="主题下的事项与进度会一并删除。"
                  okText="删除"
                  cancelText="取消"
                  okType="danger"
                  onConfirm={() => onRemoveCard(card.id)}
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
}

export interface TodoCardCreateModalProps {
  open: boolean
  title: string
  error: string
  busy: boolean
  createDisabled: boolean
  onTitleChange: (value: string) => void
  onCancel: () => void
  onSubmit: () => void
}

export function TodoCardCreateModal({
  open,
  title,
  error,
  busy,
  createDisabled,
  onTitleChange,
  onCancel,
  onSubmit,
}: TodoCardCreateModalProps): JSX.Element {
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
          onChange={(event) => onTitleChange(event.target.value)}
          onPressEnter={onSubmit}
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
            onClick={onSubmit}
          >
            创建
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** 首次取数期间画两段骨架，避免先闪一下「还没有待办主题」再出现真实内容。 */
export function TodoSkeleton(): JSX.Element {
  return (
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
}
