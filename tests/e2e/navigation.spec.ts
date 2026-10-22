import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

function environment(overrides: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') result[key] = value
  }
  delete result.ELECTRON_RUN_AS_NODE
  return { ...result, ...overrides }
}

test('导航：首启动覆盖层 → 六个分页', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-nav-'))
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
    await expect(page.getByTestId('workspace-overlay')).toBeVisible()
    await expect(page.getByTestId('open-import')).toBeVisible()
    await page.getByTestId('open-workspace').click()
    await expect(page.getByTestId('workspace-state')).toContainText('已打开')
    await expect(page.getByTestId('workspace-overlay')).toHaveCount(0)

    await page.getByTestId('window-maximize').click()
    await expect
      .poll(() =>
        electronApp.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].isMaximized(),
        ),
      )
      .toBe(true)
    await page.getByTestId('window-maximize').click()
    await expect
      .poll(() =>
        electronApp.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].isMaximized(),
        ),
      )
      .toBe(false)

    await expect(page.getByTestId('acct-tab-records')).toBeVisible()
    await page.getByTestId('nav-stock').click()
    await expect(page.getByTestId('stock-tab-account')).toBeVisible()
    await page.getByTestId('nav-events').click()
    await expect(page.getByTestId('event-year-trigger')).toBeVisible()
    await page.getByTestId('nav-diary').click()
    await expect(page.getByTestId('diary-date')).toBeVisible()
    await page.getByTestId('nav-todo').click()
    await expect(page.getByTestId('todo-card-title')).toBeVisible()
    await page.getByTestId('nav-settings').click()
    await page.getByTestId('settings-tab-about').click()
    await expect(page.getByTestId('update-status')).toBeVisible()
    await page.getByTestId('nav-accounting').click()
    await expect(page.getByTestId('acct-tab-records')).toBeVisible()
  } finally {
    await electronApp.close()
    rmSync(root, { recursive: true, force: true })
  }
})




