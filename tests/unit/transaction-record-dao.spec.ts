import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { closeWorkspace, openWorkspace } from '../../electron/db'
import type { Db } from '../../electron/db/driver'
import {
  countByLedgerId,
  create,
  createBatch,
  deleteById,
  queryById,
  queryByKeyEventDate,
  queryChartLineData,
  queryFiltered,
  queryStatistics,
  updateKeyEventDate,
} from '../../electron/db/dao/transaction-record'
import {
  createBatch as createTagBatch,
  deleteByTag,
  deleteByTrId,
  queryByTrIds,
} from '../../electron/db/dao/transaction-record-tag'
import type {
  ChartLine,
  QueryConditionItem,
  TransactionRecord,
} from '../../shared/domain/models'
import type { TrQueryCondition } from '../../shared/types/transaction'
import { AppError } from '../../shared/errors'

const directories: string[] = []

function workspaceDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'tr-dao-test-'))
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

function insertLedger(db: Db, id: string): void {
  db.prepare('INSERT INTO ledger (id, name, description, created_at, updated_at) VALUES (?, ?, ?, 1, 1)').run(
    id,
    id,
    '',
  )
}

function record(
  id: string,
  amountCents: number,
  transactionType: string,
  category: string,
  transactionAt: number,
  options: {
    ledgerId?: string
    description?: string
    outlier?: boolean
    keyEventDate?: string
  } = {},
): TransactionRecord {
  return {
    transactionId: id,
    ledgerId: options.ledgerId ?? 'l1',
    amountCents,
    transactionType,
    category,
    description: options.description ?? `备注${id}`,
    flags: JSON.stringify({ outlier: options.outlier ?? false }),
    keyEventDate: options.keyEventDate ?? '',
    transactionAt,
    createdAt: 0,
    updatedAt: 0,
  }
}

/** 固定时间戳播种，避免测试断言依赖当前时钟。 */
function seedRecords(db: Db, records: readonly TransactionRecord[], now = 1_700_000_000): void {
  for (const item of records) create(db, item, now)
}

function condition(overrides: Partial<TrQueryCondition> = {}): TrQueryCondition {
  return {
    ledgerId: 'l1',
    offset: -1,
    limit: -1,
    tsRange: [],
    items: [],
    sortFields: [],
    ...overrides,
  }
}

function item(overrides: Partial<QueryConditionItem> = {}): QueryConditionItem {
  return {
    transactionType: '',
    category: '',
    tags: [],
    tagPolicy: 'any',
    tagNot: false,
    description: '',
    ...overrides,
  }
}

function ids(result: { items: readonly TransactionRecord[] }): string[] {
  return result.items.map((entry) => entry.transactionId)
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

function seedTags(db: Db, transactionId: string, tags: readonly string[], ledgerId = 'l1'): void {
  createTagBatch(
    db,
    tags.map((tag) => ({ ledgerId, transactionId, tag })),
  )
}

describe('transaction record dao', () => {
  it('creates, queries and deletes a record with matching timestamps', () => {
    const workspace = openedWorkspace()
    const db = workspace.db
    insertLedger(db, 'l1')
    insertLedger(db, 'l2')

    const now = 1_700_000_000
    create(
      db,
      record('t1', 12_345, 'expense', '餐饮美食', 100, {
        description: '午餐 100%',
        outlier: true,
        keyEventDate: '2026-01-01',
      }),
      now,
    )

    const loaded = queryById(db, 't1')
    expect(loaded).toEqual({
      transactionId: 't1',
      ledgerId: 'l1',
      amountCents: 12_345,
      transactionType: 'expense',
      category: '餐饮美食',
      description: '午餐 100%',
      flags: '{"outlier":true}',
      keyEventDate: '2026-01-01',
      transactionAt: 100,
      createdAt: now,
      updatedAt: now,
    })
    expect(countByLedgerId(db, 'l1')).toBe(1)
    expect(countByLedgerId(db, 'l2')).toBe(0)

    deleteById(db, 't1')
    expect(captureAppError(() => queryById(db, 't1')).status).toBe(404)
    expect(countByLedgerId(db, 'l1')).toBe(0)
    // 删除是幂等的：不存在的行视为成功。
    expect(() => deleteById(db, 't1')).not.toThrow()
  })

  it('batch creates inside the caller transaction and keeps both timestamps', () => {
    const workspace = openedWorkspace()
    const db = workspace.db
    insertLedger(db, 'l1')

    createBatch(db, [
      record('t1', 100, 'expense', 'a', 10),
      record('t2', 200, 'income', 'b', 20),
    ])

    expect(countByLedgerId(db, 'l1')).toBe(2)
    const first = queryById(db, 't1')
    expect(first.createdAt).toBeGreaterThan(0)
    expect(first.updatedAt).toBe(first.createdAt)

    // createBatch 不自己开事务：调用方回滚时两条记录一起消失。
    expect(() =>
      db.transaction(() => {
        createBatch(db, [record('t3', 300, 'expense', 'c', 30)])
        throw new Error('rollback')
      }),
    ).toThrow('rollback')
    expect(countByLedgerId(db, 'l1')).toBe(2)
    expect(captureAppError(() => queryById(db, 't3')).status).toBe(404)
  })

  it('filters by transaction type, category and description keyword', () => {
    const workspace = openedWorkspace()
    const db = workspace.db
    insertLedger(db, 'l1')
    seedRecords(db, [
      record('t1', 100, 'expense', '餐饮美食', 10, { description: '午餐 100%' }),
      record('t2', 200, 'income', '工资奖金', 20, { description: '工资' }),
      record('t3', 300, 'expense', '购物消费', 30, { description: 'Lunch' }),
      record('t4', 400, 'income', '餐饮美食', 40, { description: '聚餐' }),
    ])

    expect(ids(queryFiltered(db, condition({ items: [item({ transactionType: 'expense' })] })))).toEqual([
      't3',
      't1',
    ])
    expect(ids(queryFiltered(db, condition({ items: [item({ transactionType: 'income' })] })))).toEqual([
      't4',
      't2',
    ])
    expect(ids(queryFiltered(db, condition({ items: [item({ category: '餐饮美食' })] })))).toEqual([
      't4',
      't1',
    ])

    // instr：区分大小写，且 `%` 不是通配符。
    expect(ids(queryFiltered(db, condition({ items: [item({ description: '午餐' })] })))).toEqual([
      't1',
    ])
    expect(ids(queryFiltered(db, condition({ items: [item({ description: '%' })] })))).toEqual(['t1'])
    expect(ids(queryFiltered(db, condition({ items: [item({ description: 'Lunch' })] })))).toEqual([
      't3',
    ])
    expect(queryFiltered(db, condition({ items: [item({ description: 'lunch' })] })).total).toBe(0)

    // 条件项内部是 AND：t4 分类相同但类型是 income。
    expect(
      ids(
        queryFiltered(
          db,
          condition({ items: [item({ transactionType: 'expense', category: '餐饮美食' })] }),
        ),
      ),
    ).toEqual(['t1'])
    expect(
      ids(
        queryFiltered(
          db,
          condition({
            items: [
              item({ transactionType: 'income', category: '餐饮美食', description: '聚餐' }),
            ],
          }),
        ),
      ),
    ).toEqual(['t4'])
  })

  it('ORs condition items and treats an empty item as match-all', () => {
    const workspace = openedWorkspace()
    const db = workspace.db
    insertLedger(db, 'l1')
    seedRecords(db, [
      record('t1', 100, 'expense', 'a', 10),
      record('t2', 200, 'expense', 'b', 20),
      record('t3', 300, 'income', 'c', 30),
    ])

    const twoItems = condition({
      items: [item({ category: 'a' }), item({ category: 'c' })],
    })
    expect(ids(queryFiltered(db, twoItems))).toEqual(['t3', 't1'])

    // 一个 AND 条件项：分类 a 且必须是支出。
    const andItem = condition({ items: [item({ category: 'a', transactionType: 'expense' })] })
    expect(ids(queryFiltered(db, andItem))).toEqual(['t1'])
    expect(
      queryFiltered(db, condition({ items: [item({ category: 'b', transactionType: 'income' })] }))
        .total,
    ).toBe(0)

    // 空条件项 = 1 = 1，匹配全部；空数组则完全不限制。
    expect(queryFiltered(db, condition({ items: [item()] })).total).toBe(3)
    expect(queryFiltered(db, condition({ items: [] })).total).toBe(3)
  })

  it('matches tags with any / all / not policies', () => {
    const workspace = openedWorkspace()
    const db = workspace.db
    insertLedger(db, 'l1')
    seedRecords(db, [
      record('t1', 100, 'expense', 'a', 10),
      record('t2', 200, 'expense', 'b', 20),
      record('t3', 300, 'income', 'c', 30),
    ])
    seedTags(db, 't1', ['三餐', '外卖'])
    seedTags(db, 't2', ['三餐'])

    const any = condition({
      items: [item({ tags: ['三餐'], tagPolicy: 'any' })],
    })
    expect(ids(queryFiltered(db, any))).toEqual(['t2', 't1'])

    const all = condition({
      items: [item({ tags: ['三餐', '外卖'], tagPolicy: 'all' })],
    })
    expect(ids(queryFiltered(db, all))).toEqual(['t1'])

    // any + not：没有该标签的记录（含完全没有标签的 t3）。
    const anyNot = condition({
      items: [item({ tags: ['三餐'], tagPolicy: 'any', tagNot: true })],
    })
    expect(ids(queryFiltered(db, anyNot))).toEqual(['t3'])

    // all + not：标签数不足 n 的记录都算命中（t2 有 1 个、t3 有 0 个）。
    const allNot = condition({
      items: [item({ tags: ['三餐', '外卖'], tagPolicy: 'all', tagNot: true })],
    })
    expect(ids(queryFiltered(db, allNot))).toEqual(['t3', 't2'])

    // 未知 policy 按 any 处理（既有 DAO 的 else 分支）。
    expect(
      ids(
        queryFiltered(
          db,
          condition({ items: [item({ tags: ['外卖'], tagPolicy: 'bogus' })] }),
        ),
      ),
    ).toEqual(['t1'])
  })

  it('applies a two-ended time range and ignores one-sided ranges', () => {
    const workspace = openedWorkspace()
    const db = workspace.db
    insertLedger(db, 'l1')
    seedRecords(db, [
      record('t1', 100, 'expense', 'a', 10),
      record('t2', 200, 'income', 'b', 20),
      record('t3', 300, 'expense', 'c', 30),
    ])

    expect(ids(queryFiltered(db, condition({ tsRange: [15, 25] })))).toEqual(['t2'])
    expect(queryFiltered(db, condition({ tsRange: [15] })).total).toBe(3)
    expect(queryFiltered(db, condition({ tsRange: [] })).total).toBe(3)
    expect(ids(queryFiltered(db, condition({ tsRange: [0, 15] })))).toEqual(['t1'])

    // 时间范围与条件项同时生效。
    expect(
      queryFiltered(db, condition({ tsRange: [15, 25], items: [item({ transactionType: 'expense' })] }))
        .total,
    ).toBe(0)
    expect(
      ids(
        queryFiltered(
          db,
          condition({ tsRange: [5, 15], items: [item({ transactionType: 'expense' })] }),
        ),
      ),
    ).toEqual(['t1'])
  })

  it('returns total and statistics from the same filter, independent of pagination', () => {
    const workspace = openedWorkspace()
    const db = workspace.db
    insertLedger(db, 'l1')
    insertLedger(db, 'l2')
    seedRecords(db, [
      record('t1', 100, 'expense', 'A', 10),
      record('t2', 200, 'income', 'B', 20),
      record('t3', 300, 'transfer', 'C', 30),
      record('t4', 400, 'expense', 'A', 40),
      record('t5', 999, 'expense', 'A', 15, { ledgerId: 'l2' }),
    ])

    const all = queryFiltered(db, condition())
    expect(all.total).toBe(4)
    expect(ids(all)).toEqual(['t4', 't3', 't2', 't1'])
    expect(all.statistics).toEqual({ income: 200, expense: 500, transfer: 300 })

    // queryStatistics 只看账本 + 时间范围，不带条件项。
    expect(queryStatistics(db, 'l1', [])).toEqual({
      income: 200,
      expense: 500,
      transfer: 300,
    })
    expect(queryStatistics(db, 'l1', [15, 35])).toEqual({
      income: 200,
      expense: 0,
      transfer: 300,
    })

    // 列表底部统计跟着筛选走。
    const categoryA = queryFiltered(db, condition({ items: [item({ category: 'A' })] }))
    expect(categoryA.total).toBe(2)
    expect(categoryA.statistics).toEqual({ income: 0, expense: 500, transfer: 0 })

    // 分页不进 WHERE：只取 1 条时统计仍是两笔支出的合计。
    const paged = queryFiltered(
      db,
      condition({ limit: 1, items: [item({ transactionType: 'expense' })] }),
    )
    expect(paged.total).toBe(2)
    expect(paged.items).toHaveLength(1)
    expect(paged.statistics).toEqual({ income: 0, expense: 500, transfer: 0 })

    // 空结果集：三个数都是 0。
    expect(queryFiltered(db, condition({ items: [item({ category: '不存在' })] })).statistics).toEqual(
      { income: 0, expense: 0, transfer: 0 },
    )
  })

  it('paginates with limit and offset', () => {
    const workspace = openedWorkspace()
    const db = workspace.db
    insertLedger(db, 'l1')
    seedRecords(db, [
      record('t1', 100, 'expense', 'a', 10),
      record('t2', 100, 'expense', 'a', 20),
      record('t3', 100, 'expense', 'a', 30),
      record('t4', 100, 'expense', 'a', 40),
    ])

    const limitOnly = queryFiltered(db, condition({ limit: 2 }))
    expect(ids(limitOnly)).toEqual(['t4', 't3'])
    expect(limitOnly.total).toBe(4)
    expect(limitOnly.statistics.expense).toBe(400)

    expect(ids(queryFiltered(db, condition({ limit: 2, offset: 1 })))).toEqual(['t3', 't2'])
    expect(ids(queryFiltered(db, condition({ limit: 1, offset: 2 })))).toEqual(['t2'])

    // 只有 offset（limit <= 0）：SQLite 用 LIMIT -1 OFFSET ? 表示不限制。
    expect(ids(queryFiltered(db, condition({ limit: -1, offset: 2 })))).toEqual(['t2', 't1'])

    // limit = 0 与 offset = 0 都不算分页（既有 DAO 只在 > 0 时拼子句）。
    expect(queryFiltered(db, condition({ limit: 0 })).items).toHaveLength(4)
    expect(ids(queryFiltered(db, condition({ limit: 2, offset: 0 })))).toEqual(['t4', 't3'])

    // 越界 offset 返回空列表，但 total 仍是命中总数。
    const beyond = queryFiltered(db, condition({ limit: 2, offset: 10 }))
    expect(beyond.items).toEqual([])
    expect(beyond.total).toBe(4)
  })

  it('supports every whitelisted sort field and direction', () => {
    const workspace = openedWorkspace()
    const db = workspace.db
    insertLedger(db, 'l1')
    seedRecords(db, [
      record('t1', 300, 'expense', 'b', 10),
      record('t2', 100, 'income', 'a', 30),
      record('t3', 200, 'expense', 'c', 20),
    ])

    // 默认：transaction_at desc。
    expect(ids(queryFiltered(db, condition()))).toEqual(['t2', 't3', 't1'])
    expect(ids(queryFiltered(db, condition({ sortFields: [] })))).toEqual(['t2', 't3', 't1'])

    expect(
      ids(queryFiltered(db, condition({ sortFields: [{ field: 'transactionAt', order: 'asc' }] }))),
    ).toEqual(['t1', 't3', 't2'])
    expect(
      ids(queryFiltered(db, condition({ sortFields: [{ field: 'transactionAt', order: 'desc' }] }))),
    ).toEqual(['t2', 't3', 't1'])

    // 既有 wire 的金额排序字段仍叫 price，映射到新列 amount_cents。
    expect(
      ids(queryFiltered(db, condition({ sortFields: [{ field: 'price', order: 'asc' }] }))),
    ).toEqual(['t2', 't3', 't1'])
    expect(
      ids(queryFiltered(db, condition({ sortFields: [{ field: 'price', order: 'desc' }] }))),
    ).toEqual(['t1', 't3', 't2'])

    expect(
      ids(queryFiltered(db, condition({ sortFields: [{ field: 'category', order: 'asc' }] }))),
    ).toEqual(['t2', 't1', 't3'])
    expect(
      ids(queryFiltered(db, condition({ sortFields: [{ field: 'category', order: 'desc' }] }))),
    ).toEqual(['t3', 't1', 't2'])

    // 只有 transactionType 时同类型无次序保证，只断言类型分组；再加第二字段钉住顺序。
    expect(
      queryFiltered(db, condition({ sortFields: [{ field: 'transactionType', order: 'asc' }] })).items.map(
        (entry) => entry.transactionType,
      ),
    ).toEqual(['expense', 'expense', 'income'])
    expect(
      ids(
        queryFiltered(
          db,
          condition({
            sortFields: [
              { field: 'transactionType', order: 'asc' },
              { field: 'transactionAt', order: 'asc' },
            ],
          }),
        ),
      ),
    ).toEqual(['t1', 't3', 't2'])

    // 多字段：类型升序，同类型金额降序。
    expect(
      ids(
        queryFiltered(
          db,
          condition({
            sortFields: [
              { field: 'transactionType', order: 'asc' },
              { field: 'price', order: 'desc' },
            ],
          }),
        ),
      ),
    ).toEqual(['t1', 't3', 't2'])

    // 非法字段被忽略；全部非法时回退默认排序。
    expect(
      ids(queryFiltered(db, condition({ sortFields: [{ field: 'drop table', order: 'asc' }] }))),
    ).toEqual(['t2', 't3', 't1'])
    expect(
      ids(
        queryFiltered(
          db,
          condition({
            sortFields: [
              { field: 'drop table', order: 'asc' },
              { field: 'price', order: 'asc' },
            ],
          }),
        ),
      ),
    ).toEqual(['t2', 't3', 't1'])

    // 只有精确的 "asc" 才升序，其它（含大写）按降序。
    expect(
      ids(queryFiltered(db, condition({ sortFields: [{ field: 'price', order: 'ASC' }] }))),
    ).toEqual(['t1', 't3', 't2'])

    // 白名单之外的键（含原型链上的名字）同样被忽略。
    expect(
      ids(queryFiltered(db, condition({ sortFields: [{ field: 'constructor', order: 'asc' }] }))),
    ).toEqual(['t2', 't3', 't1'])
  })

  it('updates and clears key event dates and queries linked records', () => {
    const workspace = openedWorkspace()
    const db = workspace.db
    insertLedger(db, 'l1')
    insertLedger(db, 'l2')
    db.prepare(
      'INSERT INTO key_event (id, date, title, content, color, created_at, updated_at, ledger_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run('e1', '2026-01-01', '', '', '', 1, 1, 'l1')

    seedRecords(
      db,
      [
        record('t1', 100, 'expense', 'a', 10),
        record('t2', 200, 'income', 'b', 20),
        record('t3', 300, 'expense', 'c', 30, { ledgerId: 'l2' }),
      ],
      1_700_000_000,
    )

    updateKeyEventDate(db, 't1', '2026-01-01', 1_800_000_000)
    const linked = queryById(db, 't1')
    expect(linked.keyEventDate).toBe('2026-01-01')
    expect(linked.createdAt).toBe(1_700_000_000)
    expect(linked.updatedAt).toBe(1_800_000_000)

    updateKeyEventDate(db, 't2', '2026-01-01', 1_800_000_000)
    updateKeyEventDate(db, 't3', '2026-01-01', 1_800_000_000)

    // 同一账本内按交易时间倒序；其它账本的记录不混进来。
    expect(queryByKeyEventDate(db, 'l1', '2026-01-01').map((entry) => entry.transactionId)).toEqual([
      't2',
      't1',
    ])
    expect(queryByKeyEventDate(db, 'l2', '2026-01-01').map((entry) => entry.transactionId)).toEqual([
      't3',
    ])
    expect(queryByKeyEventDate(db, 'l1', '2026-01-02')).toEqual([])

    // 关键事件本身仍然存在（关键事件表可用）。
    const eventCount = db
      .prepare('SELECT COUNT(*) AS count FROM key_event WHERE ledger_id = ? AND date = ?')
      .get('l1', '2026-01-01') as { count: number }
    expect(eventCount.count).toBe(1)

    // 解除关联：把 key_event_date 清空。
    updateKeyEventDate(db, 't1', '', 1_800_000_001)
    expect(queryByKeyEventDate(db, 'l1', '2026-01-01').map((entry) => entry.transactionId)).toEqual([
      't2',
    ])
    expect(queryById(db, 't1').keyEventDate).toBe('')
    expect(queryById(db, 't1').updatedAt).toBe(1_800_000_001)

    // 命中 0 行 → 404。
    expect(captureAppError(() => updateKeyEventDate(db, 'absent', '2026-01-01')).status).toBe(404)
  })

  it('groups chart line data by month / year and excludes outliers by default', () => {
    const workspace = openedWorkspace()
    const db = workspace.db
    insertLedger(db, 'l1')
    // 2026-01-15 与 2026-02-15（UTC 秒）。
    const january = 1_768_435_200
    const february = 1_771_113_600
    seedRecords(db, [
      record('t1', 100, 'expense', 'a', january),
      record('t2', 150, 'expense', 'a', january, { outlier: true }),
      record('t3', 300, 'expense', 'b', february),
      record('t4', 999, 'income', 'c', february),
    ])

    const expenseLine: ChartLine = {
      label: '支出',
      transactionType: 'expense',
      includeOutlier: false,
      conditions: [],
    }

    const monthly = queryChartLineData(db, 'l1', [], 'month', expenseLine)
    expect(monthly).toEqual([
      { time: '2026-01', amount: 100 },
      { time: '2026-02', amount: 300 },
    ])

    const withOutliers = queryChartLineData(db, 'l1', [], 'month', {
      ...expenseLine,
      includeOutlier: true,
    })
    expect(withOutliers[0]).toEqual({ time: '2026-01', amount: 250 })

    const yearly = queryChartLineData(db, 'l1', [], 'year', expenseLine)
    expect(yearly).toEqual([{ time: '2026', amount: 400 }])

    const incomeLine: ChartLine = { ...expenseLine, label: '收入', transactionType: 'income' }
    expect(queryChartLineData(db, 'l1', [], 'month', incomeLine)).toEqual([
      { time: '2026-02', amount: 999 },
    ])

    // 时间范围只留一月；outlier 仍默认排除。
    const januaryOnly = queryChartLineData(
      db,
      'l1',
      [1_767_225_600, 1_769_817_600],
      'month',
      expenseLine,
    )
    expect(januaryOnly).toEqual([{ time: '2026-01', amount: 100 }])

    // 条件项参与分桶：分类 a 的支出一月 100（outlier 排除），二月没有。
    const categoryLine: ChartLine = {
      ...expenseLine,
      conditions: [item({ category: 'a' })],
    }
    expect(queryChartLineData(db, 'l1', [], 'month', categoryLine)).toEqual([
      { time: '2026-01', amount: 100 },
    ])
    expect(
      queryChartLineData(db, 'l1', [], 'month', { ...categoryLine, includeOutlier: true }),
    ).toEqual([{ time: '2026-01', amount: 250 }])
  })
})

describe('transaction record tag dao', () => {
  it('creates, groups and deletes tag associations', () => {
    const workspace = openedWorkspace()
    const db = workspace.db

    seedTags(db, 't1', ['三餐', '外卖'])
    seedTags(db, 't2', ['三餐'])

    const grouped = queryByTrIds(db, ['t1', 't2'])
    expect(grouped.t1?.map((entry) => entry.tag).sort()).toEqual(['三餐', '外卖'].sort())
    expect(grouped.t2?.map((entry) => entry.tag)).toEqual(['三餐'])
    expect(grouped.t2?.[0]?.ledgerId).toBe('l1')
    expect(grouped.t2?.[0]?.transactionId).toBe('t2')

    // 空输入提前短路；查不到的 id 不产生键。
    expect(queryByTrIds(db, [])).toEqual({})
    expect(queryByTrIds(db, ['missing'])).toEqual({})

    deleteByTrId(db, 't1')
    expect(queryByTrIds(db, ['t1'])).toEqual({})
    expect(queryByTrIds(db, ['t2']).t2).toHaveLength(1)

    deleteByTag(db, 'l1', '三餐')
    expect(queryByTrIds(db, ['t2'])).toEqual({})
  })

  it('scopes deleteByTag to the given ledger', () => {
    const workspace = openedWorkspace()
    const db = workspace.db

    seedTags(db, 't1', ['三餐'], 'l1')
    seedTags(db, 't2', ['三餐'], 'l2')

    deleteByTag(db, 'l1', '三餐')

    const grouped = queryByTrIds(db, ['t1', 't2'])
    expect(grouped.t1).toBeUndefined()
    expect(grouped.t2?.map((entry) => entry.tag)).toEqual(['三餐'])
  })

  it('rejects duplicate associations through the composite primary key', () => {
    const workspace = openedWorkspace()
    const db = workspace.db

    seedTags(db, 't1', ['三餐'])
    // 新 schema 的主键是 (ledger_id, transaction_id, tag)：重插同一组值会报 UNIQUE。
    expect(() => seedTags(db, 't1', ['三餐'])).toThrow(/UNIQUE constraint failed/)

    const count = db
      .prepare('SELECT COUNT(*) AS count FROM transaction_record_tag WHERE transaction_id = ?')
      .get('t1') as { count: number }
    expect(count.count).toBe(1)

    // 先删后插（服务层的写法）可以成功。
    deleteByTrId(db, 't1')
    expect(() => seedTags(db, 't1', ['三餐'])).not.toThrow()
    expect(queryByTrIds(db, ['t1']).t1).toHaveLength(1)
  })
})
