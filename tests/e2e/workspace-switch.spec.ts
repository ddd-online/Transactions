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

test('工作空间：切换后账本隔离并写回配置', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-switch-'))
  const home = join(root, 'home')
  const first = join(root, 'ws-a')
  const second = join(root, 'ws-b')
  const userData = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
  mkdirSync(userData, { recursive: true })
  writeFileSync(
    join(home, '.tr-dev.json'),
    JSON.stringify({ width: 1400, height: 1000, closeBehavior: 'quit', appearance: 'light' }),
  )

  const electronApp = await electron.launch({
    args: ['.'],
    cwd: repositoryRoot,
    env: environment({
      USERPROFILE: home,
      HOME: home,
      TRANSACTIONS_USER_DATA: userData,
      TRANSACTIONS_TEST_DIALOG_DIRS: `${first}|${second}`,
      TRANSACTIONS_TEST_CLOSE: 'quit',
    }),
  })

  try {
    const page = await electronApp.firstWindow()
    await page.getByTestId('open-workspace').click()
    await expect(page.getByTestId('workspace-state')).toContainText(first)
    await page.getByTestId('nav-settings').click()
    await page.getByTestId('ledger-name').fill('A 账本')
    await page.getByTestId('ledger-create').click()
    await expect(page.getByTestId('ledger-item')).toHaveText(/A 账本/)

    await page.getByTestId('nav-settings').click()
    await page.getByTestId('open-workspace').click()
    await expect(page.getByTestId('workspace-state')).toContainText(second)
    await expect(page.getByTestId('ledger-empty')).toContainText('还没有账本')
    await page.getByTestId('nav-settings').click()
    await page.getByTestId('ledger-name').fill('B 账本')
    await page.getByTestId('ledger-create').click()
    await expect(page.getByTestId('ledger-item')).toHaveText(/B 账本/)

    const config = JSON.parse(
      readFileSync(join(home, '.tr-dev.json'), 'utf8'),
    ) as { workspaceDir: string }
    expect(config.workspaceDir).toBe(second)
  } finally {
    await electronApp.close()
    rmSync(root, { recursive: true, force: true })
  }
})


