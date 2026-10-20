import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'

function environment(overrides: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') result[key] = value
  }
  delete result.ELECTRON_RUN_AS_NODE
  return { ...result, ...overrides }
}

async function launch(
  closeBehavior: string,
): Promise<{ app: ElectronApplication; root: string; workspace: string }> {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-window-'))
  const home = join(root, 'home')
  const workspace = join(root, 'ws')
  const userData = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
  mkdirSync(userData, { recursive: true })
  writeFileSync(
    join(home, '.transactions-dev.json'),
    JSON.stringify({ width: 1200, height: 800, closeBehavior, appearance: 'light' }),
  )
  const app = await electron.launch({
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
  return { app, root, workspace }
}

test('窗口：关闭行为为托盘时隐藏窗口、进程保留', async () => {
  const { app, root } = await launch('tray')
  try {
    const page = await app.firstWindow()
    await page.getByTestId('open-workspace').click()
    await expect(page.getByTestId('workspace-state')).toContainText('已打开')
    await page.getByTestId('window-close').click()
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? false),
      )
      .toBe(false)
  } finally {
    await app.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('窗口：关闭时保存尺寸到配置', async () => {
  const { app, root } = await launch('quit')
  try {
    const page = await app.firstWindow()
    await page.getByTestId('open-workspace').click()
    await expect(page.getByTestId('workspace-state')).toContainText('已打开')
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setSize(1320, 860)
    })
    await page.waitForTimeout(400)
    await page.getByTestId('window-close').click()
    await expect.poll(() => page.isClosed()).toBe(true)
    const configPath = join(root, 'home', '.transactions-dev.json')
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as { width: number; height: number }
    expect(Math.abs(config.width - 1320)).toBeLessThanOrEqual(2)
    expect(Math.abs(config.height - 860)).toBeLessThanOrEqual(2)
  } finally {
    try {
      await app.close()
    } catch {
      // 已退出
    }
    rmSync(root, { recursive: true, force: true })
  }
})

test('窗口：关闭行为为退出时进程结束', async () => {
  const { app, root } = await launch('quit')
  try {
    const page = await app.firstWindow()
    await page.getByTestId('open-workspace').click()
    await expect(page.getByTestId('workspace-state')).toContainText('已打开')
    await page.getByTestId('window-close').click()
    await expect.poll(() => page.isClosed()).toBe(true)  } finally {
    try {
      await app.close()
    } catch {
      // 已经退出
    }
    rmSync(root, { recursive: true, force: true })
  }
})




