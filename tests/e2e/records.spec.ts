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

test('记录：记一笔 → 列表/统计 → 筛选 → 删除', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-records-'))
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

    await createLedger(page, '测试账本')
    await page.getByTestId('nav-accounting').click()
    await page.getByTestId('acct-tab-records').click()

    // 空态要占满滚动区、内容垂直居中（曾因滚动容器 viewport 是 block 而贴在顶部）
    await expect(page.getByTestId('tr-empty')).toBeVisible()
    const emptyLayout = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>('.tr-scroll')
      const empty = document.querySelector<HTMLElement>('[data-testid="tr-empty"]')
      if (!host || !empty) return null
      const hostRect = host.getBoundingClientRect()
      const parts = Array.from(empty.children).map((child) => child.getBoundingClientRect())
      const top = Math.min(...parts.map((rect) => rect.top))
      const bottom = Math.max(...parts.map((rect) => rect.bottom))
      return {
        contentCenter: (top + bottom) / 2,
        areaCenter: hostRect.top + hostRect.height / 2,
      }
    })
    expect(emptyLayout).not.toBeNull()
    expect(Math.abs(emptyLayout!.contentCenter - emptyLayout!.areaCenter)).toBeLessThanOrEqual(4)

    await page.getByTestId('tr-new').click()
    await expect(page.getByTestId('tr-empty')).toContainText('还没有记录')
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(repositoryRoot, 'artifacts', 'tests', 'record-modal.png') })

    await page.getByTestId('tr-amount').fill('12.34')
    await page.getByTestId('tr-category').fill('餐饮美食')
    await page.getByTestId('tr-description').fill('午餐')
    await page.getByTestId('tr-tags').click()
    await page.keyboard.type('三餐')
    await page.keyboard.press('Enter')
    await page.keyboard.type('外卖')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Escape')
    await page.getByTestId('tr-outlier').click()
    await page.locator('.ant-select-item-option[title="离群值"]').click()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('tr-event-date')).toBeVisible()
    await page.getByTestId('tr-event-date').fill('2026-01-15')
    await page.getByTestId('tr-save').click()

    await expect(page.getByTestId('tr-row')).toHaveText(/午餐/)
    await expect(page.getByTestId('tr-row')).toHaveText(/-12\.34/)
    await expect(page.getByTestId('tr-total')).toHaveText('共 1 条')
    await expect(page.getByTestId('tr-row')).toContainText('离群值')
    await expect(page.getByTestId('tr-row').locator('.tr-cell-mark')).toHaveAttribute(
      'title',
      '已关联至 2026-01-15',
    )

    await page.getByTestId('acct-tab-charts').click()
    await page.getByTestId('chart-item').filter({ hasText: '年度消费趋势' }).click()
    await expect(page.getByTestId('chart-svg')).toBeVisible()
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(repositoryRoot, 'artifacts', 'tests', 'charts.png') })

    await page.getByTestId('chart-open-create').click()
    await page.getByTestId('chart-title').fill('自定义图表')
    await page.getByTestId('chart-create').click()
    await expect(page.getByTestId('chart-item').filter({ hasText: '自定义图表' })).toHaveCount(1)
    await page.getByTestId('chart-item').filter({ hasText: '自定义图表' }).click()
    await page.getByTestId('chart-granularity').click()
    await page.locator('.ant-select-item-option[title="月"]').click()
    await expect(page.getByTestId('chart-granularity')).toContainText('月')
    await expect(page.getByTestId('chart-svg')).toBeVisible()

    await page.getByTestId('chart-rename').click()
    await page.getByTestId('chart-rename-input').fill('改名图表')
    await page.getByTestId('chart-rename-save').click()
    await expect(page.getByTestId('chart-item').filter({ hasText: '改名图表' })).toHaveCount(1)

    const renamed = page.getByTestId('chart-item').filter({ hasText: '改名图表' })
    await renamed.getByTestId('chart-delete').click()
    await page.locator('.ant-popconfirm-buttons button:last-child').click()
    await expect(renamed).toHaveCount(0)

    await page.getByTestId('acct-tab-records').click()
    await page.getByTestId('tr-new').click()
    await page.getByTestId('tr-category').fill('餐饮美食')
    await page.getByTestId('tr-description').fill('午餐')
    await page.getByTestId('tr-tags').click()
    await page.keyboard.type('三餐')
    await page.keyboard.press('Enter')
    await page.keyboard.type('外卖')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Escape')
    await page.getByTestId('tr-template-save').click()
    await expect(page.getByTestId('tr-template-select')).toContainText('支出 · 餐饮美食')
    await page.getByTestId('tr-cancel').click()
    await page.getByTestId('tr-new').click()
    await page.getByTestId('tr-category').fill('别的分类')
    await page.getByTestId('tr-template-select').click()
    await page.locator('.ant-select-item-option[title="支出 · 餐饮美食"]').click()
    await expect(page.getByTestId('tr-category')).toHaveValue('餐饮美食')
    await page.getByTestId('tr-cancel').click()
    await page.getByTestId('acct-tab-templates').click()
    await expect(page.getByTestId('template-row')).toContainText('支出 · 餐饮美食')

    await page.getByTestId('acct-tab-tags').click()
    await page.getByTestId('category-open-create').click()
    await page.getByTestId('category-name').fill('测试分类')
    await page.getByTestId('category-create').click()
    await expect(
      page.getByTestId('category-item').filter({ hasText: '测试分类' }),
    ).toHaveCount(1)
    await page.getByTestId('tag-open-create').click()
    await page.getByTestId('tag-name').fill('测试标签')
    await page.getByTestId('tag-create').click()
    const newTag = page.getByTestId('tag-item').filter({ hasText: '测试标签' })
    await expect(newTag).toHaveCount(1)
    await newTag.hover()
    await newTag.getByTestId('tag-delete').click()
    await page.getByTestId('confirm-dialog-confirm').click()
    await expect(newTag).toHaveCount(0)
    const newCategory = page.getByTestId('category-item').filter({ hasText: '测试分类' })
    await newCategory.getByTestId('category-delete').click()
    await page.getByTestId('confirm-dialog-confirm').click()
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
    expect(template.template_name).toBe('支出 · 餐饮美食')
    expect(template.tags).toBe('["三餐","外卖"]')

    await page.getByTestId('acct-tab-records').click()
    await page.getByTestId('tr-filter').click()
    // 消费类型是分段按钮而不是下拉框；「全部」= 不限类型
    await expect(page.getByTestId('tr-filter-type-all')).toHaveAttribute('aria-pressed', 'true')
    await page.getByTestId('tr-filter-type-income').click()
    await expect(page.getByTestId('tr-filter-type-income')).toHaveAttribute('aria-pressed', 'true')
    await page.getByTestId('tr-filter-type-all').click()
    await page.getByTestId('tr-filter-description').fill('午')
    // 「添加条件」把编辑区收进条件列表：列表出现摘要行、编辑区清空
    await page.getByTestId('tr-filter-add').click()
    await expect(page.getByTestId('tr-filter-item')).toHaveCount(1)
    await expect(page.getByTestId('tr-filter-item')).toContainText('"午"')
    await expect(page.getByTestId('tr-filter-description')).toHaveValue('')
    await page.getByTestId('tr-filter-item-remove').click()
    await expect(page.getByTestId('tr-filter-item')).toHaveCount(0)
    // 编辑区没点「添加条件」时，直接确认也要生效
    await page.getByTestId('tr-filter-description').fill('午')
    await page.getByTestId('tr-filter-apply').click()
    await expect(page.getByTestId('tr-row')).toHaveText(/午餐/)

    await page.getByTestId('tr-filter').click()
    await page.getByTestId('tr-filter-clear').click()
    await page.getByTestId('tr-filter-tags').click()
    await page.keyboard.type('三餐')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Escape')
    await page.getByTestId('tr-filter-apply').click()
    await expect(page.getByTestId('tr-row')).toHaveText(/午餐/)

    await page.getByTestId('tr-filter').click()
    await page.getByTestId('tr-filter-clear').click()
    await page.getByTestId('tr-filter-description').fill('不存在')
    await page.getByTestId('tr-filter-apply').click()
    await expect(page.getByTestId('tr-empty')).toContainText('还没有记录')

    await page.getByTestId('tr-filter').click()
    await page.getByTestId('tr-filter-clear').click()
    await page.getByTestId('tr-filter-apply').click()
    await expect(page.getByTestId('tr-row')).toHaveText(/午餐/)
    await page.getByTestId('tr-delete').click()
    await page.locator('.ant-popconfirm-buttons button').click()
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

















