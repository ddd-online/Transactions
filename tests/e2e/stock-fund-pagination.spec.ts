import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
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

test('股票资金变化记录：每页 15 条', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-fund-page-'))
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
    await createLedger(page, '股票账本')
    await page.getByTestId('nav-stock').click()
    await page.getByTestId('stock-open-principal').click()
    await page.getByTestId('stock-amount').fill('1000')
    await page.getByTestId('stock-amount-confirm').click()
    await expect(page.getByTestId('stock-principal')).toHaveText('¥1000.00')

    // 直接补 20 条资金记录：一页 15 条时共 21 条，正好两页（第二页 6 条）。
    // 走界面要连开 20 次「追加本金」弹窗，慢且杂音大；这里只关心分页口径。
    const database = new DatabaseSync(join(workspace, 'transactions.db'))
    const ledgerRow = database
      .prepare('SELECT id FROM ledger ORDER BY created_at ASC LIMIT 1')
      .get() as { id: string }
    const insert = database.prepare(
      'INSERT INTO stock_fund_record ' +
        '(id, ledger_id, record_date, event_type, event_text, amount_change_cents, ' +
        'cash_balance_cents, net_pnl_cents, remark, created_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    for (let index = 0; index < 20; index += 1) {
      insert.run(
        `fund-seed-${index}`,
        ledgerRow.id,
        '2026-10-30',
        'add_principal',
        '追加本金',
        100_00,
        1000_00 + index * 100_00,
        0,
        `补录 ${index}`,
        1_760_000_000 + index,
      )
    }
    database.close()

    await page.reload()
    await expect(page.getByTestId('workspace-state')).toContainText('已打开')
    await page.getByTestId('nav-stock').click()
    await page.getByTestId('stock-tab-account').click()
    await expect(page.getByTestId('fund-row')).toHaveCount(15)
    await expect(page.getByTestId('stock-fund-foot')).toContainText('共 21 条')

    await page.getByTestId('stock-fund-foot').locator('.ant-pagination-item-2').click()
    await expect(page.getByTestId('fund-row')).toHaveCount(6)
    await page.waitForTimeout(300)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'stock-fund-page2.png'),
    })
  } finally {
    await app.close()
  }
})
