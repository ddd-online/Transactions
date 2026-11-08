import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
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

interface Fixture {
  root: string
  home: string
  workspace: string
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
  return { root, home, workspace, backupDir, userData, configPath: join(home, '.tr.dev.json') }
}

function writeConfig(fixture: Fixture, overrides: Record<string, unknown> = {}): void {
  writeFileSync(
    fixture.configPath,
    JSON.stringify({
      width: 1400,
      height: 1000,
      closeBehavior: 'quit',
      appearance: 'light',
      backupDir: fixture.backupDir,
      // workspaceDir 直接给上：启动即打开，不必再点目录框
      workspaceDir: fixture.workspace,
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

/** 本地日期 → 自动备份文件名 `auto-YYYYMMDD.db`（与主进程同一口径，测试按本地时区算）。 */
function autoName(when: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `auto-${when.getFullYear()}${pad(when.getMonth() + 1)}${pad(when.getDate())}.db`
}

/** 本地日期往前推 `days` 天（跨月 / 跨年交给 Date 算）。 */
function daysAgo(days: number): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - days)
}

function autoNames(directory: string): string[] {
  if (!existsSync(directory)) return []
  return readdirSync(directory).filter((name) => /^auto-\d{8}\.db$/.test(name))
}

function readConfig(fixture: Fixture): Record<string, unknown> {
  return JSON.parse(readFileSync(fixture.configPath, 'utf8')) as Record<string, unknown>
}

test('自动备份：同一天两次启动只产生一份当日快照', async () => {
  const fixture = setup('tr-e2e-auto-once-')
  writeConfig(fixture)
  const today = autoName(new Date())

  const first = await launch(fixture)
  try {
    const page = await first.firstWindow()
    await expect(page.getByTestId('workspace-state')).toContainText(fixture.workspace)
    expect(existsSync(join(fixture.backupDir, today))).toBe(true)
  } finally {
    await first.close().catch(() => undefined)
  }

  const second = await launch(fixture)
  try {
    const page = await second.firstWindow()
    await expect(page.getByTestId('workspace-state')).toContainText(fixture.workspace)
    // 「每天第一次」而不是「每次打开」：当天已经有一份，再开一次不写第二份
    expect(autoNames(fixture.backupDir)).toEqual([today])
  } finally {
    await second.close().catch(() => undefined)
    rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('默认备份位置：没配 backupDir 时落在「文档」下的 Transactions 备份', async () => {
  const fixture = setup('tr-e2e-auto-default-')
  // 不写 backupDir：空串 = 默认目录。这条同时钉住「文档目录拿不到时应用照常启动」：
  // 一次性 profile 里没有 Documents，主进程必须退回 homedir 下的 Documents 才能起得来。
  writeFileSync(
    fixture.configPath,
    JSON.stringify({
      width: 1400,
      height: 1000,
      closeBehavior: 'quit',
      appearance: 'light',
      workspaceDir: fixture.workspace,
    }),
  )
  const defaultBackupDir = join(fixture.home, 'Documents', 'Transactions 备份')

  const electronApp = await launch(fixture)
  try {
    const page = await electronApp.firstWindow()
    await expect(page.getByTestId('workspace-state')).toContainText(fixture.workspace)

    // 当天自动备份真的写进了默认目录（目录不存在时由备份服务建出来）
    expect(existsSync(join(defaultBackupDir, autoName(new Date())))).toBe(true)

    await page.getByTestId('nav-settings').click()
    await page.getByTestId('settings-tab-data').click()
    await expect(page.getByTestId('backup-dir')).toHaveValue(defaultBackupDir)
    // 配置里仍是空串：默认位置是解析出来的，不写死进用户配置
    expect(readConfig(fixture).backupDir).toBe('')
  } finally {
    await electronApp.close().catch(() => undefined)
    rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('自动备份：只裁剪自己产生的旧快照，手动备份永远不动', async () => {
  const fixture = setup('tr-e2e-auto-prune-')
  writeConfig(fixture)
  mkdirSync(fixture.backupDir, { recursive: true })

  // 预置 8 份旧的自动备份（直接铺文件，裁剪只看名字）与一份手动备份目录
  const seeded: string[] = []
  for (let days = 1; days <= 8; days += 1) {
    const name = autoName(daysAgo(days))
    writeFileSync(join(fixture.backupDir, name), '')
    seeded.push(name)
  }
  const manualName = 'Transactions-备份-20200101-000000'
  mkdirSync(join(fixture.backupDir, manualName))

  const electronApp = await launch(fixture)
  try {
    const page = await electronApp.firstWindow()
    await expect(page.getByTestId('workspace-state')).toContainText(fixture.workspace)

    // 8 份旧 + 今天 1 份 = 9，保留最近 7 份 ⇒ 最老的两份被删
    const autos = autoNames(fixture.backupDir).sort()
    expect(autos).toHaveLength(7)
    expect(autos).toContain(autoName(new Date()))
    expect(autos).not.toContain(seeded[6])
    expect(autos).not.toContain(seeded[7])
    for (const kept of seeded.slice(0, 6)) expect(autos).toContain(kept)

    // 手动备份不参与裁剪
    expect(existsSync(join(fixture.backupDir, manualName))).toBe(true)
  } finally {
    await electronApp.close().catch(() => undefined)
    rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('自动备份：开关关掉时既不写当日快照，开关也显示为关', async () => {
  const fixture = setup('tr-e2e-auto-off-')
  writeConfig(fixture, { autoBackup: false })
  const electronApp = await launch(fixture)

  try {
    const page = await electronApp.firstWindow()
    await expect(page.getByTestId('workspace-state')).toContainText(fixture.workspace)

    expect(autoNames(fixture.backupDir)).toEqual([])

    await page.getByTestId('nav-settings').click()
    await page.getByTestId('settings-tab-data').click()
    await expect(page.getByTestId('auto-backup')).toHaveAttribute('aria-checked', 'false')
    expect(readConfig(fixture).autoBackup).toBe(false)

    await page.waitForTimeout(200)
    await page.screenshot({
      path: join(resolve(__dirname, '../..'), 'artifacts', 'tests', 'backup-auto-off.png'),
    })
  } finally {
    await electronApp.close().catch(() => undefined)
    rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('最近工作空间：打开 A 再开 B，顺序 / 置灰 / 切换都写回配置', async () => {
  const fixture = setup('tr-e2e-recent-')
  // 自动备份与这条断言无关：关掉，别在备份目录里添噪音
  writeConfig(fixture, { workspaceDir: '', autoBackup: false })
  const first = join(fixture.root, 'ws-a')
  const second = join(fixture.root, 'ws-b')

  const electronApp = await electron.launch({
    args: ['.'],
    cwd: resolve(__dirname, '../..'),
    env: environment({
      USERPROFILE: fixture.home,
      HOME: fixture.home,
      TRANSACTIONS_USER_DATA: fixture.userData,
      TRANSACTIONS_TEST_DIALOG_DIRS: `${first}|${second}`,
      TRANSACTIONS_TEST_CLOSE: 'quit',
    }),
  })

  try {
    const page = await electronApp.firstWindow()
    await page.getByTestId('open-workspace').click()
    await expect(page.getByTestId('workspace-state')).toContainText(first)

    // 设置 → 通用里的「切换」走同一个目录框，这次开 B
    await page.getByTestId('nav-settings').click()
    await page.getByTestId('open-workspace').click()
    await expect(page.getByTestId('workspace-state')).toContainText(second)

    const recentOrder = (): unknown => readConfig(fixture).recentWorkspaces
    await expect.poll(recentOrder).toEqual([second, first])

    await page.getByTestId('settings-tab-data').click()
    const rows = page.getByTestId('recent-workspace-row')
    await expect(rows).toHaveCount(2)
    // 最新的在前：B 是当前那条，置灰且不可点
    await expect(rows.nth(0)).toContainText(second)
    await expect(rows.nth(0)).toHaveAttribute('data-current', 'true')
    await expect(rows.nth(0)).toBeDisabled()
    // A 可以被点回去
    await expect(rows.nth(1)).toContainText(first)
    await expect(rows.nth(1)).toBeEnabled()
    expect(await rows.nth(1).getAttribute('data-current')).toBeNull()

    await page.waitForTimeout(200)
    await page.screenshot({
      path: join(resolve(__dirname, '../..'), 'artifacts', 'tests', 'backup-recent.png'),
    })

    // 点 A：工作空间切回去，配置里的顺序也跟着变成 [A, B]
    await rows.nth(1).click()
    await expect(page.getByTestId('workspace-state')).toContainText(first)
    await expect.poll(recentOrder).toEqual([first, second])
    await expect(rows.nth(0)).toContainText(first)
    await expect(rows.nth(0)).toHaveAttribute('data-current', 'true')
    await expect(rows.nth(1)).toContainText(second)
  } finally {
    await electronApp.close().catch(() => undefined)
    rmSync(fixture.root, { recursive: true, force: true })
  }
})
