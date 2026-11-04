import { mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

import { createLedger } from './ledger-helper'

function environment(overrides: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') result[key] = value
  }
  delete result.ELECTRON_RUN_AS_NODE
  return { ...result, ...overrides }
}

/**
 * 分页按需加载之后多了一种新的坏法：chunk 读不到。
 *
 * 这条用例把股票页的 chunk 改名（等于安装文件缺失 / 被安全软件拦下），再点进去 ——
 * 期望是**只有这一页**换成「这一页没有加载出来 + 重新加载」，外壳、导航、账本都还在；
 * 原来没有边界时，React 会把整棵树卸掉，窗口只剩标题栏。
 */
test('分页加载失败：只有这一页变成一句可重试的话', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const assets = join(repositoryRoot, 'output', 'out', 'renderer', 'assets')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-boundary-'))
  const home = join(root, 'home')
  const workspace = join(root, 'ws')
  const userData = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
  mkdirSync(userData, { recursive: true })
  mkdirSync(workspace, { recursive: true })
  writeFileSync(
    join(home, '.tr.dev.json'),
    JSON.stringify({ width: 1400, height: 1000, closeBehavior: 'quit', appearance: 'light' }),
  )

  // 上一次跑崩了会把 chunk 留在 .parked：先恢复，再挑一个。
  for (const name of readdirSync(assets).filter((entry) => entry.endsWith('.js.parked'))) {
    renameSync(join(assets, name), join(assets, name.replace(/\.parked$/, '')))
  }

  const chunks = readdirSync(assets).filter((name) => /^stock-.*\.js$/.test(name))
  expect(chunks.length).toBeGreaterThan(0)
  const victim = join(assets, chunks[0])
  const parked = `${victim}.parked`

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
    await page.getByTestId('nav-settings').click()
    await createLedger(page, '边界账本')

    renameSync(victim, parked)

    await page.getByTestId('nav-stock').click()
    await expect(page.getByTestId('page-boundary')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('page-boundary')).toContainText('这一页没有加载出来')
    // 外壳还在：侧栏、账本菜单、底栏都还能用，不是整窗白屏
    await expect(page.getByTestId('nav-accounting')).toBeVisible()
    await expect(page.getByTestId('ledger-trigger')).toBeVisible()
    await expect(page.getByTestId('page-boundary-retry')).toBeVisible()
    // 第二条出路：文件真的读不到时，靠关掉应用重开，而不是原地循环重载
    await expect(page.getByTestId('page-boundary-close')).toBeVisible()
    await expect(page.getByTestId('page-boundary')).toContainText('关掉应用重新打开')

    // 切走再回来：边界跟着路由重置，别的页照常
    await page.getByTestId('nav-accounting').click()
    await expect(page.getByTestId('page-boundary')).toHaveCount(0)
  } finally {
    renameSync(parked, victim)
    await electronApp.close()
    rmSync(root, { recursive: true, force: true })
  }
})
