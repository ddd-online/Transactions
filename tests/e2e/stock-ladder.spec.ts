import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
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

/** 东财 `date` 参数：`YYYYMMDD`。 */
function queryDate(date: Date): string {
  return ymd(date).replaceAll('-', '')
}

function at(date: Date, hour: number): number {
  const copy = new Date(date)
  copy.setHours(hour, 0, 0, 0)
  return Math.trunc(copy.getTime() / 1000)
}

/** 东财池子的一条（只写解析器用得上的字段）。 */
function raw(
  code: string,
  name: string,
  level: number,
  seal: number,
  brokenCount = 0,
): Record<string, unknown> {
  return {
    c: code,
    m: 1,
    n: name,
    p: 11000,
    zdp: 10,
    amount: 234953015,
    ltsz: 4409701791,
    hs: 5.32,
    lbc: level,
    fbt: seal,
    lbt: seal,
    zbc: brokenCount,
    fund: 109301885,
    hybk: '一般零售',
    zttj: { days: level, ct: level },
  }
}

test('连板天梯：收盘后入库、翻日读库、刷新重抓', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-stock-ladder-'))
  const home = join(root, 'home')
  const workspace = join(root, 'ws')
  const userData = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
  mkdirSync(userData, { recursive: true })
  writeFileSync(
    join(home, '.tr.dev.json'),
    JSON.stringify({
      width: 1400,
      height: 1000,
      closeBehavior: 'quit',
      appearance: 'light',
      proxy: { mode: 'off', url: '' },
    }),
  )

  const base = new Date()
  base.setHours(0, 0, 0, 0)
  const today = new Date(base)
  const previous = new Date(base)
  previous.setDate(previous.getDate() - 1)

  const pools: Record<string, unknown[]> = {
    [queryDate(today)]: [
      raw('600838', '上海九百', 4, 92500, 1),
      raw('000001', '平安银行', 2, 93000),
      raw('301502', '华阳智能', 1, 92500),
    ],
    [queryDate(previous)]: [
      raw('600838', '上海九百', 3, 92500),
      raw('000001', '平安银行', 1, 92600),
      raw('301314', '科瑞思', 2, 92700),
      raw('600519', '贵州茅台', 1, 92800),
    ],
  }

  const requests: string[] = []
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (url.pathname !== '/getTopicZTPool') {
      response.statusCode = 404
      response.end('{}')
      return
    }
    const date = url.searchParams.get('date') ?? ''
    requests.push(date)
    const pool = pools[date] ?? []
    response.setHeader('content-type', 'application/json; charset=UTF-8')
    response.end(JSON.stringify({ rc: 0, data: { tc: pool.length, qdate: 0, pool } }))
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
      TRANSACTIONS_TEST_LIMIT_SOURCE: `http://127.0.0.1:${port}`,
      TRANSACTIONS_TEST_LADDER_NOW: String(at(today, 16)),
    }),
  })

  try {
    const page = await app.firstWindow()
    await page.getByTestId('open-workspace').click()
    await expect(page.getByTestId('workspace-state')).toContainText('已打开')
    await page.getByTestId('nav-settings').click()
    await createLedger(page, '天梯账本')
    await page.getByTestId('nav-stock').click()
    await page.getByTestId('stock-tab-ladder').click()

    const ladder = page.getByTestId('stock-ladder')
    await expect(ladder.getByTestId('stock-ladder-rung')).toHaveCount(3)
    await expect(ladder.getByTestId('stock-ladder-rung').nth(0)).toHaveAttribute('data-level', '1')
    await expect(ladder.getByTestId('stock-ladder-rung').nth(2)).toHaveAttribute('data-level', '4')
    await expect(ladder.getByTestId('stock-ladder-chip').first()).toContainText('华阳智能')
    await expect(ladder.getByTestId('stock-ladder-chip-word')).toHaveCount(1)
    await expect(
      ladder.getByTestId('stock-ladder-chip').first().getByTestId('stock-ladder-chip-word'),
    ).toHaveText('一字')
    await expect(ladder.getByTestId('stock-ladder-broken-chip')).toHaveCount(2)
    await expect(
      ladder.getByTestId('stock-ladder-rung').nth(0).getByTestId('stock-ladder-broken-chip'),
    ).toContainText('贵州茅台')
    await expect(
      ladder.getByTestId('stock-ladder-rung').nth(1).getByTestId('stock-ladder-broken-chip'),
    ).toContainText('科瑞思')
    await expect(page.getByTestId('stock-ladder-status')).toContainText('已写入本地')
    const footer = page.getByTestId('stock-ladder-footer')
    await expect(footer).toContainText('50%')
    await expect(footer).toContainText('2/4')
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'stock-ladder.png'),
    })
    // 今天已是最后一天，"后一天"不可点
    await expect(page.getByTestId('stock-ladder-next')).toBeDisabled()

    const dayCounts = (): { total: number; today: number; previous: number } => {
      const database = new DatabaseSync(join(workspace, 'transactions.db'), { readOnly: true })
      const total = database.prepare('SELECT COUNT(*) AS n FROM stock_limit_day').get() as {
        n: number
      }
      const row = database
        .prepare('SELECT status FROM stock_limit_day WHERE trade_date = ?')
        .get(ymd(today)) as { status: string } | undefined
      const prevRow = database
        .prepare('SELECT status FROM stock_limit_day WHERE trade_date = ?')
        .get(ymd(previous)) as { status: string } | undefined
      database.close()
      return {
        total: total.n,
        today: row ? 1 : 0,
        previous: prevRow ? 1 : 0,
      }
    }

    await expect.poll(() => dayCounts()).toMatchObject({ today: 1, previous: 1 })

    // 翻到前一天再翻回来：当天已入库，不应再为当天发请求
    const todayQuery = ymd(today).replaceAll('-', '')
    const todayRequests = (): number => requests.filter((date) => date === todayQuery).length
    const beforeSwitch = todayRequests()
    await page.getByTestId('stock-ladder-prev').click()
    await expect(ladder.getByTestId('stock-ladder-rung')).toHaveCount(3)
    await page.getByTestId('stock-ladder-today').click()
    await expect(ladder.getByTestId('stock-ladder-rung')).toHaveCount(3)
    expect(todayRequests()).toBe(beforeSwitch)

    // 刷新会重新抓当天
    await page.getByTestId('stock-ladder-refresh').click()
    await expect.poll(todayRequests).toBe(beforeSwitch + 1)
  } finally {
    await app.close()
    server.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('连板天梯：15:00 前只渲染临时数据，不入库', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-stock-ladder-live-'))
  const home = join(root, 'home')
  const workspace = join(root, 'ws')
  const userData = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
  mkdirSync(userData, { recursive: true })
  writeFileSync(
    join(home, '.tr.dev.json'),
    JSON.stringify({
      width: 1400,
      height: 1000,
      closeBehavior: 'quit',
      appearance: 'light',
      proxy: { mode: 'off', url: '' },
    }),
  )

  const base = new Date()
  base.setHours(0, 0, 0, 0)
  const today = new Date(base)
  const previous = new Date(base)
  previous.setDate(previous.getDate() - 1)

  const pools: Record<string, unknown[]> = {
    [queryDate(today)]: [raw('600838', '上海九百', 4, 92500), raw('000001', '平安银行', 1, 93000)],
    [queryDate(previous)]: [raw('600838', '上海九百', 3, 92500), raw('600519', '贵州茅台', 1, 92800)],
  }

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const date = url.searchParams.get('date') ?? ''
    const pool = pools[date] ?? []
    response.setHeader('content-type', 'application/json; charset=UTF-8')
    response.end(JSON.stringify({ rc: 0, data: { tc: pool.length, qdate: 0, pool } }))
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
      TRANSACTIONS_TEST_LIMIT_SOURCE: `http://127.0.0.1:${port}`,
      TRANSACTIONS_TEST_LADDER_NOW: String(at(today, 10)),
    }),
  })

  try {
    const page = await app.firstWindow()
    await page.getByTestId('open-workspace').click()
    await expect(page.getByTestId('workspace-state')).toContainText('已打开')
    await page.getByTestId('nav-settings').click()
    await createLedger(page, '盘中账本')
    await page.getByTestId('nav-stock').click()
    await page.getByTestId('stock-tab-ladder').click()

    const ladder = page.getByTestId('stock-ladder')
    await expect(ladder.getByTestId('stock-ladder-rung')).toHaveCount(2)
    await expect(page.getByTestId('stock-ladder-status')).toContainText('盘中临时数据')
    await expect(ladder.getByTestId('stock-ladder-broken-chip')).toHaveCount(1)
    await expect(ladder.getByTestId('stock-ladder-broken-chip')).toContainText('贵州茅台')

    // 当天的池子与日标记都不落库；前一天是确定数据，照常缓存
    await expect
      .poll(() => {
        const database = new DatabaseSync(join(workspace, 'transactions.db'), { readOnly: true })
        const todayRow = database
          .prepare('SELECT COUNT(*) AS n FROM stock_limit_day WHERE trade_date = ?')
          .get(ymd(today)) as { n: number }
        const todayPool = database
          .prepare('SELECT COUNT(*) AS n FROM stock_limit_pool WHERE trade_date = ?')
          .get(ymd(today)) as { n: number }
        const prevRow = database
          .prepare('SELECT COUNT(*) AS n FROM stock_limit_day WHERE trade_date = ?')
          .get(ymd(previous)) as { n: number }
        database.close()
        return { todayRow: todayRow.n, todayPool: todayPool.n, prevRow: prevRow.n }
      })
      .toMatchObject({ todayRow: 0, todayPool: 0, prevRow: 1 })
  } finally {
    await app.close()
    server.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('连板天梯：09:30 前不支持查看当天', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-stock-ladder-preopen-'))
  const home = join(root, 'home')
  const workspace = join(root, 'ws')
  const userData = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
  mkdirSync(userData, { recursive: true })
  writeFileSync(
    join(home, '.tr.dev.json'),
    JSON.stringify({
      width: 1400,
      height: 1000,
      closeBehavior: 'quit',
      appearance: 'light',
      proxy: { mode: 'off', url: '' },
    }),
  )

  const base = new Date()
  base.setHours(0, 0, 0, 0)
  const today = new Date(base)

  const requests: string[] = []
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    requests.push(url.searchParams.get('date') ?? '')
    response.setHeader('content-type', 'application/json; charset=UTF-8')
    response.end(JSON.stringify({ rc: 0, data: { tc: 0, qdate: 0, pool: [] } }))
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
      TRANSACTIONS_TEST_LIMIT_SOURCE: `http://127.0.0.1:${port}`,
      TRANSACTIONS_TEST_LADDER_NOW: String(at(today, 9)),
    }),
  })

  try {
    const page = await app.firstWindow()
    await page.getByTestId('open-workspace').click()
    await expect(page.getByTestId('workspace-state')).toContainText('已打开')
    await page.getByTestId('nav-settings').click()
    await createLedger(page, '开盘前账本')
    await page.getByTestId('nav-stock').click()
    await page.getByTestId('stock-tab-ladder').click()

    await expect(page.getByTestId('stock-ladder-empty')).toContainText('还没开盘')
    await expect(page.getByTestId('stock-ladder-status')).toContainText('开盘前')
    await expect(page.getByTestId('stock-ladder-footer')).toContainText('—')
    expect(requests).toEqual([])

    const database = new DatabaseSync(join(workspace, 'transactions.db'), { readOnly: true })
    const days = database.prepare('SELECT COUNT(*) AS n FROM stock_limit_day').get() as { n: number }
    database.close()
    expect(days.n).toBe(0)
  } finally {
    await app.close()
    server.close()
    rmSync(root, { recursive: true, force: true })
  }
})
