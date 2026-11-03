import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server, type ServerResponse } from 'node:http'
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

function listen(server: Server): Promise<number> {
  return new Promise((resolveListening, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') reject(new Error('无法获取端口'))
      else resolveListening(address.port)
    })
  })
}

function ymd(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** 腾讯行情的一段：第 1 段是**名称**（除权当天会带 `XD` 前缀），第 2 段是代码。 */
function quoteLine(code: string, name: string, day: string): string {
  const fields = Array.from({ length: 31 }, () => '')
  fields[0] = '1'
  fields[1] = name
  fields[2] = code
  fields[3] = '10.45'
  fields[4] = '10.00'
  fields[30] = `${day.replaceAll('-', '')}150000`
  return `v_${code.startsWith('6') ? 'sh' : 'sz'}${code}="${fields.join('~')}";`
}

/** 应答行情请求（`/q=sh600000,sz000001`），名称取当前这份表格。 */
function respondQuotes(
  pathname: string,
  response: ServerResponse,
  names: Record<string, string>,
  day: string,
): void {
  const lines = pathname
    .slice('/q='.length)
    .split(',')
    .map((symbol) => symbol.replace(/^[a-z]{2}/, ''))
    .filter((code) => names[code] !== undefined)
    .map((code) => quoteLine(code, names[code], day))
  response.setHeader('content-type', 'text/plain; charset=GBK')
  response.end(lines.join('\n'))
}

test('股票名称：按代码刷新名称，详情与左栏一起改', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-stock-name-'))
  const home = join(root, 'home')
  const workspace = join(root, 'ws')
  const userData = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
  mkdirSync(userData, { recursive: true })
  writeFileSync(
    join(home, '.tr.dev.json'),
    JSON.stringify({ width: 1400, height: 1000, closeBehavior: 'quit', appearance: 'light' }),
  )

  // 行情源里的名称是"当前名称"：先给旧名，点刷新之前再换掉它。
  const names: Record<string, string> = { '600000': '浦发银行', '000001': '平安银行' }
  const today = ymd(new Date())
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (!url.pathname.startsWith('/q=')) {
      response.statusCode = 404
      response.end('')
      return
    }
    respondQuotes(url.pathname, response, names, today)
  })
  const port = await listen(server)

  const app = await electron.launch({
    args: ['.'],
    cwd: repositoryRoot,
    env: environment({
      USERPROFILE: home,
      HOME: home,
      TRANSACTIONS_USER_DATA: userData,
      TRANSACTIONS_TEST_DIALOG_DIR: workspace,
      TRANSACTIONS_TEST_CLOSE: 'quit',
      TRANSACTIONS_TEST_QUOTE_SOURCE: `http://127.0.0.1:${port}`,
      TRANSACTIONS_TEST_QUOTE_CHARSET: 'utf-8',
    }),
  })

  try {
    const page = await app.firstWindow()
    await page.getByTestId('open-workspace').click()
    await expect(page.getByTestId('workspace-state')).toContainText('已打开')
    await page.getByTestId('nav-settings').click()
    await createLedger(page, '名称刷新账本')
    const ledgerId = await page.evaluate(async () => {
      const rows = await window.api.invoke('ledger_list', { id: 'all' })
      return rows.find((row) => row.name === '名称刷新账本')?.id ?? ''
    })

    // 一只还没清仓（持仓页）、一只已经清仓（记录页），名称都是建仓时手填的旧名。
    await page.evaluate(async (id) => {
      const at = (month: number, day: number): number =>
        Math.trunc(new Date(2026, month - 1, day, 12, 0, 0).getTime() / 1000)
      await window.api.invoke('stock_principal_add', {
        ledger_id: id,
        amount: 1_000_000,
        date: '',
      })
      for (const order of [
        { code: '600000', name: '浦发银行', type: 'open', time: at(10, 1) },
        { code: '000001', name: '平安银行', type: 'open', time: at(9, 1) },
        { code: '000001', name: '平安银行', type: 'close', time: at(9, 2) },
      ]) {
        await window.api.invoke('stock_trade_create', {
          ledger_id: id,
          stock_code: order.code,
          stock_name: order.name,
          trade_type: order.type,
          trade_time: order.time,
          remark: '',
          tag: '',
          fills: [],
          price: 10,
          lots: 1,
        })
      }
    }, ledgerId)

    await page.getByTestId('nav-stock').click()
    await page.getByTestId('stock-tab-positions').click()
    const positionHead = page.locator('.stock-detail__identity h2')
    await expect(positionHead).toHaveText('浦发银行')
    await expect(page.getByTestId('stock-position-row')).toContainText('浦发银行')

    // 除权除息当天，行情把名字换成了 `XD` 前缀的那一版
    names['600000'] = 'XD浦发银'
    await page.getByTestId('stock-position-name-refresh').click()
    await expect(page.getByTestId('toast').last()).toHaveText('名称已更新：XD浦发银')
    await expect(positionHead).toHaveText('XD浦发银')
    await expect(page.getByTestId('stock-position-row')).toContainText('XD浦发银')

    // 名称没变时也给一句回执，点这一下不是没反应
    await page.getByTestId('stock-position-name-refresh').click()
    await expect(page.getByTestId('toast').last()).toHaveText('名称未变')

    // 记录页：左栏与详情头读的是历史集合里的名字，同样按代码刷新
    await page.getByTestId('stock-tab-history').click()
    await page
      .getByTestId('stock-history-row')
      .filter({ hasText: '000001' })
      .click()
    const historyHead = page.locator('.stock-history-detail .stock-detail__identity h2')
    await expect(historyHead).toHaveText('平安银行')

    names['000001'] = '平安银行A'
    await page.getByTestId('stock-history-name-refresh').click()
    await expect(page.getByTestId('toast').last()).toHaveText('名称已更新：平安银行A')
    await expect(historyHead).toHaveText('平安银行A')
    await expect(
      page.getByTestId('stock-history-row').filter({ hasText: '000001' }),
    ).toContainText('平安银行A')

    // 落库：持仓行 / 成交行 / 历史集合都换成了新名字，账本文字仍是当时的旧名
    const database = new DatabaseSync(join(workspace, 'transactions.db'))
    try {
      const positionNames = database
        .prepare('SELECT stock_code, stock_name FROM stock_position ORDER BY stock_code')
        .all() as Array<{ stock_code: string; stock_name: string }>
      expect(positionNames.map((row) => row.stock_name)).toEqual(['平安银行A', 'XD浦发银'])
      const tradeNames = database
        .prepare('SELECT DISTINCT stock_code, stock_name FROM stock_trade ORDER BY stock_code')
        .all() as Array<{ stock_code: string; stock_name: string }>
      expect(tradeNames.map((row) => row.stock_name)).toEqual(['平安银行A', 'XD浦发银'])
      const historyName = database
        .prepare("SELECT stock_name FROM stock_trade_history WHERE stock_code = '000001'")
        .get() as { stock_name: string } | undefined
      expect(historyName?.stock_name).toBe('平安银行A')
      const fundText = database
        .prepare('SELECT event_text FROM stock_fund_record ORDER BY record_date')
        .all() as Array<{ event_text: string }>
      const tradeText = fundText
        .map((row) => row.event_text)
        .filter((text) => text.startsWith('买入') || text.startsWith('卖出'))
      expect(tradeText).toEqual([
        '买入 平安银行 1手',
        '卖出 平安银行 1手',
        '买入 浦发银行 1手',
      ])
    } finally {
      database.close()
    }
  } finally {
    await app.close()
    server.close()
    rmSync(root, { recursive: true, force: true })
  }
})
