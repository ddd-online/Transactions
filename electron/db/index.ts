import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { Db, openDatabase } from './driver'
import { migrate } from './migrate'
import { AppError, ERR_CODE_DEFAULT, legacyWorkspace } from '../../shared/errors'

export interface OpenedWorkspace {
  directory: string
  databasePath: string
  db: Db
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
 * 顺序即契约：校验路径 → 建目录 → 打开库 → 旧库识别 → 建库/升级 → 记住当前工作空间。
 */
export function openWorkspace(directory: string): OpenedWorkspace {
  const raw = directory.trim()
  if (!raw) {
    throw new AppError('工作目录路径不能为空', { status: 400 })
  }

  mkdirSync(raw, { recursive: true })
  const databasePath = join(raw, 'transactions.db')
  const isNew = !existsSync(databasePath)
  const db = openDatabase(databasePath)

  try {
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
    throw error
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
