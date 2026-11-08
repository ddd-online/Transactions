import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { _electron as electron, expect, test, type Page } from '@playwright/test'

import { createLedger } from './ledger-helper'

/**
 * 当前迁移号（`electron/db/migrate.ts` 的 `MIGRATIONS.at(-1).version`，现在是第 10 条）。
 *
 * 写死而不是 import：migrate.ts 顶上 `import schemaSql from '.../0001_init.sql?raw'` 只有
 * electron-vite 认识，Playwright 的转译器不认识 `?raw`。加迁移时同步这一行。
 */
const SUPPORTED_SCHEMA_VERSION = 10

function environment(overrides: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') result[key] = value
  }
  delete result.ELECTRON_RUN_AS_NODE
  return { ...result, ...overrides }
}

interface Fixture {
  root: string
  home: string
  workspace: string
  /** 显式指定的备份位置：临时目录，绝不落进工作空间 */
  backupDir: string
  userData: string
  configPath: string
}

function setup(prefix: string): Fixture {
  const root = mkdtempSync(join(tmpdir(), prefix))
  const home = join(root, 'home')
  const workspace = join(root, 'ws')
  const backupDir = join(root, 'backups')
  const userData = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
  mkdirSync(userData, { recursive: true })
  return {
    root,
    home,
    workspace,
    backupDir,
    userData,
    configPath: join(home, '.tr.dev.json'),
  }
}

/** 写开发配置；备份位置显式给临时目录，自动备份保持默认开启（打开工作空间就会落一份 auto）。 */
function writeConfig(fixture: Fixture, overrides: Record<string, unknown> = {}): void {
  writeFileSync(
    fixture.configPath,
    JSON.stringify({
      width: 1400,
      height: 1000,
      closeBehavior: 'quit',
      appearance: 'light',
      backupDir: fixture.backupDir,
      ...overrides,
    }),
  )
}

function launch(fixture: Fixture, extraEnv: Record<string, string> = {}) {
  return electron.launch({
    args: ['.'],
    cwd: resolve(__dirname, '../..'),
    env: environment({
      USERPROFILE: fixture.home,
      HOME: fixture.home,
      TRANSACTIONS_USER_DATA: fixture.userData,
      TRANSACTIONS_TEST_DIALOG_DIR: fixture.workspace,
      TRANSACTIONS_TEST_CLOSE: 'quit',
      ...extraEnv,
    }),
  })
}

/** 在记录页记一笔（默认支出、今天的日期）。 */
async function addRecord(page: Page, amount: string, description: string): Promise<void> {
  await page.getByTestId('tr-new').click()
  await page.getByTestId('tr-amount').fill(amount)
  await page.getByTestId('tr-category').fill('餐饮美食')
  await page.getByTestId('tr-description').fill(description)
  await page.getByTestId('tr-save').click()
  // 保存成功 = 编辑弹窗收起；下一步的列表断言不会读到还没提交的草稿
  await expect(page.getByTestId('tr-save')).toHaveCount(0)
}

/** 备份目录里的手动备份目录名（`Transactions-备份-*`；自动备份与 pre-restore 不算）。 */
function manualBackups(directory: string): string[] {
  if (!existsSync(directory)) return []
  return readdirSync(directory).filter((name) => name.startsWith('Transactions-备份-'))
}

function schemaVersionOf(databasePath: string): number {
  const database = new DatabaseSync(databasePath, { readOnly: true })
  try {
    const row = database
      .prepare("SELECT value FROM app_meta WHERE key = 'schema_version'")
      .get() as { value: string } | undefined
    return Number(row?.value)
  } finally {
    database.close()
  }
}

function descriptionsOf(databasePath: string): string[] {
  const database = new DatabaseSync(databasePath, { readOnly: true })
  try {
    const rows = database
      .prepare('SELECT description FROM transaction_record ORDER BY description')
      .all() as Array<{ description: string }>
    return rows.map((row) => row.description)
  } finally {
    database.close()
  }
}

test('立即备份：备份目录出现快照，库能独立只读打开，记录与图片都在', async () => {
  const fixture = setup('tr-e2e-backup-')
  writeConfig(fixture)
  const electronApp = await launch(fixture)

  try {
    const page = await electronApp.firstWindow()
    await page.getByTestId('open-workspace').click()
    await expect(page.getByTestId('workspace-state')).toContainText('已打开')

    await createLedger(page, '备份账本')
    await page.getByTestId('nav-accounting').click()
    await page.getByTestId('acct-tab-records').click()
    await addRecord(page, '12.34', '备份前')
    await expect(page.getByTestId('tr-row')).toHaveCount(1)

    // 播种一张图片资产：备份要把 data/assets 一起带走
    const assetRelative = await page.evaluate(() => window.api.invoke('debug_write_asset'))
    expect(assetRelative).toBe('key_events/2026-01-01/m0.png')
    expect(existsSync(join(fixture.workspace, 'data', 'assets', assetRelative))).toBe(true)

    await page.getByTestId('nav-settings').click()
    await page.getByTestId('settings-tab-data').click()
    await expect(page.getByTestId('backup-dir')).toHaveValue(fixture.backupDir)
    await page.getByTestId('backup-now').click()

    // 「确实备出来了」：名称 + 大小 + 耗时都在那一行里
    const result = page.getByTestId('backup-result')
    await expect(result).toContainText('已备份')
    await expect(result).toContainText('Transactions-备份-')
    await expect(result).toContainText('ms')

    // 打开工作空间已经写了当天的 auto-*，所以只认手动备份那个前缀
    const names = manualBackups(fixture.backupDir)
    expect(names).toHaveLength(1)
    const backupName = names[0]
    const backupPath = join(fixture.backupDir, backupName)
    await expect(result).toContainText(backupName)
    expect(statSync(backupPath).isDirectory()).toBe(true)

    const snapshotPath = join(backupPath, 'transactions.db')
    expect(existsSync(snapshotPath)).toBe(true)
    // 快照能独立只读打开，库版本就是本程序当前支持的版本
    expect(schemaVersionOf(snapshotPath)).toBe(SUPPORTED_SCHEMA_VERSION)

    const snapshot = new DatabaseSync(snapshotPath, { readOnly: true })
    try {
      const rows = snapshot
        .prepare('SELECT amount_cents, description FROM transaction_record')
        .all() as Array<{ amount_cents: number; description: string }>
      expect(rows).toHaveLength(1)
      expect(rows[0].amount_cents).toBe(1234)
      expect(rows[0].description).toBe('备份前')
    } finally {
      snapshot.close()
    }

    // 图片资产也进了备份目录
    expect(
      existsSync(join(backupPath, 'data', 'assets', 'key_events', '2026-01-01', 'm0.png')),
    ).toBe(true)

    // 列表里看得见这一份：名称 / 日期 / 大小 / 库版本 / 含图片
    const row = page.getByTestId('backup-row').filter({ hasText: backupName })
    await expect(row).toBeVisible()
    await expect(row).toContainText(`库版本 v${SUPPORTED_SCHEMA_VERSION}`)
    await expect(row).toContainText('含图片')
    await expect(row).toContainText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)
    await expect(row).toContainText(/\d+(?:\.\d+)? (?:B|KB|MB)/)

    await page.waitForTimeout(200)
    await page.screenshot({
      path: join(resolve(__dirname, '../..'), 'artifacts', 'tests', 'backup-result.png'),
    })
  } finally {
    await electronApp.close().catch(() => undefined)
    rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('恢复：先另存 pre-restore，库回到快照，路径不变，重启后界面是恢复后的数据', async () => {
  const fixture = setup('tr-e2e-backup-restore-')
  writeConfig(fixture)
  // 恢复后只退出、不 relaunch：断言落在磁盘上，界面再起一个新实例验
  const electronApp = await launch(fixture, { TRANSACTIONS_TEST_RESTART: 'exit' })

  let backupName = ''
  try {
    const page = await electronApp.firstWindow()
    await page.getByTestId('open-workspace').click()
    await expect(page.getByTestId('workspace-state')).toContainText('已打开')

    await createLedger(page, '恢复账本')
    await page.getByTestId('nav-accounting').click()
    await page.getByTestId('acct-tab-records').click()
    await addRecord(page, '12.34', '备份前')
    await page.evaluate(() => window.api.invoke('debug_write_asset'))

    await page.getByTestId('nav-settings').click()
    await page.getByTestId('settings-tab-data').click()
    await page.getByTestId('backup-now').click()
    await expect(page.getByTestId('backup-result')).toContainText('已备份')

    const names = manualBackups(fixture.backupDir)
    expect(names).toHaveLength(1)
    backupName = names[0]
    const snapshotPath = join(fixture.backupDir, backupName, 'transactions.db')
    expect(descriptionsOf(snapshotPath)).toEqual(['备份前'])

    // 备份之后再写一条：恢复必须把它抹掉（否则「回去了」无从谈起）
    await page.getByTestId('nav-accounting').click()
    await page.getByTestId('acct-tab-records').click()
    await addRecord(page, '99.99', '备份后')
    await expect(page.getByTestId('tr-row')).toHaveCount(2)
    expect(descriptionsOf(join(fixture.workspace, 'transactions.db'))).toEqual([
      '备份前',
      '备份后',
    ])

    await page.getByTestId('nav-settings').click()
    await page.getByTestId('settings-tab-data').click()
    const row = page.getByTestId('backup-row').filter({ hasText: backupName })
    await expect(row).toBeVisible()

    const closed = new Promise<void>((resolveClosed) => {
      electronApp.once('close', () => resolveClosed())
    })
    await row.click()
    // 二次确认：恢复没有撤销按钮，正文得说清「先另存 pre-restore 再重启」
    await expect(page.getByText(/当前的库会先另存为 pre-restore 副本/)).toBeVisible()
    await expect(page.getByTestId('confirm-dialog-confirm')).toBeVisible()
    await page.getByTestId('confirm-dialog-confirm').click()
    await closed

    // 1) 恢复前的当前数据被另存为 pre-restore 单文件，内容就是那两条
    const preRestore = readdirSync(fixture.backupDir).filter((name) =>
      name.startsWith('pre-restore-'),
    )
    expect(preRestore).toHaveLength(1)
    expect(preRestore[0]).toMatch(/^pre-restore-\d{8}-\d{6}\.db$/)
    expect(descriptionsOf(join(fixture.backupDir, preRestore[0]))).toEqual([
      '备份前',
      '备份后',
    ])

    // 2) 工作空间的库回到快照状态（只剩第一条）
    expect(descriptionsOf(join(fixture.workspace, 'transactions.db'))).toEqual(['备份前'])

    // 3) 配置里的工作空间路径没变
    const config = JSON.parse(readFileSync(fixture.configPath, 'utf8')) as {
      workspaceDir: string
    }
    expect(config.workspaceDir).toBe(fixture.workspace)

    // 4) 再起一个同 env 的实例：界面显示的就是恢复后的数据
    const reopened = await launch(fixture)
    try {
      const restoredPage = await reopened.firstWindow()
      await expect(restoredPage.getByTestId('workspace-state')).toContainText(fixture.workspace)
      await restoredPage.getByTestId('nav-accounting').click()
      await restoredPage.getByTestId('acct-tab-records').click()
      await expect(restoredPage.getByTestId('tr-total')).toHaveText('共 1 条')
      await expect(restoredPage.getByTestId('tr-row')).toHaveCount(1)
      await expect(restoredPage.getByTestId('tr-row')).toContainText('备份前')
      await expect(restoredPage.getByTestId('tr-row')).not.toContainText('备份后')

      // 恢复的是手动备份目录：图片也一起回来了
      expect(
        existsSync(
          join(fixture.workspace, 'data', 'assets', 'key_events', '2026-01-01', 'm0.png'),
        ),
      ).toBe(true)

      await restoredPage.waitForTimeout(200)
      await restoredPage.screenshot({
        path: join(resolve(__dirname, '../..'), 'artifacts', 'tests', 'backup-restored.png'),
      })
    } finally {
      await reopened.close().catch(() => undefined)
    }
  } finally {
    await electronApp.close().catch(() => undefined)
    rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('备份位置指到工作空间内部：被拒绝，不建目录，不产生任何备份', async () => {
  const fixture = setup('tr-e2e-backup-inside-')
  writeConfig(fixture)
  const inside = join(fixture.workspace, 'inside')
  const electronApp = await electron.launch({
    args: ['.'],
    cwd: resolve(__dirname, '../..'),
    env: environment({
      USERPROFILE: fixture.home,
      HOME: fixture.home,
      TRANSACTIONS_USER_DATA: fixture.userData,
      // 第一次是工作空间目录，第二次（「更改备份位置」）是工作空间里的子目录
      TRANSACTIONS_TEST_DIALOG_DIRS: `${fixture.workspace}|${inside}`,
      TRANSACTIONS_TEST_CLOSE: 'quit',
    }),
  })

  try {
    const page = await electronApp.firstWindow()
    await page.getByTestId('open-workspace').click()
    await expect(page.getByTestId('workspace-state')).toContainText('已打开')

    await page.getByTestId('nav-settings').click()
    await page.getByTestId('settings-tab-data').click()
    await expect(page.getByTestId('backup-dir')).toHaveValue(fixture.backupDir)

    // 打开工作空间已经做了当天的自动备份：以这一刻的目录内容为基准
    const before = readdirSync(fixture.backupDir).sort()
    expect(before.some((name) => name.startsWith('auto-'))).toBe(true)

    await page.getByTestId('backup-dir-change').click()
    // 动作失败只走消息；页面上那行红字（data-error）只留给「这一页装不起来」
    await expect(
      page.getByTestId('toast').filter({ hasText: '不能放在工作空间内部' }),
    ).toBeVisible()
    await expect(page.getByTestId('toast').filter({ hasText: fixture.workspace })).toBeVisible()
    await expect(page.getByTestId('data-error')).toHaveCount(0)

    // 拒绝必须是「什么都不做」：不建目录、不写配置、备份目录里不添东西
    expect(existsSync(inside)).toBe(false)
    expect(readdirSync(fixture.backupDir).sort()).toEqual(before)
    await expect(page.getByTestId('backup-dir')).toHaveValue(fixture.backupDir)
    const config = JSON.parse(readFileSync(fixture.configPath, 'utf8')) as { backupDir: string }
    expect(config.backupDir).toBe(fixture.backupDir)

    await page.waitForTimeout(200)
    await page.screenshot({
      path: join(resolve(__dirname, '../..'), 'artifacts', 'tests', 'backup-dir-rejected.png'),
    })
  } finally {
    await electronApp.close().catch(() => undefined)
    rmSync(fixture.root, { recursive: true, force: true })
  }
})
