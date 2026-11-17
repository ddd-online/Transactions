import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

import { createLedger } from './ledger-helper'
import { environment } from './helpers'

test('标题栏：工作空间名入口、账本、外观切换、设置与关于分栏', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-menu-'))
  const home = join(root, 'home')
  const workspace = join(root, 'ws')
  const userData = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
  mkdirSync(userData, { recursive: true })
  writeFileSync(
    join(home, '.tr.dev.json'),
    JSON.stringify({ width: 1440, height: 950, closeBehavior: 'quit', appearance: 'light' }),
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
    await expect(page.getByTestId('workspace-state')).toContainText('已打开')

    // 标题栏：左边是「工作空间目录名 + ⌄」，中间只有一个页面名（不再带 Transactions- 前缀）。
    await expect(page.getByTestId('app-title')).toHaveText('记账')
    await expect(page.getByTestId('app-menu-trigger')).toContainText('ws')

    // 还没有账本时，菜单第一节说的是「暂无账本」，创建入口就在它下面。
    await page.getByTestId('app-menu-trigger').click()
    await expect(page.getByTestId('ledger-menu-empty')).toContainText('暂无账本')
    await page.waitForTimeout(260)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'app-menu-empty.png'),
    })
    await page.keyboard.press('Escape')

    await createLedger(page, '测试账本')
    await expect(page.getByTestId('app-title')).toHaveText('记账')

    // 菜单：账本一节在最上面，当前账本带对勾；下面是应用动作，外观不再占一行。
    await page.getByTestId('app-menu-trigger').click()
    await expect(page.getByTestId('app-menu')).toBeVisible()
    const activeRow = page
      .getByTestId('ledger-menu-row')
      .filter({ hasText: '测试账本' })
      .getByRole('menuitemradio')
    await expect(activeRow).toHaveAttribute('aria-checked', 'true')
    // 鼠标打开时焦点留在入口：当前账本行不会提前露出删除键（悬停 / 键盘聚焦才露）
    await expect(
      page.getByTestId('ledger-menu-row').filter({ hasText: '测试账本' }).getByTestId('ledger-delete'),
    ).toHaveCSS('opacity', '0')
    await expect(page.getByTestId('app-menu-settings')).toBeVisible()
    await expect(page.getByTestId('app-menu-theme')).toHaveCount(0)
    await page.waitForTimeout(260)
    await page.screenshot({ path: join(repositoryRoot, 'artifacts', 'tests', 'app-menu.png') })
    await page.keyboard.press('Escape')

    // 外观模式：标题栏的太阳键一按翻面，写回同一条配置；深色下再开菜单留一张证据。
    const themeToggle = page.getByTestId('theme-toggle')
    await expect(themeToggle).toHaveAttribute('title', '外观模式')
    await themeToggle.click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.getByTestId('app-menu-trigger').click()
    await page.waitForTimeout(260)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'app-menu-dark.png'),
    })
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('app-menu')).toHaveCount(0)
    await expect(page.getByTestId('app-menu-trigger')).toBeFocused()

    // 键盘打开：焦点直接进第一项，方向键在菜单里走。
    // 先把指针挪开面板，证明删除键只在悬停 / 聚焦时出现，不是指针停在那里的残留。
    await page.mouse.move(900, 700)
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('app-menu')).toBeVisible()
    await expect(page.getByRole('menuitemradio').first()).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByTestId('ledger-open-create')).toBeFocused()
    await page.waitForTimeout(260)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'app-menu-focus.png'),
    })
    await page.keyboard.press('Escape')

    // 再按一次太阳 / 月亮键回到浅色，设置页的外观分段跟着变。
    await themeToggle.click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    // 「应用设置」落到通用分栏，「关于软件」落到关于分栏 —— 同一个菜单两种落点。
    // 设置是浮在当前页上的工具窗：背后的页面还挂着，标题仍是那一页。
    await page.getByTestId('app-menu-trigger').click()
    await page.getByTestId('app-menu-settings').click()
    await expect(page.getByTestId('settings-layer')).toBeVisible()
    await expect(page.getByTestId('settings-tab-general')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('appearance-light')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('app-title')).toHaveText('记账')
    await page.waitForTimeout(260)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'settings-dialog.png'),
    })

    await page.getByTestId('app-menu-trigger').click()
    await page.getByTestId('app-menu-about').click()
    await expect(page.getByTestId('settings-tab-about')).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('.st-app-version')).toContainText('版本')
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'app-menu-about.png'),
    })

    // 关闭入口 + Esc：关闭后回到原来那一页，标题也跟着回来。
    await page.getByTestId('settings-close').click()
    await expect(page.getByTestId('settings-layer')).toHaveCount(0)
    await expect(page.getByTestId('app-title')).toHaveText('记账')

    await page.getByTestId('nav-settings').click()
    await expect(page.getByTestId('settings-layer')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('settings-layer')).toHaveCount(0)
    await expect(page.getByTestId('app-title')).toHaveText('记账')
  } finally {
    await electronApp.close()
    rmSync(root, { recursive: true, force: true })
  }
})
