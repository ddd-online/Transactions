import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { closeWorkspace, openWorkspace } from '../../electron/db'
import type { Db } from '../../electron/db/driver'
import {
  countByTag,
  countRecordsByTags as countRecordsByTagsRow,
  createTag as createTagRow,
  deleteTagsByCategory,
  getMaxSort,
  listTags,
  updateTagSort as updateTagSortRow,
} from '../../electron/db/dao/tag'
import {
  countRecordsByTags,
  createTag,
  deleteTag,
  updateTagSort,
} from '../../electron/services/tag'
import { AppError } from '../../shared/errors'

const directories: string[] = []

function workspaceDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'tr-tag-test-'))
  directories.push(directory)
  return directory
}

afterEach(() => {
  closeWorkspace()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function openedWorkspace() {
  return openWorkspace(workspaceDirectory())
}

function captureAppError(run: () => void): AppError {
  try {
    run()
  } catch (error) {
    if (error instanceof AppError) return error
    throw error
  }
  throw new Error('应当抛出 AppError')
}

function insertRecordTag(
  db: Db,
  ledgerId: string,
  transactionId: string,
  tag: string,
): void {
  db.prepare(
    'INSERT INTO transaction_record_tag (ledger_id, transaction_id, tag) VALUES (?, ?, ?)',
  ).run(ledgerId, transactionId, tag)
}

describe('tag dao', () => {
  it('query orders by sort then name desc and filters category', () => {
    const workspace = openedWorkspace()

    createTagRow(workspace.db, {
      ledgerId: 'l1',
      name: '三餐',
      categoryTransactionType: '餐饮美食:expense',
      sortOrder: 1,
    })
    createTagRow(workspace.db, {
      ledgerId: 'l1',
      name: '外卖',
      categoryTransactionType: '餐饮美食:expense',
      sortOrder: 0,
    })
    createTagRow(workspace.db, {
      ledgerId: 'l1',
      name: '工资',
      categoryTransactionType: '工资奖金:income',
      sortOrder: 0,
    })
    createTagRow(workspace.db, {
      ledgerId: 'l2',
      name: '三餐',
      categoryTransactionType: '餐饮美食:expense',
      sortOrder: 0,
    })

    const all = listTags(workspace.db, 'l1', 'all')
    // sort_order 升序；同序号按 name DESC（工(5DE5) > 外(5916) > 三(4E09)）
    expect(all.map((item) => item.name)).toEqual(['工资', '外卖', '三餐'])

    const dining = listTags(workspace.db, 'l1', '餐饮美食:expense')
    expect(dining.map((item) => item.name)).toEqual(['外卖', '三餐'])

    expect(listTags(workspace.db, 'l1', '')).toHaveLength(3)
  })

  it('max sort update sort and unique index', () => {
    const workspace = openedWorkspace()

    expect(getMaxSort(workspace.db, 'l1', '餐饮美食:expense')).toBe(0)

    const item = {
      ledgerId: 'l1',
      name: '三餐',
      categoryTransactionType: '餐饮美食:expense',
      sortOrder: 4,
    }
    createTagRow(workspace.db, item)
    expect(getMaxSort(workspace.db, 'l1', '餐饮美食:expense')).toBe(4)

    expect(() => createTagRow(workspace.db, item)).toThrow(/UNIQUE constraint failed/)

    updateTagSortRow(workspace.db, 'l1', '三餐', '餐饮美食:expense', 8)
    const loaded = listTags(workspace.db, 'l1', '餐饮美食:expense')
    expect(loaded[0].sortOrder).toBe(8)
  })

  it('record counts use transaction tag table', () => {
    const workspace = openedWorkspace()

    insertRecordTag(workspace.db, 'l1', 't1', '三餐')
    insertRecordTag(workspace.db, 'l1', 't1', '外卖')
    insertRecordTag(workspace.db, 'l1', 't2', '三餐')
    insertRecordTag(workspace.db, 'l2', 't3', '三餐')

    expect(countByTag(workspace.db, 'l1', '三餐')).toBe(2)
    expect(countByTag(workspace.db, 'l1', '外卖')).toBe(1)
    expect(countByTag(workspace.db, 'l1', '不存在')).toBe(0)

    const names = ['三餐', '外卖', '不存在']
    const counts = countRecordsByTagsRow(workspace.db, 'l1', names)
    expect(Object.keys(counts)).toHaveLength(2)
    expect(counts['三餐']).toBe(2)
    expect(counts['外卖']).toBe(1)
    expect(countRecordsByTagsRow(workspace.db, 'l1', [])).toEqual({})
  })

  it('delete by category and ledger cleanup', () => {
    const workspace = openedWorkspace()

    createTagRow(workspace.db, {
      ledgerId: 'l1',
      name: '三餐',
      categoryTransactionType: '餐饮美食:expense',
      sortOrder: 0,
    })
    createTagRow(workspace.db, {
      ledgerId: 'l1',
      name: '外卖',
      categoryTransactionType: '餐饮美食:expense',
      sortOrder: 0,
    })
    createTagRow(workspace.db, {
      ledgerId: 'l1',
      name: '工资',
      categoryTransactionType: '工资奖金:income',
      sortOrder: 0,
    })
    createTagRow(workspace.db, {
      ledgerId: 'l2',
      name: '三餐',
      categoryTransactionType: '餐饮美食:expense',
      sortOrder: 0,
    })

    // 删分类连带删标签：只删同账本同 `分类:交易类型` 的行
    deleteTagsByCategory(workspace.db, 'l1', '餐饮美食:expense')
    const remaining = listTags(workspace.db, 'l1', 'all')
    expect(remaining).toHaveLength(1)
    expect(remaining[0].name).toBe('工资')
    expect(listTags(workspace.db, 'l2', 'all')).toHaveLength(1)

    // 账本级联清理走活路径（语句与 LEDGER_CASCADE 一致）
    workspace.db.prepare('DELETE FROM tag WHERE ledger_id = ?').run('l1')
    expect(listTags(workspace.db, 'l1', 'all')).toHaveLength(0)
    expect(listTags(workspace.db, 'l2', 'all')).toHaveLength(1)
  })
})

describe('tag service', () => {
  it('create tag appends to max sort per category and rejects duplicate', () => {
    const workspace = openedWorkspace()
    createTag(workspace.db, 'l1', '三餐', '餐饮美食:expense')
    createTag(workspace.db, 'l1', '外卖', '餐饮美食:expense')
    createTag(workspace.db, 'l1', '工资', '工资奖金:income')

    const dining = listTags(workspace.db, 'l1', '餐饮美食:expense')
    expect(dining).toHaveLength(2)
    expect(dining[0].sortOrder).toBe(1)
    expect(dining[1].sortOrder).toBe(2)
    expect(listTags(workspace.db, 'l1', '工资奖金:income')[0].sortOrder).toBe(1)

    const error = captureAppError(() =>
      createTag(workspace.db, 'l1', '三餐', '餐饮美食:expense'),
    )
    expect(error.status).toBe(500)
    expect(error.message).toContain('UNIQUE constraint failed')
  })

  it('delete tag removes record associations first', () => {
    const workspace = openedWorkspace()
    createTag(workspace.db, 'l1', '三餐', '餐饮美食:expense')
    createTag(workspace.db, 'l1', '外卖', '餐饮美食:expense')
    insertRecordTag(workspace.db, 'l1', 't1', '三餐')
    insertRecordTag(workspace.db, 'l1', 't1', '外卖')
    insertRecordTag(workspace.db, 'l1', 't2', '三餐')
    insertRecordTag(workspace.db, 'l2', 't3', '三餐')

    deleteTag(workspace.db, 'l1', '三餐', '餐饮美食:expense')

    expect(countByTag(workspace.db, 'l1', '三餐')).toBe(0)
    expect(countByTag(workspace.db, 'l1', '外卖')).toBe(1)
    // 其它账本的关联不受影响（删除同样带 ledger_id 条件）
    expect(countByTag(workspace.db, 'l2', '三餐')).toBe(1)
    const remaining = listTags(workspace.db, 'l1', '餐饮美食:expense')
    expect(remaining).toHaveLength(1)
    expect(remaining[0].name).toBe('外卖')
  })

  // 分类服务删除分类时走的就是这个 DAO 入口（见 category::deleteCategory 的同一事务）；
  // 既有行为里服务层 delete_tags_by_category 的包装已删掉，直接测活路径。
  it('delete tags by category only touches that category', () => {
    const workspace = openedWorkspace()
    createTag(workspace.db, 'l1', '三餐', '餐饮美食:expense')
    createTag(workspace.db, 'l1', '外卖', '餐饮美食:expense')
    createTag(workspace.db, 'l1', '工资', '工资奖金:income')
    createTag(workspace.db, 'l2', '三餐', '餐饮美食:expense')

    deleteTagsByCategory(workspace.db, 'l1', '餐饮美食:expense')

    expect(listTags(workspace.db, 'l1', '餐饮美食:expense')).toHaveLength(0)
    expect(listTags(workspace.db, 'l1', '工资奖金:income')).toHaveLength(1)
    expect(listTags(workspace.db, 'l2', '餐饮美食:expense')).toHaveLength(1)
  })

  it('update sort is silent for missing row', () => {
    const workspace = openedWorkspace()
    createTag(workspace.db, 'l1', '三餐', '餐饮美食:expense')
    updateTagSort(workspace.db, 'l1', '三餐', '餐饮美食:expense', 6)
    expect(listTags(workspace.db, 'l1', '餐饮美食:expense')[0].sortOrder).toBe(6)
    expect(() =>
      updateTagSort(workspace.db, 'l1', '不存在', '餐饮美食:expense', 1),
    ).not.toThrow()
  })

  it('record counts are batched by name', () => {
    const workspace = openedWorkspace()
    insertRecordTag(workspace.db, 'l1', 't1', '三餐')
    insertRecordTag(workspace.db, 'l1', 't1', '外卖')
    insertRecordTag(workspace.db, 'l1', 't2', '三餐')

    const names = ['三餐', '外卖', '不存在']
    const counts = countRecordsByTags(workspace.db, 'l1', names)
    expect(counts['三餐']).toBe(2)
    expect(counts['外卖']).toBe(1)
    expect(counts['不存在']).toBeUndefined()
    expect(countRecordsByTags(workspace.db, 'l1', [])).toEqual({})
  })
})
