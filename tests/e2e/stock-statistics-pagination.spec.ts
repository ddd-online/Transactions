import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

test('股票统计明细：超过一页时分页可翻页', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-stock-paging-'))
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
    await page.getByTestId('nav-settings').click()
    await createLedger(page, '分页账本')

    const ledgerId = await page.evaluate(async () => {
      const ledgers = await window.api.invoke('ledger_list', { id: 'all' })
      return ledgers.find((ledger) => ledger.name === '分页账本')?.id ?? ''
    })
    expect(ledgerId).not.toBe('')

    // 17 轮结算（每天一轮），默认每页 15 条：第 1 页 15 行，第 2 页 2 行。
    await page.evaluate(async (id) => {
      const at = (day: number): number =>
        Math.trunc(new Date(2026, 8, day, 12, 0, 0).getTime() / 1000)
      for (let day = 1; day <= 17; day += 1) {
        for (const trade of [
          { type: 'open', time: at(day), price: 10 },
          { type: 'close', time: at(day) + 3_600, price: 10.5 },
        ]) {
          await window.api.invoke('stock_trade_create', {
            ledger_id: id,
            stock_code: '600519',
            stock_name: '贵州茅台',
            trade_type: trade.type,
            trade_time: trade.time,
            remark: '',
            tag: '',
            fills: [],
            price: trade.price,
            lots: 10,
          })
        }
      }
    }, ledgerId)

    await page.getByTestId('nav-stock').click()
    await page.getByTestId('stock-tab-statistics').click()
    await page.getByTestId('statistics-tab-detail').click()

    const rows = page.getByTestId('stock-statistics-point')
    const detailFoot = page.getByTestId('stock-statistics-detail-foot')
    await expect(rows).toHaveCount(15)
    await expect(detailFoot).toContainText('共 17 笔')
    await expect(detailFoot.locator('.ant-pagination-item')).toHaveCount(2)
    // 行序是结算序号倒序：第 1 页从最新一轮开始
    await expect(rows.nth(0)).toContainText('2026-09-17')

    await page.getByTestId('stock-statistics-detail-next').locator('button').click()
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0)).toContainText('2026-09-02')
    await expect(rows.nth(1)).toContainText('2026-09-01')
    await expect(detailFoot.locator('.ant-pagination-item-active')).toHaveText('2')

    await page.waitForTimeout(300)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'stock-statistics-pagination.png'),
    })
  } finally {
    await electronApp.close()
    rmSync(root, { recursive: true, force: true })
  }
})
