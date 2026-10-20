import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

test('设置：外观落盘并驱动 data-theme；功能开关键名落盘', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-settings-'))
  const home = join(root, 'home')
  const workspace = join(root, 'ws')
  const userData = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
  mkdirSync(userData, { recursive: true })
  const configPath = join(home, '.transactions-dev.json')
  writeFileSync(
    configPath,
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

    await page.getByTestId('nav-settings').click()
    await expect(page.getByTestId('update-status')).toContainText('检查更新')
    await page.getByTestId('appearance').selectOption('dark')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect
      .poll(() => JSON.parse(readFileSync(configPath, 'utf8')).appearance)
      .toBe('dark')

    await page.getByTestId('feature-stock').uncheck()
    await expect
      .poll(() => JSON.parse(readFileSync(configPath, 'utf8')).features.stock)
      .toBe(false)

    await page.getByTestId('feature-stock').check()
    await expect
      .poll(() => JSON.parse(readFileSync(configPath, 'utf8')).features.stock)
      .toBe(true)
  } finally {
    await electronApp.close()
    rmSync(root, { recursive: true, force: true })
  }
})


