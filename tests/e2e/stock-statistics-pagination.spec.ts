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

    // 17 轮盈利结算 + 1 轮零费用平局（每天一轮），默认每页 15 条：
    // 第 1 页 15 行，第 2 页 3 行。
    await page.evaluate(async (id) => {
      const at = (day: number): number =>
        Math.trunc(new Date(2026, 8, day, 12, 0, 0).getTime() / 1000)
      const zeroFee = {
        // 佣金费率必须 > 0；小到金额 1 元时四舍五入为 0 分，印花税 / 过户费也都为 0
        commission_rate: 0.000001,
        min_commission: 0,
        stamp_duty_rate: 0,
        transfer_fee_rate: 0,
      }
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
      // 第 18 轮：1 手、每股 0.01 元，佣金四舍五入为 0 → 同价买卖盈亏为 0（平局）。
      // round_fee 只在本轮建仓时接受，清仓沿用本轮设置。
      for (const trade of [
        { type: 'open', time: at(18), price: 0.01, fee: zeroFee },
        { type: 'close', time: at(18) + 3_600, price: 0.01, fee: undefined },
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
          ...(trade.fee ? { round_fee: trade.fee } : {}),
        })
      }
    }, ledgerId)

    await page.getByTestId('nav-stock').click()
    await page.getByTestId('stock-tab-statistics').click()
    // 顶部胜率卡也把平局写出来（分母同样含平局：17/18 = 94.44%）
    await expect(page.getByTestId('stock-statistics-summary')).toContainText('17 胜 · 0 负 · 1 平')
    await expect(page.getByTestId('stock-statistics-summary')).toContainText('94.44%')
    await page.getByTestId('statistics-tab-detail').click()

    const rows = page.getByTestId('stock-statistics-point')
    const detailFoot = page.getByTestId('stock-statistics-detail-foot')
    await expect(rows).toHaveCount(15)
    await expect(detailFoot).toContainText('共 18 笔')
    await expect(detailFoot.locator('.ant-pagination-item')).toHaveCount(2)
    // 行序是结算序号倒序：第 1 页从最新一轮开始
    await expect(rows.nth(0)).toContainText('2026-09-18')
    // 胜负栏把平局显式写出来（胜率分母含平局）
    await expect(rows.nth(0)).toContainText('17 胜 0 负 1 平')

    await page.waitForTimeout(300)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'stock-statistics-pagination-page1.png'),
    })

    await page.getByTestId('stock-statistics-detail-next').locator('button').click()
    await expect(rows).toHaveCount(3)
    await expect(rows.nth(0)).toContainText('2026-09-03')
    await expect(rows.nth(2)).toContainText('2026-09-01')
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
