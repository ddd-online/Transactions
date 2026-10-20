import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { closeWorkspace, openWorkspace } from '../../electron/db'
import { LEDGER_CASCADE } from '../../electron/db/dao/ledger'
import {
  createLedger,
  deleteLedgerById,
  listAllLedgers,
  modifyLedger,
  queryLedgerById,
} from '../../electron/services/ledger'
import { AppError } from '../../shared/errors'

const directories: string[] = []

function workspaceDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'tr-ledger-test-'))
  directories.push(directory)
  return directory
}

afterEach(() => {
  closeWorkspace()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('ledger service', () => {
  it('creates, lists, updates and queries ledgers', () => {
    const workspace = openWorkspace(workspaceDirectory())
    const first = createLedger(workspace.db, '默认账本', '说明')
    const second = createLedger(workspace.db, '第二个', '')

    const all = listAllLedgers(workspace.db)
    expect(all.map((ledger) => ledger.id)).toEqual([first, second])
    expect(all[0]?.name).toBe('默认账本')

    modifyLedger(workspace.db, first, '改名', '新说明')
    expect(queryLedgerById(workspace.db, first).name).toBe('改名')
    expect(queryLedgerById(workspace.db, first).description).toBe('新说明')
  })

  it('reports a missing ledger as 404', () => {
    const workspace = openWorkspace(workspaceDirectory())
    try {
      queryLedgerById(workspace.db, 'absent')
      throw new Error('应当抛错')
    } catch (error) {
      expect(error).toBeInstanceOf(AppError)
      expect((error as AppError).status).toBe(404)
      expect((error as AppError).message).toBe('账本不存在')
    }
  })

  it('deletes a ledger and cascades every ledger-scoped table only for that ledger', () => {
    const workspace = openWorkspace(workspaceDirectory())
    const removed = createLedger(workspace.db, '待删', '')
    const kept = createLedger(workspace.db, '保留', '')

    for (const ledgerId of [removed, kept]) {
      workspace.db
        .prepare(
          'INSERT INTO transaction_record (transaction_id, ledger_id, amount_cents, transaction_type, category, transaction_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(`tr-${ledgerId}`, ledgerId, 100, 'expense', '餐饮美食', 1, 1, 1)
      workspace.db
        .prepare(
          'INSERT INTO category (ledger_id, name, transaction_type, sort_order) VALUES (?, ?, ?, ?)',
        )
        .run(ledgerId, '餐饮美食', 'expense', 0)
    }

    deleteLedgerById(workspace.db, removed)

    expect(listAllLedgers(workspace.db).map((ledger) => ledger.id)).toEqual([kept])
    const removedRecords = workspace.db
      .prepare('SELECT COUNT(*) AS count FROM transaction_record WHERE ledger_id = ?')
      .get(removed) as { count: number }
    expect(removedRecords.count).toBe(0)
    const keptRecords = workspace.db
      .prepare('SELECT COUNT(*) AS count FROM transaction_record WHERE ledger_id = ?')
      .get(kept) as { count: number }
    expect(keptRecords.count).toBe(1)
  })

  it('cascade list covers every table that has a ledger_id column', () => {
    const workspace = openWorkspace(workspaceDirectory())
    const tables = workspace.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>

    const scoped = tables
      .map((row) => row.name)
      .filter((table) => {
        const columns = workspace.db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{
          name: string
        }>
        return columns.some((column) => column.name === 'ledger_id')
      })

    for (const table of scoped) {
      const covered = LEDGER_CASCADE.some((sql) => sql.includes(` ${table} `))
      expect(covered, `${table} 带 ledger_id 但未纳入级联`).toBe(true)
    }
  })
})
