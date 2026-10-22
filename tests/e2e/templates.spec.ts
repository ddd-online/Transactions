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

async function createTemplate(
  page: import('@playwright/test').Page,
  name: string,
  description: string,
): Promise<void> {
  await page.getByTestId('template-open-create').click()
  await page.getByTestId('template-name').fill(name)
  await page.getByTestId('template-category').click()
  await page.locator('.ant-select-item-option[title="餐饮美食"]').click()
  await page.getByRole('checkbox', { name: '三餐', exact: true }).check()
  await page.getByTestId('template-description').fill(description)
  await page.getByTestId('template-outlier').check()
  await page.getByTestId('template-create').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByTestId('template-row').filter({ hasText: name })).toHaveCount(1)
}

test('模板页：新建 / 拖拽排序 / 删除', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-templates-'))
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
    await createLedger(page, '模板账本')
    await page.getByTestId('nav-accounting').click()
    await page.getByTestId('acct-tab-templates').click()
    await expect(page.getByTestId('template-page-empty')).toContainText('暂无模板')

    // 未选分类时标签区给出提示
    await page.getByTestId('template-open-create').click()
    await expect(page.getByText('该分类下暂无标签')).toBeVisible()
    await page.waitForTimeout(400)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'templates-modal.png'),
    })
    await page.getByTestId('template-name').fill('早餐模板')
    await page.getByTestId('template-cancel').click()

    await createTemplate(page, '早餐模板', '早餐')
    await expect(page.getByTestId('template-row').filter({ hasText: '早餐模板' })).toContainText(
      '离群值',
    )
    await createTemplate(page, '午餐模板', '午餐')

    const rows = page.getByTestId('template-row')
    await expect(rows).toHaveCount(2)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'templates-list.png'),
    })
    await rows.nth(1).dragTo(rows.nth(0))
    await expect(rows.nth(0)).toContainText('午餐模板')

    const database = new DatabaseSync(join(workspace, 'transactions.db'), { readOnly: true })
    const ordered = database
      .prepare('SELECT template_name FROM transaction_template ORDER BY sort_order ASC')
      .all() as Array<{ template_name: string }>
    database.close()
    expect(ordered.map((row) => row.template_name)).toEqual(['午餐模板', '早餐模板'])

    const breakfast = rows.filter({ hasText: '早餐模板' })
    await breakfast.getByTestId('template-delete').click()
    await page.locator('.ant-popconfirm-buttons button:last-child').click()
    await expect(breakfast).toHaveCount(0)

    const after = new DatabaseSync(join(workspace, 'transactions.db'), { readOnly: true })
    const remaining = after
      .prepare('SELECT template_name FROM transaction_template')
      .all() as Array<{ template_name: string }>
    after.close()
    expect(remaining.map((row) => row.template_name)).toEqual(['午餐模板'])
  } finally {
    await electronApp.close()
    rmSync(root, { recursive: true, force: true })
  }
})
