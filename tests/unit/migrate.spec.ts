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

const LATEST = MIGRATIONS[MIGRATIONS.length - 1].version

describe('migration runner', () => {
  it('applies the init migration to a fresh database', () => {
    const path = join(temporaryDirectory(), 'transactions.db')
    const db = openDatabase(path)
    migrate(db, path)
    expect(schemaVersion(db)).toBe(LATEST)
    db.close()
  })

  it('is idempotent', () => {
    const path = join(temporaryDirectory(), 'transactions.db')
    const db = openDatabase(path)
    migrate(db, path)
    migrate(db, path)
    expect(schemaVersion(db)).toBe(LATEST)
    db.close()
  })

  it('rewrites the two out-of-contrast event tones and leaves other colours alone', () => {
    const path = join(temporaryDirectory(), 'transactions.db')
    const db = openDatabase(path)
    // 先停在 v9：这一条要验的是「老库里已经存下的那两档色被改到新值」。
    migrate(
      db,
      path,
      MIGRATIONS.filter((migration) => migration.version < 10),
    )
    db.exec(`
      INSERT INTO key_event (id, date, title, content, color, created_at, updated_at, ledger_id)
      VALUES
        ('a', '2026-01-01', '土黄', '', '#C6963A', 1, 1, ''),
        ('b', '2026-01-02', '橘黄', '', '#D48838', 1, 1, ''),
        ('c', '2026-01-03', '砖红', '', '#D9705A', 1, 1, ''),
        ('d', '2026-01-04', '没挑色', '', NULL, 1, 1, '');
    `)

    migrate(db, path)

    const colors = db
      .prepare('SELECT id, color FROM key_event ORDER BY id')
      .all() as Array<{ id: string; color: string | null }>
    expect(colors).toEqual([
      { id: 'a', color: '#B08534' },
      { id: 'b', color: '#C17C33' },
      { id: 'c', color: '#D9705A' },
      { id: 'd', color: null },
    ])
    db.close()
  })

  it('backs up an existing database before upgrading and keeps only one .bak', () => {
    const directory = temporaryDirectory()
    const path = join(directory, 'transactions.db')
    const db = openDatabase(path)
    migrate(db, path)

    const version5: Migration = {
      version: LATEST + 1,
      name: 'add-note',
      sql: 'ALTER TABLE ledger ADD COLUMN note TEXT NOT NULL DEFAULT "";',
    }

    migrate(db, path, [...MIGRATIONS, version5])
    expect(schemaVersion(db)).toBe(LATEST + 1)
    expect(existsSync(`${path}.bak`)).toBe(true)

    const version6: Migration = {
      version: LATEST + 2,
      name: 'add-note-2',
      sql: 'ALTER TABLE ledger ADD COLUMN note2 TEXT NOT NULL DEFAULT "";',
    }
    migrate(db, path, [...MIGRATIONS, version5, version6])
    expect(schemaVersion(db)).toBe(LATEST + 2)
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
    const bad: Migration = { version: LATEST + 1, name: 'bad', sql: 'THIS IS NOT SQL' }
    expect(() => migrate(db, path, [...MIGRATIONS, bad])).toThrow()
    expect(schemaVersion(db)).toBe(LATEST)
    db.close()
  })

  it('opens a workspace through the same runner', () => {
    const workspace = openWorkspace(temporaryDirectory())
    expect(schemaVersion(workspace.db)).toBe(LATEST)
  })

  it('adds the live photo columns to an existing event image table', () => {
    const path = join(temporaryDirectory(), 'transactions.db')
    const db = openDatabase(path)
    // 上一版（v5）的库：关键事件图片还没有原图 / 实况两列
    migrate(db, path, MIGRATIONS.filter((migration) => migration.version <= 5))
    db.prepare(
      `INSERT INTO key_event_image (id, ledger_id, event_date, file_path, thumb_path, sort_order, created_at)
       VALUES ('img-1', 'l1', '2026-01-01', 'key_events/2026-01-01/a.png', 'thumb_a.jpg', 1, 0)`,
    ).run()

    migrate(db, path)

    expect(schemaVersion(db)).toBe(LATEST)
    const row = db
      .prepare('SELECT file_path, original_path, motion_path FROM key_event_image WHERE id = ?')
      .get('img-1')
    expect(row).toEqual({
      file_path: 'key_events/2026-01-01/a.png',
      original_path: '',
      motion_path: '',
    })
    db.close()
  })

  it('drops the retired income preset chart but keeps a same-named custom one', () => {
    const path = join(temporaryDirectory(), 'transactions.db')
    const db = openDatabase(path)
    // 上一版（v6）的库：三张预设图表，其中「年度收入趋势」已不再播种
    migrate(db, path, MIGRATIONS.filter((migration) => migration.version <= 6))
    const insert = db.prepare(
      `INSERT INTO chart (chart_id, ledger_id, title, granularity, chart_lines, chart_type, is_preset, sort_order, created_at, updated_at)
       VALUES (?, 'l1', ?, 'year', '[]', 'line', ?, ?, 0, 0)`,
    )
    insert.run('preset-income', '年度收入趋势', 1, 2)
    insert.run('preset-month', '月度消费趋势', 1, 0)
    insert.run('custom-income', '年度收入趋势', 0, 3)

    migrate(db, path)

    expect(schemaVersion(db)).toBe(LATEST)
    const rows = db.prepare('SELECT chart_id FROM chart ORDER BY sort_order').all() as Array<{
      chart_id: string
    }>
    expect(rows.map((row) => row.chart_id)).toEqual(['preset-month', 'custom-income'])
    db.close()
  })

  it('adds the tag-group category column to an existing chart table', () => {
    const path = join(temporaryDirectory(), 'transactions.db')
    const db = openDatabase(path)
    // 上一版（v8）的库：饼图已有分组两列，但还没有「标签分组」的分类列
    migrate(db, path, MIGRATIONS.filter((migration) => migration.version <= 8))
    db.prepare(
      `INSERT INTO chart (chart_id, ledger_id, title, granularity, chart_lines, chart_type, is_preset, sort_order, created_at, updated_at)
       VALUES ('old', 'l1', '老饼图', '', '[]', 'pie', 0, 0, 0, 0)`,
    ).run()
    db.prepare(
      "UPDATE chart SET group_field = 'category', group_transaction_type = 'expense' WHERE chart_id = 'old'",
    ).run()

    migrate(db, path)

    expect(schemaVersion(db)).toBe(LATEST)
    expect(
      db
        .prepare(
          'SELECT group_field, group_transaction_type, group_category FROM chart WHERE chart_id = ?',
        )
        .get('old'),
    ).toEqual({ group_field: 'category', group_transaction_type: 'expense', group_category: '' })
    db.close()
  })

  it('adds the broken-quote table without touching the cached limit pool', () => {
    const path = join(temporaryDirectory(), 'transactions.db')
    const db = openDatabase(path)
    // 上一版（v10）的库：断板当天的涨跌幅还没有地方存
    migrate(
      db,
      path,
      MIGRATIONS.filter((migration) => migration.version <= 10),
    )
    db.prepare(
      `INSERT INTO stock_limit_pool (trade_date, stock_code, stock_name, level, pct)
       VALUES ('2026-10-23', '600519', '贵州茅台', 2, 10.01)`,
    ).run()
    db.prepare(
      "INSERT INTO stock_limit_day (trade_date, status, count, fetched_at) VALUES ('2026-10-23', 'ok', 1, 0)",
    ).run()
    expect(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get('stock_limit_broken_quote'),
    ).toBeUndefined()

    migrate(db, path)

    expect(schemaVersion(db)).toBe(LATEST)
    // 已有的涨停池不被这一条迁移动到
    expect(db.prepare('SELECT COUNT(*) AS n FROM stock_limit_pool').get()).toEqual({ n: 1 })
    db.prepare(
      `INSERT INTO stock_limit_broken_quote (trade_date, stock_code, pct, price_milli, fetched_at)
       VALUES ('2026-10-23', '600519', -3.33, 145000, 0)`,
    ).run()
    expect(
      db.prepare('SELECT pct, price_milli FROM stock_limit_broken_quote').get(),
    ).toEqual({ pct: -3.33, price_milli: 145_000 })
    db.close()
  })

  it('adds the pie grouping columns, reading old charts back as line charts', () => {
    const path = join(temporaryDirectory(), 'transactions.db')
    const db = openDatabase(path)
    // 上一版（v7）的库：chart 表还没有分组两列
    migrate(db, path, MIGRATIONS.filter((migration) => migration.version <= 7))
    db.prepare(
      `INSERT INTO chart (chart_id, ledger_id, title, granularity, chart_lines, chart_type, is_preset, sort_order, created_at, updated_at)
       VALUES ('old', 'l1', '老图表', 'month', '[]', 'bar', 0, 0, 0, 0)`,
    ).run()

    migrate(db, path)

    expect(schemaVersion(db)).toBe(LATEST)
    expect(
      db
        .prepare(
          'SELECT group_field, group_transaction_type, chart_type FROM chart WHERE chart_id = ?',
        )
        .get('old'),
    ).toEqual({ group_field: '', group_transaction_type: '', chart_type: 'bar' })
    db.close()
  })
})
