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

test('待办：拖动主题后排序落库', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-todo-drag-'))
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
    await page.getByTestId('ledger-name').fill('待办账本')
    await page.getByTestId('ledger-create').click()
    await expect(page.getByTestId('ledger-item')).toHaveText(/待办账本/)
    await page.getByTestId('nav-todo').click()

    await page.getByTestId('todo-card-title').fill('第一个主题')
    await page.getByTestId('todo-card-create').click()
    await page.getByTestId('todo-card-title').fill('第二个主题')
    await page.getByTestId('todo-card-create').click()
    await expect(page.getByTestId('todo-card')).toHaveCount(2)

    const cards = page.getByTestId('todo-card')
    await cards.nth(0).dragTo(cards.nth(1))
    await expect(cards.nth(0)).toContainText('第二个主题')
    await expect(cards.nth(1)).toContainText('第一个主题')

    const database = new DatabaseSync(join(workspace, 'transactions.db'), { readOnly: true })
    const rows = database
      .prepare('SELECT title, sort_order FROM todo_card ORDER BY sort_order ASC')
      .all() as Array<{ title: string; sort_order: number }>
    database.close()
    expect(rows.map((row) => row.title)).toEqual(['第二个主题', '第一个主题'])
  } finally {
    await electronApp.close()
    rmSync(root, { recursive: true, force: true })
  }
})
