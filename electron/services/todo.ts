import { randomUUID } from 'node:crypto'

import { daysInMonth } from '../../shared/domain/calendar'
import {
  TODO_CARD_TITLE_MAX,
  TODO_ITEM_TITLE_MAX,
  TODO_LEVELS,
  TODO_LEVEL_LABELS,
  TODO_PROGRESS_MAX,
  TODO_STATUSES,
  TODO_STATUS_DOING,
  TODO_STATUS_DONE,
} from '../../shared/domain/consts'
import { AppError } from '../../shared/errors'
import type {
  TodoCard,
  TodoCardDto,
  TodoHistoryDto,
  TodoItem,
  TodoItemDto,
  TodoProgress,
  TodoProgressDto,
} from '../../shared/types/todo'
import type { Db } from '../db/driver'
import {
  createCard as createCardRow,
  createItem as createItemRow,
  createProgress,
  deleteCard as deleteCardRow,
  deleteItem as deleteItemRow,
  deleteItemsByCard,
  deleteProgress as deleteProgressRow,
  deleteProgressByCard,
  deleteProgressByItem,
  findCard,
  findItem,
  getMaxCardSort,
  listCardsByLedger,
  listItemsByCard,
  listItemsByStatus,
  listProgressByLedger,
  nowUnix,
  updateCardSort as updateCardSortRow,
  updateItem as updateItemRow,
  updateItemStatus,
  updateProgressDone,
} from '../db/dao/todo'
import { logError } from '../logging'

/**
 * 待办服务：卡片（主题） / 事项 / 进度记录（既有实现 的逐条移植）。
 *
 * 三条纪律（与既有行为一致）：
 * * **按账本隔离**：每个带账本的写操作都先取行再比 `ledgerId`，取到的行不属于本账本时
 *   一律当作「不存在」（不区分「没有这行」与「是别的账本的」）；
 * * **完成不搬数据**：把 `status` 写成 `done` 并记完成时刻即可 —— 卡片视图只取进行中的、
 *   历史视图只取已完成的，是同一张表的两个 WHERE；
 * * **删卡片 / 删事项连进度记录一起删**（同一个事务），不留孤儿行。
 *
 * 档位（紧急度 / 重要度）的六档是 `TODO_LEVELS`（-5 / -3 / -1 / 1 / 3 / 5），
 * 写入只接受这六档，其余值报 400 —— `snapTodoLevel` 是**迁移 / 展示侧**的语义
 * （源库 11 档数据由迁移 `20260929_todo_levels_snap` 就近归档，导入前置条件保证已跑过），
 * 这里不静默改写用户本次输入。
 *
 * 错误状态码沿用既有 `AppError`：校验 400、查无此行 404、其它 500。
 */

// ---------------------------------------------------------------- 校验

/**
 * 去掉首尾空白、校验非空，并按**字符**（Unicode 码点，不是 UTF-16 码元、不是字节）
 * 截断到上限。与既有 `util::truncate_chars` 同一口径。
 */
function requireText(value: string, emptyMessage: string, maxChars: number): string {
  const text = value.trim()
  if (text === '') {
    throw new AppError(emptyMessage, { status: 400 })
  }
  return Array.from(text).slice(0, maxChars).join('')
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * 日期：**空串允许**（= 没填），否则必须是严格的 `YYYY-MM-DD`。
 *
 * 与既有 `stock::parse_strict_date` 同一口径：**恰好 10 个 ASCII 字符、零填充、日期真实存在**
 * （含闰年），`2026/01/05` 与 `2026-1-5` 都会被拒绝。日记的校验是同一套规则。
 */
function normalizeDate(value: string): string {
  const text = value.trim()
  if (text === '') return ''
  const match = DATE_PATTERN.exec(text)
  if (!match) {
    throw new AppError('日期格式应为 YYYY-MM-DD', { status: 400 })
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new AppError('日期格式应为 YYYY-MM-DD', { status: 400 })
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * 紧急度 / 重要度只能是六档之一（低 / 中低 / 次低 / 次高 / 中高 / 高）。
 *
 * 既有测试明确断言 `0` / `±4` / `6` 不再合法（上一版的 11 档与「没填」的 0 已由迁移归档）。
 */
function checkLevel(value: number, label: string): void {
  if ((TODO_LEVELS as readonly number[]).includes(value)) return
  throw new AppError(`${label}只能是 ${TODO_LEVEL_LABELS.join(' / ')}`, { status: 400 })
}

/** 事项的四个可变字段一起校验，返回归一化后的 `[标题, 开始, 截止]`。 */
function normalizeItemFields(
  title: string,
  startDate: string,
  dueDate: string,
  urgency: number,
  importance: number,
): [string, string, string] {
  const normalizedTitle = requireText(title, '请输入事项', TODO_ITEM_TITLE_MAX)
  const start = normalizeDate(startDate)
  const due = normalizeDate(dueDate)
  // 归一化后都是 `YYYY-MM-DD`，字典序即时间序
  if (start !== '' && due !== '' && start > due) {
    throw new AppError('截止日期不能早于开始日期', { status: 400 })
  }
  checkLevel(urgency, '紧急度')
  checkLevel(importance, '重要度')
  return [normalizedTitle, start, due]
}

// ---------------------------------------------------------------- 取行

/** 取卡片；不存在或不属于本账本时统一报「卡片不存在」。 */
function cardOf(db: Db, ledgerId: string, cardId: string): TodoCard {
  const card = findCard(db, cardId)
  if (!card || card.ledgerId !== ledgerId) {
    throw new AppError('卡片不存在', { status: 404 })
  }
  return card
}

/** 取事项；不存在或不属于本账本时统一报「事项不存在」。 */
function itemOf(db: Db, ledgerId: string, itemId: string): TodoItem {
  const item = findItem(db, itemId)
  if (!item || item.ledgerId !== ledgerId) {
    throw new AppError('事项不存在', { status: 404 })
  }
  return item
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// ---------------------------------------------------------------- DTO

function progressDto(progress: TodoProgress): TodoProgressDto {
  return {
    id: progress.id,
    itemId: progress.itemId,
    content: progress.content,
    done: progress.done,
    createdAt: progress.createdAt,
  }
}

function itemDto(item: TodoItem, progress: TodoProgressDto[]): TodoItemDto {
  return {
    id: item.id,
    cardId: item.cardId,
    title: item.title,
    startDate: item.startDate,
    dueDate: item.dueDate,
    urgency: item.urgency,
    importance: item.importance,
    status: item.status,
    completedAt: item.completedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    progress,
  }
}

function cardDto(card: TodoCard, items: TodoItemDto[]): TodoCardDto {
  return {
    id: card.id,
    title: card.title,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
    items,
  }
}

function historyDto(
  item: TodoItem,
  cardTitle: string,
  progress: TodoProgressDto[],
): TodoHistoryDto {
  return {
    id: item.id,
    cardId: item.cardId,
    cardTitle,
    title: item.title,
    startDate: item.startDate,
    dueDate: item.dueDate,
    urgency: item.urgency,
    importance: item.importance,
    completedAt: item.completedAt,
    progress,
  }
}

// ---------------------------------------------------------------- 读

/** 某账本的进度记录按 `itemId` 分桶（一次查询而不是每事项一次）。 */
function progressByItem(db: Db, ledgerId: string): Map<string, TodoProgressDto[]> {
  const buckets = new Map<string, TodoProgressDto[]>()
  for (const progress of listProgressByLedger(db, ledgerId)) {
    const bucket = buckets.get(progress.itemId)
    if (bucket) {
      bucket.push(progressDto(progress))
    } else {
      buckets.set(progress.itemId, [progressDto(progress)])
    }
  }
  return buckets
}

/** 卡片视图：卡片（含没有事项的）+ 每张卡片下**进行中**的事项（进度记录内嵌）。 */
export function listCards(db: Db, ledgerId: string): TodoCardDto[] {
  const buckets = progressByItem(db, ledgerId)
  const cards = listCardsByLedger(db, ledgerId)
  return cards.map((card) => {
    const items = listItemsByCard(db, card.id, TODO_STATUS_DOING).map((item) => {
      const progress = buckets.get(item.id) ?? []
      buckets.delete(item.id)
      return itemDto(item, progress)
    })
    return cardDto(card, items)
  })
}

/** 历史视图：**已完成**的事项（按完成时刻倒序）+ 主题名 + 进度记录。 */
export function listHistory(db: Db, ledgerId: string): TodoHistoryDto[] {
  const buckets = progressByItem(db, ledgerId)
  const titles = new Map(
    listCardsByLedger(db, ledgerId).map((card) => [card.id, card.title] as const),
  )
  return listItemsByStatus(db, ledgerId, TODO_STATUS_DONE).map((item) => {
    const progress = buckets.get(item.id) ?? []
    buckets.delete(item.id)
    return historyDto(item, titles.get(item.cardId) ?? '', progress)
  })
}

// ---------------------------------------------------------------- 卡片

/** 新建卡片（主题）。同一账本允许重名 —— 主题是给人看的分类，不是主键。 */
export function createCard(db: Db, ledgerId: string, title: string): TodoCardDto {
  const normalizedTitle = requireText(title, '请输入卡片主题', TODO_CARD_TITLE_MAX)
  // 新卡片排在最后（拖动排序改的就是这个序号）
  const sortOrder = getMaxCardSort(db, ledgerId) + 1
  const card: TodoCard = {
    id: randomUUID(),
    ledgerId,
    title: normalizedTitle,
    createdAt: 0,
    updatedAt: 0,
    sortOrder,
  }
  createCardRow(db, card)
  // 回读一次拿 DAO 填的时间戳
  const saved = findCard(db, card.id)
  if (!saved) {
    throw new AppError('record not found', { status: 500 })
  }
  return cardDto(saved, [])
}

/** 改卡片排序号（拖动排序；只按 id，见 {@link deleteCard} 的说明）。 */
export function updateCardSort(db: Db, cardId: string, sortOrder: number): void {
  updateCardSortRow(db, cardId, sortOrder)
}

/**
 * 删卡片：同一个事务里连它的事项与进度记录一起删。
 *
 * 删除只按 id（与图表 / 模板 / 事件的删除同一约定）：界面上的行本来就来自当前账本，
 * 而既有 wire 的 `IdRequest` 只带 id —— 不为此多定义一个请求结构。
 */
export function deleteCard(db: Db, cardId: string): void {
  try {
    db.transaction(() => {
      if (!findCard(db, cardId)) {
        throw new AppError('卡片不存在', { status: 404 })
      }
      deleteProgressByCard(db, cardId)
      deleteItemsByCard(db, cardId)
      deleteCardRow(db, cardId)
    })
  } catch (error) {
    logError(`删除待办卡片失败, card: ${cardId}, err: ${errorText(error)}`)
    throw error
  }
}

// ---------------------------------------------------------------- 事项

/** 在卡片下新建事项（新事项一律是「进行中」）。 */
export function createItem(
  db: Db,
  ledgerId: string,
  cardId: string,
  title: string,
  startDate: string,
  dueDate: string,
  urgency: number,
  importance: number,
): TodoItemDto {
  const [normalizedTitle, start, due] = normalizeItemFields(
    title,
    startDate,
    dueDate,
    urgency,
    importance,
  )
  cardOf(db, ledgerId, cardId)
  const item: TodoItem = {
    id: randomUUID(),
    ledgerId,
    cardId,
    title: normalizedTitle,
    startDate: start,
    dueDate: due,
    urgency,
    importance,
    status: TODO_STATUS_DOING,
    completedAt: 0,
    createdAt: 0,
    updatedAt: 0,
  }
  createItemRow(db, item)
  const saved = findItem(db, item.id)
  if (!saved) {
    throw new AppError('record not found', { status: 500 })
  }
  return itemDto(saved, [])
}

/** 编辑事项的正文与属性（**不动**状态；完成 / 取消完成走 {@link setItemStatus}）。 */
export function updateItem(
  db: Db,
  ledgerId: string,
  itemId: string,
  title: string,
  startDate: string,
  dueDate: string,
  urgency: number,
  importance: number,
): TodoItemDto {
  const [normalizedTitle, start, due] = normalizeItemFields(
    title,
    startDate,
    dueDate,
    urgency,
    importance,
  )
  const item = itemOf(db, ledgerId, itemId)
  item.title = normalizedTitle
  item.startDate = start
  item.dueDate = due
  item.urgency = urgency
  item.importance = importance
  updateItemRow(db, item)
  const saved = findItem(db, itemId)
  if (!saved) {
    throw new AppError('record not found', { status: 500 })
  }
  return itemDto(
    saved,
    listProgressByLedger(db, ledgerId)
      .filter((progress) => progress.itemId === itemId)
      .map(progressDto),
  )
}

/** 改状态：`done` 记下完成时刻（进历史），`doing` 清掉完成时刻（退回卡片）。 */
export function setItemStatus(
  db: Db,
  ledgerId: string,
  itemId: string,
  status: string,
): TodoItemDto {
  if (!(TODO_STATUSES as readonly string[]).includes(status)) {
    throw new AppError('待办状态只能是进行中或已完成', { status: 400 })
  }
  itemOf(db, ledgerId, itemId)
  const completedAt = status === TODO_STATUS_DONE ? nowUnix() : 0
  updateItemStatus(db, itemId, status, completedAt)
  const saved = findItem(db, itemId)
  if (!saved) {
    throw new AppError('record not found', { status: 500 })
  }
  return itemDto(saved, [])
}

/**
 * 删事项：同一个事务里连它的进度记录一起删。
 * 删除只按 id（见 {@link deleteCard} 的说明）。
 */
export function deleteItem(db: Db, itemId: string): void {
  try {
    db.transaction(() => {
      if (!findItem(db, itemId)) {
        throw new AppError('事项不存在', { status: 404 })
      }
      deleteProgressByItem(db, itemId)
      deleteItemRow(db, itemId)
    })
  } catch (error) {
    logError(`删除待办事项失败, item: ${itemId}, err: ${errorText(error)}`)
    throw error
  }
}

// ---------------------------------------------------------------- 进度记录

/** 追加一条进度记录（只增不写：要改就删了重记）。 */
export function addProgress(
  db: Db,
  ledgerId: string,
  itemId: string,
  content: string,
): TodoProgressDto {
  const normalizedContent = requireText(content, '请输入进度', TODO_PROGRESS_MAX)
  itemOf(db, ledgerId, itemId)
  const progress: TodoProgress = {
    id: randomUUID(),
    ledgerId,
    itemId,
    content: normalizedContent,
    done: false,
    createdAt: 0,
  }
  createProgress(db, progress)
  const saved = listProgressByLedger(db, ledgerId).find((row) => row.id === progress.id)
  if (!saved) {
    throw new AppError('写入进度记录后未取到该行', { status: 500 })
  }
  return progressDto(saved)
}

/** 删一条进度记录（只按 id，见 {@link deleteCard} 的说明）。 */
export function deleteProgress(db: Db, progressId: string): void {
  if (deleteProgressRow(db, progressId) === 0) {
    throw new AppError('进度记录不存在', { status: 404 })
  }
}

/** 给一条进度记录打勾 / 取消打勾（打勾后界面上给正文加删除线）。 */
export function setProgressDone(db: Db, progressId: string, done: boolean): void {
  if (updateProgressDone(db, progressId, done) === 0) {
    throw new AppError('进度记录不存在', { status: 404 })
  }
}
