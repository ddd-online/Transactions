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

test('导入：非源目录给出明确拒绝且不能开始', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-import-bad-'))
  const home = join(root, 'home')
  const source = join(root, 'not-source')
  const target = join(root, 'target')
  const userData = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
  mkdirSync(source, { recursive: true })
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
      TRANSACTIONS_TEST_DIALOG_DIR: source,
      TRANSACTIONS_TEST_CLOSE: 'quit',
    }),
  })

  try {
    const page = await electronApp.firstWindow()
    await page.getByTestId('open-import').click()
    await page.getByTestId('settings-tab-about').click()
    await page.getByTestId('import-source').fill(source)
    await page.getByTestId('import-target').fill(target)
    await page.getByTestId('import-probe').click()
    await expect(page.getByTestId('import-probe-result')).toContainText('未找到 transactions.db')
    await expect(page.getByTestId('import-start')).toBeDisabled()
  } finally {
    await electronApp.close()
    rmSync(root, { recursive: true, force: true })
  }
})

