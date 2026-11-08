import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { _electron as electron, expect, test } from '@playwright/test'

function environment(overrides: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') result[key] = value
  }
  delete result.ELECTRON_RUN_AS_NODE
  return { ...result, ...overrides }
}

test('旧版工作空间：打开被拒绝，设置里不再有数据导入', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-legacy-'))
  const home = join(root, 'home')
  const legacyRoot = join(root, 'legacy')
  const userData = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
  mkdirSync(legacyRoot, { recursive: true })
  mkdirSync(userData, { recursive: true })
  writeFileSync(
    join(home, '.tr.dev.json'),
    JSON.stringify({ width: 1400, height: 1000, closeBehavior: 'quit', appearance: 'light' }),
  )

  // 只有旧版迁移登记表 —— 足够让工作空间被识别成 tbl_billadm_* 结构
  const legacyDb = new DatabaseSync(join(legacyRoot, 'transactions.db'))
  legacyDb.exec('CREATE TABLE tbl_billadm_schema_migration (id TEXT, applied_at INTEGER)')
  legacyDb.close()

  const electronApp = await electron.launch({
    args: ['.'],
    cwd: repositoryRoot,
    env: environment({
      USERPROFILE: home,
      HOME: home,
      TRANSACTIONS_USER_DATA: userData,
      TRANSACTIONS_TEST_DIALOG_DIR: legacyRoot,
      TRANSACTIONS_TEST_CLOSE: 'quit',
    }),
  })

  try {
    const page = await electronApp.firstWindow()
    const overlay = page.getByTestId('workspace-overlay')
    await expect(overlay).toBeVisible()
    // 首屏是一张对话框：有角色、有名字，焦点在它上面，Tab 走不进背后的外壳
    await expect(overlay).toHaveAttribute('role', 'dialog')
    await expect(overlay).toHaveAttribute('aria-modal', 'true')
    await expect(overlay).toHaveAttribute('aria-label', '选择工作空间')
    expect(await overlay.evaluate((node) => document.activeElement === node)).toBe(true)
    const trail: string[] = []
    for (let step = 0; step < 4; step += 1) {
      await page.keyboard.press('Tab')
      trail.push(
        await page.evaluate(() => {
          const active = document.activeElement as HTMLElement | null
          if (!active) return 'none'
          if (active.closest('[data-testid="workspace-overlay"]')) return 'overlay'
          // 窗口三键留在遮罩之上，其余外壳内容一律不该可达
          return active.closest('.window-controls') ? 'window-controls' : 'shell'
        }),
      )
    }
    expect(trail).not.toContain('shell')
    expect(trail).toContain('overlay')

    await page.getByTestId('open-workspace').click()
    // 失败的那句话落在卡里 —— 写在外壳里的错误会被遮罩盖住，等于没说
    await expect(page.getByTestId('workspace-error')).toBeVisible()
    await expect(page.getByTestId('workspace-error')).toContainText('旧版工作空间')
    await expect(page.getByTestId('workspace-error')).toContainText('不再支持打开')

    // 没有工作空间也要进得了设置（代理 / 检查更新是应用级的）；数据分栏在，
    // 但只有备份与恢复，没有任何导入入口
    await page.getByTestId('open-app-settings').click()
    await expect(page.getByTestId('settings-tab-general')).toBeVisible()
    await page.getByTestId('settings-tab-data').click()
    await expect(page.getByTestId('settings-tab-data')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('backup-now')).toBeVisible()
    await expect(page.getByRole('button', { name: /导入/ })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /导入/ })).toHaveCount(0)
    await expect(page.getByTestId('workspace-state')).toContainText('未打开工作空间')
  } finally {
    await electronApp.close()
    rmSync(root, { recursive: true, force: true })
  }
})
