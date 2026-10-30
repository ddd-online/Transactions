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
    join(home, '.tr.dev.json'),
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

test('窗口：设置里改成「直接退出」后关闭即退出（改完立即生效）', async () => {
  const { app, root } = await launch('tray')
  try {
    const page = await app.firstWindow()
    await page.getByTestId('open-workspace').click()
    await expect(page.getByTestId('workspace-state')).toContainText('已打开')
    await page.getByTestId('nav-settings').click()
    await page.getByTestId('settings-tab-general').click()
    await page.getByTestId('close-behavior-quit').click()
    await expect
      .poll(() => JSON.parse(readFileSync(join(root, 'home', '.tr.dev.json'), 'utf8')).closeBehavior)
      .toBe('quit')
    await page.getByTestId('window-close').click()
    await expect.poll(() => page.isClosed(), { timeout: 5000 }).toBe(true)
  } finally {
    try {
      await app.close()
    } catch {
      // 已退出
    }
    rmSync(root, { recursive: true, force: true })
  }
})

test('窗口：退出被取消时也要真的退出，不留没有窗口的托盘进程', async () => {
  const { app, root } = await launch('quit')
  try {
    const page = await app.firstWindow()
    await page.getByTestId('open-workspace').click()
    await expect(page.getByTestId('workspace-state')).toContainText('已打开')
    // 真实事故：退出流程被打断后 quitting 已经置位，窗口关掉而进程留在托盘，
    // 再点托盘又开回一个窗口 —— 看起来就是「关闭行为不生效、总是缩到托盘」。
    await app.evaluate(({ app: electronApp }) => {
      electronApp.on('before-quit', (event) => {
        event.preventDefault()
      })
    })
    await page.getByTestId('window-close').click()
    await expect.poll(() => page.isClosed(), { timeout: 8000 }).toBe(true)
  } finally {
    try {
      await app.close()
    } catch {
      // 已退出
    }
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
    const configPath = join(root, 'home', '.tr.dev.json')
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

test('窗口：重启后恢复上次的位置和尺寸', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-window-restore-'))
  const home = join(root, 'home')
  const workspace = join(root, 'ws')
  const userData = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
  mkdirSync(userData, { recursive: true })
  writeFileSync(
    join(home, '.tr.dev.json'),
    JSON.stringify({ closeBehavior: 'quit', appearance: 'light' }),
  )

  const launchApp = (): Promise<ElectronApplication> =>
    electron.launch({
      args: ['.'],
      cwd: repositoryRoot,
      env: environment({
        USERPROFILE: home,
        HOME: home,
        TRANSACTIONS_USER_DATA: userData,
        TRANSACTIONS_TEST_DIALOG_DIR: workspace,
      }),
    })

  // 取工作区的绝大部分做目标尺寸：高 DPI 屏上若把 workArea 再除一次缩放比例，
  // 这里会被夹小、位置也被拉回左上角，第二段启动就会对不上。
  let target: { x: number; y: number; width: number; height: number } | null = null
  const first = await launchApp()
  try {
    const page = await first.firstWindow()
    await page.getByTestId('open-workspace').click()
    await expect(page.getByTestId('workspace-state')).toContainText('已打开')
    target = await first.evaluate(({ BrowserWindow, screen }) => {
      const window = BrowserWindow.getAllWindows()[0]
      const area = screen.getDisplayMatching(window.getBounds()).workArea
      const bounds = {
        x: area.x + 80,
        y: area.y + 60,
        width: Math.max(800, Math.min(area.width - 160, 1900)),
        height: Math.max(600, Math.min(area.height - 160, 1000)),
      }
      window.setBounds(bounds)
      return bounds
    })
    await page.waitForTimeout(500)
    await page.getByTestId('window-close').click()
    await expect.poll(() => page.isClosed()).toBe(true)
  } finally {
    try {
      await first.close()
    } catch {
      // 已退出
    }
  }
  expect(target).not.toBeNull()

  const saved = JSON.parse(readFileSync(join(home, '.tr.dev.json'), 'utf8')) as {
    x: number
    y: number
    width: number
    height: number
  }
  expect(Math.abs(saved.x - target!.x)).toBeLessThanOrEqual(2)
  expect(Math.abs(saved.y - target!.y)).toBeLessThanOrEqual(2)
  expect(Math.abs(saved.width - target!.width)).toBeLessThanOrEqual(2)
  expect(Math.abs(saved.height - target!.height)).toBeLessThanOrEqual(2)

  const second = await launchApp()
  try {
    const page = await second.firstWindow()
    await page.waitForTimeout(800)
    const restored = await second.evaluate(({ BrowserWindow }) => {
      return BrowserWindow.getAllWindows()[0].getBounds()
    })
    expect(Math.abs(restored.x - target!.x)).toBeLessThanOrEqual(2)
    expect(Math.abs(restored.y - target!.y)).toBeLessThanOrEqual(2)
    expect(Math.abs(restored.width - target!.width)).toBeLessThanOrEqual(2)
    expect(Math.abs(restored.height - target!.height)).toBeLessThanOrEqual(2)
  } finally {
    await second.close()
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




