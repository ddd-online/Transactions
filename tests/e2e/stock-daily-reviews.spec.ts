import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { _electron as electron, expect, test } from '@playwright/test'

import { addDays } from '../../shared/domain/calendar'
import { todayYmd } from '../../shared/domain/time'
import { createLedger } from './ledger-helper'

function environment(overrides: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') result[key] = value
  }
  delete result.ELECTRON_RUN_AS_NODE
  return { ...result, ...overrides }
}

test('持仓详情：每日复盘一天一条、倒序、一行省略，点开看全文', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-day-reviews-'))
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

  const longReview = `前一天的复盘：${'量能放大，主线在电网设备与化工之间切换，尾盘有资金回流。'.repeat(4)}`

  try {
    const page = await app.firstWindow()
    await page.getByTestId('open-workspace').click()
    await expect(page.getByTestId('workspace-state')).toContainText('已打开')
    await page.getByTestId('nav-settings').click()
    await createLedger(page, '复盘账本')
    await page.getByTestId('nav-stock').click()
    await page.getByTestId('stock-open-principal').click()
    await page.getByTestId('stock-amount').fill('20000')
    await page.getByTestId('stock-amount-confirm').click()

    await page.getByTestId('stock-tab-positions').click()
    await page.getByTestId('stock-position-create').click()
    await page.getByTestId('trade-code').fill('600000')
    await page.getByTestId('trade-name').fill('浦发银行')
    await page.getByTestId('trade-price').fill('5')
    await page.getByTestId('trade-lots').fill('1')
    await page.getByTestId('trade-save').click()
    await expect(page.getByTestId('stock-trade')).toHaveCount(1)

    // 今天的复盘走界面；更早的那条直接落库（服务只允许写到本轮建仓日之后）
    await page.getByTestId('position-review-open').click()
    await page.getByTestId('position-review-text').fill('今天的盘面：缩量整理，没动')
    await page.getByTestId('position-review-save').click()
    await expect(page.getByTestId('position-daily-review-item')).toHaveCount(1)

    const today = todayYmd()
    const older = addDays(today, -2)
    expect(older).not.toBeNull()
    const database = new DatabaseSync(join(workspace, 'transactions.db'))
    const ledgerRow = database.prepare('SELECT id FROM ledger LIMIT 1').get() as { id: string }
    const now = Math.floor(Date.now() / 1000)
    database
      .prepare(
        'INSERT INTO stock_day_review ' +
          '(id, ledger_id, stock_code, round_id, review_date, review, created_at, updated_at) ' +
          "VALUES (?, ?, ?, '', ?, ?, ?, ?)",
      )
      .run('day-review-older', ledgerRow.id, '600000', older, longReview, now, now)
    database.close()

    await page.reload()
    await expect(page.getByTestId('workspace-state')).toContainText('已打开')
    await page.getByTestId('nav-stock').click()
    await page.getByTestId('stock-tab-positions').click()

    const items = page.getByTestId('position-daily-review-item')
    await expect(items).toHaveCount(2)
    // 倒序：今天在上、更早的在下
    await expect(items.nth(0)).toContainText(today)
    await expect(items.nth(0)).toContainText('缩量整理')
    await expect(items.nth(1)).toContainText(older!)
    await expect(items.nth(1)).toContainText('前一天的复盘')

    // 一行放不下：单行 + 省略号（文本被裁掉，scrollWidth 大于可视宽度）
    const truncated = await items.nth(1).locator('.stock-review-day__text').evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        whiteSpace: style.whiteSpace,
        overflow: style.textOverflow,
        clipped: element.scrollWidth > element.clientWidth + 1,
      }
    })
    expect(truncated).toEqual({ whiteSpace: 'nowrap', overflow: 'ellipsis', clipped: true })

    // 点开看全文
    await items.nth(1).click()
    await expect(page.getByText(`每日复盘 · ${older}`)).toBeVisible()
    const full = page.getByTestId('position-daily-review-full')
    await expect(full).toHaveText(longReview)
    // 弹窗有 200ms 的入场动画，等它落定再截图
    await page.waitForTimeout(350)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'stock-daily-review.png'),
    })
    await page.keyboard.press('Escape')
    await expect(full).toBeHidden()
  } finally {
    await app.close()
    rmSync(root, { recursive: true, force: true })
  }
})
