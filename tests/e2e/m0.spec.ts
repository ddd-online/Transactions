import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

import { openDatabase } from '../../electron/db/driver'

function environment(overrides: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') result[key] = value
  }
  // 本机（以及一些 CI）会设置 ELECTRON_RUN_AS_NODE=1，Electron 会退化成 Node 直接退出。
  delete result.ELECTRON_RUN_AS_NODE
  return { ...result, ...overrides }
}

test('M0：窗口 / 工作空间 / trasset / IPC 闭环', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-m0-'))
  const home = join(root, 'home')
  const workspace = join(root, 'ws')
  const userData = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
  mkdirSync(userData, { recursive: true })

  const configPath = join(home, '.transactions-dev.json')
  writeFileSync(
    configPath,
    JSON.stringify({
      width: 1200,
      height: 800,
      closeBehavior: 'quit',
      appearance: 'light',
    }),
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

    await expect(page.getByTestId('app-info')).toContainText('1.0.0')
    await expect(page.getByTestId('workspace-state')).toContainText('未打开工作空间')

    await page.getByTestId('open-workspace').click()
    await expect(page.getByTestId('workspace-state')).toContainText('已打开')
    await expect(page.getByTestId('workspace-state')).toContainText(workspace)

    const databasePath = join(workspace, 'transactions.db')
    expect(existsSync(databasePath)).toBe(true)

    const database = openDatabase(databasePath)
    const meta = database.prepare('SELECT value FROM app_meta WHERE key = ?').get('schema_version') as
      | { value: string }
      | undefined
    expect(meta?.value).toBe('1')
    database.close()

    await page.getByTestId('write-asset').click()
    await expect(page.getByTestId('asset-state')).toHaveText('trasset:// 已加载')
    const naturalWidth = await page
      .getByTestId('asset-img')
      .evaluate((element) => (element as HTMLImageElement).naturalWidth)
    expect(naturalWidth).toBeGreaterThan(0)

    mkdirSync(join(repositoryRoot, 'artifacts', 'tests'), { recursive: true })
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'm0.png'),
      fullPage: true,
    })

    const persisted = JSON.parse(readFileSync(configPath, 'utf8')) as { workspaceDir?: string }
    expect(persisted.workspaceDir).toBe(workspace)
  } finally {
    await electronApp.close()
    rmSync(root, { recursive: true, force: true })
  }
})
