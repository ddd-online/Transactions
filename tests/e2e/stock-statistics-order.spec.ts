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

/** 同一天建仓、不同天清仓：明细表的行序必须跟结算序号走。 */
test('股票统计明细：同日建仓的两轮按清仓先后排列', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-stock-order-'))
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
    await createLedger(page, '统计顺序账本')

    const ledgerId = await page.evaluate(async () => {
      const ledgers = await window.api.invoke('ledger_list', { id: 'all' })
      return ledgers.find((ledger) => ledger.name === '统计顺序账本')?.id ?? ''
    })
    expect(ledgerId).not.toBe('')

    // 上海 10-13→10-14 赚；雪人 10-14→10-16 赚；亚邦与雪人同一个建仓时刻，但 10-19 才清仓（亏）。
    await page.evaluate(async (id) => {
      const at = (day: number): number =>
        Math.trunc(new Date(2026, 9, day, 12, 0, 0).getTime() / 1000)
      const rounds = [
        { code: '601595', name: '上海电影', open: at(13), close: at(14), buy: 10, sell: 11 },
        { code: '002639', name: '雪人股份', open: at(14), close: at(16), buy: 8, sell: 8.5 },
        { code: '603188', name: '亚邦股份', open: at(14), close: at(19), buy: 10, sell: 9.5 },
      ]
      for (const round of rounds) {
        for (const trade of [
          { type: 'open', time: round.open, price: round.buy },
          { type: 'close', time: round.close, price: round.sell },
        ]) {
          await window.api.invoke('stock_trade_create', {
            ledger_id: id,
            stock_code: round.code,
            stock_name: round.name,
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
    await expect(page.getByTestId('statistics-strategy')).toBeVisible()
    await expect(page.getByTestId('stock-statistics-summary')).toBeVisible()
    // 已实现盈亏：标题与其它标题同字号，数值明显放大
    const typeSizes = await page.evaluate(() => {
      const summary = document.querySelector('[data-testid="stock-statistics-summary"]')!
      const label = summary.querySelector('.stock-stat-cell--wide .stock-stat-label')!
      const others = [...summary.querySelectorAll('.stock-stat-label')].filter(
        (element) => element !== label,
      )
      const value = summary.querySelector('.stock-stat-cell--wide strong')!
      return [
        getComputedStyle(label).fontSize,
        getComputedStyle(others[0]).fontSize,
        getComputedStyle(value).fontSize,
      ]
    })
    expect(typeSizes[0]).toBe(typeSizes[1])
    expect(Number.parseFloat(typeSizes[2])).toBeGreaterThan(
      Number.parseFloat(typeSizes[1]) * 1.5,
    )
    await page.waitForTimeout(400)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'stock-statistics-summary.png'),
    })

    // 先在「统计」里切到分组口径：明细是逐笔结算，仍应列出 3 行且收起口径下拉。
    const summaryBefore = (await page.getByTestId('stock-statistics-summary').innerText()).replace(
      /\s+/g,
      '',
    )
    await page.getByTestId('statistics-strategy').click()
    await page.locator('.ant-select-item-option').filter({ hasText: '分组统计' }).click()
    await expect(page.getByTestId('statistics-strategy')).toContainText('分组统计')
    // 顶部合计不跟分组口径变：仍是全量逐笔的合计，不是最后一组
    await expect
      .poll(async () =>
        (await page.getByTestId('stock-statistics-summary').innerText()).replace(/\s+/g, ''),
      )
      .toBe(summaryBefore)
    await page.getByTestId('statistics-tab-detail').click()
    await expect(page.getByTestId('statistics-strategy')).toHaveCount(0)
    await expect(page.getByTestId('statistics-range')).toBeVisible()
    await expect(page.getByTestId('statistics-tag')).toBeVisible()

    const rows = page.getByTestId('stock-statistics-point')
    await expect(rows).toHaveCount(3)
    // 行序 = 结算序号倒序：亚邦最后清仓，排最前；雪人与亚邦同一天建仓，不能按建仓时点重排。
    await expect(rows.nth(0)).toContainText('亚邦股份')
    await expect(rows.nth(1)).toContainText('雪人股份')
    await expect(rows.nth(2)).toContainText('上海电影')
    // 派生列跟着行序走：样本数逐行递减。
    await expect(rows.nth(0)).toContainText('2 胜 1 负')
    await expect(rows.nth(1)).toContainText('2 胜 0 负')
    await expect(rows.nth(2)).toContainText('1 胜 0 负')

    // 分页脚：总数 + 页码（3 笔只有 1 页）
    const detailFoot = page.getByTestId('stock-statistics-detail-foot')
    await expect(detailFoot).toContainText('共 3 笔')
    await expect(detailFoot.locator('.ant-pagination-item')).toHaveCount(1)

    // 列对齐：建仓 / 清仓 / 标签居中，其余（含股票、胜负）居右。
    const headers = page.locator('.ant-table-thead th')
    for (const index of [0, 1, 3]) {
      await expect(headers.nth(index)).toHaveCSS('text-align', 'center')
      await expect(rows.nth(0).locator('td').nth(index)).toHaveCSS('text-align', 'center')
    }
    for (const index of [2, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      await expect(headers.nth(index)).toHaveCSS('text-align', 'right')
      await expect(rows.nth(0).locator('td').nth(index)).toHaveCSS('text-align', 'right')
    }

    await page.waitForTimeout(300)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'stock-statistics-order.png'),
    })

    // 回到「统计」时口径下拉回来（状态仍记得分组统计）
    await page.getByTestId('statistics-tab-summary').click()
    await expect(page.getByTestId('statistics-strategy')).toContainText('分组统计')
  } finally {
    await electronApp.close()
    rmSync(root, { recursive: true, force: true })
  }
})
