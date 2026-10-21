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

test('待办：主题 → 事项 → 进度 → 完成进入历史', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-todo-'))
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
    await page.getByTestId('nav-settings').click()
    await page.getByTestId('ledger-name').fill('待办账本')
    await page.getByTestId('ledger-create').click()
    await expect(page.getByTestId('ledger-item')).toHaveText(/待办账本/)
    await page.getByTestId('nav-todo').click()

    await page.getByTestId('todo-card-title').fill('工作')
    await page.getByTestId('todo-card-create').click()
    await expect(page.getByTestId('todo-card')).toContainText('工作')

    await page.getByTestId('todo-item-title').fill('写周报')
    await page.getByTestId('todo-item-create').click()
    await expect(page.getByTestId('todo-item')).toContainText('写周报')

    await page.getByTestId('todo-progress-input').fill('完成一半')
    await page.getByTestId('todo-progress-add').click()
    await expect(page.getByTestId('todo-item')).toContainText('完成一半')

    await page.getByTestId('todo-progress-done').click()
    await expect(page.getByTestId('todo-progress-done')).toBeChecked()
    await page.getByTestId('todo-item-done').click()
    await page.getByTestId('todo-tab-history').click()
    await expect(page.getByTestId('todo-history-item')).toContainText('工作 · 写周报')
    await expect(page.getByTestId('todo-item')).toHaveCount(0)

    const database = new DatabaseSync(join(workspace, 'transactions.db'), { readOnly: true })
    const item = database
      .prepare('SELECT title, status, completed_at FROM todo_item')
      .get() as { title: string; status: string; completed_at: number }
    const progress = database
      .prepare('SELECT content, done FROM todo_progress')
      .get() as { content: string; done: number }
    database.close()
    expect(item.title).toBe('写周报')
    expect(item.status).toBe('done')
    expect(item.completed_at).toBeGreaterThan(0)
    expect(progress).toEqual({ content: '完成一半', done: 1 })
  } finally {
    await electronApp.close()
    rmSync(root, { recursive: true, force: true })
  }
})




