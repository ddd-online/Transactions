import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
  const configPath = join(home, '.tr.dev.json')
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
    await page.getByTestId('ledger-name').fill('设置账本')
    await page.getByTestId('ledger-create').click()
    await expect(page.getByTestId('ledger-item')).toHaveText(/设置账本/)
    await page.getByTestId('settings-tab-about').click()
    await expect(page.getByTestId('update-status')).toContainText('检查更新')
    await expect(page.getByTestId('import-source')).toBeInViewport()

    await page.getByTestId('settings-tab-general').click()
    await page.getByTestId('appearance-dark').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect
      .poll(() => JSON.parse(readFileSync(configPath, 'utf8')).appearance)
      .toBe('dark')

    await page.getByTestId('close-behavior-tray').click()
    await expect
      .poll(() => JSON.parse(readFileSync(configPath, 'utf8')).closeBehavior)
      .toBe('tray')

    await page.getByTestId('proxy-mode-manual').click()
    await page.getByTestId('proxy-url').fill('http://127.0.0.1:7890')
    await page.getByTestId('proxy-save').click()
    await expect
      .poll(() => JSON.parse(readFileSync(configPath, 'utf8')).proxy)
      .toEqual({ mode: 'manual', url: 'http://127.0.0.1:7890' })
    await page.getByTestId('proxy-detect').click()
    await expect(page.getByTestId('proxy-detect-result')).toContainText('manual')

    await page.getByTestId('workspace-icon-input').setInputFiles({
      name: 'icon.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      ),
    })
    await expect(page.getByTestId('workspace-icon')).toBeVisible()
    const iconWidth = await page
      .getByTestId('workspace-icon')
      .evaluate((element) => (element as HTMLImageElement).naturalWidth)
    expect(iconWidth).toBeGreaterThan(0)
    expect(existsSync(join(workspace, 'data', 'assets', 'workspace-icon.png'))).toBe(true)

    await page.getByTestId('workspace-icon-clear').click()
    await expect(page.getByTestId('workspace-icon')).toHaveCount(0)
    expect(existsSync(join(workspace, 'data', 'assets', 'workspace-icon.png'))).toBe(false)

    await page.getByTestId('settings-tab-features').click()
    await page.getByTestId('feature-stock').uncheck()
    await expect
      .poll(() => JSON.parse(readFileSync(configPath, 'utf8')).features.stock)
      .toBe(false)
    await page.getByTestId('feature-stock').check()
    await expect
      .poll(() => JSON.parse(readFileSync(configPath, 'utf8')).features.stock)
      .toBe(true)
    await page.getByTestId('ledger-feature-stock').click()
    await expect(page.getByTestId('ledger-feature-stock')).not.toBeChecked()
    await expect(page.getByTestId('nav-stock')).toHaveCount(0)
    await expect
      .poll(() => {
        const features = JSON.parse(readFileSync(configPath, 'utf8')).ledgerFeatures as Record<
          string,
          { stock: boolean }
        >
        return Object.values(features).some((entry) => entry.stock === false)
      })
      .toBe(true)
    await page.getByTestId('ledger-feature-stock').click()
    await expect(page.getByTestId('ledger-feature-stock')).toBeChecked()
    await expect(page.getByTestId('nav-stock')).toHaveCount(1)
    await expect
      .poll(() => JSON.parse(readFileSync(configPath, 'utf8')).features.stock)
      .toBe(true)  } finally {
    await electronApp.close()
    rmSync(root, { recursive: true, force: true })
  }
})













