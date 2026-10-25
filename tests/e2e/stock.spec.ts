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

test('股票：本金/支取/资金记录与费用设置', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-stock-'))
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
    await createLedger(page, '股票账本')
    await page.getByTestId('nav-stock').click()

    await expect(page.getByTestId('stock-principal')).toHaveText('¥0.00')
    await expect(page.getByTestId('stock-cash')).toHaveText('¥0.00')
    await expect(page.getByTestId('stock-total-assets')).toHaveText('¥0.00')
    await page.getByTestId('stock-tab-positions').click()
    await expect(page.getByTestId('stock-position-empty')).toContainText('当前没有持仓')
    await page.getByTestId('stock-tab-account').click()
    await expect(page.getByTestId('fund-empty')).toContainText('还没有资金记录')

    await page.getByTestId('stock-open-principal').click()
    await page.getByTestId('stock-amount').fill('1000')
    await page.getByTestId('stock-amount-confirm').click()
    await expect(page.getByTestId('stock-principal')).toHaveText('¥1000.00')
    await expect(page.getByTestId('stock-cash')).toHaveText('¥1000.00')
    await expect(page.getByTestId('fund-row')).toHaveText(/追加本金/)
    await expect(page.getByTestId('fund-row')).toHaveText(/1000\.00/)
    // 分页跟着表格走：在表格下方、同一个滚动区里
    await expect(page.locator('.stock-fund-scroll .stock-table-foot')).toContainText('共')
    // 备注列（表头与单元格）居中
    await expect(page.locator('.stock-fund-table thead th').last()).toHaveCSS('text-align', 'center')
    await expect(page.getByTestId('fund-row').locator('td').last()).toHaveCSS('text-align', 'center')

    await page.getByTestId('stock-open-withdraw').click()
    await page.getByTestId('stock-amount').fill('200')
    await page.getByTestId('stock-amount-confirm').click()
    await expect(page.getByTestId('stock-cash')).toHaveText('¥800.00')
    await expect(page.getByTestId('stock-principal')).toHaveText('¥1000.00')

    await page.getByTestId('stock-tab-settings').click()
    await page.getByTestId('fee-open').click()
    await page.getByTestId('fee-commission').fill('1')
    await page.getByTestId('fee-save').click()
    await expect(page.getByTestId('stock-error')).toHaveCount(0)

    await page.getByTestId('stock-tab-positions').click()
    await page.getByTestId('stock-position-create').click()
    await page.getByTestId('trade-code').fill('600000')
    await page.getByTestId('trade-name').fill('浦发银行')
    await page.getByTestId('trade-price').fill('5')
    await page.getByTestId('trade-lots').fill('1')
    await page.getByTestId('trade-save').click()

    await expect(page.getByTestId('stock-position-row')).toContainText('浦发银行')
    await expect(page.getByTestId('stock-position-row')).toContainText('1 手')
    await expect(page.getByTestId('stock-position-empty')).toHaveCount(0)
    await page.getByTestId('stock-tab-account').click()
    await expect(page.getByTestId('stock-cash')).toHaveText('¥294.99')
    await expect(page.getByTestId('fund-row').filter({ hasText: '买入' })).toHaveCount(1)
    await page.getByTestId('stock-tab-positions').click()

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
    const trade = database
      .prepare(
        'SELECT price_milli, amount_cents, quantity, total_cost_cents FROM stock_trade JOIN stock_position ON stock_position.stock_code = stock_trade.stock_code',
      )
      .get() as {
      price_milli: number
      amount_cents: number
      quantity: number
      total_cost_cents: number
    }
    database.close()

    expect(account.principal_cents).toBe(100_000)
    expect(funds.map((row) => [row.event_type, row.amount_change_cents, row.cash_balance_cents])).toEqual([
      ['add_principal', 100_000, 100_000],
      ['withdraw', -20_000, 80_000],
      ['buy', -50_501, 29_499],
    ])
    expect(fee.commission_rate).toBeCloseTo(0.0001, 10)
    expect(trade.price_milli).toBe(5_000)
    expect(trade.amount_cents).toBe(50_000)
    expect(trade.quantity).toBe(100)
    expect(trade.total_cost_cents).toBe(50_501)

    await page.getByTestId('position-review-open').click()
    await expect(page.getByTestId('position-review-text')).toHaveValue(/今日盘面/)
    await page.getByTestId('position-review-text').fill('观察一天')
    await page.getByTestId('position-review-save').click()
    await expect(page.getByTestId('toast').last()).toContainText('复盘已保存')
    await expect(page.getByTestId('position-daily-review')).toContainText('观察一天')

    await page.getByTestId('position-round-edit').click()
    // 第一次写本轮复盘时用内置模板起头
    await expect(page.getByTestId('position-round-review')).toHaveValue(/^买入理由：/)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'stock-round-template.png'),
    })
    await page.getByTestId('position-round-review').fill('本轮复盘内容')
    await page.getByTestId('position-round-save').click()
    await expect(page.getByTestId('position-round-preview')).toContainText('本轮复盘内容')
    await page.getByTestId('position-round-toggle').click()
    await expect(page.getByTestId('position-round-preview')).toHaveCount(0)
    await expect(page.getByTestId('position-round-edit')).toBeVisible()
    await page.getByTestId('position-round-edit').click()
    await expect(page.getByTestId('position-round-review')).toBeVisible()
    await page.getByTestId('position-round-cancel').click()
    await expect(page.getByTestId('position-round-preview')).toContainText('本轮复盘内容')

    await page.getByTestId('stock-position-close').click()
    await page.getByTestId('trade-price').fill('6')
    await page.getByTestId('trade-save').click()
    await expect(page.getByTestId('toast').last()).toContainText('成交已记录')
    await expect(page.getByTestId('stock-position-empty')).toContainText('当前没有持仓')

    // 建仓时输入代码自动带出名称：该代码已有成交历史，本地查询即可，不依赖网络
    await page.getByTestId('stock-position-create').click()
    await page.getByTestId('trade-code').fill('600000')
    await expect(page.getByTestId('trade-name')).toHaveValue('浦发银行')
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'stock-trade-auto-name.png'),
    })
    await page.getByTestId('trade-cancel').click()

    await page.getByTestId('stock-tab-history').click()
    await expect(page.getByTestId('stock-history-row')).toContainText('浦发银行')
    await page.getByTestId('stock-history-row').click()
    await expect(page.getByTestId('stock-history-detail')).toContainText('第 1 轮')
    await expect(page.getByTestId('stock-round')).toContainText('每日复盘')
    await expect(page.getByTestId('stock-round')).toContainText('观察一天')

    await page.getByTestId('round-review-open').click()
    // 与持仓页同一套本轮复盘编辑器：6 行输入 + 取消 / 保存
    await expect(page.locator('.stock-round .stock-review-box')).toBeVisible()
    await expect(page.getByTestId('round-review')).toHaveAttribute('rows', '6')
    await page.getByTestId('round-review').fill('临时草稿')
    await page.getByTestId('round-review-cancel').click()
    await expect(page.getByTestId('stock-round')).not.toContainText('临时草稿')
    await page.getByTestId('round-review-open').click()
    await page.getByTestId('round-review').fill('复盘：趋势向上')
    await page.waitForTimeout(200)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'stock-history-round-review.png'),
    })
    await page.getByTestId('round-review-save').click()
    await expect(page.getByTestId('stock-round')).toContainText('复盘：趋势向上')
    // 已写过的复盘再次编辑时保留原文，不再套模板
    await page.getByTestId('round-review-open').click()
    await expect(page.getByTestId('round-review')).toHaveValue('复盘：趋势向上')
    await page.getByTestId('round-review-cancel').click()
    await page.getByTestId('round-tag').click()
    await page.locator('.ant-select-item-option').filter({ hasText: '打板' }).click()
    await expect(page.getByTestId('round-tag')).toContainText('打板')
    await expect(page.getByTestId('stock-round')).toContainText('打板')

    const reviewDatabase = new DatabaseSync(join(workspace, 'transactions.db'), {
      readOnly: true,
    })
    const round = reviewDatabase
      .prepare('SELECT review, tag FROM stock_trade_round')
      .get() as { review: string; tag: string }
    reviewDatabase.close()
    expect(round).toEqual({ review: '复盘：趋势向上', tag: '打板' })

    await expect(page.getByTestId('stock-trade')).toHaveCount(2)
    const openTrade = page.getByTestId('stock-trade').filter({ hasText: '建仓' })
    await openTrade.getByTestId('stock-trade-edit').click()
    await openTrade.getByTestId('stock-trade-price').fill('6.5')
    await expect(openTrade.getByTestId('stock-trade-price')).toHaveValue('6.5')
    await page.waitForTimeout(100)
    await openTrade.getByTestId('stock-trade-save').click()
    await expect(page.getByTestId('toast').last()).toContainText('成交已更新')
    await expect(openTrade).toContainText('6.50')
    await expect
      .poll(() => {
        const db = new DatabaseSync(join(workspace, 'transactions.db'), { readOnly: true })
        const row = db
          .prepare("SELECT price_milli FROM stock_trade WHERE trade_type = 'open'")
          .get() as { price_milli: number }
        db.close()
        return row.price_milli
      })
      .toBe(6500)
    await page.getByTestId('stock-tab-statistics').click()
    await expect(page.getByTestId('statistics-metric-total_pnl')).toBeVisible()
    await page.getByTestId('statistics-range-recent').click()
    await expect(page.getByTestId('statistics-recent')).toHaveValue('5')
    await page.getByTestId('statistics-range-time').click()
    await expect(page.getByTestId('statistics-time-trigger')).toBeVisible()
    await page.getByTestId('statistics-metric-win_rate').click()
    await page.getByTestId('statistics-tab-detail').click()
    await expect(page.getByTestId('stock-statistics-point')).toHaveCount(1)
    await expect(page.locator('.ant-table-thead')).toContainText('期望值')

    await page.getByTestId('stock-tab-settings').click()
    await page.getByTestId('stock-operations-open').click()
    await expect(page.getByTestId('stock-operation')).toHaveCount(4)
    await page.keyboard.press('Escape')
    await page.getByTestId('stock-operation-rollback').click()
    await page.getByTestId('stock-operations-open').click()
    await expect(page.getByTestId('stock-operation')).toHaveCount(3)
  } finally {
    await electronApp.close()
    rmSync(root, { recursive: true, force: true })
  }
})




















