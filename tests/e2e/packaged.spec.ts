import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

import { openDatabase } from '../../electron/db/driver'

const packagedExecutable = process.env.TRANSACTIONS_PACKAGED_EXE

function environment(overrides: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') result[key] = value
  }
  delete result.ELECTRON_RUN_AS_NODE
  return { ...result, ...overrides }
}

test.skip(!packagedExecutable, '未设置 TRANSACTIONS_PACKAGED_EXE，跳过打包产物冒烟')

test('打包产物：启动、打开工作空间、node:sqlite 落库', async () => {
  const executable = packagedExecutable as string
  if (!existsSync(executable)) {
    throw new Error(`打包产物不存在: ${executable}`)
  }

  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-packaged-'))
  const home = join(root, 'home')
  const workspace = join(root, 'ws')
  const userData = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
  mkdirSync(userData, { recursive: true })

  writeFileSync(
    join(home, '.tr.json'),
    JSON.stringify({ width: 1200, height: 800, closeBehavior: 'quit', appearance: 'light' }),
  )

  const electronApp = await electron.launch({
    executablePath: executable,
    args: [],
    cwd: dirname(executable),
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
    await expect(page.getByTestId('app-info')).toContainText('1.6.0')

    await page.getByTestId('open-workspace').click()
    await expect(page.getByTestId('workspace-state')).toContainText('已打开')
    expect(existsSync(join(workspace, 'transactions.db'))).toBe(true)

    const database = openDatabase(join(workspace, 'transactions.db'))
    const meta = database.prepare('SELECT value FROM app_meta WHERE key = ?').get('schema_version') as
      | { value: string }
      | undefined
    expect(meta?.value).toBe('3')
    database.close()

    mkdirSync(join(resolve(__dirname, '../..'), 'artifacts', 'tests'), { recursive: true })
    await page.screenshot({
      path: join(resolve(__dirname, '../..'), 'artifacts', 'tests', 'm0-packaged.png'),
      fullPage: true,
    })
  } finally {
    await electronApp.close()
    rmSync(root, { recursive: true, force: true })
  }
})
