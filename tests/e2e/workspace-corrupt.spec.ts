import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
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

test('损坏的库：启动说清哪个文件坏了、指向恢复入口，且不生成空库', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-corrupt-'))
  const home = join(root, 'home')
  const workspace = join(root, 'ws')
  const backupDir = join(root, 'backups')
  const userData = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
  mkdirSync(workspace, { recursive: true })
  mkdirSync(userData, { recursive: true })

  const databasePath = join(workspace, 'transactions.db')
  // 一坨非 SQLite 字节：文件头就不对，打开时必须以「已损坏」收场
  const corruptBytes = Buffer.from('这不是一个 SQLite 数据库：文件头已损坏\n'.repeat(64), 'utf8')
  writeFileSync(databasePath, corruptBytes)
  const sizeBefore = statSync(databasePath).size
  expect(sizeBefore).toBe(corruptBytes.length)

  writeFileSync(
    join(home, '.tr.dev.json'),
    JSON.stringify({
      width: 1400,
      height: 1000,
      closeBehavior: 'quit',
      appearance: 'light',
      // 有 workspaceDir 时外壳已经认为「有工作空间」：首屏遮罩不出现，
      // 错误落在外壳的 data-testid="error" 段落上（不是遮罩里的 workspace-error）
      workspaceDir: workspace,
      backupDir,
      autoBackup: false,
    }),
  )

  const electronApp = await electron.launch({
    args: ['.'],
    cwd: repositoryRoot,
    env: environment({
      USERPROFILE: home,
      HOME: home,
      TRANSACTIONS_USER_DATA: userData,
      TRANSACTIONS_TEST_CLOSE: 'quit',
    }),
  })

  try {
    const page = await electronApp.firstWindow()

    const error = page.getByTestId('error')
    await expect(error).toBeVisible()
    await expect(error).toContainText('已损坏')
    await expect(error).toContainText('从备份恢复')
    await expect(error).toContainText('transactions.db')

    // 遮罩不出现：workspaceDir 已经有值，外壳不当「还没选工作空间」
    await expect(page.getByTestId('workspace-overlay')).toHaveCount(0)
    await expect(page.getByTestId('workspace-state')).toContainText(workspace)

    // 没有被静默换成空库 / 新库：大小一致，字节还是那坨坏字节
    expect(statSync(databasePath).size).toBe(sizeBefore)
    expect(readFileSync(databasePath).equals(corruptBytes)).toBe(true)
    // 也没有偷偷留一份迁移前的 .bak 或 WAL 尾巴
    expect(existsSync(`${databasePath}.bak`)).toBe(false)

    await page.waitForTimeout(200)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'workspace-corrupt.png'),
    })
  } finally {
    await electronApp.close().catch(() => undefined)
    rmSync(root, { recursive: true, force: true })
  }
})
