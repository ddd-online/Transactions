import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { _electron as electron, expect, test, type Locator } from '@playwright/test'

import { createLedger } from './ledger-helper'

function environment(overrides: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') result[key] = value
  }
  delete result.ELECTRON_RUN_AS_NODE
  return { ...result, ...overrides }
}

test('股票台账：持仓填写、清仓归档、历史继续修改', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-stock-ledger-'))
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
    await createLedger(page, '台账账本')
    const ledgerId = await page.evaluate(async () => {
      const rows = await window.api.invoke('ledger_list', { id: 'all' })
      return rows.find((row) => row.name === '台账账本')?.id ?? ''
    })
    await page.evaluate(async (id) => {
      await window.api.invoke('stock_principal_add', {
        ledger_id: id,
        amount: 100_000,
        date: '',
      })
      await window.api.invoke('stock_trade_create', {
        ledger_id: id,
        stock_code: '600000',
        stock_name: '浦发银行',
        trade_type: 'open',
        trade_time: Math.trunc(new Date(2026, 0, 5, 12).getTime() / 1000),
        remark: '',
        tag: '分析',
        fills: [],
        price: 5,
        lots: 1,
      })
    }, ledgerId)

    await page.getByTestId('nav-stock').click()
    await page.getByTestId('stock-tab-positions').click()
    await expect(page.getByTestId('stock-position-row')).toContainText('浦发银行')
    await page.getByTestId('stock-position-row').click()

    const ledger = page.getByTestId('stock-ledger')
    const tokenColor = (token: string) =>
      page.evaluate((name) => {
        const probe = document.createElement('span')
        probe.style.color = `var(${name})`
        document.body.append(probe)
        const value = getComputedStyle(probe).color
        probe.remove()
        return value
      }, token)
    /** 元素自己的字色对它最近一块**上了色**的底色的对比度（12px 小字要 ≥4.5:1）。 */
    const contrastOnOwnSurface = (locator: Locator): Promise<number> =>
      locator.evaluate((element) => {
        // `color-mix(...)` 在 Chromium 里算成 `color(srgb 0.07 0.48 0.23)`，通道是 0–1 的小数
        const rgbOf = (value: string): number[] => {
          const numbers = value.match(/[\d.]+/g)!.slice(0, 3).map(Number)
          return value.startsWith('color(') ? numbers.map((channel) => channel * 255) : numbers
        }
        const lum = (rgb: number[]): number => {
          const [r, g, b] = rgb.map((channel) => {
            const c = channel / 255
            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
          })
          return 0.2126 * r + 0.7152 * g + 0.0722 * b
        }
        let node: Element | null = element
        let background = 'rgb(255, 255, 255)'
        while (node) {
          const value = getComputedStyle(node).backgroundColor
          if (value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent') {
            background = value
            break
          }
          node = node.parentElement
        }
        const [high, low] = [
          lum(rgbOf(getComputedStyle(element).color)),
          lum(rgbOf(background)),
        ].sort((a, b) => b - a)
        return (high + 0.05) / (low + 0.05)
      })
    await expect(ledger).toContainText('还没有台账')
    await expect(page.getByTestId('stock-ledger-copy')).toBeDisabled()
    await page.getByTestId('stock-ledger-edit').click()
    await expect(page.getByRole('dialog', { name: '填写台账' })).toBeVisible()
    await expect(page.getByTestId('stock-ledger-buy-price')).toHaveValue('5.00')
    await expect(page.getByTestId('stock-ledger-sell-price')).toBeDisabled()
    // 校验失败只挂一条红字；改任何一个字段（不只是「为什么买」）就该清掉
    await page.getByTestId('stock-ledger-save').click()
    await expect(page.getByTestId('stock-ledger-form-error')).toContainText('台账至少填写一项')
    await page.getByTestId('stock-ledger-stop').fill('4.60')
    await expect(page.getByTestId('stock-ledger-form-error')).toHaveCount(0)
    await page.getByTestId('stock-ledger-stop').fill('')
    await page.getByTestId('stock-ledger-why').fill('回踩确认后买入，控制单笔仓位')
    // 盈亏比 / 涨跌百分比是边填边算的：还没填全时那一行说的是「填好…自动计算」
    await expect(page.getByTestId('stock-ledger-form-ratio')).toContainText('填好止损和止盈后自动计算')
    await page.getByTestId('stock-ledger-stop').fill('4.60')
    await expect(page.getByTestId('stock-ledger-stop-delta')).toContainText('较买入价 -8.00%')
    await expect(page.getByTestId('stock-ledger-form-ratio')).toContainText('填好止损和止盈后自动计算')
    await page.getByTestId('stock-ledger-take').fill('6.50')
    await expect(page.getByTestId('stock-ledger-take-delta')).toContainText('较买入价 +30.00%')
    // (6.50 - 5.00) / (5.00 - 4.60) = 3.75
    await expect(page.getByTestId('stock-ledger-form-ratio')).toContainText('3.75')
    const stopDelta = page.getByTestId('stock-ledger-stop-delta')
    const takeDelta = page.getByTestId('stock-ledger-take-delta')
    await expect(stopDelta).toContainText('较买入价 -8.00%')
    await expect(takeDelta).toContainText('较买入价 +30.00%')
    // 弹窗挂在 body 下（不在 `.stock-page` 作用域里），颜色靠 `.stock-ledger__delta` 自己声明：
    // 止损在成本之下走绿、止盈在成本之上走红，且 12px 的小字压过一档墨，底上要过 AA。
    const rgbOf = (locator: Locator): Promise<number[]> =>
      locator.evaluate((element) => {
        const value = getComputedStyle(element).color
        const numbers = value.match(/[\d.]+/g)!.slice(0, 3).map(Number)
        return value.startsWith('color(') ? numbers.map((channel) => channel * 255) : numbers
      })
    const [stopRgb, takeRgb] = await Promise.all([rgbOf(stopDelta), rgbOf(takeDelta)])
    expect(stopRgb[1]).toBeGreaterThan(stopRgb[0])
    expect(takeRgb[0]).toBeGreaterThan(takeRgb[1])
    expect(await contrastOnOwnSurface(stopDelta)).toBeGreaterThanOrEqual(4.5)
    expect(await contrastOnOwnSurface(takeDelta)).toBeGreaterThanOrEqual(4.5)

    const ratioLine = page.getByTestId('stock-ledger-form-ratio')
    // 带后缀时输入框的可访问名仍是「止损」/「止盈」，百分比只挂在描述里 ——
    // 不然包着输入框的 label 会把后缀算进名字，读屏把同一个数字念两遍
    await expect(page.getByRole('textbox', { name: '止损', exact: true })).toHaveValue('4.60')
    await expect(page.getByRole('textbox', { name: '止盈', exact: true })).toHaveValue('6.50')
    // 止损抬到成本之上（保本 / 移动止损）：百分比照给（+2.00%），盈亏比说明方向不成立
    await page.getByTestId('stock-ledger-stop').fill('5.10')
    await expect(stopDelta).toContainText('+2.00%')
    await expect(ratioLine).toContainText('止盈高于买入价、止损低于买入价，才有盈亏比')
    await page.getByTestId('stock-ledger-stop').fill('4.60')
    await expect(ratioLine).toContainText('3.75')
    // 写了但不是数字：那一侧的百分比消失，说明指向「写法」而不是「没填」
    await page.getByTestId('stock-ledger-take').fill('破 6.5 就走')
    await expect(takeDelta).toHaveCount(0)
    await expect(ratioLine).toContainText('止损和止盈写成价格数字，才能算盈亏比')
    await page.getByTestId('stock-ledger-take').fill('6.50')
    await expect(ratioLine).toContainText('3.75')
    await page.getByTestId('stock-ledger-followed').fill('是')
    await page.getByTestId('stock-ledger-summary').fill('先小仓试错')
    await page.waitForTimeout(200)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'stock-ledger-edit.png'),
    })
    await page.getByTestId('stock-ledger-save').click()
    await expect(page.getByTestId('toast').last()).toContainText('台账已保存')
    await expect(ledger).toContainText('回踩确认后买入，控制单笔仓位')
    await expect(ledger).toContainText('止损')
    await expect(ledger).toContainText('清仓后回填')
    await expect(ledger).toContainText('5.00')
    // 只读台账说的是同一份数：落差跟在价位右边，盈亏比在买入计划那一行的最后一格
    await expect(page.getByTestId('stock-ledger-plan-stop')).toContainText('-8.00%')
    await expect(page.getByTestId('stock-ledger-plan-take')).toContainText('+30.00%')
    await expect(page.getByTestId('stock-ledger-ratio')).toContainText('3.75')
    await page.waitForTimeout(200)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'stock-ledger-holding.png'),
    })

    // 清仓，台账随轮次归档到记录
    await page.getByTestId('stock-position-close').click()
    await page.getByTestId('trade-price').fill('6')
    await page.getByTestId('trade-save').click()
    await expect(page.getByTestId('toast').last()).toContainText('成交已记录')
    await page.getByTestId('stock-tab-history').click()
    await expect(page.getByTestId('stock-history-row')).toContainText('浦发银行')
    await page.getByTestId('stock-history-row').click()
    await expect(page.getByTestId('stock-round')).toContainText('交易台账')
    await expect(ledger).toContainText('回踩确认后买入，控制单笔仓位')
    await expect(ledger).toContainText('6.00')
    await expect(ledger).not.toContainText('清仓后回填')
    await page.waitForTimeout(200)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'stock-ledger-archive.png'),
    })

    // 窄窗：台账的 4 列收成 2 列，百分比与盈亏比仍各自贴在字段上
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(900, 1000)
    })
    await page.waitForTimeout(300)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'stock-ledger-narrow.png'),
    })

    // 历史里继续修改文字字段
    await page.getByTestId('stock-ledger-edit').click()
    await page.getByTestId('stock-ledger-summary').fill('清仓后回看：执行到位')
    await page.getByTestId('stock-ledger-save').click()
    await expect(ledger).toContainText('清仓后回看：执行到位')

    // 红涨绿跌：这轮是盈利，弹窗里的净盈亏必须是红（弹窗挂在 body 下，
    // 不在 `.stock-page` 作用域里，颜色靠 `.stock-ledger__computed` 自己声明）。
    const pnl = page.getByTestId('stock-ledger-pnl')
    await expect(pnl).toHaveValue(/^¥-?\d/)
    const pnlColor = await pnl.evaluate((element) => getComputedStyle(element).color)
    expect(pnlColor).toBe(await tokenColor('--transactions-color-expense'))
    expect(pnlColor).not.toBe(await tokenColor('--transactions-color-income'))
    await expect(page.getByRole('dialog', { name: '编辑台账' })).not.toContainText('带底色')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: '编辑台账' })).toBeHidden()

    // 复制到剪贴板：整张台账连成 Markdown，字段一个不漏
    await page.getByTestId('stock-ledger-copy').click()
    await expect(page.getByTestId('toast').last()).toContainText('台账已复制为 Markdown')
    const copied = await app.evaluate(({ clipboard }) => clipboard.readText())
    expect(copied.startsWith('## 交易台账\n\n')).toBe(true)
    expect(copied).toContain('- 为什么买：回踩确认后买入，控制单笔仓位')
    expect(copied).toContain('- 买入价：5.00')
    expect(copied).toContain('- 止损：4.60')
    expect(copied).toContain('- 止盈：6.50')
    expect(copied).toContain('- 卖出价：6.00')
    expect(copied).toContain('- 是否按系统执行：是')
    expect(copied).toContain('- 一句话：清仓后回看：执行到位')
    expect(copied).toMatch(/- 净盈亏：¥\d/)
    // 成交记录附在台账后面：一笔一条，日期（年月日）/ 类型 / 手数 / 成交金额，不画表格
    expect(copied).toContain('## 成交记录')
    expect(copied).toMatch(/- \d{4}-\d{2}-\d{2} · 建仓 · 1 手 · ¥500\.00/)
    expect(copied).toMatch(/- \d{4}-\d{2}-\d{2} · 清仓 · 1 手 · ¥600\.00/)
    expect(copied).not.toContain('|')

    const database = new DatabaseSync(join(workspace, 'transactions.db'), { readOnly: true })
    const row = database
      .prepare('SELECT round_id, why_buy, stop_loss, take_profit, followed_system, summary FROM stock_ledger')
      .get() as {
      round_id: string
      why_buy: string
      stop_loss: string
      take_profit: string
      followed_system: string
      summary: string
    }
    database.close()
    expect(row.round_id).not.toBeNull()
    expect(row.why_buy).toBe('回踩确认后买入，控制单笔仓位')
    expect(row.stop_loss).toBe('4.60')
    expect(row.take_profit).toBe('6.50')
    expect(row.followed_system).toBe('是')
    expect(row.summary).toBe('清仓后回看：执行到位')
  } finally {
    await app.close()
    rmSync(root, { recursive: true, force: true })
  }
})
