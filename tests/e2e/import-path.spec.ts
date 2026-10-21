import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

test('导入：源与目标相同或目标在源内都被拒绝', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-import-path-'))
  const home = join(root, 'home')
  const sourceRoot = join(root, 'source')
  const nested = join(sourceRoot, 'nested-target')
  const userData = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
  mkdirSync(sourceRoot, { recursive: true })
  mkdirSync(userData, { recursive: true })
  writeFileSync(
    join(home, '.tr.dev.json'),
    JSON.stringify({ width: 1400, height: 1000, closeBehavior: 'quit', appearance: 'light' }),
  )
  const seed = readFileSync(join(repositoryRoot, 'fixtures', 'source', 'seed.sql'), 'utf8')
  const source = new DatabaseSync(join(sourceRoot, 'transactions.db'))
  source.exec(seed)
  source.close()

  const electronApp = await electron.launch({
    args: ['.'],
    cwd: repositoryRoot,
    env: environment({
      USERPROFILE: home,
      HOME: home,
      TRANSACTIONS_USER_DATA: userData,
      TRANSACTIONS_TEST_DIALOG_DIR: sourceRoot,
      TRANSACTIONS_TEST_CLOSE: 'quit',
    }),
  })

  try {
    const page = await electronApp.firstWindow()
    await page.getByTestId('open-import').click()
    await page.getByTestId('settings-tab-data').click()
    await page.getByTestId('import-source').fill(sourceRoot)
    await page.getByTestId('import-target').fill(sourceRoot)
    await page.getByTestId('import-probe').click()
    await expect(page.getByTestId('import-probe-result')).toContainText('可导入')
    await page.getByTestId('import-start').click()
    await expect(page.getByTestId('import-error')).toContainText('不能相同')

    await page.getByTestId('import-target').fill(nested)
    await page.getByTestId('import-start').click()
    await expect(page.getByTestId('import-error')).toContainText('不能放在源目录里面')
    expect(existsSync(join(nested, 'transactions.db'))).toBe(false)
  } finally {
    await electronApp.close()
    rmSync(root, { recursive: true, force: true })
  }
})

