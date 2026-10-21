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

test('导入：目标目录非空时拒绝且不写库', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-import-target-'))
  const home = join(root, 'home')
  const source = join(root, 'compat')
  const target = join(root, 'target')
  const userData = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
  mkdirSync(source, { recursive: true })
  mkdirSync(target, { recursive: true })
  mkdirSync(userData, { recursive: true })
  writeFileSync(join(target, 'occupied.txt'), 'occupied')
  writeFileSync(
    join(home, '.tr.dev.json'),
    JSON.stringify({ width: 1400, height: 1000, closeBehavior: 'quit', appearance: 'light' }),
  )
  const seed = readFileSync(join(repositoryRoot, 'fixtures', 'compat', 'seed.sql'), 'utf8')
  const compat = new DatabaseSync(join(source, 'transactions.db'))
  compat.exec(seed)
  compat.close()

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
    await expect(page.getByTestId('import-probe-result')).toContainText('可导入')
    await page.getByTestId('import-start').click()
    await expect(page.getByTestId('import-error')).toContainText('目标目录不是空目录')
    expect(existsSync(join(target, 'transactions.db'))).toBe(false)
  } finally {
    await electronApp.close()
    rmSync(root, { recursive: true, force: true })
  }
})



