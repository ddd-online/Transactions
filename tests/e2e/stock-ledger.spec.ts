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
    await expect(ledger).toContainText('还没有台账')
    await expect(page.getByTestId('stock-ledger-copy')).toBeDisabled()
    await page.getByTestId('stock-ledger-edit').click()
    await expect(page.getByRole('dialog', { name: '填写台账' })).toBeVisible()
    await expect(page.getByTestId('stock-ledger-buy-price')).toHaveValue('5.00')
    await expect(page.getByTestId('stock-ledger-sell-price')).toBeDisabled()
    await page.getByTestId('stock-ledger-why').fill('回踩确认后买入，控制单笔仓位')
    await page.getByTestId('stock-ledger-stop').fill('4.60')
    await page.getByTestId('stock-ledger-take').fill('6.50')
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

    // 历史里继续修改文字字段
    await page.getByTestId('stock-ledger-edit').click()
    await page.getByTestId('stock-ledger-summary').fill('清仓后回看：执行到位')
    await page.getByTestId('stock-ledger-save').click()
    await expect(ledger).toContainText('清仓后回看：执行到位')

    // 红涨绿跌：这轮是盈利，弹窗里的净盈亏必须是红（弹窗挂在 body 下，
    // 不在 `.stock-page` 作用域里，颜色靠 `.stock-ledger__computed` 自己声明）。
    const tokenColor = (token: string) =>
      page.evaluate((name) => {
        const probe = document.createElement('span')
        probe.style.color = `var(${name})`
        document.body.append(probe)
        const value = getComputedStyle(probe).color
        probe.remove()
        return value
      }, token)
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
