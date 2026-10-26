import { existsSync, unlinkSync } from 'node:fs'

import schemaSql from './schema/0001_init.sql?raw'
import type { Db } from './driver'
import { AppError } from '../../shared/errors'

export interface Migration {
  version: number
  name: string
  sql: string
}

/**
 * 迁移清单：**只增不改**。
 *
 * v1 是新应用的第一份结构；源库的 15 条历史迁移不在这里（ADR 0006）。
 * 之后每次结构变更追加一条，`version` 必须连续递增。
 */
export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'init', sql: schemaSql },
  {
    version: 2,
    name: 'stock_review_daily_template',
    sql: "ALTER TABLE stock_review_setting ADD COLUMN daily_template TEXT NOT NULL DEFAULT '';",
  },
  {
    version: 3,
    name: 'stock_lesson',
    sql: `
      CREATE TABLE IF NOT EXISTS stock_lesson (
        id TEXT PRIMARY KEY,
        ledger_id TEXT NOT NULL DEFAULT '',
        text TEXT NOT NULL,
        round_id TEXT,
        stock_code TEXT NOT NULL DEFAULT '',
        stock_name TEXT NOT NULL DEFAULT '',
        round_no INTEGER NOT NULL DEFAULT 0,
        opened_at INTEGER NOT NULL DEFAULT 0,
        closed_at INTEGER NOT NULL DEFAULT 0,
        pnl_cents INTEGER NOT NULL DEFAULT 0,
        pnl_rate REAL NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_stock_lesson_ledger
        ON stock_lesson(ledger_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_stock_lesson_round
        ON stock_lesson(round_id);
    `,
  },
  {
    version: 4,
    name: 'stock_ledger',
    sql: `
      CREATE TABLE IF NOT EXISTS stock_ledger (
        id TEXT PRIMARY KEY,
        ledger_id TEXT NOT NULL DEFAULT '',
        stock_code TEXT NOT NULL DEFAULT '',
        round_id TEXT,
        why_buy TEXT NOT NULL DEFAULT '',
        stop_loss TEXT NOT NULL DEFAULT '',
        take_profit TEXT NOT NULL DEFAULT '',
        followed_system TEXT NOT NULL DEFAULT '',
        summary TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_ledger_open
        ON stock_ledger(ledger_id, stock_code) WHERE round_id IS NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_ledger_round
        ON stock_ledger(ledger_id, round_id) WHERE round_id IS NOT NULL;
    `,
  },
]

function hasMetaTable(db: Db): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'app_meta'")
    .get()
  return row !== undefined
}

export function schemaVersion(db: Db): number {
  if (!hasMetaTable(db)) return 0
  const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get('schema_version') as
    | { value: string }
    | undefined
  if (!row) return 0
  const parsed = Number(row.value)
  return Number.isInteger(parsed) ? parsed : 0
}

function setSchemaVersion(db: Db, version: number): void {
  db.prepare(
    "INSERT INTO app_meta(key, value) VALUES ('schema_version', ?) " +
      'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(String(version))
}

/** 升级前的备份：`VACUUM INTO <db>.bak`；同一工作空间只留最近一份。 */
function backupDatabase(db: Db, databasePath: string): void {
  const backupPath = `${databasePath}.bak`
  if (existsSync(backupPath)) unlinkSync(backupPath)
  const escaped = backupPath.replace(/'/g, "''")
  db.exec(`VACUUM INTO '${escaped}'`)
}

/**
 * 把数据库升到目标版本。
 *
 * 纪律：单事务（每条迁移）、幂等、版本高于程序认识时明确拒绝；
 * 从已有版本升级前先备份（失败就不升级）。
 */
export function migrate(db: Db, databasePath: string, migrations: readonly Migration[] = MIGRATIONS): void {
  if (migrations.length === 0) throw new Error('迁移清单为空')

  const sorted = [...migrations].sort((left, right) => left.version - right.version)
  for (let index = 0; index < sorted.length; index += 1) {
    const expected = index + 1
    if (sorted[index].version !== expected) {
      throw new Error(`迁移版本必须从 1 连续递增（期望 ${expected}，实际 ${sorted[index].version}）`)
    }
  }

  const target = sorted[sorted.length - 1].version
  const current = schemaVersion(db)
  if (current > target) {
    throw new AppError(`库格式版本 ${current} 高于本程序支持的 ${target}，请升级应用`, {
      status: 409,
    })
  }
  if (current === target) return

  if (current > 0) {
    backupDatabase(db, databasePath)
  }

  for (const migration of sorted) {
    if (migration.version <= current) continue
    db.transaction(() => {
      db.exec(migration.sql)
      setSchemaVersion(db, migration.version)
    })
  }
}
