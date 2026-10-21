import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { openDatabase } from '../../electron/db/driver'
import { openWorkspace, closeWorkspace } from '../../electron/db'
import { AppError, ERR_CODE_COMPAT_WORKSPACE } from '../../shared/errors'

const directories: string[] = []

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'tr-compat-fixture-'))
  directories.push(directory)
  return directory
}

afterEach(() => {
  closeWorkspace()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function buildCompatDatabase(): string {
  const directory = temporaryDirectory()
  const database = openDatabase(join(directory, 'transactions.db'))
  database.exec(readFileSync('fixtures/compat/seed.sql', 'utf8'))
  database.close()
  return directory
}

describe('compat seed fixture', () => {
  it('builds a 源格式-shaped database with the expected content', () => {
    const directory = buildCompatDatabase()
    const database = openDatabase(join(directory, 'transactions.db'))

    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'tbl_billadm_%'")
      .all() as Array<{ name: string }>
    expect(tables.length).toBeGreaterThanOrEqual(20)

    const ledgers = database.prepare('SELECT COUNT(*) AS count FROM tbl_billadm_ledger').get() as {
      count: number
    }
    expect(ledgers.count).toBeGreaterThanOrEqual(2)

    const trades = database
      .prepare('SELECT COUNT(*) AS count FROM tbl_billadm_stock_trade')
      .get() as { count: number }
    expect(trades.count).toBeGreaterThan(0)

    const migrations = database
      .prepare('SELECT COUNT(*) AS count FROM tbl_billadm_schema_migration')
      .get() as { count: number }
    expect(migrations.count).toBeGreaterThanOrEqual(15)

    database.close()
  })

  it('is recognized as a compat workspace by the new app', () => {
    const directory = buildCompatDatabase()
    try {
      openWorkspace(directory)
      throw new Error('应当拒绝源库')
    } catch (error) {
      expect(error).toBeInstanceOf(AppError)
      expect((error as AppError).code).toBe(ERR_CODE_COMPAT_WORKSPACE)
    }
  })
})
