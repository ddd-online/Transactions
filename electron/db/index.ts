import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import schemaSql from './schema/0001_init.sql?raw'
import { Db, openDatabase } from './driver'
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

function readMeta(db: Db, key: string): string | null {
  const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

function initializeSchema(db: Db): void {
  db.exec(schemaSql)
}

function validateSchema(db: Db): void {
  const version = readMeta(db, 'schema_version')
  if (version !== '1') {
    throw new AppError(`不认识的库格式（schema_version=${version ?? '缺失'}）`, {
      status: 409,
    })
  }
}

/**
 * 打开（或创建）一个工作空间。
 *
 * 顺序即契约：校验路径 → 建目录 → 打开库 → 旧库识别 → 建库/校验 → 记住当前工作空间。
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
    if (!tableExists(db, 'app_meta')) {
      if (isNew) {
        initializeSchema(db)
      } else {
        throw new AppError('不是 Transactions 工作空间：缺少 app_meta', {
          code: ERR_CODE_DEFAULT,
          status: 409,
        })
      }
    }
    validateSchema(db)
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
