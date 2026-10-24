import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

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

test('股票：重置与归档', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-stock-life-'))
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
    page.on('dialog', (dialog) => void dialog.accept())
    await page.getByTestId('open-workspace').click()
    await expect(page.getByTestId('workspace-state')).toContainText('已打开')
    await page.getByTestId('nav-settings').click()
    await createLedger(page, '股票账本')
    await page.getByTestId('nav-stock').click()

    await page.getByTestId('stock-open-principal').click()
    await page.getByTestId('stock-amount').fill('1000')
    await page.getByTestId('stock-amount-confirm').click()
    await expect(page.getByTestId('stock-principal')).toHaveText('¥1000.00')

    await page.getByTestId('stock-tab-settings').click()
    await page.getByTestId('stock-reset').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByTestId('confirm-dialog-confirm').click()
    await page.getByTestId('stock-tab-account').click()
    await expect(page.getByTestId('stock-principal')).toHaveText('¥0.00')

    let database = new DatabaseSync(join(workspace, 'transactions.db'), { readOnly: true })
    let accountCount = database
      .prepare('SELECT COUNT(*) AS count FROM stock_fund_record')
      .get() as { count: number }
    const ledgerRow = database
      .prepare('SELECT id FROM ledger ORDER BY created_at ASC LIMIT 1')
      .get() as { id: string }
    database.close()
    const originalLedgerId = ledgerRow.id
    expect(accountCount.count).toBe(0)

    await page.getByTestId('stock-open-principal').click()
    await page.getByTestId('stock-amount').fill('500')
    await page.getByTestId('stock-amount-confirm').click()
    await expect(page.getByTestId('stock-principal')).toHaveText('¥500.00')

    await page.getByTestId('stock-tab-settings').click()
    await page.getByTestId('stock-archive-open').click()
    await page.getByTestId('stock-archive-name').fill('归档账本')
    await page.getByTestId('stock-archive').click()
    await expect(page.getByTestId('toast').last()).toContainText('已归档')
    await page.getByTestId('nav-accounting').click()
    await expect(page.getByTestId('ledger-select')).toContainText('归档账本')

    database = new DatabaseSync(join(workspace, 'transactions.db'), { readOnly: true })
    const originalFunds = database
      .prepare('SELECT COUNT(*) AS count FROM stock_fund_record WHERE ledger_id = ?')
      .get(originalLedgerId) as { count: number }
    const movedFunds = database
      .prepare('SELECT COUNT(*) AS count FROM stock_fund_record WHERE ledger_id != ?')
      .get(originalLedgerId) as { count: number }
    database.close()
    expect(originalFunds.count).toBe(0)
    expect(movedFunds.count).toBe(1)  } finally {
    await electronApp.close()
    rmSync(root, { recursive: true, force: true })
  }
})






