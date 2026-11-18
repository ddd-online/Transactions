import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

import { createLedger } from './ledger-helper'
import { environment, listen } from './helpers'

test('底栏：常驻全宽，页面汇总进右端，? 菜单装 GitHub 与检查更新', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-footer-'))
  const home = join(root, 'home')
  const workspace = join(root, 'ws')
  const userData = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
  mkdirSync(workspace, { recursive: true })
  mkdirSync(userData, { recursive: true })

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
    await page.getByTestId('open-workspace').click()

    // 建一本账本，记录页才有收支合计
    await page.getByTestId('app-menu-trigger').click()
    await page.getByTestId('ledger-open-create').click()
    await page.getByTestId('ledger-name').fill('日常账本')
    await page.getByTestId('ledger-create').click()

    const footer = page.locator('.app-footer-bar')
    await expect(footer).toBeVisible()
    await expect(footer.locator('.statistics-footer')).toContainText('收入')
    await expect(footer.locator('.statistics-footer')).toContainText('支出')
    // 汇总只住在底栏里，页面主列不再有一条自己的底栏
    await expect(page.locator('.page-content .statistics-footer')).toHaveCount(0)

    // 换一页：底栏还在，页面汇总清空
    await page.getByTestId('nav-todo').click()
    await expect(footer).toBeVisible()
    await expect(footer.locator('.statistics-footer')).toHaveCount(0)

    // ? 菜单：两行常驻，GitHub 与「关于软件」里的链接同一个去处
    const menu = page.getByTestId('footer-help-menu')
    await page.getByTestId('footer-help').click()
    await expect(menu).toBeVisible()
    await expect(page.getByTestId('footer-help-github')).toHaveAttribute(
      'href',
      'https://github.com/ddd-online/Transactions',
    )
    await expect(page.getByTestId('footer-help-check')).toContainText('检查更新')

    // Esc 收回并把焦点还给 ? 键
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(page.getByTestId('footer-help')).toBeFocused()

    // 键盘打开：焦点直接落在第一行
    await page.keyboard.press('Enter')
    await expect(menu).toBeVisible()
    await expect(page.getByTestId('footer-help-github')).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByTestId('footer-help-check')).toBeFocused()

    // 点外面收回
    await page.mouse.click(300, 200)
    await expect(menu).toHaveCount(0)
  } finally {
    await electronApp.close()
  }
})

test('底栏：检查更新查到新版本时，菜单里给出下载入口并落到关于软件', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-footer-update-'))
  const home = join(root, 'home')
  const workspace = join(root, 'ws')
  const userData = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
  mkdirSync(workspace, { recursive: true })
  mkdirSync(userData, { recursive: true })
  writeFileSync(
    join(home, '.tr.dev.json'),
    JSON.stringify({
      width: 1400,
      height: 1000,
      closeBehavior: 'quit',
      appearance: 'light',
      proxy: { mode: 'off', url: '' },
    }),
  )

  const installer = Buffer.from('fake installer bytes for footer update smoke')
  const digest = createHash('sha256').update(installer).digest('hex')
  const server = createServer((request, response) => {
    if (request.url === '/release') {
      const port = (server.address() as { port: number }).port
      response.setHeader('content-type', 'application/json')
      response.end(
        JSON.stringify({
          tag_name: 'v9.9.9',
          body: '测试更新',
          assets: [
            {
              name: 'Transactions-9.9.9-setup.exe',
              browser_download_url: `http://127.0.0.1:${port}/Transactions-9.9.9-setup.exe`,
              digest: `sha256:${digest}`,
            },
          ],
        }),
      )
      return
    }
    response.statusCode = 404
    response.end('not found')
  })
  const port = await listen(server)

  const electronApp = await electron.launch({
    args: ['.'],
    cwd: repositoryRoot,
    env: environment({
      USERPROFILE: home,
      HOME: home,
      TRANSACTIONS_USER_DATA: userData,
      TRANSACTIONS_TEST_DIALOG_DIR: workspace,
      TRANSACTIONS_TEST_CLOSE: 'quit',
      TRANSACTIONS_TEST_RELEASE_API: `http://127.0.0.1:${port}/release`,
    }),
  })

  try {
    const page = await electronApp.firstWindow()
    await page.getByTestId('open-workspace').click()

    await page.getByTestId('footer-help').click()
    await page.getByTestId('footer-help-check').click()

    // 菜单不关：查到版本后顶部多出「下载新版本 9.9.9」
    await expect(page.getByTestId('toast')).toContainText('发现新版本 9.9.9')
    await expect(page.getByTestId('footer-help-menu')).toBeVisible()
    await expect(page.getByTestId('footer-help-offer')).toContainText('下载新版本 9.9.9')

    // 点它落到设置 · 关于软件（下载与安装只在那里做）
    await page.getByTestId('footer-help-offer').click()
    await expect(page.getByTestId('settings-layer')).toBeVisible()
    await expect(page.getByTestId('settings-tab-about')).toHaveAttribute('aria-current', 'page')
  } finally {
    await electronApp.close()
    server.close()
  }
})

test('底栏：窄窗下股票汇总换行，不裁掉最左边那一个', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-footer-narrow-'))
  const home = join(root, 'home')
  const workspace = join(root, 'ws')
  const userData = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
  mkdirSync(workspace, { recursive: true })
  mkdirSync(userData, { recursive: true })
  writeFileSync(
    join(home, '.tr.dev.json'),
    JSON.stringify({ width: 1400, height: 1000, closeBehavior: 'quit', appearance: 'light' }),
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
    await page.getByTestId('open-workspace').click()
    await createLedger(page, '股票账本')
    await page.getByTestId('nav-stock').click()
    await page.getByTestId('stock-open-principal').click()
    await page.getByTestId('stock-amount').fill('1000')
    await page.getByTestId('stock-amount-confirm').click()
    await expect(page.getByTestId('stock-principal')).toHaveText('¥1000.00')
    await page.getByTestId('stock-tab-history').click()

    // 400 宽：四个读数一行放不下，底栏长成两行，而不是把最左边那个裁掉
    await page.setViewportSize({ width: 400, height: 700 })
    const bar = page.locator('.app-footer-bar')
    await expect(bar).toBeVisible()
    await expect(bar.getByText('已实现盈亏')).toBeVisible()

    const layout = await page.evaluate(() => {
      const slot = document.querySelector('.app-footer-bar__page') as HTMLElement
      const stats = document.querySelector('.stock-history-footer') as HTMLElement
      const barElement = document.querySelector('.app-footer-bar') as HTMLElement
      const slotBox = slot.getBoundingClientRect()
      const statsBox = stats.getBoundingClientRect()
      return {
        barHeight: barElement.getBoundingClientRect().height,
        statsLeft: statsBox.left,
        statsRight: statsBox.right,
        slotLeft: slotBox.left,
        slotRight: slotBox.right,
      }
    })
    expect(layout.statsLeft).toBeGreaterThanOrEqual(layout.slotLeft - 0.5)
    expect(layout.statsRight).toBeLessThanOrEqual(layout.slotRight + 0.5)
    expect(layout.barHeight).toBeGreaterThan(44)
  } finally {
    await electronApp.close()
  }
})
