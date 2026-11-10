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

/**
 * 凯利值跟着工具栏的范围与统计口径走。
 *
 * 9 轮零费用结算（盈亏单位：分）：+100 ×5、+250、+300、−200、−100。
 *
 * * 逐笔累计（全部）：7 胜 2 负、胜率 77.78%、盈亏比 1 → 7/9 − (2/9)/1 = 55.56%；
 * * 最近 3 笔（+300 / −200 / −100）：1 胜 2 负、胜率 33.33%、盈亏比 2
 *   → 正好 0，副标题「没有正期望」；
 * * 最近 1 笔（−100）：只有亏损样本、没有赔率 → 凯利给「—」，副标题「样本不足」；
 * * 分组统计（每组 5 笔，最近一组是第 6-9 笔）：2 胜 2 负、胜率 50.00%、盈亏比 1.833
 *   → 22.73%。卡片一起换成最近一组：已实现盈亏从 ¥7.50 变 ¥2.50。
 */
test('股票统计：凯利值跟着交易范围与逐笔 / 分组口径变', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-stock-kelly-'))
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
    await createLedger(page, '凯利账本')

    const ledgerId = await page.evaluate(async () => {
      const ledgers = await window.api.invoke('ledger_list', { id: 'all' })
      return ledgers.find((ledger) => ledger.name === '凯利账本')?.id ?? ''
    })
    expect(ledgerId).not.toBe('')

    await page.evaluate(async (id) => {
      const at = (day: number): number =>
        Math.trunc(new Date(2026, 8, day, 12, 0, 0).getTime() / 1000)
      // 1 手 = 100 股：价格每跳 0.01 元正好是 1 元 = 100 分盈亏。
      const closePrices = [10.01, 10.01, 10.01, 10.01, 10.01, 10.025, 10.03, 9.98, 9.99]
      const zeroFee = {
        // 佣金费率必须 > 0；1030 元的成交额四舍五入到 0 分，其余三项本来就是 0
        commission_rate: 0.000001,
        min_commission: 0,
        stamp_duty_rate: 0,
        transfer_fee_rate: 0,
      }
      for (const [index, closePrice] of closePrices.entries()) {
        for (const trade of [
          { type: 'open', time: at(index + 1), price: 10 },
          { type: 'close', time: at(index + 1) + 3_600, price: closePrice },
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
            lots: 1,
            ...(trade.type === 'open' ? { round_fee: zeroFee } : {}),
          })
        }
      }
    }, ledgerId)

    await page.getByTestId('nav-stock').click()
    await page.getByTestId('stock-tab-statistics').click()

    const kelly = page.getByTestId('stock-statistics-kelly')
    const scope = page.getByTestId('stock-statistics-scope')
    const pnl = page.getByTestId('stock-statistics-pnl')
    const summary = page.getByTestId('stock-statistics-summary')

    // 逐笔累计 · 全部：7 胜 2 负，胜率 77.78%、盈亏比 1 → 7/9 − (2/9)/1 = 55.56%
    await expect(scope).toHaveText('共 9 笔')
    await expect(pnl).toHaveText('¥7.50')
    await expect(summary).toContainText('77.78%')
    await expect(kelly).toHaveText('55.56%')
    await expect(summary).toContainText('建议仓位')
    await page.waitForTimeout(300)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'stock-statistics-kelly.png'),
    })

    // 最近 3 笔（+300 / −200 / −100）：胜率 33.33%、盈亏比 2 → 正好 0，副标题说没有正期望
    await page.getByTestId('statistics-range-recent').click()
    await page.getByTestId('statistics-recent').fill('3')
    await expect(scope).toHaveText('共 3 笔')
    await expect(pnl).toHaveText('¥0.00')
    await expect(kelly).toHaveText('0.00%')
    await expect(summary).toContainText('没有正期望')

    // 最近 1 笔（−100）：只有亏损样本 → 没有赔率，给占位符而不是 0
    await page.getByTestId('statistics-recent').fill('1')
    await expect(scope).toHaveText('共 1 笔')
    await expect(kelly).toHaveText('—')
    await expect(summary).toContainText('样本不足')

    // 分组统计（每组 5 笔）：卡片换成最近一组（第 6-9 笔）→ 2 胜 2 负、盈亏比 1.833
    await page.getByTestId('statistics-range-all').click()
    await page.getByTestId('statistics-strategy').click()
    await page.locator('.ant-select-item-option').filter({ hasText: '分组统计' }).click()
    await expect(scope).toHaveText('最近一组 4 笔')
    await expect(pnl).toHaveText('¥2.50')
    await expect(summary).toContainText('50.00%')
    await expect(kelly).toHaveText('22.73%')
    await page.waitForTimeout(300)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'stock-statistics-kelly-grouped.png'),
    })
  } finally {
    await electronApp.close()
    rmSync(root, { recursive: true, force: true })
  }
})
