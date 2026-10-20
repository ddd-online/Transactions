import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { closeWorkspace, openWorkspace } from '../../electron/db'
import type { Db } from '../../electron/db/driver'
import {
  addProgress,
  createCard,
  createItem,
  deleteCard,
  deleteItem,
  deleteProgress,
  listCards,
  listHistory,
  setItemStatus,
  setProgressDone,
  updateCardSort,
  updateItem,
} from '../../electron/services/todo'
import {
  TODO_CARD_TITLE_MAX,
  TODO_ITEM_TITLE_MAX,
  TODO_LEVEL_DEFAULT,
  TODO_LEVEL_LABELS,
  TODO_LEVELS,
  TODO_PROGRESS_MAX,
  TODO_STATUS_DOING,
  TODO_STATUS_DONE,
  snapTodoLevel,
} from '../../shared/domain/consts'
import { AppError } from '../../shared/errors'

/**
 * 待办服务的行为测试：逐条移植旧 `tr-service/src/todo.rs` 的四个测试
 * （流程 / 校验与账本隔离 / 删卡片级联 / 排序与打勾），并按新 schema 补上
 * 档位网格、历史排序、文本上限、日期口径与「编辑不动状态」的覆盖。
 *
 * 每个用例一个临时工作空间，`afterEach` 关库并删目录（与 ledger 测试同款）。
 */

const LEDGER = 'ledger-todo'
const OTHER_LEDGER = 'other-ledger'

const directories: string[] = []

function workspaceDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'tr-todo-test-'))
  directories.push(directory)
  return directory
}

afterEach(() => {
  closeWorkspace()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function database(): Db {
  return openWorkspace(workspaceDirectory()).db
}

function cardId(db: Db, title: string): string {
  return createCard(db, LEDGER, title).id
}

/** 取期望抛出的 `AppError`（没抛就断言失败，而不是静默通过）。 */
function appErrorFrom(action: () => unknown): AppError {
  try {
    action()
  } catch (error) {
    expect(error).toBeInstanceOf(AppError)
    return error as AppError
  }
  throw new Error('应当抛错')
}

function expectAppError(action: () => unknown, status: number, message: string): void {
  const error = appErrorFrom(action)
  expect(error.status).toBe(status)
  expect(error.message).toBe(message)
}

function countRows(db: Db, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as
    | { count: number }
    | undefined
  return row?.count ?? 0
}

describe('todo service', () => {
  it('moves an item from the card view to history with its progress', () => {
    const db = database()
    const card = cardId(db, '季度目标')

    const item = createItem(db, LEDGER, card, '写完季度复盘', '2026-09-01', '2026-09-30', 3, -3)
    expect(item.cardId).toBe(card)
    expect(item.status).toBe(TODO_STATUS_DOING)
    expect(item.completedAt).toBe(0)
    expect(item.progress).toEqual([])
    addProgress(db, LEDGER, item.id, '列了大纲')
    addProgress(db, LEDGER, item.id, '写完前两节')

    // 卡片视图：这张卡片下有一条进行中的事项，进度记录两条
    const cards = listCards(db, LEDGER)
    expect(cards).toHaveLength(1)
    expect(cards[0]?.title).toBe('季度目标')
    expect(cards[0]?.items).toHaveLength(1)
    expect(cards[0]?.items[0]?.title).toBe('写完季度复盘')
    expect(cards[0]?.items[0]?.urgency).toBe(3)
    expect(cards[0]?.items[0]?.importance).toBe(-3)
    expect(cards[0]?.items[0]?.startDate).toBe('2026-09-01')
    expect(cards[0]?.items[0]?.dueDate).toBe('2026-09-30')
    expect(cards[0]?.items[0]?.progress.map((row) => row.content)).toEqual([
      '列了大纲',
      '写完前两节',
    ])
    expect(listHistory(db, LEDGER)).toEqual([])

    // 完成 → 卡片视图空、历史里带上主题名与进度
    const completed = setItemStatus(db, LEDGER, item.id, TODO_STATUS_DONE)
    expect(completed.status).toBe(TODO_STATUS_DONE)
    expect(completed.completedAt).toBeGreaterThan(0)

    const afterDone = listCards(db, LEDGER)
    expect(afterDone).toHaveLength(1)
    expect(afterDone[0]?.items).toEqual([])

    const history = listHistory(db, LEDGER)
    expect(history).toHaveLength(1)
    expect(history[0]?.cardTitle).toBe('季度目标')
    expect(history[0]?.title).toBe('写完季度复盘')
    expect(history[0]?.progress).toHaveLength(2)
    expect(history[0]?.progress[0]?.content).toBe('列了大纲')
    expect(history[0]?.completedAt).toBeGreaterThan(0)

    // 退回进行中：又回到卡片，完成时刻清掉
    const reopened = setItemStatus(db, LEDGER, item.id, TODO_STATUS_DOING)
    expect(reopened.completedAt).toBe(0)
    expect(listHistory(db, LEDGER)).toEqual([])
    const reopenedCards = listCards(db, LEDGER)
    expect(reopenedCards[0]?.items).toHaveLength(1)
    expect(reopenedCards[0]?.items[0]?.completedAt).toBe(0)
  })

  it('validates input with the old Chinese messages and status codes', () => {
    const db = database()
    const card = cardId(db, '主题')
    const levelsMessage = TODO_LEVEL_LABELS.join(' / ')

    expectAppError(() => createCard(db, LEDGER, '   '), 400, '请输入卡片主题')
    expectAppError(() => createItem(db, LEDGER, card, ' ', '', '', -1, -1), 400, '请输入事项')
    expectAppError(
      () => createItem(db, LEDGER, card, '事项', '', '', 6, -1),
      400,
      `紧急度只能是 ${levelsMessage}`,
    )
    expectAppError(
      () => createItem(db, LEDGER, card, '事项', '', '', -1, -6),
      400,
      `重要度只能是 ${levelsMessage}`,
    )
    expectAppError(
      () => createItem(db, LEDGER, card, '事项', '2026/09/01', '', -1, -1),
      400,
      '日期格式应为 YYYY-MM-DD',
    )
    expectAppError(
      () => createItem(db, LEDGER, card, '事项', '2026-09-30', '2026-09-01', -1, -1),
      400,
      '截止日期不能早于开始日期',
    )
    // 状态先于取行校验：id 不存在也先报状态非法
    expectAppError(
      () => setItemStatus(db, LEDGER, 'nope', 'finished'),
      400,
      '待办状态只能是进行中或已完成',
    )
    expectAppError(
      () => setItemStatus(db, LEDGER, 'nope', TODO_STATUS_DONE),
      404,
      '事项不存在',
    )

    expectAppError(
      () => createItem(db, LEDGER, 'missing-card', '事项', '', '', -1, -1),
      404,
      '卡片不存在',
    )
    expectAppError(
      () => updateItem(db, LEDGER, 'missing-item', '事项', '', '', -1, -1),
      404,
      '事项不存在',
    )
    expectAppError(() => deleteCard(db, 'missing-card'), 404, '卡片不存在')
    expectAppError(() => deleteItem(db, 'missing-item'), 404, '事项不存在')

    const item = createItem(db, LEDGER, card, '事项', '', '', -1, -1)
    expectAppError(() => addProgress(db, LEDGER, item.id, '  '), 400, '请输入进度')
    expectAppError(() => addProgress(db, LEDGER, 'missing-item', '进度'), 404, '事项不存在')
    expectAppError(() => deleteProgress(db, 'missing-progress'), 404, '进度记录不存在')
    expectAppError(() => setProgressDone(db, 'missing-progress', true), 404, '进度记录不存在')
  })

  it('accepts exactly the six snapped levels and rejects values off the grid', () => {
    const db = database()
    const card = cardId(db, '主题')
    const levelsMessage = TODO_LEVEL_LABELS.join(' / ')

    for (const level of TODO_LEVELS) {
      // 六档本身是 snapTodoLevel 的不动点
      expect(snapTodoLevel(level), `${level} 已是档位`).toBe(level)
      const item = createItem(db, LEDGER, card, `事项${level}`, '', '', level, level)
      expect(item.urgency).toBe(level)
      expect(item.importance).toBe(level)
    }

    // 上一版的 11 档（偶数档与「没填」的 0）不再是合法值
    for (const raw of [-6, -4, -2, 0, 2, 4, 6]) {
      expect(snapTodoLevel(raw), `${raw} 不在六档里`).not.toBe(raw)
      expectAppError(
        () => createItem(db, LEDGER, card, '事项', '', '', raw, -1),
        400,
        `紧急度只能是 ${levelsMessage}`,
      )
    }
    expect(snapTodoLevel(0)).toBe(TODO_LEVEL_DEFAULT)
  })

  it('keeps every read and write inside its ledger', () => {
    const db = database()
    const card = cardId(db, '主题')
    const item = createItem(db, LEDGER, card, '事项', '', '', -1, -1)
    addProgress(db, LEDGER, item.id, '进度一')

    // 别的账本看不见
    expect(listCards(db, OTHER_LEDGER)).toEqual([])
    expect(listHistory(db, OTHER_LEDGER)).toEqual([])

    // 别的账本也写不进 / 改不了本账本的行
    expectAppError(
      () => createItem(db, OTHER_LEDGER, card, '事项', '', '', -1, -1),
      404,
      '卡片不存在',
    )
    expectAppError(
      () => updateItem(db, OTHER_LEDGER, item.id, '事项', '', '', -1, -1),
      404,
      '事项不存在',
    )
    expectAppError(
      () => setItemStatus(db, OTHER_LEDGER, item.id, TODO_STATUS_DONE),
      404,
      '事项不存在',
    )
    expectAppError(() => addProgress(db, OTHER_LEDGER, item.id, '进度'), 404, '事项不存在')

    // 删除只按 id（界面上的行本来就来自当前账本），这里删掉之后确认卡片视图空了
    deleteItem(db, item.id)
    expect(listCards(db, LEDGER)[0]?.items).toEqual([])
    expect(countRows(db, 'todo_progress')).toBe(0)
  })

  it('deletes cards and items together with their progress rows', () => {
    const db = database()
    const card = cardId(db, '主题')
    const item = createItem(db, LEDGER, card, '事项', '', '', -1, -1)
    const progress = addProgress(db, LEDGER, item.id, '进度一')

    deleteCard(db, card)

    expect(countRows(db, 'todo_item')).toBe(0)
    expect(countRows(db, 'todo_progress')).toBe(0)

    // 已经删掉的卡片再删一次 → 报「卡片不存在」
    expectAppError(() => deleteCard(db, card), 404, '卡片不存在')
    // 已删除的事项的进度也删不掉
    expectAppError(() => deleteProgress(db, progress.id), 404, '进度记录不存在')

    // 删事项同样连进度记录一起删
    const kept = cardId(db, '保留')
    const second = createItem(db, LEDGER, kept, '事项', '', '', -1, -1)
    const secondProgress = addProgress(db, LEDGER, second.id, '进度二')
    deleteItem(db, second.id)
    expect(countRows(db, 'todo_item')).toBe(0)
    expect(countRows(db, 'todo_progress')).toBe(0)
    expect(countRows(db, 'todo_card')).toBe(1)
    expectAppError(() => deleteItem(db, second.id), 404, '事项不存在')
    expectAppError(() => deleteProgress(db, secondProgress.id), 404, '进度记录不存在')
  })

  it('orders cards by sort order and writes progress done back to the card view', () => {
    const db = database()
    const first = cardId(db, '甲')
    const second = cardId(db, '乙')
    const titles = (): string[] => listCards(db, LEDGER).map((card) => card.title)
    expect(titles(), '新建的排在最后').toEqual(['甲', '乙'])

    // 把第二张拖到第一位（界面拖拽后就是这样两条写回）
    updateCardSort(db, second, 0)
    updateCardSort(db, first, 1)
    expect(titles()).toEqual(['乙', '甲'])

    // 进度打勾：卡片视图里读回来就是 done
    const item = createItem(db, LEDGER, first, '事项', '', '', -1, -1)
    const progress = addProgress(db, LEDGER, item.id, '先做了半步')
    expect(progress.done, '新记的进度默认没打勾').toBe(false)

    const doneOfFirstCard = (): boolean | undefined =>
      listCards(db, LEDGER).find((card) => card.title === '甲')?.items[0]?.progress[0]?.done

    setProgressDone(db, progress.id, true)
    expect(doneOfFirstCard()).toBe(true)
    setProgressDone(db, progress.id, false)
    expect(doneOfFirstCard(), '取消打勾也写回库').toBe(false)
    expectAppError(() => setProgressDone(db, 'nope', true), 404, '进度记录不存在')
  })

  it('edits item fields without touching status, completion time or progress', () => {
    const db = database()
    const card = cardId(db, '主题')
    const item = createItem(db, LEDGER, card, '旧标题', '2026-01-01', '2026-01-31', -1, -1)
    addProgress(db, LEDGER, item.id, '进度一')
    setItemStatus(db, LEDGER, item.id, TODO_STATUS_DONE)

    const updated = updateItem(db, LEDGER, item.id, '  新标题  ', '2026-02-01', '', 5, 3)

    expect(updated.title).toBe('新标题')
    expect(updated.startDate).toBe('2026-02-01')
    expect(updated.dueDate).toBe('')
    expect(updated.urgency).toBe(5)
    expect(updated.importance).toBe(3)
    expect(updated.status, '编辑不动状态').toBe(TODO_STATUS_DONE)
    expect(updated.completedAt, '编辑不动完成时刻').toBeGreaterThan(0)
    expect(updated.progress.map((row) => row.content)).toEqual(['进度一'])

    // 仍在历史里，标题已更新
    expect(listHistory(db, LEDGER)[0]?.title).toBe('新标题')
  })

  it('orders history by completion time (newest first) and carries the card title', () => {
    const db = database()
    const firstCard = cardId(db, '甲')
    const secondCard = cardId(db, '乙')
    const first = createItem(db, LEDGER, firstCard, '先完成', '', '', -1, -1)
    const second = createItem(db, LEDGER, secondCard, '后完成', '', '', -1, -1)
    setItemStatus(db, LEDGER, first.id, TODO_STATUS_DONE)
    setItemStatus(db, LEDGER, second.id, TODO_STATUS_DONE)

    db.prepare('UPDATE todo_item SET completed_at = ? WHERE id = ?').run(1_000, first.id)
    db.prepare('UPDATE todo_item SET completed_at = ? WHERE id = ?').run(2_000, second.id)
    expect(listHistory(db, LEDGER).map((row) => row.title)).toEqual(['后完成', '先完成'])
    expect(listHistory(db, LEDGER).map((row) => row.cardTitle)).toEqual(['乙', '甲'])

    // 同一完成时刻按 rowid 倒序（后插入的在前），与旧 SQL 的 tiebreaker 一致
    db.prepare('UPDATE todo_item SET completed_at = ?').run(3_000)
    expect(listHistory(db, LEDGER).map((row) => row.title)).toEqual(['后完成', '先完成'])

    // 退回进行中：离开历史
    setItemStatus(db, LEDGER, second.id, TODO_STATUS_DOING)
    expect(listHistory(db, LEDGER).map((row) => row.title)).toEqual(['先完成'])
  })

  it('trims and truncates titles / progress by Unicode code points (200 / 500 / 2000)', () => {
    const db = database()
    const card = createCard(db, LEDGER, `  ${'😀'.repeat(TODO_CARD_TITLE_MAX + 1)}  `)
    expect(card.title).toBe('😀'.repeat(TODO_CARD_TITLE_MAX))
    expect(Array.from(card.title)).toHaveLength(TODO_CARD_TITLE_MAX)

    const item = createItem(
      db,
      LEDGER,
      card.id,
      ` ${'事'.repeat(TODO_ITEM_TITLE_MAX + 1)} `,
      '',
      '',
      -1,
      -1,
    )
    expect(item.title).toBe('事'.repeat(TODO_ITEM_TITLE_MAX))
    expect(Array.from(item.title)).toHaveLength(TODO_ITEM_TITLE_MAX)

    const progress = addProgress(db, LEDGER, item.id, '进'.repeat(TODO_PROGRESS_MAX + 1))
    expect(progress.content).toBe('进'.repeat(TODO_PROGRESS_MAX))
    expect(Array.from(progress.content)).toHaveLength(TODO_PROGRESS_MAX)

    // 上限以内原样保留，只去掉首尾空白
    const exact = createItem(
      db,
      LEDGER,
      card.id,
      ` ${'乙'.repeat(TODO_ITEM_TITLE_MAX)} `,
      '',
      '',
      -1,
      -1,
    )
    expect(exact.title).toBe('乙'.repeat(TODO_ITEM_TITLE_MAX))
  })

  it('allows empty dates and rejects non-strict or impossible dates', () => {
    const db = database()
    const card = cardId(db, '主题')

    const empty = createItem(db, LEDGER, card, '无日期', '', '   ', -1, -1)
    expect(empty.startDate).toBe('')
    expect(empty.dueDate).toBe('')

    const sameDay = createItem(db, LEDGER, card, '同一天', '2026-02-28', '2026-02-28', -1, -1)
    expect(sameDay.startDate).toBe('2026-02-28')
    expect(sameDay.dueDate).toBe('2026-02-28')

    const leapDay = createItem(db, LEDGER, card, '闰日', '2024-02-29', '2024-03-01', -1, -1)
    expect(leapDay.startDate).toBe('2024-02-29')

    const padded = createItem(db, LEDGER, card, '带空白', ' 2026-09-01 ', ' 2026-09-02 ', -1, -1)
    expect(padded.startDate).toBe('2026-09-01')
    expect(padded.dueDate).toBe('2026-09-02')

    for (const bad of [
      '2026/09/01',
      '2026-1-5',
      '2026-09-1',
      '2026-13-01',
      '2026-00-10',
      '2024-02-30',
      '2026-09-00',
    ]) {
      expectAppError(
        () => createItem(db, LEDGER, card, '坏日期', bad, '', -1, -1),
        400,
        '日期格式应为 YYYY-MM-DD',
      )
    }
  })
})
