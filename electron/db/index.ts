import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { Db, openDatabase, quickCheckDetail } from './driver'
import { migrate } from './migrate'
import {
  AppError,
  ERR_CODE_DEFAULT,
  corruptWorkspace,
  errorMessage,
  legacyWorkspace,
} from '../../shared/errors'

export interface OpenedWorkspace {
  directory: string
  databasePath: string
  db: Db
}

export interface OpenWorkspaceOptions {
  /**
   * 目录必须已经存在（最近工作空间里点一条被删掉的记录时用）。
   *
   * 给 `true` 时**不建目录**：替用户把一个已经删掉的路径重新建出来，
   * 只会让「这个工作空间不见了」变成「它怎么空了」。
   */
  mustExist?: boolean
}

let opened: OpenedWorkspace | null = null

function tableExists(db: Db, name: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name)
  return row !== undefined
}

/**
 * 打开（或创建）一个工作空间。
 *
 * 顺序即契约：校验路径 → （可选的）目录必须存在 → 建目录 → 打开库 → **快速检查** →
 * 源库识别 → 建库/升级 → 记住当前工作空间。
 *
 * 快速检查排在识别之前：坏库先被说成「坏了」，而不是被误报成「旧版工作空间」或
 * 「不是 Transactions 工作空间」—— 那两句都在建议用户做别的事，而真正该说的是去恢复。
 *
 * 快速检查只做 `PRAGMA quick_check`（全量 `integrity_check` 留给备份与恢复两个显式动作）：
 * 库坏了要当场说清楚「哪个文件、坏了、请从备份恢复」，绝不静默建一个空库。
 */
export function openWorkspace(
  directory: string,
  options: OpenWorkspaceOptions = {},
): OpenedWorkspace {
  const raw = directory.trim()
  if (!raw) {
    throw new AppError('工作目录路径不能为空', { status: 400 })
  }
  if (options.mustExist && !existsSync(raw)) {
    throw new AppError(`这个工作空间目录已经不存在了：${raw}`, { status: 400 })
  }

  mkdirSync(raw, { recursive: true })
  const databasePath = join(raw, 'transactions.db')
  const isNew = !existsSync(databasePath)
  let db: Db
  try {
    db = openDatabase(databasePath)
  } catch (error) {
    // 坏到连打开 / 写 pragma 都不行：同一句「库坏了」，指到恢复入口
    throw corruptWorkspace(databasePath, errorMessage(error))
  }

  try {
    if (!isNew) {
      // 打开之后的第一件事：坏页会在这里被抓住，而不是等 tableExists / migrate 抛 SQLite 原文
      const detail = quickCheckDetail(db)
      if (detail !== 'ok') {
        throw corruptWorkspace(databasePath, detail)
      }
    }
    if (tableExists(db, 'tbl_billadm_schema_migration')) {
      throw legacyWorkspace()
    }
    if (!isNew && !tableExists(db, 'app_meta')) {
      throw new AppError('不是 Transactions 工作空间：缺少 app_meta', {
        code: ERR_CODE_DEFAULT,
        status: 409,
      })
    }
    migrate(db, databasePath)
  } catch (error) {
    db.close()
    // 识别 / 迁移里冒出来的 SQLite 原文同样要翻成「坏了」；自己抛的 AppError 原样保留
    if (error instanceof AppError) throw error
    throw corruptWorkspace(databasePath, errorMessage(error))
  }

  closeWorkspace()
  opened = { directory: raw, databasePath, db }
  return opened
}

export function currentWorkspace(): OpenedWorkspace | null {
  return opened
}

export function hasWorkspace(): boolean {
  return opened !== null
}

export function closeWorkspace(): void {
  if (opened) {
    opened.db.close()
    opened = null
  }
}
