import { randomUUID } from 'node:crypto'

import { AppError } from '../../shared/errors'
import type { Ledger } from '../../shared/domain/models'
import type { Db } from '../db/driver'
import {
  createLedger as createLedgerRow,
  deleteLedgerCascade,
  findLedger,
  listLedgers,
  updateLedger as updateLedgerRow,
} from '../db/dao/ledger'
import { logError } from '../logging'

/** 账本服务：无状态函数 + 显式 Db 入参（与旧 tr-service 的自由函数风格一致）。 */
export function createLedger(db: Db, name: string, description: string): string {
  const id = randomUUID()
  try {
    createLedgerRow(db, { id, name, description })
    return id
  } catch (error) {
    logError(`创建账本失败, name: ${name}, err: ${String(error)}`)
    throw new AppError('创建账本失败', { status: 500 })
  }
}

export function modifyLedger(
  db: Db,
  ledgerId: string,
  name: string,
  description: string,
): void {
  try {
    updateLedgerRow(db, { id: ledgerId, name, description })
  } catch (error) {
    logError(`修改账本失败, id: ${ledgerId}, err: ${String(error)}`)
    throw new AppError('修改账本失败', { status: 500 })
  }
}

export function listAllLedgers(db: Db): Ledger[] {
  try {
    return listLedgers(db)
  } catch (error) {
    logError(`列出账本失败, err: ${String(error)}`)
    throw new AppError('列出账本失败', { status: 500 })
  }
}

export function queryLedgerById(db: Db, ledgerId: string): Ledger {
  let ledger: Ledger | null
  try {
    ledger = findLedger(db, ledgerId)
  } catch (error) {
    logError(`按 ID 查询账本失败, id: ${ledgerId}, err: ${String(error)}`)
    throw new AppError('查询账本失败', { status: 500 })
  }
  if (!ledger) {
    throw new AppError('账本不存在', { status: 404 })
  }
  return ledger
}

/** 删除账本及其全部业务数据（单事务级联；图片文件清理由 assets 服务接管）。 */
export function deleteLedgerById(db: Db, ledgerId: string): void {
  try {
    deleteLedgerCascade(db, ledgerId)
  } catch (error) {
    logError(`删除账本失败, id: ${ledgerId}, err: ${String(error)}`)
    throw new AppError('删除账本失败', { status: 500 })
  }
}
