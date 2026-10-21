import { TODO_STATUS_DONE } from '../../../shared/domain/consts'
import type { TodoCard, TodoItem, TodoProgress } from '../../../shared/types/todo'
import type { Db } from '../driver'

/**
 * 待办 DAO：卡片（主题） / 事项 / 进度记录（既有 `tr-store/src/dao/todo.rs` 的逐条移植）。
 *
 * 约定与其它 DAO 一致：入参是模型结构体，时间戳由 DAO 在 INSERT / UPDATE 时填，
 * 列名恒为 snake_case（列映射在这里显式书写，不依赖序列化层）。
 *
 * 「进度记录」在读取时**按账本一次捞全**再在服务层按 `itemId` 分桶：
 * 单个账本的待办量级很小，一条 `SELECT` 比「每个事项查一次」省得多。
 *
 * SQL 只拼常量片段：值一律 `?`，列名来自 `*_COLUMNS` / 固定的完整语句。
 */

const CARD_COLUMNS = 'id, ledger_id, title, created_at, updated_at, sort_order'
const ITEM_COLUMNS =
  'id, ledger_id, card_id, title, start_date, due_date, urgency, importance, status, ' +
  'completed_at, created_at, updated_at'
const PROGRESS_COLUMNS = 'id, ledger_id, item_id, content, done, created_at'

interface CardRow {
  id: string
  ledger_id: string
  title: string
  created_at: number
  updated_at: number
  sort_order: number
}

interface ItemRow {
  id: string
  ledger_id: string
  card_id: string
  title: string
  start_date: string
  due_date: string
  urgency: number
  importance: number
  status: string
  completed_at: number
  created_at: number
  updated_at: number
}

interface ProgressRow {
  id: string
  ledger_id: string
  item_id: string
  content: string
  done: number
  created_at: number
}

/** 当前 Unix 秒（既有 `tr_store::util::now_unix`）。 */
export function nowUnix(): number {
  return Math.floor(Date.now() / 1000)
}

function cardFromRow(row: CardRow): TodoCard {
  return {
    id: row.id,
    ledgerId: row.ledger_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sortOrder: row.sort_order,
  }
}

function itemFromRow(row: ItemRow): TodoItem {
  return {
    id: row.id,
    ledgerId: row.ledger_id,
    cardId: row.card_id,
    title: row.title,
    startDate: row.start_date,
    dueDate: row.due_date,
    urgency: row.urgency,
    importance: row.importance,
    status: row.status,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function progressFromRow(row: ProgressRow): TodoProgress {
  return {
    id: row.id,
    ledgerId: row.ledger_id,
    itemId: row.item_id,
    content: row.content,
    // 库里的布尔是 0 / 1；node:sqlite 读回 number
    done: Number(row.done) !== 0,
    createdAt: row.created_at,
  }
}

// ---------------------------------------------------------------- 卡片

/** 新建卡片（时间戳取当前时刻）。 */
export function createCard(db: Db, card: TodoCard, now = nowUnix()): void {
  db.prepare(
    'INSERT INTO todo_card (id, ledger_id, title, created_at, updated_at, sort_order) ' +
      'VALUES (?, ?, ?, ?, ?, ?)',
  ).run(card.id, card.ledgerId, card.title, now, now, card.sortOrder)
}

/** 该账本最大的 `sort_order`（无卡片时为 0）；新建卡片取它 + 1，排在最后。 */
export function getMaxCardSort(db: Db, ledgerId: string): number {
  const row = db
    .prepare(
      'SELECT COALESCE(MAX(sort_order), 0) AS max_sort_order FROM todo_card WHERE ledger_id = ?',
    )
    .get(ledgerId) as { max_sort_order: number } | undefined
  return row?.max_sort_order ?? 0
}

/** 改排列序号（拖动排序；卡片只按 id 定位，与其它待办写操作同一约定）。 */
export function updateCardSort(
  db: Db,
  id: string,
  sortOrder: number,
  now = nowUnix(),
): void {
  db.prepare('UPDATE todo_card SET sort_order = ?, updated_at = ? WHERE id = ?').run(
    sortOrder,
    now,
    id,
  )
}

/** 某账本的全部卡片，按排列序号（同序号时按创建顺序，保证稳定）。 */
export function listCardsByLedger(db: Db, ledgerId: string): TodoCard[] {
  const rows = db
    .prepare(
      `SELECT ${CARD_COLUMNS} FROM todo_card WHERE ledger_id = ? ` +
        'ORDER BY sort_order, created_at, rowid',
    )
    .all(ledgerId) as unknown as CardRow[]
  return rows.map(cardFromRow)
}

/** 取一张卡片；不存在时返回 `null`（服务层据此报 404）。 */
export function findCard(db: Db, id: string): TodoCard | null {
  const row = db.prepare(`SELECT ${CARD_COLUMNS} FROM todo_card WHERE id = ?`).get(id) as
    | CardRow
    | undefined
  return row ? cardFromRow(row) : null
}

/** 删一张卡片（事项与进度记录由服务层在同一个事务里一起删）。 */
export function deleteCard(db: Db, id: string): void {
  db.prepare('DELETE FROM todo_card WHERE id = ?').run(id)
}

// ---------------------------------------------------------------- 事项

/** 新建事项（时间戳取当前时刻）。 */
export function createItem(db: Db, item: TodoItem, now = nowUnix()): void {
  db.prepare(
    'INSERT INTO todo_item ' +
      '(id, ledger_id, card_id, title, start_date, due_date, urgency, importance, status, ' +
      'completed_at, created_at, updated_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    item.id,
    item.ledgerId,
    item.cardId,
    item.title,
    item.startDate,
    item.dueDate,
    item.urgency,
    item.importance,
    item.status,
    item.completedAt,
    now,
    now,
  )
}

/**
 * 编辑事项的正文与属性（**不动** status / completedAt，那两个走
 * {@link updateItemStatus}）。
 */
export function updateItem(db: Db, item: TodoItem, now = nowUnix()): void {
  db.prepare(
    'UPDATE todo_item SET title = ?, start_date = ?, due_date = ?, urgency = ?, ' +
      'importance = ?, updated_at = ? WHERE id = ?',
  ).run(
    item.title,
    item.startDate,
    item.dueDate,
    item.urgency,
    item.importance,
    now,
    item.id,
  )
}

/** 改状态（顺带写 / 清完成时刻）。 */
export function updateItemStatus(
  db: Db,
  id: string,
  status: string,
  completedAt: number,
  now = nowUnix(),
): void {
  db.prepare(
    'UPDATE todo_item SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?',
  ).run(status, completedAt, now, id)
}

/** 取一个事项；不存在时返回 `null`（服务层据此报 404）。 */
export function findItem(db: Db, id: string): TodoItem | null {
  const row = db.prepare(`SELECT ${ITEM_COLUMNS} FROM todo_item WHERE id = ?`).get(id) as
    | ItemRow
    | undefined
  return row ? itemFromRow(row) : null
}

/**
 * 某账本按状态取事项。`status` 为空串时取全部（历史 / 卡片视图都只用具体状态）。
 *
 * 排序：进行中的按创建时间（新的在前，与「刚加的在上」一致），
 * 已完成的按**完成时刻倒序**（最近完成的在最上面）。
 */
export function listItemsByStatus(db: Db, ledgerId: string, status: string): TodoItem[] {
  if (status === '') {
    const rows = db
      .prepare(
        `SELECT ${ITEM_COLUMNS} FROM todo_item WHERE ledger_id = ? ` +
          'ORDER BY created_at DESC, rowid DESC',
      )
      .all(ledgerId) as unknown as ItemRow[]
    return rows.map(itemFromRow)
  }

  const statement =
    status === TODO_STATUS_DONE
      ? db.prepare(
          `SELECT ${ITEM_COLUMNS} FROM todo_item WHERE ledger_id = ? AND status = ? ` +
            'ORDER BY completed_at DESC, rowid DESC',
        )
      : db.prepare(
          `SELECT ${ITEM_COLUMNS} FROM todo_item WHERE ledger_id = ? AND status = ? ` +
            'ORDER BY created_at DESC, rowid DESC',
        )
  const rows = statement.all(ledgerId, status) as unknown as ItemRow[]
  return rows.map(itemFromRow)
}

/**
 * 某卡片下某状态的事项（卡片视图按卡片取；排序与 {@link listItemsByStatus} 一致）。
 *
 * 不按账本过滤：卡片 id 已经决定了归属（与既有 DAO 一致）。
 */
export function listItemsByCard(db: Db, cardId: string, status: string): TodoItem[] {
  const rows = db
    .prepare(
      `SELECT ${ITEM_COLUMNS} FROM todo_item WHERE card_id = ? AND status = ? ` +
        'ORDER BY created_at DESC, rowid DESC',
    )
    .all(cardId, status) as unknown as ItemRow[]
  return rows.map(itemFromRow)
}

/** 某卡片下**全部**事项的 id（既有 DAO 的对齐接口；删卡片走 SQL 子查询，不依赖它）。 */
export function listItemIdsByCard(db: Db, cardId: string): string[] {
  const rows = db.prepare('SELECT id FROM todo_item WHERE card_id = ?').all(cardId) as unknown as Array<{
    id: string
  }>
  return rows.map((row) => row.id)
}

/** 删一个事项（进度记录由服务层在同一个事务里一起删）。 */
export function deleteItem(db: Db, id: string): void {
  db.prepare('DELETE FROM todo_item WHERE id = ?').run(id)
}

/** 删一张卡片下的全部事项。 */
export function deleteItemsByCard(db: Db, cardId: string): void {
  db.prepare('DELETE FROM todo_item WHERE card_id = ?').run(cardId)
}

// ---------------------------------------------------------------- 进度记录

/** 追加一条进度记录（`createdAt` 由 DAO 填当前时刻，与既有行为一致）。 */
export function createProgress(db: Db, progress: TodoProgress, now = nowUnix()): void {
  db.prepare(
    'INSERT INTO todo_progress (id, ledger_id, item_id, content, done, created_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?)',
  ).run(
    progress.id,
    progress.ledgerId,
    progress.itemId,
    progress.content,
    progress.done ? 1 : 0,
    now,
  )
}

/** 打勾 / 取消打勾，返回改动的行数（0 = 本来就没有这一行）。 */
export function updateProgressDone(db: Db, id: string, done: boolean): number {
  const result = db
    .prepare('UPDATE todo_progress SET done = ? WHERE id = ?')
    .run(done ? 1 : 0, id)
  return Number(result.changes)
}

/** 某账本的全部进度记录（服务层按 `itemId` 分桶；按记录顺序）。 */
export function listProgressByLedger(db: Db, ledgerId: string): TodoProgress[] {
  const rows = db
    .prepare(
      `SELECT ${PROGRESS_COLUMNS} FROM todo_progress WHERE ledger_id = ? ` +
        'ORDER BY created_at, rowid',
    )
    .all(ledgerId) as unknown as ProgressRow[]
  return rows.map(progressFromRow)
}

/** 删一条进度记录，返回删掉的行数（0 = 本来就没有这一行）。 */
export function deleteProgress(db: Db, id: string): number {
  const result = db.prepare('DELETE FROM todo_progress WHERE id = ?').run(id)
  return Number(result.changes)
}

/** 删一个事项下的全部进度记录。 */
export function deleteProgressByItem(db: Db, itemId: string): void {
  db.prepare('DELETE FROM todo_progress WHERE item_id = ?').run(itemId)
}

/** 删一张卡片下全部事项的进度记录（删卡片时用）。 */
export function deleteProgressByCard(db: Db, cardId: string): void {
  db.prepare(
    'DELETE FROM todo_progress WHERE item_id IN ' +
      '(SELECT id FROM todo_item WHERE card_id = ?)',
  ).run(cardId)
}
