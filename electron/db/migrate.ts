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
  {
    version: 5,
    name: 'stock_limit_pool',
    sql: `
      CREATE TABLE IF NOT EXISTS stock_limit_day (
        trade_date TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        fetched_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS stock_limit_pool (
        trade_date TEXT NOT NULL,
        stock_code TEXT NOT NULL,
        stock_name TEXT NOT NULL DEFAULT '',
        market INTEGER NOT NULL DEFAULT 0,
        price_milli INTEGER NOT NULL DEFAULT 0,
        pct REAL NOT NULL DEFAULT 0,
        amount_cents INTEGER NOT NULL DEFAULT 0,
        float_mv_cents INTEGER NOT NULL DEFAULT 0,
        turnover REAL NOT NULL DEFAULT 0,
        level INTEGER NOT NULL DEFAULT 1,
        first_seal INTEGER NOT NULL DEFAULT 0,
        last_seal INTEGER NOT NULL DEFAULT 0,
        broken_count INTEGER NOT NULL DEFAULT 0,
        seal_fund_cents INTEGER NOT NULL DEFAULT 0,
        industry TEXT NOT NULL DEFAULT '',
        stat_days INTEGER NOT NULL DEFAULT 0,
        stat_count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (trade_date, stock_code)
      );
      CREATE INDEX IF NOT EXISTS idx_stock_limit_pool_date ON stock_limit_pool(trade_date);
    `,
  },
  {
    version: 6,
    name: 'key_event_image_live_photo',
    sql: `
      ALTER TABLE key_event_image ADD COLUMN original_path TEXT NOT NULL DEFAULT '';
      ALTER TABLE key_event_image ADD COLUMN motion_path TEXT NOT NULL DEFAULT '';
    `,
  },
  {
    version: 7,
    name: 'drop_income_preset_chart',
    // 预设图表收敛到两张（月度 / 年度消费趋势）。第三张「年度收入趋势」是当年播种进去的
    // 系统数据 —— 预设曲线用户改不了，同名同预设标记的行只可能是它，直接清掉；
    // 用户自己建的同名图表（is_preset = 0）不受影响。
    sql: `
      DELETE FROM chart WHERE is_preset = 1 AND title = '年度收入趋势';
    `,
  },
  {
    version: 8,
    name: 'chart_pie_grouping',
    // 饼图的两个分组列。老图表（以及两张预设）取空串，读回就是折线图：
    // 「不分组」与「十年前的折线图」是同一件事，不需要回填。
    sql: `
      ALTER TABLE chart ADD COLUMN group_field TEXT NOT NULL DEFAULT '';
      ALTER TABLE chart ADD COLUMN group_transaction_type TEXT NOT NULL DEFAULT '';
    `,
  },
  {
    version: 9,
    name: 'chart_pie_tag_grouping',
    // 按标签分组的饼图要再点名一个分类（标签挂在「类型 + 分类」之下才读得懂）。
    // 其余分组与所有老图表取空串。
    sql: `
      ALTER TABLE chart ADD COLUMN group_category TEXT NOT NULL DEFAULT '';
    `,
  },
  {
    version: 10,
    name: 'event_tone_contrast',
    // 事件身份色里两档在纸白/画布上不够 3:1（WCAG 1.4.11，6px 圆点与 3px 竖条都是
    // 有意义的图形）：土黄 #C6963A 只有 2.57:1、橘黄 #D48838 2.72:1。各压暗一档，
    // 色相与名字都不动 —— 用户当年选的是「土黄」这一档，不是那个具体十六进制，
    // 所以老事件跟着迁移，选择器里的选中态也仍然对得上。
    // 新值见 `src/theme/event-colors.ts`。
    sql: `
      UPDATE key_event SET color = '#B08534' WHERE UPPER(TRIM(color)) = '#C6963A';
      UPDATE key_event SET color = '#C17C33' WHERE UPPER(TRIM(color)) = '#D48838';
    `,
  },
  {
    version: 11,
    name: 'stock_limit_broken_quote',
    // 断板当天的涨跌幅与价格。断板不在涨停池里，这两个数只能问行情，而行情只给
    // "最新一笔"——过了那个交易日就问不到了。所以收盘定稿那一刻把补到的写下来，
    // 之后看历史日直接读这张表；没写下的日期就是没有，不拿前后交易日顶替。
    sql: `
      CREATE TABLE IF NOT EXISTS stock_limit_broken_quote (
        trade_date TEXT NOT NULL,
        stock_code TEXT NOT NULL,
        pct REAL,
        price_milli INTEGER NOT NULL,
        fetched_at INTEGER NOT NULL,
        PRIMARY KEY (trade_date, stock_code)
      );
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
