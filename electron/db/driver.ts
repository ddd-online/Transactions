import { DatabaseSync } from 'node:sqlite'

import type { SnapshotProbe } from '../../shared/domain/backup'

/**
 * 数据库驱动的唯一入口。
 *
 * 目前用 Node 内置的 `node:sqlite`（Electron 与系统 Node 都自带，免原生模块/ABI 重建）。
 * 若 M0 的打包态验证不通过，只需要替换本文件为 better-sqlite3 的实现，上层不感知。
 *
 * `node:sqlite` 只出现在这个文件里：`probeDatabase` 只读打开候选备份、读 `quick_check`
 * 与 `app_meta`，上层（恢复 / 备份列表 / 打开工作空间）只消费 `SnapshotProbe`。
 */
export class Db {
  private readonly db: DatabaseSync

  constructor(path: string) {
    this.db = new DatabaseSync(path)
    try {
      this.db.exec('PRAGMA journal_mode = WAL')
      this.db.exec('PRAGMA synchronous = NORMAL')
      this.db.exec('PRAGMA busy_timeout = 5000')
      this.db.exec('PRAGMA foreign_keys = OFF')
    } catch (error) {
      // 打开一个坏到连 pragma 都跑不动的库：先把句柄放掉，否则 Windows 上文件一直被锁着
      try {
        this.db.close()
      } catch {
        // 关不掉也不要盖住原始错误
      }
      throw error
    }
  }

  exec(sql: string): void {
    this.db.exec(sql)
  }

  prepare(sql: string) {
    return this.db.prepare(sql)
  }

  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const result = fn()
      this.db.exec('COMMIT')
      return result
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  close(): void {
    this.db.close()
  }
}

export function openDatabase(path: string): Db {
  return new Db(path)
}

/** `PRAGMA quick_check` 的回包 → `'ok'` 或问题原文；一条都没回也算 ok（空库）。 */
function quickCheckOf(run: () => unknown[]): string {
  try {
    const rows = run() as Array<Record<string, unknown>>
    const values = rows.map((row) => String(Object.values(row)[0] ?? ''))
    if (values.length === 0) return 'ok'
    return values.every((value) => value.trim().toLowerCase() === 'ok') ? 'ok' : values.join('；')
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

/** 已打开的库的快速检查：打开工作空间时用，与 `probeDatabase` 同一口径。 */
export function quickCheckDetail(db: Db): string {
  return quickCheckOf(() => db.prepare('PRAGMA quick_check').all())
}

/** `app_meta` 里记的库版本与来源工作空间；没有表或读不到 → 0 / 空串。 */
function metaOf(raw: DatabaseSync): {
  hasAppMeta: boolean
  schemaVersion: number
  workspaceDir: string
} {
  const table = raw
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'app_meta'")
    .get()
  if (table === undefined) return { hasAppMeta: false, schemaVersion: 0, workspaceDir: '' }
  const versionRow = raw.prepare("SELECT value FROM app_meta WHERE key = 'schema_version'").get() as
    | { value: unknown }
    | undefined
  const parsed = Number(versionRow?.value)
  const workspaceRow = raw.prepare("SELECT value FROM app_meta WHERE key = 'workspace_dir'").get() as
    | { value: unknown }
    | undefined
  return {
    hasAppMeta: true,
    schemaVersion: Number.isInteger(parsed) && parsed > 0 ? parsed : 0,
    workspaceDir: typeof workspaceRow?.value === 'string' ? workspaceRow.value : '',
  }
}

/**
 * 给一份刚产出的快照盖上「它是从哪个工作空间来的」标记（覆盖写）。
 *
 * 自动备份的名字只到天：同一天里两个工作空间的快照形状完全一样，没有这枚标记，
 * 列表分不出归属，恢复时也无从提醒「你正在把 A 的备份盖到 B 上」。
 * `node:sqlite` 仍然只出现在这个文件里。
 */
export function stampWorkspaceDir(databasePath: string, workspaceDir: string): void {
  const raw = new DatabaseSync(databasePath)
  try {
    raw.exec('CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
    raw
      .prepare(
        "INSERT INTO app_meta(key, value) VALUES ('workspace_dir', ?) " +
          'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(workspaceDir)
  } finally {
    raw.close()
  }
}

/**
 * 只读探一份候选快照。
 *
 * 打不开（文件不存在 / 没有权限）时让异常冒出去 —— 那是"这个路径没有备份"，
 * 由调用方记成 `opened: false`；能打开但内容坏掉时回检查结果的原文。
 *
 * `deep: true` 用 `PRAGMA integrity_check`（全量）代替 `quick_check`：全量只属于备份与恢复
 * 两个显式动作，打开工作空间与列备份列表都用快速检查。
 */
export function probeDatabase(
  path: string,
  options: { deep?: boolean } = {},
): SnapshotProbe {
  const raw = new DatabaseSync(path, { readOnly: true })
  try {
    const pragma = options.deep ? 'PRAGMA integrity_check' : 'PRAGMA quick_check'
    const quickCheck = quickCheckOf(() => raw.prepare(pragma).all())
    let hasAppMeta = false
    let schemaVersion = 0
    let workspaceDir = ''
    try {
      const meta = metaOf(raw)
      hasAppMeta = meta.hasAppMeta
      schemaVersion = meta.schemaVersion
      workspaceDir = meta.workspaceDir
    } catch {
      // 坏库读不了 sqlite_master：结论已经由 quickCheck 给出，这里保持 0 / 空串
    }
    return { opened: true, hasAppMeta, schemaVersion, workspaceDir, quickCheck }
  } finally {
    try {
      raw.close()
    } catch {
      // 坏到关不掉也不影响已经读到的结论
    }
  }
}
