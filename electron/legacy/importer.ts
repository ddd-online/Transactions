import { createHash, randomUUID } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { DatabaseSync, backup } from 'node:sqlite'

import type { Db } from '../db/driver'
import { openDatabase } from '../db/driver'
import { migrate } from '../db/migrate'
import { AppError } from '../../shared/errors'
import type {
  LegacyImportProbe,
  LegacyImportProgress,
  LegacyImportReport,
  LegacyImportSumReport,
} from '../../shared/types/import'

/** 0.20.0 的 15 条迁移 id；缺一条就说明旧库还没升级到可导入的格式。 */
export const LEGACY_MIGRATIONS = [
  '20260101_key_event_ledger_date_composite_unique',
  '20260101_key_event_image_backfill_ledger_id',
  '20260918_stock_trade_backfill_order_id',
  '20260920_diary_ledger_scope',
  '20260925_stock_operation_log',
  '20260928_todo_tables',
  '20260929_todo_card_sort_progress_done',
  '20260929_todo_levels_snap',
  '20261009_stock_trade_price_milli',
  '20261009_stock_trade_round_fee',
  '20261015_stock_review_setting',
  '20261015_stock_position_tag',
  '20261018_category_fixed_flag',
  '20261019_category_drop_fixed_flag',
  '20261018_stock_day_review',
] as const

interface CopySpec {
  from: string
  to: string
  columns?: Record<string, string>
  insertOrIgnore?: boolean
}

const COPY_SPECS: CopySpec[] = [
  { from: 'tbl_billadm_ledger', to: 'ledger' },
  { from: 'tbl_billadm_transaction_record', to: 'transaction_record', columns: { price: 'amount_cents' } },
  { from: 'tbl_billadm_transaction_record_tag', to: 'transaction_record_tag', insertOrIgnore: true },
  { from: 'tbl_billadm_category', to: 'category' },
  { from: 'tbl_billadm_tag', to: 'tag' },
  { from: 'tbl_billadm_transaction_tpl', to: 'transaction_template' },
  { from: 'tbl_billadm_chart', to: 'chart' },
  { from: 'tbl_billadm_key_event', to: 'key_event' },
  { from: 'tbl_billadm_key_event_image', to: 'key_event_image' },
  { from: 'tbl_billadm_diary_entry', to: 'diary_entry' },
  {
    from: 'tbl_billadm_stock_account',
    to: 'stock_account',
    columns: { principal: 'principal_cents' },
  },
  {
    from: 'tbl_billadm_stock_fee_setting',
    to: 'stock_fee_setting',
    columns: { min_commission: 'min_commission_cents' },
  },
  {
    from: 'tbl_billadm_stock_fund_record',
    to: 'stock_fund_record',
    columns: {
      amount_change: 'amount_change_cents',
      cash_balance: 'cash_balance_cents',
      net_pnl: 'net_pnl_cents',
    },
  },
  {
    from: 'tbl_billadm_stock_position',
    to: 'stock_position',
    columns: { total_cost: 'total_cost_cents', realized_pnl: 'realized_pnl_cents' },
  },
  {
    from: 'tbl_billadm_stock_trade',
    to: 'stock_trade',
    columns: {
      price: 'price_milli',
      amount: 'amount_cents',
      fee: 'fee_cents',
      commission: 'commission_cents',
      stamp_duty: 'stamp_duty_cents',
      transfer_fee: 'transfer_fee_cents',
      realized_pnl: 'realized_pnl_cents',
      round_min_commission: 'round_min_commission_cents',
    },
  },
  { from: 'tbl_billadm_stock_trade_history', to: 'stock_trade_history' },
  { from: 'tbl_billadm_stock_trade_round', to: 'stock_trade_round' },
  { from: 'tbl_billadm_stock_trade_tag_setting', to: 'stock_trade_tag_setting' },
  { from: 'tbl_billadm_stock_operation', to: 'stock_operation' },
  { from: 'tbl_billadm_stock_review_setting', to: 'stock_review_setting' },
  { from: 'tbl_billadm_stock_day_review', to: 'stock_day_review' },
  { from: 'tbl_billadm_todo_card', to: 'todo_card' },
  { from: 'tbl_billadm_todo_item', to: 'todo_item' },
  { from: 'tbl_billadm_todo_progress', to: 'todo_progress' },
]

interface SumCheck {
  oldTable: string
  oldColumn: string
  newTable: string
  newColumn: string
}

const SUM_CHECKS: SumCheck[] = [
  {
    oldTable: 'tbl_billadm_transaction_record',
    oldColumn: 'price',
    newTable: 'transaction_record',
    newColumn: 'amount_cents',
  },
  {
    oldTable: 'tbl_billadm_stock_fund_record',
    oldColumn: 'amount_change',
    newTable: 'stock_fund_record',
    newColumn: 'amount_change_cents',
  },
  {
    oldTable: 'tbl_billadm_stock_fund_record',
    oldColumn: 'cash_balance',
    newTable: 'stock_fund_record',
    newColumn: 'cash_balance_cents',
  },
  {
    oldTable: 'tbl_billadm_stock_trade',
    oldColumn: 'amount',
    newTable: 'stock_trade',
    newColumn: 'amount_cents',
  },
  {
    oldTable: 'tbl_billadm_stock_trade',
    oldColumn: 'fee',
    newTable: 'stock_trade',
    newColumn: 'fee_cents',
  },
  {
    oldTable: 'tbl_billadm_stock_account',
    oldColumn: 'principal',
    newTable: 'stock_account',
    newColumn: 'principal_cents',
  },
  {
    oldTable: 'tbl_billadm_stock_position',
    oldColumn: 'total_cost',
    newTable: 'stock_position',
    newColumn: 'total_cost_cents',
  },
]

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

function tableExists(db: DatabaseSync | Db, table: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table)
  return row !== undefined
}

function tableColumns(db: DatabaseSync | Db, table: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as Array<{
    name: string
  }>
  return rows.map((row) => String(row.name))
}

function countFiles(directory: string): number {
  if (!existsSync(directory)) return 0
  let count = 0
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) count += countFiles(path)
    else count += 1
  }
  return count
}

function sumColumn(db: DatabaseSync | Db, table: string, column: string): number {
  if (!tableExists(db, table)) return 0
  const columns = tableColumns(db, table)
  if (!columns.includes(column)) return 0
  const row = db
    .prepare(`SELECT COALESCE(SUM(${quoteIdentifier(column)}), 0) AS total FROM ${quoteIdentifier(table)}`)
    .get() as { total: number | bigint }
  return Number(row.total)
}

function tableRowCount(db: DatabaseSync | Db, table: string): number {
  if (!tableExists(db, table)) return 0
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`).get() as {
    count: number | bigint
  }
  return Number(row.count)
}

/** 只读探测：旧库是否存在、是否已经是 0.20.0 格式、各表行数与金额合计。 */
export function probeLegacyWorkspace(sourceDir: string): LegacyImportProbe {
  const databasePath = join(sourceDir, 'transactions.db')
  const base: LegacyImportProbe = {
    legacy: false,
    ready: false,
    sourceDir,
    databasePath,
    migrationCount: 0,
    missingMigrations: [],
    counts: {},
    moneySums: {},
    assetFiles: countFiles(join(sourceDir, 'data', 'assets')),
    message: '未找到 transactions.db',
  }
  if (!existsSync(databasePath)) return base

  const db = new DatabaseSync(databasePath, { readOnly: true })
  try {
    if (!tableExists(db, 'tbl_billadm_schema_migration')) {
      return { ...base, message: '这不是 0.20.0 的 Transactions 工作空间（缺少迁移登记表）' }
    }
    const rows = db.prepare('SELECT id FROM tbl_billadm_schema_migration').all() as Array<{
      id: string
    }>
    const ids = rows.map((row) => String(row.id))
    const missing = LEGACY_MIGRATIONS.filter((id) => !ids.includes(id))
    const counts: Record<string, number> = {}
    for (const spec of COPY_SPECS) {
      if (tableExists(db, spec.from)) counts[spec.to] = tableRowCount(db, spec.from)
    }
    const moneySums: Record<string, number> = {}
    for (const check of SUM_CHECKS) {
      moneySums[`${check.newTable}.${check.newColumn}`] = sumColumn(db, check.oldTable, check.oldColumn)
    }
    return {
      ...base,
      legacy: true,
      ready: missing.length === 0,
      migrationCount: ids.length,
      missingMigrations: missing,
      counts,
      moneySums,
      message:
        missing.length === 0
          ? `可导入：${counts.ledger ?? 0} 个账本`
          : '旧库还没升级到 0.20.0：请先用旧版打开该工作空间完成升级',
    }
  } finally {
    db.close()
  }
}

interface CopyContext {
  source: DatabaseSync
  target: Db
  defaultLedgerId: string
  warnings: string[]
}

type SqlValue = string | number | bigint | Uint8Array | null

interface ColumnInfo {
  name: string
  notNull: boolean
  defaultValue: string | null
  type: string
}

function tableColumnInfo(db: DatabaseSync | Db, table: string): Map<string, ColumnInfo> {
  const rows = db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as Array<{
    name: string
    notnull: number
    dflt_value: string | null
    type: string
  }>
  return new Map(
    rows.map((row) => [
      String(row.name),
      {
        name: String(row.name),
        notNull: Number(row.notnull) === 1,
        defaultValue: row.dflt_value === null ? null : String(row.dflt_value),
        type: String(row.type),
      },
    ]),
  )
}

function defaultValueOf(info: ColumnInfo): SqlValue {
  if (info.defaultValue !== null) {
    const raw = info.defaultValue
    if (raw.startsWith("'") && raw.endsWith("'")) {
      return raw.slice(1, -1).replace(/''/g, "'")
    }
    if (raw.toUpperCase() === 'NULL') return null
    const numeric = Number(raw)
    if (Number.isFinite(numeric)) return numeric
    return raw
  }
  return /INT|REAL|NUMERIC|DECIMAL|DOUBLE|FLOAT/i.test(info.type) ? 0 : ''
}

function normalizeValue(
  value: unknown,
  newColumn: string,
  info: ColumnInfo | undefined,
  context: CopyContext,
): SqlValue {
  if (newColumn === 'ledger_id' && (value === null || value === '')) {
    return context.defaultLedgerId
  }
  if (value === null || value === undefined) {
    return info?.notNull ? defaultValueOf(info) : null
  }
  if (newColumn.endsWith('_cents') || newColumn.endsWith('_milli')) {
    const numeric = Number(value)
    if (!Number.isInteger(numeric)) {
      context.warnings.push(`${newColumn} 不是整数：${String(value)}（已截断）`)
      return Math.trunc(numeric)
    }
    if (!Number.isSafeInteger(numeric)) {
      context.warnings.push(`${newColumn} 超出安全整数范围：${String(value)}`)
    }
    return numeric
  }
  if (value instanceof Uint8Array) return value
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'number' || typeof value === 'string') return value
  return String(value)
}

function copyTable(context: CopyContext, spec: CopySpec): number {
  const { source, target } = context
  if (!tableExists(source, spec.from)) {
    context.warnings.push(`旧库缺少表 ${spec.from}，已跳过`)
    return 0
  }

  const targetInfo = tableColumnInfo(target, spec.to)
  const targetColumns = new Set(targetInfo.keys())
  const sourceColumns = tableColumns(source, spec.from)
  const pairs: Array<{ oldColumn: string; newColumn: string }> = []
  for (const oldColumn of sourceColumns) {
    const mapped = spec.columns?.[oldColumn] ?? oldColumn
    if (targetColumns.has(mapped)) pairs.push({ oldColumn, newColumn: mapped })
  }
  if (pairs.length === 0) {
    context.warnings.push(`${spec.from} 没有可复制的列，已跳过`)
    return 0
  }

  const selectColumns = pairs.map((pair) => quoteIdentifier(pair.oldColumn)).join(', ')
  const rows = source
    .prepare(`SELECT ${selectColumns} FROM ${quoteIdentifier(spec.from)}`)
    .all() as Array<Record<string, unknown>>

  const insertColumns = pairs.map((pair) => quoteIdentifier(pair.newColumn)).join(', ')
  const placeholders = pairs.map(() => '?').join(', ')
  const verb = spec.insertOrIgnore ? 'INSERT OR IGNORE' : 'INSERT'
  const statement = target.prepare(
    `${verb} INTO ${quoteIdentifier(spec.to)} (${insertColumns}) VALUES (${placeholders})`,
  )

  for (const row of rows) {
    const values = pairs.map((pair) =>
      normalizeValue(row[pair.oldColumn], pair.newColumn, targetInfo.get(pair.newColumn), context),
    )
    statement.run(...values)
  }
  return rows.length
}

function ensureDefaultLedger(context: CopyContext): string {
  const row = context.target
    .prepare('SELECT id FROM ledger ORDER BY created_at, rowid LIMIT 1')
    .get() as { id: string } | undefined
  if (row) return String(row.id)

  const id = randomUUID()
  const now = Math.floor(Date.now() / 1000)
  context.target
    .prepare('INSERT INTO ledger (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, '默认账本', '', now, now)
  context.warnings.push('旧库没有账本，已创建「默认账本」承载空 ledger_id 的历史数据')
  return id
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function cleanupTarget(targetDir: string, targetWasCreated: boolean): void {
  if (targetWasCreated) {
    rmSync(targetDir, { recursive: true, force: true })
    return
  }
  for (const name of ['transactions.db', 'transactions.db-wal', 'transactions.db-shm', 'import-report.json']) {
    rmSync(join(targetDir, name), { force: true })
  }
  rmSync(join(targetDir, 'data'), { recursive: true, force: true })
}

function copyAssets(sourceDir: string, targetDir: string): { copied: number; missing: string[] } {
  const sourceAssets = join(sourceDir, 'data', 'assets')
  const targetAssets = join(targetDir, 'data', 'assets')
  if (existsSync(sourceAssets)) {
    mkdirSync(targetAssets, { recursive: true })
    cpSync(sourceAssets, targetAssets, { recursive: true })
  }
  return { copied: countFiles(targetAssets), missing: [] }
}

function missingAssetReferences(source: DatabaseSync, sourceDir: string): string[] {
  const missing: string[] = []
  if (!tableExists(source, 'tbl_billadm_key_event_image')) return missing
  const rows = source
    .prepare('SELECT file_path, thumb_path FROM tbl_billadm_key_event_image')
    .all() as Array<{ file_path: string; thumb_path: string }>
  const assets = join(sourceDir, 'data', 'assets')
  for (const row of rows) {
    for (const path of [row.file_path, row.thumb_path]) {
      if (path && !existsSync(join(assets, path))) missing.push(path)
    }
  }
  return missing
}

/**
 * 一次性导入旧工作空间。
 *
 * 源目录**只读**（先做 SQLite 快照再读）；目标目录必须是空的；
 * 失败时清掉目标里的半成品；成功时写 `import-report.json`。
 */
export async function importLegacyWorkspace(options: {
  sourceDir: string
  targetDir: string
  onProgress?: (progress: LegacyImportProgress) => void
}): Promise<LegacyImportReport> {
  const sourceDir = resolve(options.sourceDir)
  const targetDir = resolve(options.targetDir)
  if (sourceDir.toLowerCase() === targetDir.toLowerCase()) {
    throw new AppError('源目录与目标目录不能相同', { status: 400 })
  }
  const relativeToSource = relative(sourceDir, targetDir)
  if (relativeToSource && !relativeToSource.startsWith('..') && !isAbsolute(relativeToSource)) {
    throw new AppError('目标目录不能放在源目录里面', { status: 400 })
  }
  if (existsSync(targetDir) && readdirSync(targetDir).length > 0) {
    throw new AppError('目标目录不是空目录，请换一个目录', { status: 409 })
  }

  const probe = probeLegacyWorkspace(sourceDir)
  if (!probe.legacy) throw new AppError(probe.message, { status: 409 })
  if (!probe.ready) throw new AppError(probe.message, { status: 409 })

  options.onProgress?.({ phase: 'probe' })

  const targetWasCreated = !existsSync(targetDir)
  mkdirSync(targetDir, { recursive: true })

  const temporary = mkdtempSync(join(tmpdir(), 'tr-legacy-import-'))
  const snapshotPath = join(temporary, 'legacy.db')
  const sourceDatabasePath = join(sourceDir, 'transactions.db')
  const sourceHashBefore = sha256File(sourceDatabasePath)

  let target: Db | null = null
  let snapshotForCleanup: DatabaseSync | null = null
  try {
    const source = new DatabaseSync(sourceDatabasePath, { readOnly: true })
    try {
      await backup(source, snapshotPath)
    } finally {
      source.close()
    }

    const sourceDigest = sha256File(snapshotPath)
    const snapshot = new DatabaseSync(snapshotPath, { readOnly: true })
    snapshotForCleanup = snapshot
    const targetDatabasePath = join(targetDir, 'transactions.db')
    const targetDb = openDatabase(targetDatabasePath)
    target = targetDb
    migrate(targetDb, targetDatabasePath)

    const warnings: string[] = []
    const tables: Array<{ table: string; rows: number }> = []
    let sums: LegacyImportSumReport[] = []

    const context: CopyContext = {
      source: snapshot,
      target: targetDb,
      defaultLedgerId: '',
      warnings,
    }

    targetDb.transaction(() => {
      const ledgerSpec = COPY_SPECS[0]
      copyTable(context, ledgerSpec)
      context.defaultLedgerId = ensureDefaultLedger(context)

      const remaining = COPY_SPECS.slice(1)
      remaining.forEach((spec, index) => {
        options.onProgress?.({
          phase: 'tables',
          table: spec.to,
          index: index + 1,
          total: remaining.length,
        })
        tables.push({ table: spec.to, rows: copyTable(context, spec) })
      })

      options.onProgress?.({ phase: 'verify' })
      sums = SUM_CHECKS.map((check) => {
        const before = sumColumn(snapshot, check.oldTable, check.oldColumn)
        const after = sumColumn(targetDb, check.newTable, check.newColumn)
        const report = {
          table: check.newTable,
          column: check.newColumn,
          before,
          after,
          ok: before === after,
        }
        if (!report.ok) {
          throw new AppError(
            `导入校验失败：${check.newTable}.${check.newColumn} 合计不一致（${before} != ${after}）`,
            { status: 500 },
          )
        }
        return report
      })

      tables.unshift({ table: 'ledger', rows: tableRowCount(targetDb, 'ledger') })
    })

    options.onProgress?.({ phase: 'assets' })
    const assets = copyAssets(sourceDir, targetDir)
    assets.missing.push(...missingAssetReferences(snapshot, sourceDir))

    const sourceHashAfter = sha256File(sourceDatabasePath)
    if (sourceHashAfter !== sourceHashBefore) {
      throw new AppError('源数据库在导入过程中被修改，已中止', { status: 500 })
    }

    const report: LegacyImportReport = {
      sourceDir,
      targetDir,
      sourceDigest,
      importedAt: Math.floor(Date.now() / 1000),
      tables,
      sums,
      assets,
      warnings,
    }
    writeFileSync(join(targetDir, 'import-report.json'), `${JSON.stringify(report, null, 2)}\n`)

    snapshot.close()
    snapshotForCleanup = null
    targetDb.close()
    target = null
    options.onProgress?.({ phase: 'done' })
    return report
  } catch (error) {
    target?.close()
    cleanupTarget(targetDir, targetWasCreated)
    throw error
  } finally {
    snapshotForCleanup?.close()
    rmSync(temporary, { recursive: true, force: true })
  }
}

/** 给测试/工具用：列出一个目录下的文件数（相对路径），便于断言资产复制。 */
export function listFiles(directory: string): string[] {
  if (!existsSync(directory)) return []
  const results: string[] = []
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) walk(path)
      else results.push(relative(directory, path))
    }
  }
  walk(directory)
  return results.sort()
}
