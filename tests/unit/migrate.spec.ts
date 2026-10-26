import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { openDatabase } from '../../electron/db/driver'
import { MIGRATIONS, migrate, schemaVersion, type Migration } from '../../electron/db/migrate'
import { openWorkspace, closeWorkspace } from '../../electron/db'

const directories: string[] = []

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'tr-migrate-test-'))
  directories.push(directory)
  return directory
}

afterEach(() => {
  closeWorkspace()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('migration runner', () => {
  it('applies the init migration to a fresh database', () => {
    const path = join(temporaryDirectory(), 'transactions.db')
    const db = openDatabase(path)
    migrate(db, path)
    expect(schemaVersion(db)).toBe(4)
    expect(MIGRATIONS).toHaveLength(4)
    db.close()
  })

  it('is idempotent', () => {
    const path = join(temporaryDirectory(), 'transactions.db')
    const db = openDatabase(path)
    migrate(db, path)
    migrate(db, path)
    expect(schemaVersion(db)).toBe(4)
    db.close()
  })

  it('backs up an existing database before upgrading and keeps only one .bak', () => {
    const directory = temporaryDirectory()
    const path = join(directory, 'transactions.db')
    const db = openDatabase(path)
    migrate(db, path)

    const version5: Migration = {
      version: 5,
      name: 'add-note',
      sql: 'ALTER TABLE ledger ADD COLUMN note TEXT NOT NULL DEFAULT "";',
    }

    migrate(db, path, [...MIGRATIONS, version5])
    expect(schemaVersion(db)).toBe(5)
    expect(existsSync(`${path}.bak`)).toBe(true)

    const version6: Migration = {
      version: 6,
      name: 'add-note-2',
      sql: 'ALTER TABLE ledger ADD COLUMN note2 TEXT NOT NULL DEFAULT "";',
    }
    migrate(db, path, [...MIGRATIONS, version5, version6])
    expect(schemaVersion(db)).toBe(6)
    expect(existsSync(`${path}.bak`)).toBe(true)
    db.close()
  })

  it('refuses a database newer than this program', () => {
    const path = join(temporaryDirectory(), 'transactions.db')
    const db = openDatabase(path)
    migrate(db, path)
    db.exec("UPDATE app_meta SET value = '99' WHERE key = 'schema_version'")
    expect(() => migrate(db, path)).toThrow(/高于本程序支持/)
    db.close()
  })

  it('rejects a non-contiguous migration list', () => {
    const path = join(temporaryDirectory(), 'transactions.db')
    const db = openDatabase(path)
    expect(() =>
      migrate(db, path, [
        { version: 1, name: 'a', sql: 'SELECT 1' },
        { version: 3, name: 'b', sql: 'SELECT 1' },
      ]),
    ).toThrow(/连续递增/)
    db.close()
  })

  it('rolls back a failed migration', () => {
    const path = join(temporaryDirectory(), 'transactions.db')
    const db = openDatabase(path)
    const bad: Migration = { version: 5, name: 'bad', sql: 'THIS IS NOT SQL' }
    expect(() => migrate(db, path, [...MIGRATIONS, bad])).toThrow()
    expect(schemaVersion(db)).toBe(4)
    db.close()
  })

  it('opens a workspace through the same runner', () => {
    const workspace = openWorkspace(temporaryDirectory())
    expect(schemaVersion(workspace.db)).toBe(4)
  })
})
