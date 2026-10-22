import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

import { addDays } from '../../shared/domain/calendar'
import { createLedger } from './ledger-helper'

function environment(overrides: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') result[key] = value
  }
  delete result.ELECTRON_RUN_AS_NODE
  return { ...result, ...overrides }
}

function ymd(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

test('时间范围：记录与分析共用粒度、区间与快捷项', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-time-'))
  const home = join(root, 'home')
  const workspace = join(root, 'ws')
  const userData = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
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
    await expect(page.getByTestId('workspace-state')).toContainText('已打开')
    await createLedger(page, '时间账本')
    await page.getByTestId('nav-accounting').click()
    await page.getByTestId('acct-tab-records').click()

    const today = new Date()
    const todayYmd = ymd(today)
    const monthKey = todayYmd.slice(0, 7)
    const yearKey = todayYmd.slice(0, 4)
    const laterYmd = addDays(todayYmd, 2) ?? todayYmd

    await expect(page.getByTestId('tr-time-trigger')).toHaveText(todayYmd)
    await page.getByTestId('tr-time-trigger').click()
    await expect(page.getByTestId('tr-time-panel')).toBeVisible()
    await page.screenshot({ path: join(repositoryRoot, 'artifacts', 'tests', 'time-date.png') })

    await page.getByTestId('tr-time-mode-month').click()
    await expect(page.getByTestId('tr-time-trigger')).toHaveText(monthKey)
    await expect(page.getByTestId(`tr-time-month-${monthKey}`)).toBeVisible()
    await page.screenshot({ path: join(repositoryRoot, 'artifacts', 'tests', 'time-month.png') })

    await page.getByTestId('tr-time-mode-year').click()
    await expect(page.getByTestId('tr-time-trigger')).toHaveText(yearKey)
    await expect(page.getByTestId(`tr-time-year-${yearKey}`)).toBeVisible()
    await page.screenshot({ path: join(repositoryRoot, 'artifacts', 'tests', 'time-year.png') })

    // 回到日粒度：先点「今天」快捷项，再两次点击选「日 → 日」区间
    await page.getByTestId('tr-time-mode-date').click()
    await page.getByTestId('tr-time-preset-今天').click()
    await expect(page.getByTestId('tr-time-trigger')).toHaveText(todayYmd)
    await page.getByTestId(`tr-time-day-${todayYmd}`).click()
    await expect(page.getByTestId('tr-time-trigger')).toHaveText(`${todayYmd} ~`)
    await page.getByTestId(`tr-time-day-${laterYmd}`).click()
    await expect(page.getByTestId('tr-time-trigger')).toHaveText(
      `${todayYmd} ~ ${laterYmd}`,
    )
    await page.getByTestId('tr-time-trigger').click()
    await expect(page.getByTestId('tr-time-panel')).toHaveCount(0)

    // 分析页使用同一个组件
    await page.getByTestId('acct-tab-charts').click()
    await expect(page.getByTestId('chart-time-trigger')).toBeVisible()
    await page.getByTestId('chart-time-trigger').click()
    await expect(page.getByTestId('chart-time-panel')).toBeVisible()
    await page.getByTestId('chart-time-mode-year').click()
    await expect(page.getByTestId('chart-time-trigger')).toContainText(yearKey)
    await page.screenshot({ path: join(repositoryRoot, 'artifacts', 'tests', 'chart-time.png') })
  } finally {
    await electronApp.close()
    rmSync(root, { recursive: true, force: true })
  }
})
