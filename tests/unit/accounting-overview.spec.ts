import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { closeWorkspace, openWorkspace } from '../../electron/db'
import { accountingOverview } from '../../electron/services/accounting-overview'
import { createTr } from '../../electron/services/transaction-record'
import type { TransactionRecordDto } from '../../shared/types/transaction'
import type { Db } from '../../electron/db/driver'

const directories: string[] = []

function workspaceDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'tr-overview-test-'))
  directories.push(directory)
  return directory
}

afterEach(() => {
  closeWorkspace()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function at(year: number, month: number, day: number): number {
  return Math.trunc(new Date(year, month - 1, day, 12, 0, 0).getTime() / 1000)
}

function record(
  db: Db,
  kind: string,
  category: string,
  price: number,
  timestamp: number,
): void {
  const dto: TransactionRecordDto = {
    ledgerId: 'l1',
    transactionId: '',
    price,
    transactionType: kind,
    category,
    description: '-',
    tags: [],
    transactionAt: timestamp,
    outlier: false,
    keyEventDate: '',
  }
  createTr(db, dto)
}

function ask(db: Db, kind: string, key: string) {
  return accountingOverview(db, { ledgerId: 'l1', periodKind: kind, periodKey: key })
}

describe('accounting overview', () => {
  it('counts every expense category, ignores transfer, and keeps balance in the same period', () => {
    const db = openWorkspace(workspaceDirectory()).db
    record(db, 'income', '工资奖金', 100_000, at(2025, 3, 10))
    record(db, 'expense', '房产房贷', 50_000, at(2025, 3, 1))
    record(db, 'expense', '餐饮美食', 2_000, at(2025, 3, 5))
    record(db, 'expense', '购物消费', 3_000, at(2025, 3, 6))
    record(db, 'transfer', '五险一金', 1_000, at(2025, 3, 10))

    const reply = ask(db, 'month', '2025-03')
    expect(reply.cards).toEqual({ expense: 55_000, income: 100_000, balance: 45_000 })
    expect(reply.categories.map((item) => item.label)).toEqual([
      '房产房贷',
      '购物消费',
      '餐饮美食',
    ])
    expect(reply.categories.reduce((sum, item) => sum + item.amount, 0)).toBe(55_000)
    expect(reply.period).toMatchObject({
      kind: 'month',
      key: '2025-03',
      label: '2025年3月',
      isCurrent: false,
      throughDay: null,
      year: 2025,
    })
  })

  it('returns empty cards for a period with no records', () => {
    const db = openWorkspace(workspaceDirectory()).db
    record(db, 'expense', '餐饮美食', 2_000, at(2025, 3, 5))
    const reply = ask(db, 'month', '2019-07')
    expect(reply.cards).toEqual({ expense: null, income: null, balance: null })
    expect(reply.categories).toEqual([])
  })

  it('uses the same period for balance and supports year views', () => {
    const db = openWorkspace(workspaceDirectory()).db
    record(db, 'income', '工资奖金', 100_000, at(2025, 1, 10))
    record(db, 'expense', '房产房贷', 50_000, at(2025, 3, 1))

    const march = ask(db, 'month', '2025-03')
    expect(march.cards.balance).toBe(-50_000)

    const year = ask(db, 'year', '2025')
    expect(year.cards).toEqual({ expense: 50_000, income: 100_000, balance: 50_000 })
    expect(year.period).toMatchObject({ kind: 'year', key: '2025', label: '2025年', year: 2025 })
  })

  it('merges slices beyond the top eight into 其他', () => {
    const db = openWorkspace(workspaceDirectory()).db
    for (let index = 0; index < 10; index += 1) {
      record(db, 'expense', `分类${index}`, (index + 1) * 100, at(2025, 3, index + 1))
    }
    const reply = ask(db, 'month', '2025-03')
    expect(reply.categories).toHaveLength(9)
    const other = reply.categories[8]
    expect(other.isOther).toBe(true)
    expect(other.label).toBe('其他')
    expect(other.amount).toBe(100 + 200)
    expect(other.count).toBe(2)
    expect(reply.categories.slice(0, 8).every((item) => !item.isOther)).toBe(true)
  })
})
