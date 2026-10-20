import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { _electron as electron, expect, test } from '@playwright/test'

function environment(overrides: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') result[key] = value
  }
  delete result.ELECTRON_RUN_AS_NODE
  return { ...result, ...overrides }
}

test('记录：记一笔 → 列表/统计 → 筛选 → 删除', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-records-'))
  const home = join(root, 'home')
  const workspace = join(root, 'ws')
  const userData = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
  mkdirSync(userData, { recursive: true })
  writeFileSync(
    join(home, '.transactions-dev.json'),
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

    await page.getByTestId('ledger-name').fill('测试账本')
    await page.getByTestId('ledger-create').click()
    await expect(page.getByTestId('ledger-item')).toHaveText(/测试账本/)
    await page.getByTestId('acct-tab-records').click()
    await expect(page.getByTestId('tr-empty')).toContainText('还没有记录')

    await page.getByTestId('tr-amount').fill('12.34')
    await page.getByTestId('tr-category').fill('餐饮美食')
    await page.getByTestId('tr-description').fill('午餐')
    await page.getByTestId('tr-tags').fill('三餐, 外卖')
    await page.getByTestId('tr-outlier').check()
    await page.getByTestId('tr-event-date').fill('2026-01-15')
    await page.getByTestId('tr-save').click()

    await expect(page.getByTestId('tr-row')).toHaveText(/午餐/)
    await expect(page.getByTestId('tr-row')).toHaveText(/-12\.34/)
    await expect(page.getByTestId('tr-total')).toHaveText('1 笔')
    await expect(page.getByTestId('tr-row')).toContainText('异常')
    await expect(page.getByTestId('tr-row')).toContainText('事件 2026-01-15')
    await page.getByTestId('acct-tab-dashboard').click()
    await expect(page.getByTestId('stat-expense')).toHaveText('¥12.34')
    await expect(page.getByTestId('dashboard-slices')).toContainText('餐饮美食')
    await expect(page.getByTestId('dashboard-slices')).toContainText('1 笔')

    await page.getByTestId('acct-tab-charts').click()
    await expect(page.getByTestId('chart-select')).toBeVisible()
    await page.getByTestId('chart-select').selectOption({ label: '年度消费趋势' })
    await expect(page.getByTestId('chart-svg')).toBeVisible()

    await page.getByTestId('acct-tab-records').click()
    await page.getByTestId('tr-category').fill('餐饮美食')
    await page.getByTestId('tr-description').fill('午餐')
    await page.getByTestId('tr-tags').fill('三餐, 外卖')
    await page.getByTestId('tr-template-name').fill('午餐模板')
    await page.getByTestId('tr-template-save').click()
    await expect(page.getByTestId('tr-template')).toContainText('午餐模板')
    await page.getByTestId('tr-category').fill('别的分类')
    await page.getByTestId('tr-template').first().click()
    await expect(page.getByTestId('tr-category')).toHaveValue('餐饮美食')
    await page.getByTestId('acct-tab-templates').click()
    await page.getByTestId('template-refresh').click()
    await expect(page.getByTestId('template-row')).toContainText('午餐模板')

    await page.getByTestId('acct-tab-tags').click()
    await page.getByTestId('category-name').fill('测试分类')
    await page.getByTestId('category-create').click()
    await expect(
      page.getByTestId('category-item').filter({ hasText: '测试分类' }),
    ).toHaveCount(1)
    await page.getByTestId('tag-category').selectOption('测试分类')
    await page.getByTestId('tag-name').fill('测试标签')
    await page.getByTestId('tag-create').click()
    const newTag = page.getByTestId('tag-item').filter({ hasText: '测试标签' })
    await expect(newTag).toHaveCount(1)
    await newTag.getByTestId('tag-delete').click()
    await expect(newTag).toHaveCount(0)
    const newCategory = page.getByTestId('category-item').filter({ hasText: '测试分类' })
    await newCategory.getByTestId('category-delete').click()
    await expect(newCategory).toHaveCount(0)

    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'records.png'),
      fullPage: true,
    })

    const database = new DatabaseSync(join(workspace, 'transactions.db'), { readOnly: true })
    const record = database
      .prepare(
        'SELECT amount_cents, transaction_type, category, description, flags, key_event_date FROM transaction_record',
      )
      .get() as {
      amount_cents: number
      transaction_type: string
      category: string
      description: string
      flags: string
      key_event_date: string
    }
    const tags = database
      .prepare('SELECT tag FROM transaction_record_tag ORDER BY tag')
      .all() as Array<{ tag: string }>
    const template = database
      .prepare('SELECT template_name, tags FROM transaction_template')
      .get() as { template_name: string; tags: string }
    database.close()
    expect(record.amount_cents).toBe(1234)
    expect(record.transaction_type).toBe('expense')
    expect(record.category).toBe('餐饮美食')
    expect(record.description).toBe('午餐')
    expect(JSON.parse(record.flags).outlier).toBe(true)
    expect(record.key_event_date).toBe('2026-01-15')
    expect(tags.map((row) => row.tag).sort()).toEqual(['三餐', '外卖'])
    expect(template.template_name).toBe('午餐模板')
    expect(template.tags).toBe('["三餐","外卖"]')

    await page.getByTestId('acct-tab-records').click()
    await page.getByTestId('tr-keyword').fill('午')
    await expect(page.getByTestId('tr-row')).toHaveText(/午餐/)
    await page.getByTestId('tr-tag-filter').fill('三餐')
    await expect(page.getByTestId('tr-row')).toHaveText(/午餐/)
    await page.getByTestId('tr-tag-filter').fill('不存在')
    await expect(page.getByTestId('tr-empty')).toContainText('还没有记录')

    await page.getByTestId('tr-tag-filter').fill('')
    await page.getByTestId('tr-keyword').fill('不存在')
    await expect(page.getByTestId('tr-empty')).toContainText('还没有记录')

    await page.getByTestId('tr-keyword').fill('')
    await expect(page.getByTestId('tr-row')).toHaveText(/午餐/)
    await page.getByTestId('tr-delete').click()
    await expect(page.getByTestId('tr-empty')).toContainText('还没有记录')

    const after = new DatabaseSync(join(workspace, 'transactions.db'), { readOnly: true })
    const count = after.prepare('SELECT COUNT(*) AS count FROM transaction_record').get() as {
      count: number
    }
    after.close()
    expect(count.count).toBe(0)
  } finally {
    await electronApp.close()
    rmSync(root, { recursive: true, force: true })
  }
})








