import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

test('既有工作空间：打开被拒绝并引导到导入向导', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-source-open-'))
  const home = join(root, 'home')
  const sourceRoot = join(root, 'source')
  const userData = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
  mkdirSync(sourceRoot, { recursive: true })
  mkdirSync(userData, { recursive: true })
  writeFileSync(
    join(home, '.tr.dev.json'),
    JSON.stringify({ width: 1400, height: 1000, closeBehavior: 'quit', appearance: 'light' }),
  )
  const seed = readFileSync(join(repositoryRoot, 'fixtures', 'source', 'seed.sql'), 'utf8')
  const sourceDb = new DatabaseSync(join(sourceRoot, 'transactions.db'))
  sourceDb.exec(seed)
  sourceDb.close()

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
    await page.getByTestId('open-workspace').click()
    await expect(page.getByTestId('error')).toContainText('既有工作空间')
    await page.getByTestId('settings-tab-data').click()
    await expect(page.getByTestId('import-source')).toBeVisible()
    await expect(page.getByTestId('workspace-state')).toContainText('未打开工作空间')
  } finally {
    await electronApp.close()
    rmSync(root, { recursive: true, force: true })
  }
})


