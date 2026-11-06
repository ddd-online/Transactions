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

test('旧版工作空间：打开被拒绝，设置里不再有数据导入', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-legacy-'))
  const home = join(root, 'home')
  const legacyRoot = join(root, 'legacy')
  const userData = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
  mkdirSync(legacyRoot, { recursive: true })
  mkdirSync(userData, { recursive: true })
  writeFileSync(
    join(home, '.tr.dev.json'),
    JSON.stringify({ width: 1400, height: 1000, closeBehavior: 'quit', appearance: 'light' }),
  )

  // 只有旧版迁移登记表 —— 足够让工作空间被识别成 tbl_billadm_* 结构
  const legacyDb = new DatabaseSync(join(legacyRoot, 'transactions.db'))
  legacyDb.exec('CREATE TABLE tbl_billadm_schema_migration (id TEXT, applied_at INTEGER)')
  legacyDb.close()

  const electronApp = await electron.launch({
    args: ['.'],
    cwd: repositoryRoot,
    env: environment({
      USERPROFILE: home,
      HOME: home,
      TRANSACTIONS_USER_DATA: userData,
      TRANSACTIONS_TEST_DIALOG_DIR: legacyRoot,
      TRANSACTIONS_TEST_CLOSE: 'quit',
    }),
  })

  try {
    const page = await electronApp.firstWindow()
    await expect(page.getByTestId('workspace-overlay')).toBeVisible()
    await page.getByTestId('open-workspace').click()
    await expect(page.getByTestId('error')).toContainText('旧版工作空间')
    await expect(page.getByTestId('error')).toContainText('不再支持打开')

    // 没有工作空间也要进得了设置（代理 / 检查更新是应用级的）；但导入分栏已经没了
    await page.getByTestId('open-app-settings').click()
    await expect(page.getByTestId('settings-tab-general')).toBeVisible()
    await expect(page.getByTestId('settings-tab-data')).toHaveCount(0)
    await expect(page.getByTestId('workspace-state')).toContainText('未打开工作空间')
  } finally {
    await electronApp.close()
    rmSync(root, { recursive: true, force: true })
  }
})
