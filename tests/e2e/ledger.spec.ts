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

test('账本：新建 → 列表 → 落库 → 删除', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-ledger-'))
  const home = join(root, 'home')
  const workspace = join(root, 'ws')
  const userData = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
  mkdirSync(userData, { recursive: true })
  writeFileSync(
    join(home, '.tr.dev.json'),
    JSON.stringify({ width: 1200, height: 900, closeBehavior: 'quit', appearance: 'light' }),
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
    await page.getByTestId('ledger-trigger').click()
    await expect(page.getByTestId('ledger-menu-empty')).toContainText('暂无账本')
    await page.getByTestId('ledger-open-create').click()
    await page.getByTestId('ledger-name').fill('测试账本')
    await page.getByTestId('ledger-description').fill('测试描述')
    await page.getByTestId('ledger-create').click()
    await expect(page.getByTestId('ledger-trigger')).toContainText('测试账本')
    await expect(page.getByTestId('toast').first()).toContainText('账本已创建')

    const database = new DatabaseSync(join(workspace, 'transactions.db'), { readOnly: true })
    const rows = database.prepare('SELECT id, name, description FROM ledger').all() as Array<{
      id: string
      name: string
      description: string
    }>
    database.close()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.name).toBe('测试账本')
    expect(rows[0]?.description).toBe('测试描述')

    await page.getByTestId('ledger-trigger').click()
    await page
      .getByTestId('ledger-menu-row')
      .filter({ hasText: '测试账本' })
      .getByTestId('ledger-delete')
      .click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByTestId('confirm-dialog-confirm').click()
    await expect(page.getByTestId('ledger-trigger')).toContainText('默认账本')
    await page.getByTestId('ledger-trigger').click()
    await expect(page.getByTestId('ledger-menu-empty')).toContainText('暂无账本')

    const after = new DatabaseSync(join(workspace, 'transactions.db'), { readOnly: true })
    const count = after.prepare('SELECT COUNT(*) AS count FROM ledger').get() as { count: number }
    after.close()
    expect(count.count).toBe(0)
  } finally {
    await electronApp.close()
    rmSync(root, { recursive: true, force: true })
  }
})




