import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

import { createLedger } from './ledger-helper'
import { environment } from './helpers'

test('设置：外观落盘并驱动 data-theme；功能开关键名落盘', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-settings-'))
  const home = join(root, 'home')
  const workspace = join(root, 'ws')
  const userData = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
  mkdirSync(userData, { recursive: true })
  const configPath = join(home, '.tr.dev.json')
  writeFileSync(
    configPath,
    JSON.stringify({ width: 1200, height: 900, closeBehavior: 'quit', appearance: 'light' }),
  )

  const proxyTarget = createServer((_request, response) => {
    response.writeHead(204)
    response.end()
  })
  await new Promise<void>((resolveServer, rejectServer) => {
    proxyTarget.once('error', rejectServer)
    proxyTarget.listen(0, '127.0.0.1', resolveServer)
  })
  const proxyTargetUrl = `http://127.0.0.1:${(proxyTarget.address() as AddressInfo).port}/health`

  const electronApp = await electron.launch({
    args: ['.'],
    cwd: repositoryRoot,
    env: environment({
      USERPROFILE: home,
      HOME: home,
      TRANSACTIONS_USER_DATA: userData,
      TRANSACTIONS_TEST_DIALOG_DIR: workspace,
      TRANSACTIONS_TEST_CLOSE: 'quit',
      TRANSACTIONS_TEST_PROXY_TARGET: proxyTargetUrl,
      TRANSACTIONS_TEST_PROXY_ADDRESS: '127.0.0.1:7890',
    }),
  })

  try {
    const page = await electronApp.firstWindow()
    await page.getByTestId('open-workspace').click()
    await expect(page.getByTestId('workspace-state')).toContainText('已打开')

    await createLedger(page, '设置账本')
    await page.getByTestId('nav-settings').click()
    await page.getByTestId('settings-tab-about').click()
    await expect(page.getByTestId('update-status')).toContainText('检查更新')
    // 数据导入已移除：分栏回归为「备份 / 恢复」，没有任何导入入口
    await page.getByTestId('settings-tab-data').click()
    await expect(page.getByTestId('settings-tab-data')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('backup-now')).toBeVisible()
    await expect(page.getByRole('button', { name: /导入/ })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /导入/ })).toHaveCount(0)

    // 连续两次动作只留一条提示：新的把旧的顶上去，不排成一列
    await page.getByTestId('backup-now').click()
    await expect(page.getByTestId('backup-result')).toContainText('已备份')
    await page.getByTestId('backup-now').click()
    await expect(page.getByTestId('toast')).toHaveCount(1)
    const latestBackup = await page
      .getByTestId('backup-result')
      .locator('.st-backup-mono')
      .first()
      .innerText()
    await expect(page.getByTestId('toast')).toContainText(latestBackup)

    await page.getByTestId('settings-tab-general').click()
    await page.getByTestId('appearance-dark').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect
      .poll(() => JSON.parse(readFileSync(configPath, 'utf8')).appearance)
      .toBe('dark')

    await page.getByTestId('close-behavior-tray').click()
    await expect
      .poll(() => JSON.parse(readFileSync(configPath, 'utf8')).closeBehavior)
      .toBe('tray')

    // 「每次询问」也必须存得下来（主进程曾只认 quit / tray，选了会弹「无效的关闭行为」）
    await page.getByTestId('close-behavior-ask').click()
    await expect
      .poll(() => JSON.parse(readFileSync(configPath, 'utf8')).closeBehavior)
      .toBe('ask')
    await expect(page.getByTestId('close-behavior-ask')).toHaveAttribute('aria-pressed', 'true')

    await page.getByTestId('proxy-mode-manual').click()
    // 手动的地址空着就保存：失败是一次动作的回执，走消息（而不是页面顶上多一行红字）
    await page.getByTestId('proxy-url').fill('')
    await page.getByTestId('proxy-save').click()
    await expect(
      page.getByTestId('toast').filter({ hasText: '请填写代理地址' }),
    ).toBeVisible()
    await expect(page.getByTestId('error')).toHaveCount(0)
    await page.waitForTimeout(250)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'settings-proxy-error-toast.png'),
    })

    await page.getByTestId('proxy-url').fill('http://127.0.0.1:7890')
    await page.getByTestId('proxy-save').click()
    await expect
      .poll(() => JSON.parse(readFileSync(configPath, 'utf8')).proxy)
      .toEqual({ mode: 'manual', url: 'http://127.0.0.1:7890' })
    await page.getByTestId('proxy-mode-auto').click()
    await expect(page.getByTestId('proxy-resolved')).toHaveValue('127.0.0.1:7890')
    await expect(page.getByTestId('proxy-save')).toHaveCount(0)
    await expect(page.getByTestId('proxy-url')).toHaveCount(0)
    await page.getByTestId('proxy-detect').click()
    await expect(
      page.getByTestId('toast').filter({ hasText: '代理连通正常' }),
    ).toBeVisible()
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(repositoryRoot, 'artifacts', 'tests', 'settings-proxy.png') })

    await page.getByTestId('proxy-mode-off').click()
    await expect(page.getByTestId('proxy-save')).toHaveCount(0)
    await expect(page.getByTestId('proxy-detect')).toHaveCount(0)

    await page.getByTestId('workspace-icon-input').setInputFiles({
      name: 'icon.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      ),
    })
    await expect(page.getByTestId('workspace-icon')).toBeVisible()
    const iconWidth = await page
      .getByTestId('workspace-icon')
      .evaluate((element) => (element as HTMLImageElement).naturalWidth)
    expect(iconWidth).toBeGreaterThan(0)
    expect(existsSync(join(workspace, 'data', 'assets', 'workspace-icon.png'))).toBe(true)

    await page.getByTestId('workspace-icon-clear').click()
    await expect(page.getByTestId('workspace-icon')).toHaveCount(0)
    expect(existsSync(join(workspace, 'data', 'assets', 'workspace-icon.png'))).toBe(false)

    await page.getByTestId('settings-tab-features').click()
    // 后果挂在分区标题旁的 ⓘ 上，不再占一行正文：读屏读 aria-label，鼠标 / 焦点出气泡。
    const featureHint = page.getByTestId('feature-hint')
    await expect(featureHint).toHaveAttribute('aria-label', /只对当前账本生效/)
    await featureHint.hover()
    await expect(page.locator('.ant-tooltip:not(.ant-tooltip-hidden)')).toContainText(
      '只对当前账本生效',
    )
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'settings-features.png'),
    })
    await expect(page.getByTestId('feature-row-accounting')).toBeVisible()
    await page.getByTestId('feature-stock').click()
    await expect(page.getByTestId('feature-stock')).toHaveAttribute('aria-checked', 'false')
    await expect(page.getByTestId('nav-stock')).toHaveCount(0)
    await expect
      .poll(() => {
        const features = JSON.parse(readFileSync(configPath, 'utf8')).ledgerFeatures as Record<
          string,
          { stock: boolean }
        >
        return Object.values(features).some((entry) => entry.stock === false)
      })
      .toBe(true)
    await page.getByTestId('feature-stock').click()
    await expect(page.getByTestId('feature-stock')).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('nav-stock')).toHaveCount(1)
    await expect
      .poll(() => {
        const features = JSON.parse(readFileSync(configPath, 'utf8')).ledgerFeatures as Record<
          string,
          { stock: boolean }
        >
        return Object.values(features).every((entry) => entry.stock !== false)
      })
      .toBe(true)

    // 窄窗：设置面板的分栏横到顶上，内容区必须跟着收 —— 否则面板会横向溢出。
    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setSize(720, 900)
    })
    await page.getByTestId('settings-tab-general').click()
    await expect
      .poll(() =>
        page.evaluate(() => {
          const dialog = document.querySelector('.settings-dialog')
          return dialog ? dialog.scrollWidth - dialog.clientWidth : -1
        }),
      )
      .toBe(0)
  } finally {
    await electronApp.close()
    await new Promise<void>((resolveServer) => proxyTarget.close(() => resolveServer()))
    rmSync(root, { recursive: true, force: true })
  }
})













