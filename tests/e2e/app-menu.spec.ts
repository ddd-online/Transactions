import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

import { createLedger } from './ledger-helper'
import { environment } from './helpers'

test('标题栏：应用菜单切账本、主题、设置与关于分栏', async () => {
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

    // 标题栏：左边是应用菜单入口，中间只有一个页面名（不再带 Transactions- 前缀）。
    await expect(page.getByTestId('app-title')).toHaveText('记账')
    await expect(page.getByTestId('app-menu-trigger')).toBeVisible()

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

    // 菜单：账本一节在最上面，当前账本带对勾；下面是应用动作。
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
    await page.waitForTimeout(260)
    await page.screenshot({ path: join(repositoryRoot, 'artifacts', 'tests', 'app-menu.png') })

    // 主题是二级菜单：选中深色后立刻落库并换肤。
    await page.getByTestId('app-menu-theme').click()
    await expect(page.getByTestId('app-menu-theme-menu')).toBeVisible()
    await page.waitForTimeout(260)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'app-menu-theme.png'),
    })
    await page.getByTestId('app-menu-theme-dark').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.getByTestId('app-menu')).toHaveCount(0)
    await page.getByTestId('app-menu-trigger').click()
    await page.waitForTimeout(260)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'app-menu-dark.png'),
    })

    // 键盘：Esc 收起菜单并把焦点还给入口。
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

    // 主题走同一条配置写入：换回浅色，设置页的外观分段跟着变。
    await page.getByTestId('app-menu-trigger').click()
    await page.getByTestId('app-menu-theme').click()
    await page.getByTestId('app-menu-theme-light').click()
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark')

    // 「应用设置」落到通用分栏，「关于软件」落到关于分栏 —— 同一个菜单两种落点。
    await page.getByTestId('app-menu-trigger').click()
    await page.getByTestId('app-menu-settings').click()
    await expect(page.getByTestId('settings-tab-general')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('appearance-light')).toHaveAttribute('aria-pressed', 'true')

    await page.getByTestId('app-menu-trigger').click()
    await page.getByTestId('app-menu-about').click()
    await expect(page.getByTestId('settings-tab-about')).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('.st-app-version')).toContainText('版本')
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'app-menu-about.png'),
    })
  } finally {
    await electronApp.close()
    rmSync(root, { recursive: true, force: true })
  }
})
