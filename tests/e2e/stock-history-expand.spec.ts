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

test('股票记录：选中股票默认展开最新一轮', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-stock-history-expand-'))
  const home = join(root, 'home')
  const workspace = join(root, 'ws')
  const userData = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
  mkdirSync(userData, { recursive: true })
  writeFileSync(
    join(home, '.tr.dev.json'),
    JSON.stringify({ width: 1400, height: 1000, closeBehavior: 'quit', appearance: 'light' }),
  )

  const app = await electron.launch({
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
    const page = await app.firstWindow()
    await page.getByTestId('open-workspace').click()
    await expect(page.getByTestId('workspace-state')).toContainText('已打开')
    await page.getByTestId('nav-settings').click()
    await createLedger(page, '记录展开账本')
    const ledgerId = await page.evaluate(async () => {
      const rows = await window.api.invoke('ledger_list', { id: 'all' })
      return rows.find((row) => row.name === '记录展开账本')?.id ?? ''
    })

    await page.evaluate(async (id) => {
      await window.api.invoke('stock_principal_add', {
        ledger_id: id,
        amount: 1_000_000,
        date: '',
      })
      const at = (day: number): number =>
        Math.trunc(new Date(2026, 9, day, 12, 0, 0).getTime() / 1000)
      // 两轮同一只股票：第 2 轮的轮次更大，应默认展开它
      for (const round of [
        { open: at(1), close: at(5) },
        { open: at(10), close: at(15) },
      ]) {
        for (const trade of [
          { type: 'open', time: round.open, price: 10 },
          { type: 'close', time: round.close, price: 11 },
        ]) {
          await window.api.invoke('stock_trade_create', {
            ledger_id: id,
            stock_code: '600000',
            stock_name: '浦发银行',
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
    await page.getByTestId('stock-tab-history').click()
    await expect(page.getByTestId('stock-round')).toHaveCount(2)

    const rounds = page.getByTestId('stock-round')
    await expect(rounds.nth(1)).toContainText('第 2 轮')
    await expect(rounds.nth(1).locator('.stock-round__body')).toBeVisible()
    await expect(rounds.nth(0).locator('.stock-round__body')).toHaveCount(0)

    await rounds.nth(0).locator('.stock-round__head').click()
    await expect(rounds.nth(0).locator('.stock-round__body')).toBeVisible()
  } finally {
    await app.close()
    rmSync(root, { recursive: true, force: true })
  }
})
