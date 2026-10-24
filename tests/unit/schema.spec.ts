import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { closeWorkspace, openWorkspace } from '../../electron/db'

const directories: string[] = []

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'tr-schema-test-'))
  directories.push(directory)
  return directory
}

afterEach(() => {
  closeWorkspace()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function tableNames(): string[] {
  const workspace = openWorkspace(temporaryDirectory())
  const rows = workspace.db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all() as Array<{ name: string }>
  return rows.map((row) => row.name)
}

function columns(table: string): string[] {
  const workspace = openWorkspace(temporaryDirectory())
  const rows = workspace.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return rows.map((row) => row.name)
}

describe('schema v1', () => {
  it('creates every business table', () => {
    const names = tableNames()
    for (const expected of [
      'app_meta',
      'ledger',
      'transaction_record',
      'transaction_record_tag',
      'category',
      'tag',
      'transaction_template',
      'chart',
      'key_event',
      'key_event_image',
      'diary_entry',
      'stock_account',
      'stock_fee_setting',
      'stock_fund_record',
      'stock_position',
      'stock_trade',
      'stock_trade_history',
      'stock_trade_round',
      'stock_trade_tag_setting',
      'stock_operation',
      'stock_review_setting',
      'stock_day_review',
      'todo_card',
      'todo_item',
      'todo_progress',
    ]) {
      expect(names, expected).toContain(expected)
    }
    expect(names.some((name) => name.startsWith('tbl_billadm_'))).toBe(false)
  })

  it('uses explicit money / price / time units', () => {
    expect(columns('transaction_record')).toContain('amount_cents')
    expect(columns('transaction_record')).not.toContain('price')

    const trade = columns('stock_trade')
    expect(trade).toEqual(
      expect.arrayContaining([
        'price_milli',
        'amount_cents',
        'fee_cents',
        'commission_cents',
        'stamp_duty_cents',
        'transfer_fee_cents',
        'realized_pnl_cents',
        'round_min_commission_cents',
      ]),
    )
    expect(trade).not.toContain('price')
    expect(trade).not.toContain('amount')

    expect(columns('stock_fee_setting')).toContain('min_commission_cents')
    expect(columns('stock_fund_record')).toEqual(
      expect.arrayContaining(['amount_change_cents', 'cash_balance_cents', 'net_pnl_cents']),
    )
  })

  it('creates the uniqueness / lookup indexes', () => {
    const workspace = openWorkspace(temporaryDirectory())
    const rows = workspace.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
      .all() as Array<{ name: string }>
    const names = rows.map((row) => row.name)
    for (const expected of [
      'idx_key_event_ledger_date',
      'idx_diary_entry_ledger_date',
      'idx_tr_ledger_at',
      'idx_stock_position_ledger_code',
      'idx_stock_trade_round',
      'idx_todo_item_card',
      'idx_todo_progress_item',
    ]) {
      expect(names, expected).toContain(expected)
    }
  })

  it('records the schema version', () => {
    const workspace = openWorkspace(temporaryDirectory())
    const row = workspace.db
      .prepare('SELECT value FROM app_meta WHERE key = ?')
      .get('schema_version') as { value: string }
    expect(row.value).toBe('2')
  })

  it('allows inserting and reading a ledger with integer cents', () => {
    const workspace = openWorkspace(temporaryDirectory())
    workspace.db
      .prepare('INSERT INTO ledger (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('l1', '默认账本', 1, 1)
    workspace.db
      .prepare(
        'INSERT INTO transaction_record (transaction_id, ledger_id, amount_cents, transaction_type, category, transaction_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run('t1', 'l1', 12_345, 'expense', '餐饮', 100, 100, 100)

    const row = workspace.db
      .prepare('SELECT amount_cents FROM transaction_record WHERE transaction_id = ?')
      .get('t1') as { amount_cents: number }
    expect(row.amount_cents).toBe(12_345)
  })
})
