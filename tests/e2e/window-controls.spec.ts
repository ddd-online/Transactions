import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

test('窗口三键：最大化/还原、最小化', async () => {
  const repo = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-window-controls-'))
  const home = join(root, 'home')
  const ws = join(root, 'ws')
  const userData = join(root, 'ud')
  mkdirSync(home, { recursive: true })
  mkdirSync(userData, { recursive: true })
  writeFileSync(join(home, '.tr.dev.json'), JSON.stringify({ width: 1200, height: 800, closeBehavior: 'quit', appearance: 'light' }))
  const app = await electron.launch({
    args: ['.'],
    cwd: repo,
    env: environment({ USERPROFILE: home, HOME: home, TRANSACTIONS_USER_DATA: userData, TRANSACTIONS_TEST_DIALOG_DIR: ws, TRANSACTIONS_TEST_CLOSE: 'quit' }),
  })
  try {
    const page = await app.firstWindow()
    await page.getByTestId('open-workspace').click()
    await expect(page.getByTestId('workspace-state')).toContainText('已打开')
    await page.getByTestId('window-maximize').click()
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized())).toBe(true)
    await expect(page.getByTestId('window-maximize')).toHaveAttribute('title', '还原')
    await page.getByTestId('window-maximize').click()
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized())).toBe(false)
    await expect(page.getByTestId('window-maximize')).toHaveAttribute('title', '最大化')
    await page.getByTestId('window-minimize').click()
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized())).toBe(true)
  } finally {
    await app.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('窗口三键：工作空间选择遮罩未关闭时也可用', async () => {
  const repo = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-window-controls-overlay-'))
  const home = join(root, 'home')
  const ws = join(root, 'ws')
  const userData = join(root, 'ud')
  mkdirSync(home, { recursive: true })
  mkdirSync(userData, { recursive: true })
  writeFileSync(join(home, '.tr.dev.json'), JSON.stringify({ width: 1200, height: 800, closeBehavior: 'quit', appearance: 'light' }))
  const app = await electron.launch({
    args: ['.'],
    cwd: repo,
    env: environment({ USERPROFILE: home, HOME: home, TRANSACTIONS_USER_DATA: userData, TRANSACTIONS_TEST_DIALOG_DIR: ws, TRANSACTIONS_TEST_CLOSE: 'quit' }),
  })
  try {
    const page = await app.firstWindow()
    await expect(page.getByTestId('open-workspace')).toBeVisible()
    await page.getByTestId('window-maximize').click()
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized())).toBe(true)
    await expect(page.getByTestId('window-maximize')).toHaveAttribute('title', '还原')
    await page.getByTestId('window-maximize').click()
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized())).toBe(false)
    await expect(page.getByTestId('window-maximize')).toHaveAttribute('title', '最大化')
    await page.getByTestId('window-minimize').click()
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized())).toBe(true)
  } finally {
    await app.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('窗口：保存的尺寸和位置超出工作区时夹回屏内', async () => {
  const repo = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-window-bounds-'))
  const home = join(root, 'home')
  const ws = join(root, 'ws')
  const userData = join(root, 'ud')
  mkdirSync(home, { recursive: true })
  mkdirSync(userData, { recursive: true })
  writeFileSync(
    join(home, '.tr.dev.json'),
    JSON.stringify({
      width: 20000,
      height: 16000,
      x: 4000,
      y: 3000,
      closeBehavior: 'quit',
      appearance: 'light',
    }),
  )
  const app = await electron.launch({
    args: ['.'],
    cwd: repo,
    env: environment({ USERPROFILE: home, HOME: home, TRANSACTIONS_USER_DATA: userData, TRANSACTIONS_TEST_DIALOG_DIR: ws }),
  })
  try {
    await app.firstWindow()
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 800))
    const state = await app.evaluate(({ BrowserWindow, screen }) => {
      const bounds = BrowserWindow.getAllWindows()[0].getBounds()
      const display = screen.getDisplayMatching(bounds)
      return {
        bounds,
        // screen 模块返回的 workArea 已经是 DIP，与 BrowserWindow 的边界同口径
        workArea: display.workArea,
      }
    })
    expect(state.bounds.width).toBeLessThanOrEqual(state.workArea.width)
    expect(state.bounds.height).toBeLessThanOrEqual(state.workArea.height)
    expect(state.bounds.x).toBeGreaterThanOrEqual(state.workArea.x)
    expect(state.bounds.y).toBeGreaterThanOrEqual(state.workArea.y)
    expect(state.bounds.x + state.bounds.width).toBeLessThanOrEqual(state.workArea.x + state.workArea.width)
    expect(state.bounds.y + state.bounds.height).toBeLessThanOrEqual(state.workArea.y + state.workArea.height)
  } finally {
    await app.close()
    rmSync(root, { recursive: true, force: true })
  }
})




