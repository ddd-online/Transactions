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

test('股票：本金/支取/资金记录与费用设置', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-stock-'))
  const home = join(root, 'home')
  const workspace = join(root, 'ws')
  const userData = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
  mkdirSync(userData, { recursive: true })
  writeFileSync(
    join(home, '.transactions-dev.json'),
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
    await page.getByTestId('ledger-name').fill('股票账本')
    await page.getByTestId('ledger-create').click()
    await expect(page.getByTestId('ledger-item')).toHaveText(/股票账本/)

    await expect(page.getByTestId('stock-principal')).toHaveText('¥0.00')
    await expect(page.getByTestId('stock-cash')).toHaveText('¥0.00')
    await expect(page.getByTestId('fund-empty')).toContainText('还没有资金记录')

    await page.getByTestId('stock-amount').fill('1000')
    await page.getByTestId('stock-add-principal').click()
    await expect(page.getByTestId('stock-principal')).toHaveText('¥1000.00')
    await expect(page.getByTestId('stock-cash')).toHaveText('¥1000.00')
    await expect(page.getByTestId('fund-row')).toHaveText(/追加本金/)
    await expect(page.getByTestId('fund-row')).toHaveText(/1000\.00/)

    await page.getByTestId('stock-amount').fill('200')
    await page.getByTestId('stock-withdraw').click()
    await expect(page.getByTestId('stock-cash')).toHaveText('¥800.00')
    await expect(page.getByTestId('stock-principal')).toHaveText('¥1000.00')

    await page.getByTestId('fee-commission').fill('0.0001')
    await page.getByTestId('fee-save').click()
    await expect(page.getByTestId('stock-error')).toHaveCount(0)

    const database = new DatabaseSync(join(workspace, 'transactions.db'), { readOnly: true })
    const account = database
      .prepare('SELECT principal_cents FROM stock_account')
      .get() as { principal_cents: number }
    const funds = database
      .prepare('SELECT event_type, amount_change_cents, cash_balance_cents FROM stock_fund_record ORDER BY created_at')
      .all() as Array<{
      event_type: string
      amount_change_cents: number
      cash_balance_cents: number
    }>
    const fee = database
      .prepare('SELECT commission_rate FROM stock_fee_setting')
      .get() as { commission_rate: number }
    database.close()

    expect(account.principal_cents).toBe(100_000)
    expect(funds.map((row) => [row.event_type, row.amount_change_cents, row.cash_balance_cents])).toEqual([
      ['add_principal', 100_000, 100_000],
      ['withdraw', -20_000, 80_000],
    ])
    expect(fee.commission_rate).toBeCloseTo(0.0001, 10)
  } finally {
    await electronApp.close()
    rmSync(root, { recursive: true, force: true })
  }
})
