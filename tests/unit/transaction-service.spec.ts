import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { closeWorkspace, openWorkspace } from '../../electron/db'
import {
  batchCreateTr,
  createTr,
  deleteTrById,
  linkToKeyEvent,
  queryLinkedByDate,
  queryTrsForChart,
  queryTrsOnCondition,
  unlinkFromKeyEvent,
} from '../../electron/services/transaction-record'
import type {
  ChartQueryRequest,
  TransactionRecordDto,
  TrQueryCondition,
} from '../../shared/types/transaction'
import type { Db } from '../../electron/db/driver'

const directories: string[] = []

function workspaceDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'tr-service-test-'))
  directories.push(directory)
  return directory
}

afterEach(() => {
  closeWorkspace()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function dto(
  price: number,
  transactionType: string,
  category: string,
  at: number,
  tags: string[] = [],
): TransactionRecordDto {
  return {
    ledgerId: 'l1',
    transactionId: '',
    price,
    transactionType,
    category,
    description: `备注${price}`,
    tags,
    transactionAt: at,
    outlier: false,
    keyEventDate: '',
  }
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

function database(): Db {
  return openWorkspace(workspaceDirectory()).db
}

describe('transaction service', () => {
  it('creates a record with tags and leaves keyEventDate empty', () => {
    const db = database()
    const id = createTr(db, dto(12345, 'expense', '餐饮美食', 100, ['三餐', '外卖']))

    const result = queryTrsOnCondition(db, condition())
    expect(result.total).toBe(1)
    expect(result.items[0]?.transactionId).toBe(id)
    expect(result.items[0]?.price).toBe(12345)
    expect(result.items[0]?.tags).toEqual(['三餐', '外卖'])
    expect(result.items[0]?.keyEventDate).toBe('')
    expect(result.items[0]?.outlier).toBe(false)
  })

  it('validates ledger and transaction type', () => {
    const db = database()
    expect(() => createTr(db, { ...dto(1, 'expense', '餐饮美食', 1), ledgerId: '' })).toThrow(
      'LedgerID is empty',
    )
    expect(() => createTr(db, dto(1, 'nope', '餐饮美食', 1))).toThrow(
      'invalid TransactionType: nope',
    )
  })

  it('batch creates and returns the count, skipping an empty batch', () => {
    const db = database()
    expect(batchCreateTr(db, [])).toBe(0)
    expect(
      batchCreateTr(db, [
        dto(100, 'expense', '餐饮美食', 10, ['三餐']),
        dto(200, 'income', '工资奖金', 20),
      ]),
    ).toBe(2)
    const result = queryTrsOnCondition(db, condition())
    expect(result.total).toBe(2)
    expect(result.trStatistics).toEqual({ income: 200, expense: 100, transfer: 0 })
  })

  it('derives pagination metadata without feeding paging into statistics', () => {
    const db = database()
    for (let index = 0; index < 5; index += 1) {
      createTr(db, dto(100 + index, 'expense', '餐饮美食', 10 * index))
    }

    const first = queryTrsOnCondition(db, condition({ limit: 2, offset: 0 }))
    expect(first.items).toHaveLength(2)
    expect(first.page).toBe(1)
    expect(first.page_size).toBe(2)
    expect(first.total_pages).toBe(3)
    expect(first.trStatistics.expense).toBe(100 + 101 + 102 + 103 + 104)

    const second = queryTrsOnCondition(db, condition({ limit: 2, offset: 2 }))
    expect(second.page).toBe(2)
    expect(second.items).toHaveLength(2)
    expect(second.trStatistics.expense).toBe(first.trStatistics.expense)

    const unbounded = queryTrsOnCondition(db, condition())
    expect(unbounded.page).toBe(1)
    expect(unbounded.page_size).toBe(5)
  })

  it('filters by category while statistics follow the condition', () => {
    const db = database()
    createTr(db, dto(100, 'expense', '餐饮美食', 10, ['三餐']))
    createTr(db, dto(200, 'expense', '购物消费', 20))
    createTr(db, dto(300, 'income', '工资奖金', 30))

    const result = queryTrsOnCondition(
      db,
      condition({
        items: [
          {
            transactionType: '',
            category: '餐饮美食',
            tags: [],
            tagPolicy: '',
            tagNot: false,
            description: '',
          },
        ],
      }),
    )
    expect(result.total).toBe(1)
    expect(result.items).toHaveLength(1)
    expect(result.trStatistics).toEqual({ income: 0, expense: 100, transfer: 0 })
  })

  it('zero-fills the chart timeline between the min and max bucket', () => {
    const db = database()
    const january = Math.floor(Date.UTC(2026, 0, 15) / 1000)
    const march = Math.floor(Date.UTC(2026, 2, 15) / 1000)
    createTr(db, dto(100, 'expense', '餐饮美食', january))
    createTr(db, dto(300, 'expense', '餐饮美食', march))

    const request: ChartQueryRequest = {
      ledgerId: 'l1',
      tsRange: [0, 4_000_000_000],
      granularity: 'month',
      lines: [
        { label: '支出', transactionType: 'expense', includeOutlier: false, conditions: [] },
      ],
    }
    const response = queryTrsForChart(db, request)
    expect(response.lines).toHaveLength(1)
    expect(response.lines[0]?.data.map((point) => point.time)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
    ])
    expect(response.lines[0]?.data.map((point) => point.amount)).toEqual([100, 0, 300])
    expect(response.statistics.expense).toBe(400)
  })

  it('deletes the record and its tag links in one transaction', () => {
    const db = database()
    const id = createTr(db, dto(100, 'expense', '餐饮美食', 10, ['三餐']))
    deleteTrById(db, id)
    expect(queryTrsOnCondition(db, condition()).total).toBe(0)
    const links = db
      .prepare('SELECT COUNT(*) AS count FROM transaction_record_tag WHERE transaction_id = ?')
      .get(id) as { count: number }
    expect(links.count).toBe(0)
  })

  it('links to a key event, auto-creates it once, and unlinks', () => {
    const db = database()
    const id = createTr(db, dto(100, 'expense', '餐饮美食', 10, ['三餐']))

    linkToKeyEvent(db, id, '2026-01-01')
    const events = db.prepare('SELECT COUNT(*) AS count FROM key_event').get() as {
      count: number
    }
    expect(events.count).toBe(1)
    expect(queryLinkedByDate(db, 'l1', '2026-01-01')).toHaveLength(1)

    linkToKeyEvent(db, id, '2026-01-01')
    const again = db.prepare('SELECT COUNT(*) AS count FROM key_event').get() as {
      count: number
    }
    expect(again.count).toBe(1)

    unlinkFromKeyEvent(db, id)
    expect(queryLinkedByDate(db, 'l1', '2026-01-01')).toHaveLength(0)
  })

  it('reports a missing transaction with the stable link message', () => {
    const db = database()
    expect(() => linkToKeyEvent(db, 'absent', '2026-01-01')).toThrow(
      'transaction not found: absent',
    )
    expect(() => unlinkFromKeyEvent(db, 'absent')).toThrow('transaction not found: absent')
  })
})
