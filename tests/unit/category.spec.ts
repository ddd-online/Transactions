import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { closeWorkspace, openWorkspace } from '../../electron/db'
import type { Db } from '../../electron/db/driver'
import {
  countByLedgerId,
  countRecordsByCategories as countRecordsByCategoriesRow,
  countRecordsByCategory as countRecordsByCategoryRow,
  createCategory as createCategoryRow,
  deleteCategory as deleteCategoryRow,
  getMaxSort,
  listCategories,
  updateCategorySort as updateCategorySortRow,
} from '../../electron/db/dao/category'
import { listTags } from '../../electron/db/dao/tag'
import {
  DEFAULT_DATA,
  countRecordsByCategories,
  countRecordsByCategory,
  createCategory,
  deleteCategory,
  initializeCategories,
  updateCategorySort,
  type DefaultCategory,
} from '../../electron/services/category'
import { AppError } from '../../shared/errors'

const directories: string[] = []

function workspaceDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'tr-category-test-'))
  directories.push(directory)
  return directory
}

afterEach(() => {
  closeWorkspace()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function openedWorkspace() {
  return openWorkspace(workspaceDirectory())
}

function captureAppError(run: () => void): AppError {
  try {
    run()
  } catch (error) {
    if (error instanceof AppError) return error
    throw error
  }
  throw new Error('应当抛出 AppError')
}

function insertRecord(db: Db, ledgerId: string, id: string, category: string): void {
  db.prepare(
    'INSERT INTO transaction_record (transaction_id, ledger_id, amount_cents, transaction_type, category, transaction_at, created_at, updated_at) VALUES (?, ?, 100, ?, ?, 1, 1, 1)',
  ).run(id, ledgerId, 'expense', category)
}

function defaultGroup(transactionType: string): readonly DefaultCategory[] {
  const group = DEFAULT_DATA.find(([type]) => type === transactionType)
  if (!group) throw new Error(`缺少交易类型 ${transactionType}`)
  return group[1]
}

describe('category dao', () => {
  it('query orders by sort then name desc and filters type', () => {
    const workspace = openedWorkspace()

    createCategoryRow(workspace.db, {
      ledgerId: 'l1',
      name: '甲',
      transactionType: 'expense',
      sortOrder: 1,
    })
    createCategoryRow(workspace.db, {
      ledgerId: 'l1',
      name: '乙',
      transactionType: 'expense',
      sortOrder: 0,
    })
    createCategoryRow(workspace.db, {
      ledgerId: 'l1',
      name: '丙',
      transactionType: 'income',
      sortOrder: 0,
    })
    createCategoryRow(workspace.db, {
      ledgerId: 'l2',
      name: '其它账本',
      transactionType: 'expense',
      sortOrder: 0,
    })

    const all = listCategories(workspace.db, 'l1', 'all')
    // sort_order 升序；同序号按 name DESC（SQLite 二进制比较：乙(4E59) > 丙(4E19)）
    expect(all.map((item) => item.name)).toEqual(['乙', '丙', '甲'])

    const expense = listCategories(workspace.db, 'l1', 'expense')
    expect(expense.map((item) => item.name)).toEqual(['乙', '甲'])

    // 空字符串与 "all" 等价：不过滤
    expect(listCategories(workspace.db, 'l1', '')).toHaveLength(3)
  })

  it('max sort and update sort', () => {
    const workspace = openedWorkspace()

    expect(getMaxSort(workspace.db, 'l1', 'expense')).toBe(0)

    createCategoryRow(workspace.db, {
      ledgerId: 'l1',
      name: '甲',
      transactionType: 'expense',
      sortOrder: 3,
    })
    createCategoryRow(workspace.db, {
      ledgerId: 'l1',
      name: '乙',
      transactionType: 'income',
      sortOrder: 7,
    })
    expect(getMaxSort(workspace.db, 'l1', 'expense')).toBe(3)
    expect(getMaxSort(workspace.db, 'l1', 'income')).toBe(7)
    expect(getMaxSort(workspace.db, 'l1', 'transfer')).toBe(0)

    updateCategorySortRow(workspace.db, 'l1', '甲', 'expense', 9)
    const loaded = listCategories(workspace.db, 'l1', 'expense')
    expect(loaded[0].sortOrder).toBe(9)

    // 不存在的记录更新视为成功（命中 0 行不报错）
    expect(() =>
      updateCategorySortRow(workspace.db, 'l1', '不存在', 'expense', 1),
    ).not.toThrow()
  })

  it('duplicate category violates unique index', () => {
    const workspace = openedWorkspace()

    createCategoryRow(workspace.db, {
      ledgerId: 'l1',
      name: '餐饮美食',
      transactionType: 'expense',
      sortOrder: 0,
    })
    expect(() =>
      createCategoryRow(workspace.db, {
        ledgerId: 'l1',
        name: '餐饮美食',
        transactionType: 'expense',
        sortOrder: 1,
      }),
    ).toThrow(/UNIQUE constraint failed/)

    // 交易类型不同则是另一条记录（唯一键含 transaction_type）
    createCategoryRow(workspace.db, {
      ledgerId: 'l1',
      name: '餐饮美食',
      transactionType: 'income',
      sortOrder: 0,
    })
  })

  it('record counts are grouped by name', () => {
    const workspace = openedWorkspace()

    insertRecord(workspace.db, 'l1', 't1', '餐饮美食')
    insertRecord(workspace.db, 'l1', 't2', '餐饮美食')
    insertRecord(workspace.db, 'l1', 't3', '购物消费')
    insertRecord(workspace.db, 'l2', 't4', '餐饮美食')

    expect(countRecordsByCategoryRow(workspace.db, 'l1', '餐饮美食')).toBe(2)

    const names = ['餐饮美食', '购物消费', '无记录']
    const counts = countRecordsByCategoriesRow(workspace.db, 'l1', names)
    expect(Object.keys(counts)).toHaveLength(2)
    expect(counts['餐饮美食']).toBe(2)
    expect(counts['购物消费']).toBe(1)
    expect(counts['无记录']).toBeUndefined()

    // 空名单不查库（提前返回）
    expect(countRecordsByCategoriesRow(workspace.db, 'l1', [])).toEqual({})
  })

  it('delete and count by ledger', () => {
    const workspace = openedWorkspace()

    createCategoryRow(workspace.db, {
      ledgerId: 'l1',
      name: '甲',
      transactionType: 'expense',
      sortOrder: 0,
    })
    createCategoryRow(workspace.db, {
      ledgerId: 'l1',
      name: '乙',
      transactionType: 'income',
      sortOrder: 0,
    })
    createCategoryRow(workspace.db, {
      ledgerId: 'l2',
      name: '丙',
      transactionType: 'expense',
      sortOrder: 0,
    })

    expect(countByLedgerId(workspace.db, 'l1')).toBe(2)

    deleteCategoryRow(workspace.db, 'l1', '甲', 'expense')
    expect(countByLedgerId(workspace.db, 'l1')).toBe(1)
    // 交易类型不匹配时不会误删
    deleteCategoryRow(workspace.db, 'l1', '乙', 'expense')
    expect(countByLedgerId(workspace.db, 'l1')).toBe(1)

    // 账本级联清理走活路径（语句与 LEDGER_CASCADE 一致）
    workspace.db.prepare('DELETE FROM category WHERE ledger_id = ?').run('l1')
    expect(countByLedgerId(workspace.db, 'l1')).toBe(0)
    expect(countByLedgerId(workspace.db, 'l2')).toBe(1)
  })
})

describe('category service', () => {
  it('default data has expected shape', () => {
    const categories = DEFAULT_DATA.reduce((sum, [, items]) => sum + items.length, 0)
    const tags = DEFAULT_DATA.reduce(
      (sum, [, items]) => sum + items.reduce((count, [, names]) => count + names.length, 0),
      0,
    )
    expect(categories).toBe(19)
    expect(tags).toBe(57)

    // 关键条目：分类归属的交易类型、`分类名:交易类型` 的标签关联格式
    const expense = defaultGroup('expense')
    const dining = expense.find(([name]) => name === '餐饮美食')
    expect(dining?.[1]).toEqual([
      '三餐',
      '零食',
      '商场',
      '外卖',
      '饮料',
      '奶茶',
      '咖啡',
      '水果',
      '茶叶',
      '买菜',
    ])
    // 「还款」同时属于两个分类（各自一条标签记录，靠 category_transaction_type 区分）
    expect(
      expense.some(([name, names]) => name === '购物消费' && names.includes('还款')),
    ).toBe(true)
    expect(
      expense.some(([name, names]) => name === '生活缴费' && names.includes('还款')),
    ).toBe(true)

    const transfer = defaultGroup('transfer')
    const insurance = transfer.find(([name]) => name === '五险一金')
    expect(insurance?.[1]).toEqual(['养老', '医疗', '失业', '住房'])
  })

  // 默认种子数据的规范化导出
  // （`交易类型|分类名|标签,标签`，交易类型与分类名按字节序排序，标签保持字面量顺序）。
  //
  // 以下期望值来自一次真实运行，作为回归基线，不要手改：
  // 任何名字、归属或顺序上的偏差都会让下面的测试失败。
  const DEFAULT_DATA_DUMP = `expense|交通出行|打车,地铁,公交,高铁,油费,停车,ETC,车险
expense|人情往来|红包,请客,礼金
expense|医疗健康|医药,医险
expense|娱乐休闲|
expense|教育学习|
expense|生活缴费|房租,物业,燃气,水费,电费,通讯,还款,网费,理发
expense|购物消费|衣物,数码,家居,书籍,礼物,玩具,宠物,游戏,快递,彩票,电影,运动,酒店,烟酒,充值,汽车,还款
expense|贷款还款|
expense|餐饮美食|三餐,零食,商场,外卖,饮料,奶茶,咖啡,水果,茶叶,买菜
income|二手转卖|
income|借贷借款|
income|工资奖金|工资,奖金
income|彩票收入|
income|投资理财|
income|红包转账|
income|补贴补助|
income|退税退款|
transfer|五险一金|养老,医疗,失业,住房
transfer|税费党费|团费,交税`

  it('default data matches seed dump verbatim', () => {
    const rows: Array<[string, string, string]> = []
    for (const [transactionType, categories] of DEFAULT_DATA) {
      for (const [name, tags] of categories) {
        rows.push([transactionType, name, tags.join(',')])
      }
    }
    rows.sort((left, right) => {
      if (left[0] !== right[0]) return left[0] < right[0] ? -1 : 1
      if (left[1] !== right[1]) return left[1] < right[1] ? -1 : 1
      return 0
    })

    const dump = rows.map((row) => row.join('|')).join('\n')
    expect(dump).toBe(DEFAULT_DATA_DUMP)
  })

  it('initialize seeds categories and tags', () => {
    const workspace = openedWorkspace()
    const [categoryCount, tagCount] = initializeCategories(workspace.db, 'l1')
    expect(categoryCount).toBe(19)
    expect(tagCount).toBe(57)

    const categories = listCategories(workspace.db, 'l1', 'all')
    expect(categories).toHaveLength(19)
    expect(categories.every((item) => item.sortOrder === 0)).toBe(true)
    expect(
      categories.some(
        (item) => item.name === '餐饮美食' && item.transactionType === 'expense',
      ),
    ).toBe(true)
    expect(
      categories.some(
        (item) => item.name === '五险一金' && item.transactionType === 'transfer',
      ),
    ).toBe(true)

    const dining = listTags(workspace.db, 'l1', '餐饮美食:expense')
    expect(dining).toHaveLength(10)
    expect(dining.some((item) => item.name === '三餐')).toBe(true)
    expect(
      listTags(workspace.db, 'l1', '工资奖金:income').some(
        (item) => item.name === '工资',
      ),
    ).toBe(true)
    // 「还款」在两个分类下各自存在
    expect(
      listTags(workspace.db, 'l1', '购物消费:expense').filter(
        (item) => item.name === '还款',
      ),
    ).toHaveLength(1)
    expect(
      listTags(workspace.db, 'l1', '生活缴费:expense').filter(
        (item) => item.name === '还款',
      ),
    ).toHaveLength(1)
  })

  it('initialize twice returns same message with 500', () => {
    const workspace = openedWorkspace()
    initializeCategories(workspace.db, 'l1')

    const error = captureAppError(() => initializeCategories(workspace.db, 'l1'))
    expect(error.message).toBe('该账本已有分类，无需初始化')
    expect(error.status).toBe(500)
    // 第二次不得重复插入
    expect(countByLedgerId(workspace.db, 'l1')).toBe(19)

    // 其它账本不受影响
    const [otherCount] = initializeCategories(workspace.db, 'l2')
    expect(otherCount).toBe(19)
  })

  it('create category appends to max sort and rejects duplicate', () => {
    const workspace = openedWorkspace()
    createCategory(workspace.db, 'l1', '餐饮美食', 'expense')
    createCategory(workspace.db, 'l1', '购物消费', 'expense')
    createCategory(workspace.db, 'l1', '工资奖金', 'income')

    const expense = listCategories(workspace.db, 'l1', 'expense')
    expect(expense).toHaveLength(2)
    expect(expense[0].sortOrder).toBe(1) // 先建的排在前面
    expect(expense[1].sortOrder).toBe(2) // 排序号 = 最大值 + 1
    // 交易类型各自独立计数
    expect(listCategories(workspace.db, 'l1', 'income')[0].sortOrder).toBe(1)

    const error = captureAppError(() =>
      createCategory(workspace.db, 'l1', '餐饮美食', 'expense'),
    )
    expect(error.status).toBe(500)
    expect(error.message).toContain('UNIQUE constraint failed')
  })

  it('delete category cascades tags in one transaction', () => {
    const workspace = openedWorkspace()
    initializeCategories(workspace.db, 'l1')
    expect(listTags(workspace.db, 'l1', '餐饮美食:expense')).toHaveLength(10)

    deleteCategory(workspace.db, 'l1', '餐饮美食', 'expense')

    expect(
      listCategories(workspace.db, 'l1', 'all').some(
        (item) => item.name === '餐饮美食' && item.transactionType === 'expense',
      ),
    ).toBe(false)
    expect(listTags(workspace.db, 'l1', '餐饮美食:expense')).toHaveLength(0)
    // 其它分类的标签不受影响
    expect(listTags(workspace.db, 'l1', '工资奖金:income')).toHaveLength(2)
  })

  it('update sort is silent for missing row', () => {
    const workspace = openedWorkspace()
    createCategory(workspace.db, 'l1', '餐饮美食', 'expense')
    updateCategorySort(workspace.db, 'l1', '餐饮美食', 'expense', 9)
    expect(listCategories(workspace.db, 'l1', 'expense')[0].sortOrder).toBe(9)
    // 不存在的记录：不报错
    expect(() =>
      updateCategorySort(workspace.db, 'l1', '不存在', 'expense', 1),
    ).not.toThrow()
  })

  it('record counts are batched by name', () => {
    const workspace = openedWorkspace()
    createCategory(workspace.db, 'l1', '餐饮美食', 'expense')
    createCategory(workspace.db, 'l1', '购物消费', 'expense')

    insertRecord(workspace.db, 'l1', 't1', '餐饮美食')
    insertRecord(workspace.db, 'l1', 't2', '餐饮美食')
    insertRecord(workspace.db, 'l1', 't3', '购物消费')

    expect(countRecordsByCategory(workspace.db, 'l1', '餐饮美食')).toBe(2)

    const counts = countRecordsByCategories(workspace.db, 'l1', ['餐饮美食', '不存在'])
    expect(counts['餐饮美食']).toBe(2)
    expect(counts['不存在']).toBeUndefined()
    expect(countRecordsByCategories(workspace.db, 'l1', [])).toEqual({})
  })
})
