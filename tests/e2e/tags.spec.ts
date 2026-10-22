import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { _electron as electron, expect, test } from '@playwright/test'

import { createLedger } from './ledger-helper'

function environment(overrides: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') result[key] = value
  }
  delete result.ELECTRON_RUN_AS_NODE
  return { ...result, ...overrides }
}

function readNames(
  workspace: string,
  sql: string,
  ...args: string[]
): string[] {
  const database = new DatabaseSync(join(workspace, 'transactions.db'), { readOnly: true })
  const rows = database.prepare(sql).all(...args) as Array<{ name: string }>
  database.close()
  return rows.map((row) => row.name)
}

test('标签页：类型切换 / 新增分类与标签 / 拖拽排序', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-tags-'))
  const home = join(root, 'home')
  const workspace = join(root, 'ws')
  const userData = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
  mkdirSync(userData, { recursive: true })
  writeFileSync(
    join(home, '.tr.dev.json'),
    JSON.stringify({ width: 1400, height: 1000, closeBehavior: 'quit', appearance: 'light' }),
  )

  const electronApp = await electron.launch({
    args: ['.'],
    cwd: repositoryRoot,
    env: environment({
      USERPROFILE: home,
      HOME: home,
      TRANSACTIONS_USER_DATA: userData,
      TRANSACTIONS_TEST_DIALOG_DIR: workspace,
      TRANSACTIONS_TEST_CLOSE: 'quit',
    }),
  })

  try {
    const page = await electronApp.firstWindow()
    await page.getByTestId('open-workspace').click()
    await expect(page.getByTestId('workspace-state')).toContainText('已打开')
    await createLedger(page, '标签账本')
    await page.getByTestId('nav-accounting').click()
    await page.getByTestId('acct-tab-tags').click()

    await expect(page.getByText('选择分类查看标签')).toBeVisible()
    await page.getByTestId('category-item').filter({ hasText: '餐饮美食' }).click()
    await expect(page.getByTestId('tag-item').first()).toBeVisible()
    await expect(page.locator('.ct-column--tags .ct-column-title')).toHaveText('餐饮美食')

    // 切换类型后，选中分类与标签一起清空
    await page.getByTestId('tag-type-income').click()
    await expect(page.getByText('选择分类查看标签')).toBeVisible()
    await page.getByTestId('tag-type-expense').click()

    // 新增分类：自动选中；重复名称留在弹窗里报错
    await page.getByTestId('category-open-create').click()
    await page.getByTestId('category-name').fill('测试分类')
    await page.getByTestId('category-create').click()
    await expect(page.locator('.ct-column--tags .ct-column-title')).toHaveText('测试分类')

    await page.getByTestId('category-open-create').click()
    await page.getByTestId('category-name').fill('测试分类')
    await page.getByTestId('category-create').click()
    await expect(page.getByTestId('category-error')).toContainText('该分类已存在')
    await page.getByTestId('category-cancel').click()

    // 新增两个标签
    for (const name of ['甲标签', '乙标签']) {
      await page.getByTestId('tag-open-create').click()
      await page.getByTestId('tag-name').fill(name)
      await page.getByTestId('tag-create').click()
      await expect(page.getByTestId('tag-item').filter({ hasText: name })).toHaveCount(1)
    }

    await page.getByTestId('tag-open-create').click()
    await page.getByTestId('tag-name').fill('甲标签')
    await page.getByTestId('tag-create').click()
    await expect(page.getByTestId('tag-error')).toContainText('该标签已存在')
    await page.getByTestId('tag-cancel').click()

    // 标签拖拽：把第二个拖到第一个
    const tags = page.getByTestId('tag-item')
    await tags.nth(1).dragTo(tags.nth(0))
    await expect(tags.nth(0)).toContainText('乙标签')

    // 分类拖拽：把新分类拖到第一位
    const categories = page.getByTestId('category-item')
    await categories.last().dragTo(categories.first())
    await expect(categories.first()).toContainText('测试分类')

    const database = new DatabaseSync(join(workspace, 'transactions.db'), { readOnly: true })
    const ledger = database
      .prepare('SELECT id FROM ledger WHERE name = ?')
      .get('标签账本') as { id: string }
    database.close()

    await expect
      .poll(() =>
        readNames(
          workspace,
          'SELECT name FROM tag WHERE ledger_id = ? AND category_transaction_type = ? ORDER BY sort_order ASC',
          ledger.id,
          '测试分类:expense',
        ),
      )
      .toEqual(['乙标签', '甲标签'])

    await expect
      .poll(() =>
        readNames(
          workspace,
          'SELECT name FROM category WHERE ledger_id = ? AND transaction_type = ? ORDER BY sort_order ASC',
          ledger.id,
          'expense',
        ),
      )
      .toEqual(['测试分类', '餐饮美食', '贷款还款', '购物消费', '生活缴费', '教育学习', '娱乐休闲', '医疗健康', '人情往来', '交通出行'])
  } finally {
    await electronApp.close()
    rmSync(root, { recursive: true, force: true })
  }
})
