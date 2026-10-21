import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { openDatabase } from '../../electron/db/driver'
import { openWorkspace, closeWorkspace } from '../../electron/db'
import { importSourceWorkspace, probeSourceWorkspace } from '../../electron/source/importer'

const directories: string[] = []

function temporaryDirectory(tag: string): string {
  const directory = mkdtempSync(join(tmpdir(), `tr-import-${tag}-`))
  directories.push(directory)
  return directory
}

afterEach(() => {
  closeWorkspace()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function buildSourceWorkspace(): string {
  const directory = temporaryDirectory('src')
  const database = openDatabase(join(directory, 'transactions.db'))
  database.exec(readFileSync('fixtures/source/seed.sql', 'utf8'))
  database.close()

  const assetDirectory = join(directory, 'data', 'assets', 'key_events', '2026-01-01')
  mkdirSync(assetDirectory, { recursive: true })
  writeFileSync(join(assetDirectory, 'sample.png'), Buffer.from('png'))
  return directory
}

function hash(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

describe('source probe', () => {
  it('reports a ready source workspace', () => {
    const source = buildSourceWorkspace()
    const probe = probeSourceWorkspace(source)
    expect(probe.source).toBe(true)
    expect(probe.ready).toBe(true)
    expect(probe.missingMigrations).toEqual([])
    expect(probe.counts.ledger).toBeGreaterThanOrEqual(2)
    expect(probe.counts.stock_trade).toBeGreaterThan(0)
    expect(probe.moneySums['transaction_record.amount_cents']).toBeGreaterThan(0)
    expect(probe.assetFiles).toBe(1)
  })

  it('reports a workspace that has not finished upgrading', () => {
    const source = buildSourceWorkspace()
    const database = openDatabase(join(source, 'transactions.db'))
    database.exec(
      "DELETE FROM tbl_billadm_schema_migration WHERE id = '20261018_stock_day_review'",
    )
    database.close()

    const probe = probeSourceWorkspace(source)
    expect(probe.source).toBe(true)
    expect(probe.ready).toBe(false)
    expect(probe.missingMigrations).toContain('20261018_stock_day_review')
    expect(probe.message).toContain('源格式')
  })
})

describe('source import', () => {
  it('imports rows, money totals and assets, and leaves the source untouched', async () => {
    const source = buildSourceWorkspace()
    const target = temporaryDirectory('dst')
    const sourceDatabase = join(source, 'transactions.db')
    const before = hash(sourceDatabase)

    const probe = probeSourceWorkspace(source)
    const report = await importSourceWorkspace({ sourceDir: source, targetDir: target })

    expect(report.tables.find((table) => table.table === 'ledger')?.rows).toBeGreaterThanOrEqual(2)
    expect(report.tables.find((table) => table.table === 'transaction_record')?.rows).toBe(
      probe.counts.transaction_record,
    )
    expect(report.sums.every((sum) => sum.ok)).toBe(true)
    expect(report.assets.copied).toBe(1)
    expect(existsSync(join(target, 'import-report.json'))).toBe(true)
    expect(hash(sourceDatabase)).toBe(before)

    const workspace = openWorkspace(target)
    const sourceTables = workspace.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'tbl_billadm_%'")
      .all()
    expect(sourceTables).toEqual([])

    const ledgers = workspace.db.prepare('SELECT COUNT(*) AS count FROM ledger').get() as {
      count: number
    }
    expect(ledgers.count).toBeGreaterThanOrEqual(2)

    const trades = workspace.db.prepare('SELECT COUNT(*) AS count FROM stock_trade').get() as {
      count: number
    }
    expect(trades.count).toBeGreaterThan(0)

    const imported = workspace.db
      .prepare("SELECT value FROM app_meta WHERE key = 'schema_version'")
      .get() as { value: string }
    expect(imported.value).toBe('1')
  })

  it('refuses a non-empty target directory', async () => {
    const source = buildSourceWorkspace()
    const target = temporaryDirectory('dst')
    writeFileSync(join(target, 'keep.txt'), 'x')
    await expect(importSourceWorkspace({ sourceDir: source, targetDir: target })).rejects.toThrow(
      /不是空目录/,
    )
  })

  it('refuses a target directory inside the source directory', async () => {
    const source = buildSourceWorkspace()
    await expect(
      importSourceWorkspace({ sourceDir: source, targetDir: join(source, 'nested') }),
    ).rejects.toThrow(/不能放在源目录里面/)
  })

  it('fills NOT NULL text columns when the old row has NULL', async () => {
    const source = buildSourceWorkspace()
    const database = openDatabase(join(source, 'transactions.db'))
    database.exec('UPDATE tbl_billadm_ledger SET description = NULL WHERE rowid = 1')
    database.close()

    const target = temporaryDirectory('dst')
    await importSourceWorkspace({ sourceDir: source, targetDir: target })
    const workspace = openWorkspace(target)
    const row = workspace.db
      .prepare('SELECT description FROM ledger ORDER BY created_at, rowid LIMIT 1')
      .get() as { description: string }
    expect(row.description).toBe('')
  })

  it('refuses a source that is not a source workspace', async () => {
    const empty = temporaryDirectory('empty')
    await expect(
      importSourceWorkspace({ sourceDir: empty, targetDir: temporaryDirectory('dst') }),
    ).rejects.toThrow(/未找到 transactions\.db/)
  })

  it('assigns empty ledger ids to the earliest ledger', async () => {
    const source = buildSourceWorkspace()
    const database = openDatabase(join(source, 'transactions.db'))
    const trade = database
      .prepare('SELECT id FROM tbl_billadm_stock_trade LIMIT 1')
      .get() as { id: string }
    database
      .prepare("UPDATE tbl_billadm_stock_trade SET ledger_id = '' WHERE id = ?")
      .run(trade.id)
    const earliest = database
      .prepare('SELECT id FROM tbl_billadm_ledger ORDER BY created_at, rowid LIMIT 1')
      .get() as { id: string }
    database.close()

    const target = temporaryDirectory('dst')
    await importSourceWorkspace({ sourceDir: source, targetDir: target })

    const workspace = openWorkspace(target)
    const row = workspace.db
      .prepare('SELECT ledger_id FROM stock_trade WHERE id = ?')
      .get(trade.id) as { ledger_id: string }
    expect(row.ledger_id).toBe(earliest.id)
  })
})
