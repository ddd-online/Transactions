import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { closeWorkspace, currentWorkspace, hasWorkspace, openWorkspace } from '../../electron/db'
import { openDatabase } from '../../electron/db/driver'
import { MIGRATIONS } from '../../electron/db/migrate'
import { AppError, ERR_CODE_SOURCE_WORKSPACE } from '../../shared/errors'

const directories: string[] = []

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'tr-db-test-'))
  directories.push(directory)
  return directory
}

afterEach(() => {
  closeWorkspace()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('workspace database', () => {
  it('creates a new workspace from the init schema', () => {
    const directory = temporaryDirectory()
    const workspace = openWorkspace(directory)

    expect(hasWorkspace()).toBe(true)
    expect(currentWorkspace()?.databasePath).toBe(join(directory, 'transactions.db'))

    const meta = workspace.db.prepare('SELECT value FROM app_meta WHERE key = ?').get('schema_version') as
      | { value: string }
      | undefined
    /* 新建的工作空间跑完全部迁移，落库的是**最新**版本（迁移 v2 加了每日复盘模板列）。 */
    expect(meta?.value).toBe(String(MIGRATIONS[MIGRATIONS.length - 1].version))

    workspace.db
      .prepare('INSERT INTO ledger (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('l1', '默认账本', 1, 1)
    const row = workspace.db.prepare('SELECT name FROM ledger WHERE id = ?').get('l1') as
      | { name: string }
      | undefined
    expect(row?.name).toBe('默认账本')
  })

  it('rolls back a failed transaction', () => {
    const workspace = openWorkspace(temporaryDirectory())
    expect(() =>
      workspace.db.transaction(() => {
        workspace.db
          .prepare('INSERT INTO ledger (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
          .run('l1', 'A', 1, 1)
        throw new Error('boom')
      }),
    ).toThrow('boom')

    const count = workspace.db.prepare('SELECT COUNT(*) AS count FROM ledger').get() as {
      count: number
    }
    expect(count.count).toBe(0)
  })

  it('rejects a source workspace with the dedicated error code', () => {
    const directory = temporaryDirectory()
    const source = openDatabase(join(directory, 'transactions.db'))
    source.exec('CREATE TABLE tbl_billadm_schema_migration (id TEXT, applied_at INTEGER)')
    source.close()

    try {
      openWorkspace(directory)
      throw new Error('应当拒绝源库')
    } catch (error) {
      expect(error).toBeInstanceOf(AppError)
      expect((error as AppError).code).toBe(ERR_CODE_SOURCE_WORKSPACE)
    }
  })

  it('rejects an existing database with an unknown app_meta version', () => {
    const directory = temporaryDirectory()
    const database = openDatabase(join(directory, 'transactions.db'))
    database.exec("CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    database.exec("INSERT INTO app_meta VALUES ('schema_version', '99')")
    database.close()

    expect(() => openWorkspace(directory)).toThrow(/高于本程序支持/)
  })

  it('rejects an empty path', () => {
    expect(() => openWorkspace('   ')).toThrow(AppError)
  })

  it('keeps a single current workspace when reopening', () => {
    const first = temporaryDirectory()
    const second = temporaryDirectory()
    openWorkspace(first)
    openWorkspace(second)
    expect(currentWorkspace()?.directory).toBe(second)
    closeWorkspace()
    expect(hasWorkspace()).toBe(false)
  })
})

describe('workspace file layout', () => {
  it('leaves a readable database file on disk', () => {
    const directory = temporaryDirectory()
    openWorkspace(directory)
    writeFileSync(join(directory, 'marker.txt'), 'ok')
    expect(join(directory, 'transactions.db')).toMatch(/transactions\.db$/)
  })
})
