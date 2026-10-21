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

test('导入：旧版 0.20.0 库 → 新工作空间', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-import-'))
  const home = join(root, 'home')
  const source = join(root, 'legacy')
  const target = join(root, 'imported')
  const userData = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
  mkdirSync(source, { recursive: true })
  mkdirSync(userData, { recursive: true })
  writeFileSync(
    join(home, '.transactions-dev.json'),
    JSON.stringify({ width: 1400, height: 1000, closeBehavior: 'quit', appearance: 'light' }),
  )

  const seed = readFileSync(join(repositoryRoot, 'fixtures', 'legacy', 'seed.sql'), 'utf8')
  const legacy = new DatabaseSync(join(source, 'transactions.db'))
  legacy.exec(seed)
  const expected = legacy
    .prepare('SELECT COUNT(*) AS count FROM tbl_billadm_transaction_record')
    .get() as { count: number }
  legacy.close()
  expect(expected.count).toBeGreaterThan(0)

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
    await expect(page.getByTestId('import-source')).toBeVisible()
    await page.getByTestId('import-source').fill(source)
    await page.getByTestId('import-target').fill(target)
    await page.getByTestId('import-probe').click()
    await expect(page.getByTestId('import-probe-result')).toBeVisible()
    await expect(page.getByTestId('import-probe-result')).not.toContainText('未找到')
    await expect(page.getByTestId('import-start')).toBeEnabled()

    await page.getByTestId('import-start').click()
    await expect(page.getByTestId('import-report')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('workspace-state')).toContainText(target)
    await page.getByTestId('nav-accounting').click()
    await page.getByTestId('nav-settings').click()
    await page.getByTestId('settings-tab-general').click()
    await expect(page.getByTestId('ledger-item').first()).toBeVisible()

    const database = new DatabaseSync(join(target, 'transactions.db'), { readOnly: true })
    const record = database
      .prepare('SELECT COUNT(*) AS count FROM transaction_record')
      .get() as { count: number }
    const ledgers = database.prepare('SELECT COUNT(*) AS count FROM ledger').get() as {
      count: number
    }
    database.close()

    expect(record.count).toBe(expected.count)
    expect(ledgers.count).toBeGreaterThan(0)
    expect(existsSync(join(target, 'import-report.json'))).toBe(true)
  } finally {
    await electronApp.close()
    rmSync(root, { recursive: true, force: true })
  }
})





