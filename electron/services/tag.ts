import { AppError } from '../../shared/errors'
import type { Tag } from '../../shared/domain/models'
import type { Db } from '../db/driver'
import {
  countRecordsByTags as countRecordsByTagsRow,
  createTag as createTagRow,
  deleteRecordTagsByTag,
  deleteTag as deleteTagRow,
  getMaxSort,
  listTags,
  updateTagSort as updateTagSortRow,
} from '../db/dao/tag'
import { logError } from '../logging'

/**
 * 标签服务（与既有实现 一致：无状态函数 + 显式 Db 入参）。
 *
 * 删除标签时"先删交易记录上的关联、再删标签本身"的顺序与事务边界是硬约定。
 */

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 底层错误 → 500 + 原始错误文本（与既有 `ServiceError::Database` 的收敛方式一致）。 */
function internalError(action: string, error: unknown): AppError {
  const message = errorText(error)
  logError(`${action}: ${message}`)
  return new AppError(message, { status: 500 })
}

/** 查询标签（`category_transaction_type` 为空或 `all` 时不过滤）。 */
export function queryTags(
  db: Db,
  ledgerId: string,
  categoryTransactionType: string,
): Tag[] {
  try {
    return listTags(db, ledgerId, categoryTransactionType)
  } catch (error) {
    throw internalError('查询标签失败', error)
  }
}

/** 新建标签：排序号取当前最大值 + 1。 */
export function createTag(
  db: Db,
  ledgerId: string,
  name: string,
  categoryTransactionType: string,
): void {
  let maxSortOrder: number
  try {
    maxSortOrder = getMaxSort(db, ledgerId, categoryTransactionType)
  } catch (error) {
    throw internalError('获取最大排序号失败', error)
  }

  const tag: Tag = {
    ledgerId,
    name,
    categoryTransactionType,
    sortOrder: maxSortOrder + 1,
  }
  try {
    createTagRow(db, tag)
  } catch (error) {
    throw internalError('创建标签失败', error)
  }
}

/** 删除标签：先删交易记录上的该标签关联，再删标签本身（单事务）。 */
export function deleteTag(
  db: Db,
  ledgerId: string,
  name: string,
  categoryTransactionType: string,
): void {
  try {
    db.transaction(() => {
      deleteRecordTagsByTag(db, ledgerId, name)
      deleteTagRow(db, ledgerId, name, categoryTransactionType)
    })
  } catch (error) {
    throw internalError('删除标签失败', error)
  }
}

/** 更新标签排序号。 */
export function updateTagSort(
  db: Db,
  ledgerId: string,
  name: string,
  categoryTransactionType: string,
  sortOrder: number,
): void {
  try {
    updateTagSortRow(db, ledgerId, name, categoryTransactionType, sortOrder)
  } catch (error) {
    throw internalError('更新标签排序失败', error)
  }
}

/** 批量统计每个标签名下的关联交易数（空名单直接返回空对象）。 */
export function countRecordsByTags(
  db: Db,
  ledgerId: string,
  names: readonly string[],
): Record<string, number> {
  try {
    return countRecordsByTagsRow(db, ledgerId, names)
  } catch (error) {
    throw internalError('统计标签记录数失败', error)
  }
}
