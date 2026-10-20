import { AppError } from '../../shared/errors'
import type { Category, Tag } from '../../shared/domain/models'
import type { Db } from '../db/driver'
import {
  countByLedgerId,
  countRecordsByCategories as countRecordsByCategoriesRow,
  countRecordsByCategory as countRecordsByCategoryRow,
  createCategory as createCategoryRow,
  deleteCategory as deleteCategoryRow,
  getMaxSort,
  listCategories,
  updateCategorySort as updateCategorySortRow,
} from '../db/dao/category'
import { createTag as createTagRow, deleteTagsByCategory } from '../db/dao/tag'
import { logError, logInfo } from '../logging'

/** 一个默认分类：`(分类名, 标签名列表)`。 */
export type DefaultCategory = readonly [name: string, tags: readonly string[]]

/** 一个交易类型下的默认分类集合：`(交易类型, 分类列表)`。 */
export type DefaultCategoryGroup = readonly [
  transactionType: string,
  categories: readonly DefaultCategory[],
]

/**
 * 默认分类与标签（逐字固定，改动即破坏既有工作空间的数据兼容）：
 * 交易类型 → 分类名 → 标签名列表。共 19 个分类 / 57 个标签。
 */
export const DEFAULT_DATA: readonly DefaultCategoryGroup[] = [
  [
    'expense',
    [
      [
        '餐饮美食',
        ['三餐', '零食', '商场', '外卖', '饮料', '奶茶', '咖啡', '水果', '茶叶', '买菜'],
      ],
      [
        '购物消费',
        [
          '衣物',
          '数码',
          '家居',
          '书籍',
          '礼物',
          '玩具',
          '宠物',
          '游戏',
          '快递',
          '彩票',
          '电影',
          '运动',
          '酒店',
          '烟酒',
          '充值',
          '汽车',
          '还款',
        ],
      ],
      ['交通出行', ['打车', '地铁', '公交', '高铁', '油费', '停车', 'ETC', '车险']],
      ['生活缴费', ['房租', '物业', '燃气', '水费', '电费', '通讯', '还款', '网费', '理发']],
      ['贷款还款', []],
      ['医疗健康', ['医药', '医险']],
      ['娱乐休闲', []],
      ['人情往来', ['红包', '请客', '礼金']],
      ['教育学习', []],
    ],
  ],
  [
    'income',
    [
      ['工资奖金', ['工资', '奖金']],
      ['补贴补助', []],
      ['退税退款', []],
      ['二手转卖', []],
      ['彩票收入', []],
      ['投资理财', []],
      ['借贷借款', []],
      ['红包转账', []],
    ],
  ],
  [
    'transfer',
    [
      ['五险一金', ['养老', '医疗', '失业', '住房']],
      ['税费党费', ['团费', '交税']],
    ],
  ],
]

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 底层错误 → 500 + 原始错误文本（与旧 `ServiceError::Database` 的收敛方式一致）：
 * 排障信息不丢，重复插入仍能在文案里看到 `UNIQUE constraint failed`。
 */
function internalError(action: string, error: unknown): AppError {
  const message = errorText(error)
  logError(`${action}: ${message}`)
  return new AppError(message, { status: 500 })
}

/**
 * 写入默认分类与标签，返回 `[分类数, 标签数]`。
 *
 * **不使用事务**（与旧实现一致）：逐行插入，任一行失败即整体报错（已插入的行保留）。
 */
export function seedDefaultData(db: Db, ledgerId: string): [number, number] {
  let categoryCount = 0
  let tagCount = 0

  for (const [transactionType, categories] of DEFAULT_DATA) {
    for (const [categoryName, tagNames] of categories) {
      const category: Category = {
        ledgerId,
        name: categoryName,
        transactionType,
        sortOrder: 0,
      }
      try {
        createCategoryRow(db, category)
      } catch (error) {
        throw internalError('创建分类失败', error)
      }
      categoryCount += 1

      const categoryTransactionType = `${categoryName}:${transactionType}`
      for (const tagName of tagNames) {
        const tag: Tag = {
          ledgerId,
          name: tagName,
          categoryTransactionType,
          sortOrder: 0,
        }
        try {
          createTagRow(db, tag)
        } catch (error) {
          throw internalError('创建标签失败', error)
        }
        tagCount += 1
      }
    }
  }

  return [categoryCount, tagCount]
}

/** 查询分类（`transaction_type` 为空或 `all` 时不过滤）。 */
export function queryCategory(db: Db, ledgerId: string, transactionType: string): Category[] {
  try {
    return listCategories(db, ledgerId, transactionType)
  } catch (error) {
    throw internalError('查询分类失败', error)
  }
}

/** 新建分类：排序号取当前最大值 + 1。 */
export function createCategory(
  db: Db,
  ledgerId: string,
  name: string,
  transactionType: string,
): void {
  let maxSortOrder: number
  try {
    maxSortOrder = getMaxSort(db, ledgerId, transactionType)
  } catch (error) {
    throw internalError('获取最大排序号失败', error)
  }

  const category: Category = {
    ledgerId,
    name,
    transactionType,
    sortOrder: maxSortOrder + 1,
  }
  try {
    createCategoryRow(db, category)
  } catch (error) {
    throw internalError('创建分类失败', error)
  }
}

/** 删除分类，并在**同一事务**内连带删除该分类下的标签（`分类名:交易类型`）。 */
export function deleteCategory(
  db: Db,
  ledgerId: string,
  name: string,
  transactionType: string,
): void {
  const categoryTransactionType = `${name}:${transactionType}`
  try {
    db.transaction(() => {
      deleteTagsByCategory(db, ledgerId, categoryTransactionType)
      deleteCategoryRow(db, ledgerId, name, transactionType)
    })
  } catch (error) {
    throw internalError('删除分类失败', error)
  }
}

/** 更新分类排序号。 */
export function updateCategorySort(
  db: Db,
  ledgerId: string,
  name: string,
  transactionType: string,
  sortOrder: number,
): void {
  try {
    updateCategorySortRow(db, ledgerId, name, transactionType, sortOrder)
  } catch (error) {
    throw internalError('更新分类排序失败', error)
  }
}

/** 单个分类名下的交易记录数。 */
export function countRecordsByCategory(
  db: Db,
  ledgerId: string,
  category: string,
): number {
  try {
    return countRecordsByCategoryRow(db, ledgerId, category)
  } catch (error) {
    throw internalError('统计分类记录数失败', error)
  }
}

/** 批量统计每个分类名下的交易记录数（空名单直接返回空对象）。 */
export function countRecordsByCategories(
  db: Db,
  ledgerId: string,
  names: readonly string[],
): Record<string, number> {
  try {
    return countRecordsByCategoriesRow(db, ledgerId, names)
  } catch (error) {
    throw internalError('统计分类记录数失败', error)
  }
}

/**
 * 为账本初始化默认分类与标签，返回 `[分类数, 标签数]`。
 *
 * 已有分类时报错（文案："该账本已有分类，无需初始化"）。
 * 该错误在旧实现里走 `ServiceError::Internal` 兜底为 500，不是 400。
 */
export function initializeCategories(db: Db, ledgerId: string): [number, number] {
  logInfo(`开始初始化账本 ${ledgerId} 的分类`)

  let count: number
  try {
    count = countByLedgerId(db, ledgerId)
  } catch (error) {
    throw internalError('检查分类是否存在失败', error)
  }
  if (count > 0) {
    throw new AppError('该账本已有分类，无需初始化', { status: 500 })
  }

  let counts: [number, number]
  try {
    counts = seedDefaultData(db, ledgerId)
  } catch (error) {
    logError(`初始化分类失败: ${errorText(error)}`)
    throw error
  }

  logInfo(`初始化分类成功, 账本: ${ledgerId}, 分类: ${counts[0]}, 标签: ${counts[1]}`)
  return counts
}
