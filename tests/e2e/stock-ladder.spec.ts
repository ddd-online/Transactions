import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server, type ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

import { identityTone } from '../../shared/domain/identity-color'
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

/** 腾讯行情的一段：`~` 分隔的字段，行情时间固定放第 30 位（`YYYYMMDDHHMMSS`）。 */
function quoteLine(code: string, latest: string, prevClose: string, day: string): string {
  const fields = Array.from({ length: 31 }, () => '')
  fields[0] = '1'
  fields[1] = code
  fields[2] = code
  fields[3] = latest
  fields[4] = prevClose
  fields[30] = `${day.replaceAll('-', '')}150000`
  return `v_${code.startsWith('6') ? 'sh' : 'sz'}${code}="${fields.join('~')}";`
}

/**
 * 应答行情请求（`/q=sh600519,sz301314`），
 * 并告诉调用方"这条请求归我管"：天梯拿它给断板补当天涨跌幅。
 */
function respondQuotes(
  pathname: string,
  response: ServerResponse,
  quotes: Record<string, { latest: string; prevClose: string }>,
  day: string,
): boolean {
  if (!pathname.startsWith('/q=')) return false
  const lines = pathname
    .slice('/q='.length)
    .split(',')
    .map((symbol) => symbol.replace(/^[a-z]{2}/, ''))
    .map((code) => {
      const quote = quotes[code]
      return quote ? quoteLine(code, quote.latest, quote.prevClose, day) : ''
    })
    .filter(Boolean)
  response.setHeader('content-type', 'text/plain; charset=GBK')
  response.end(lines.join('\n'))
  return true
}

/** 东财池子的一条（只写解析器用得上的字段）。 */
function raw(
  code: string,
  name: string,
  level: number,
  seal: number,
  brokenCount = 0,
  board = '一般零售',
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
    hybk: board,
    zttj: { days: level, ct: level },
  }
}

/** 把主进程的 `shell.openPath` 换成记录路径：测试里不真的拉起系统浏览器。 */
async function stubOpenPath(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ shell }) => {
    ;(globalThis as { __ladderPagePath?: string }).__ladderPagePath = ''
    shell.openPath = async (target: string) => {
      ;(globalThis as { __ladderPagePath?: string }).__ladderPagePath = target
      return ''
    }
  })
}

/** 点「以网页打开」，等主进程写出文件，返回路径。 */
async function exportCurrentLadder(app: ElectronApplication, page: Page): Promise<string> {
  await page.getByTestId('stock-ladder-open-page').click()
  await expect(page.getByTestId('toast').last()).toContainText('已以网页打开')
  let openedPath = ''
  await expect
    .poll(async () => {
      openedPath = await app.evaluate(
        () => (globalThis as { __ladderPagePath?: string }).__ladderPagePath ?? '',
      )
      return openedPath
    })
    .not.toBe('')
  return openedPath
}

/** 打开导出的网页时的模拟条件：深色（系统是浅色）或打印。 */
interface LadderPageMedia {
  dark?: boolean
  print?: boolean
}

/** 用应用自己的 Chromium 打开导出的网页，按给定宽度整页截图。 */
async function captureLadderPage(
  app: ElectronApplication,
  filePath: string,
  width: number,
  media: LadderPageMedia = {},
): Promise<Buffer> {
  const png = await app.evaluate(
    async ({ BrowserWindow }, options: { filePath: string; width: number; media: LadderPageMedia }) => {
      const win = new BrowserWindow({
        width: options.width,
        height: 900,
        show: false,
        webPreferences: { sandbox: true, backgroundThrottling: false },
      })
      try {
        win.setContentSize(options.width, 900)
        await win.loadFile(options.filePath)
        if (options.media.dark || options.media.print) {
          // 让 prefers-color-scheme / media 真的换掉：这台机器的系统主题是浅色
          win.webContents.debugger.attach('1.3')
          await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
            media: options.media.print ? 'print' : 'screen',
            features: [
              {
                name: 'prefers-color-scheme',
                value: options.media.dark ? 'dark' : 'light',
              },
            ],
          })
        }
        await new Promise((resolve) => {
          setTimeout(resolve, 500)
        })
        const height = (await win.webContents.executeJavaScript(
          'document.documentElement.scrollHeight',
        )) as number
        win.setContentSize(options.width, Math.min(Math.max(height, 900), 4000))
        await new Promise((resolve) => {
          setTimeout(resolve, 400)
        })
        const image = await win.webContents.capturePage()
        return image.toPNG().toString('base64')
      } finally {
        if (win.webContents.debugger.isAttached()) win.webContents.debugger.detach()
        win.destroy()
      }
    },
    { filePath, width, media },
  )
  return Buffer.from(png, 'base64')
}

interface LadderPageCard {
  top: number
  left: number
  /** 板块色相槽位：`s0` … `s7`，没有板块的是 `none` */
  slot: string
  board: string
  broken: boolean
  borderStyle: string
  /** 名称 / 价格的 computed color：涨停是语义红 */
  nameColor: string
  priceColor: string
}

interface LadderPageBox {
  label: string
  top: number
  left: number
  headRight: number
  headBottom: number
  cards: LadderPageCard[]
}

interface LadderPageGeometry {
  levels: LadderPageBox[]
  overflowX: number
  /** 打印媒体下「打印」按钮应当是 none */
  printButton: string
  /** 一段的 display：屏幕是 grid、打印是 block（块流才能分页） */
  levelDisplay: string
}

/** 用应用自己的 Chromium 打开导出的网页，量一遍版式：不看像素，看盒子落在哪。 */
async function inspectLadderPage(
  app: ElectronApplication,
  filePath: string,
  width: number,
  media: LadderPageMedia = {},
): Promise<LadderPageGeometry> {
  return app.evaluate(
    async ({ BrowserWindow }, options: { filePath: string; width: number; media: LadderPageMedia }) => {
      const win = new BrowserWindow({
        width: options.width,
        height: 900,
        show: false,
        webPreferences: { sandbox: true, backgroundThrottling: false },
      })
      try {
        // contentSize 而不是 window size：量出来的宽度就是页面的宽度
        win.setContentSize(options.width, 900)
        await win.loadFile(options.filePath)
        if (options.media.dark || options.media.print) {
          win.webContents.debugger.attach('1.3')
          await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
            media: options.media.print ? 'print' : 'screen',
            features: [
              { name: 'prefers-color-scheme', value: options.media.dark ? 'dark' : 'light' },
            ],
          })
        }
        await new Promise((resolve) => {
          setTimeout(resolve, 300)
        })
        return await win.webContents.executeJavaScript(`(() => {
          const box = (node) => node.getBoundingClientRect()
          const levels = [...document.querySelectorAll('.level')].map((level) => {
            const head = level.querySelector('.level-head')
            const section = box(level)
            return {
              label: level.getAttribute('aria-label') || '',
              top: Math.round(section.top),
              left: Math.round(section.left),
              headRight: Math.round(head ? box(head).right : section.left),
              headBottom: Math.round(head ? box(head).bottom : section.top),
              cards: [...level.querySelectorAll('.card')].map((card) => {
                const cardBox = box(card)
                const name = card.querySelector('.name')
                const price = card.querySelector('.price')
                return {
                  top: Math.round(cardBox.top),
                  left: Math.round(cardBox.left),
                  slot: (String(card.className).match(/board-(s\\d+|none)/) || [])[1] || '',
                  board: (card.querySelector('.board') || {}).textContent || '',
                  broken: card.classList.contains('is-broken'),
                  borderStyle: getComputedStyle(card).borderTopStyle,
                  nameColor: name ? getComputedStyle(name).color : '',
                  priceColor: price ? getComputedStyle(price).color : '',
                }
              }),
            }
          })
          const root = document.documentElement
          const printButton = document.querySelector('.print')
          return {
            levels,
            overflowX: root.scrollWidth - root.clientWidth,
            printButton: printButton ? getComputedStyle(printButton).display : 'missing',
            levelDisplay: levels.length > 0
              ? getComputedStyle(document.querySelector('.level')).display
              : 'none',
          }
        })()`)
      } finally {
        win.destroy()
      }
    },
    { filePath, width, media },
  )
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
  // 天梯只谈交易日：页面默认落在最近一个交易日（周末打开就是周五），
  // 测试的"今天"也必须用同一个基准，否则周末跑时页面请求的是周五、夹具却在周日。
  while (base.getDay() === 0 || base.getDay() === 6) base.setDate(base.getDate() - 1)
  const today = new Date(base)
  // 天梯的「前一交易日」会跳过周末（`loadPreviousDay` 里直接记空、不发请求）：
  // 测试的"昨天"也得跟着跳，否则周日/周一时它会回溯到周五，而夹具只放在"昨天"。
  const previous = new Date(base)
  do {
    previous.setDate(previous.getDate() - 1)
  } while (previous.getDay() === 0 || previous.getDay() === 6)

  const pools: Record<string, unknown[]> = {
    [queryDate(today)]: [
      raw('600838', '上海九百', 4, 92500, 1, '一般零售'),
      raw('000001', '平安银行', 2, 93000, 0, '银行'),
      // 电网设备这一组故意被化学制药隔开：分组后要连着排在一起
      raw('301502', '华阳智能', 1, 92500, 0, '电网设备'),
      raw('002001', '新和成', 1, 92600, 0, '化学制药'),
      raw('300001', '特锐德', 1, 92700, 0, '电网设备'),
    ],
    [queryDate(previous)]: [
      raw('600838', '上海九百', 3, 92500, 0, '一般零售'),
      raw('000001', '平安银行', 1, 92600, 0, '银行'),
      raw('301314', '科瑞思', 2, 92700, 0, '电网设备'),
      raw('600519', '贵州茅台', 1, 92800, 0, '白酒'),
    ],
  }

  const requests: string[] = []
  // 断板行情：茅台 +3.33%（红）、科瑞思 -3.92%（绿）。
  const quotes = {
    '600519': { latest: '1550.00', prevClose: '1500.00' },
    '301314': { latest: '49.00', prevClose: '51.00' },
  }
  // 行情自己的交易日。默认就是天梯这一天；后面会把它拨到下一天，
  // 模拟"过了这个交易日，行情只肯给最新一笔"。
  let quoteDay = ymd(today)
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (respondQuotes(url.pathname, response, quotes, quoteDay)) return
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
      TRANSACTIONS_TEST_QUOTE_SOURCE: `http://127.0.0.1:${port}`,
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

    // 工具栏下的板块汇总：只数今日涨停（断板的白酒不计），家数多的在前
    const boardSummary = ladder.getByTestId('stock-ladder-boards')
    await expect(boardSummary.getByTestId('stock-ladder-board-count')).toHaveCount(4)
    await expect(boardSummary.getByTestId('stock-ladder-board-name')).toHaveText([
      '电网设备',
      '一般零售',
      '化学制药',
      '银行',
    ])
    await expect(boardSummary.getByTestId('stock-ladder-board-num')).toHaveText(['2', '1', '1', '1'])
    // 汇总里的板块名与列里的同色
    await expect(boardSummary.getByTestId('stock-ladder-board-name').first()).toHaveClass(
      new RegExp(`stock-ladder__board--${identityTone('电网设备')}`),
    )
    const summaryBox = await boardSummary.boundingBox()
    const rungsBox = await ladder.getByTestId('stock-ladder-rungs').boundingBox()
    expect(summaryBox).not.toBeNull()
    expect(rungsBox).not.toBeNull()
    // 汇总条在板块列之上
    expect((summaryBox?.y ?? 0) + (summaryBox?.height ?? 0)).toBeLessThanOrEqual(
      (rungsBox?.y ?? 0) + 1,
    )

    await expect(ladder.getByTestId('stock-ladder-chip').first()).toContainText('华阳智能')
    // 卡片带当天的价格：收盘后是收盘价（涨停池里的 p），断板的价来自同一笔当天行情
    const firstPrice = ladder
      .getByTestId('stock-ladder-chip')
      .first()
      .getByTestId('stock-ladder-chip-price')
    await expect(firstPrice).toContainText('11.00')
    await expect(ladder.getByTestId('stock-ladder-chip').first()).toHaveAttribute(
      'title',
      /收盘价 11\.00/,
    )
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

    // 先按板块聚在一起，板块内按封板先后：电网设备（09:25 / 09:27）连着排在
    // 化学制药（09:26）前面；只剩断板的白酒整组落在最后。
    const firstRung = ladder.getByTestId('stock-ladder-rung').nth(0)
    await expect(firstRung.locator('.stock-ladder__item-name')).toHaveText([
      '华阳智能',
      '特锐德',
      '新和成',
      '贵州茅台',
    ])
    const boardLabels = firstRung.getByTestId('stock-ladder-chip-board')
    await expect(boardLabels).toHaveText(['电网设备', '电网设备', '化学制药', '白酒'])
    // 同一板块同一身份色
    await expect(boardLabels.first()).toHaveClass(
      new RegExp(`stock-ladder__board--${identityTone('电网设备')}`),
    )
    const sameBoardClasses = await boardLabels.evaluateAll((nodes) =>
      nodes.slice(0, 2).map((node) => node.className),
    )
    expect(sameBoardClasses[0]).toBe(sameBoardClasses[1])

    // 代码可点：点一下复制到系统剪贴板，并给一条回执
    const firstCode = firstRung.getByTestId('stock-ladder-chip-code').first()
    await expect(firstCode).toHaveText('301502')
    await firstCode.hover()
    await page.waitForTimeout(200)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'stock-ladder-code-hover.png'),
    })
    await firstCode.click()
    await expect(page.getByTestId('toast').last()).toContainText('已复制 301502')
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('301502')

    // 涨停行铺微红底，断板行不铺底
    const rowTints = await ladder.evaluate((root) => {
      const limit = root.querySelector('[data-testid="stock-ladder-chip"]')
      const broken = root.querySelector('[data-testid="stock-ladder-broken-chip"]')
      return {
        limit: limit ? getComputedStyle(limit).backgroundColor : '',
        broken: broken ? getComputedStyle(broken).backgroundColor : '',
      }
    })
    expect(rowTints.limit).not.toBe('rgba(0, 0, 0, 0)')
    expect(rowTints.broken).toBe('rgba(0, 0, 0, 0)')

    // 行内左右留 8px：文字与列头落在同一条竖线上，不贴着底色边
    const geometry = await ladder.evaluate((root) => {
      const item = root.querySelector('[data-testid="stock-ladder-chip"]')
      const name = item?.querySelector('.stock-ladder__item-name')
      const level = root.querySelector('.stock-ladder__level-num')
      const itemBox = item?.getBoundingClientRect()
      const nameBox = name?.getBoundingClientRect()
      return {
        paddingLeft: item ? getComputedStyle(item).paddingLeft : '',
        paddingRight: item ? getComputedStyle(item).paddingRight : '',
        inset: itemBox && nameBox ? nameBox.left - itemBox.left : -1,
        nameLeft: nameBox?.left ?? -1,
        levelLeft: level?.getBoundingClientRect().left ?? -2,
      }
    })
    expect(parseFloat(geometry.paddingLeft)).toBe(8)
    expect(parseFloat(geometry.paddingRight)).toBe(24) // 8 + 16（滚动条滑块让位）
    expect(geometry.inset).toBeCloseTo(8, 0)
    expect(geometry.nameLeft).toBeCloseTo(geometry.levelLeft, 0)

    // 断板带当天的涨跌幅标签：涨红跌绿（行情由本地服务供给）
    const brokenMoutai = ladder
      .getByTestId('stock-ladder-broken-chip')
      .filter({ hasText: '贵州茅台' })
    const brokenKeruisi = ladder
      .getByTestId('stock-ladder-broken-chip')
      .filter({ hasText: '科瑞思' })
    await expect(brokenMoutai.getByTestId('stock-ladder-chip-pct')).toHaveText('+3.33%')
    await expect(brokenMoutai.getByTestId('stock-ladder-chip-pct')).toHaveClass(/stock-ladder__tag--up/)
    // 断板的价格也补上了：与涨跌幅同一笔行情，收盘后就是收盘价
    await expect(brokenMoutai.getByTestId('stock-ladder-chip-price')).toContainText('1550.00')
    await expect(brokenMoutai).toHaveAttribute('title', /收盘价 1550\.00/)
    await expect(brokenKeruisi.getByTestId('stock-ladder-chip-pct')).toHaveText('-3.92%')
    await expect(brokenKeruisi.getByTestId('stock-ladder-chip-pct')).toHaveClass(
      /stock-ladder__tag--down/,
    )
    await expect(brokenKeruisi.getByTestId('stock-ladder-chip-price')).toContainText('49.00')
    // 断板那两格落库了：这一天收盘定稿时存下的就是这一笔（历史日靠它，不靠行情）
    const storedDb = new DatabaseSync(join(workspace, 'transactions.db'), { readOnly: true })
    const storedQuotes = storedDb
      .prepare('SELECT stock_code, pct, price_milli FROM stock_limit_broken_quote ORDER BY stock_code')
      .all()
    storedDb.close()
    expect(storedQuotes).toEqual([
      { stock_code: '301314', pct: -3.92, price_milli: 49_000 },
      { stock_code: '600519', pct: 3.33, price_milli: 1_550_000 },
    ])
    await expect(page.getByTestId('stock-ladder-status')).toContainText('已写入本地')
    const footer = page.getByTestId('stock-ladder-footer')
    await expect(footer).toContainText('50%')
    await expect(footer).toContainText('2/4')
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'stock-ladder.png'),
    })
    // 今天已是最后一天，选日器的"后一天"不可点
    await expect(page.getByTestId('stock-ladder-date-next')).toBeDisabled()

    // 以网页打开：主进程写到临时目录再交给系统浏览器；测试把 openPath 换成记录路径
    await stubOpenPath(app)
    const openedPath = await exportCurrentLadder(app, page)

    expect(openedPath).toContain(`transactions-ladder-${ymd(today)}.html`)
    const pageHtml = readFileSync(openedPath, 'utf8')
    // 网页纵向排：4 板在最上、1 板在最后一段（软件里是首板在左）
    const highBoard = pageHtml.indexOf('aria-label="4 板"')
    const lowBoard = pageHtml.indexOf('aria-label="1 板"')
    expect(highBoard).toBeGreaterThan(-1)
    expect(highBoard).toBeLessThan(lowBoard)
    expect(pageHtml).toContain(`<title>连板天梯 · ${ymd(today)}</title>`)
    // 板块色铺成卡片底色：八个色相都写进样式，卡片挂的是当天分到的槽位
    for (let slot = 0; slot < 8; slot += 1) {
      expect(pageHtml).toContain(`.board-s${slot}{--tone:`)
    }
    expect(pageHtml).toMatch(/class="card board-s\d/)
    // 价格与断板都在
    expect(pageHtml).toContain('11.00')
    expect(pageHtml).toContain('1550.00')
    expect(pageHtml).toContain('>断</span>')
    expect(pageHtml).toContain('+3.33%')
    // 自包含：字体由主进程内嵌，页面没有外部请求与脚本
    expect(pageHtml).toContain('@font-face')
    expect(pageHtml).toContain("font-family:'Inter'")
    expect(pageHtml).toContain('data:font/woff2;base64,')
    expect(pageHtml).not.toMatch(/<script[\s>]/i)
    expect(pageHtml).not.toMatch(/https?:\/\//)
    expect(pageHtml).toContain('window.print()')

    // 版式：一段一个板数、从上往下由高到低；板数在左、卡片在右，一板的几张卡排成一行
    const layout = await inspectLadderPage(app, openedPath, 1440)
    expect(layout.overflowX).toBeLessThanOrEqual(1)
    expect(layout.levels.map((level) => level.label)).toEqual(['4 板', '2 板', '1 板'])
    for (let index = 1; index < layout.levels.length; index += 1) {
      expect(layout.levels[index].top).toBeGreaterThan(layout.levels[index - 1].top)
    }
    expect(new Set(layout.levels.map((level) => level.left)).size).toBe(1)
    for (const level of layout.levels) {
      // 数字在卡片左边，卡片不在第一列
      expect(level.headRight).toBeLessThanOrEqual(level.cards[0].left)
      expect(level.cards[0].left - level.left).toBeGreaterThanOrEqual(100)
    }
    // 断板是虚线框，连板是实线；同一天的每个板块一个色相，互不相同
    const cards = layout.levels.flatMap((level) => level.cards)
    expect(cards.some((card) => card.broken)).toBe(true)
    for (const card of cards) {
      expect(card.borderStyle).toBe(card.broken ? 'dashed' : 'solid')
    }
    const hueOfBoard = new Map<string, string>()
    for (const card of cards) {
      const hue = hueOfBoard.get(card.board)
      if (hue === undefined) hueOfBoard.set(card.board, card.slot)
      else expect(card.slot).toBe(hue)
    }
    expect(hueOfBoard.size).toBe(5)
    expect(new Set(hueOfBoard.values()).size).toBe(hueOfBoard.size)

    // 涨停的名字与价格是语义红（#bb2323），断板的退成板块色的次要字
    const limitCard = cards.find((card) => !card.broken)
    expect(limitCard?.nameColor).toBe('rgb(187, 35, 35)')
    expect(limitCard?.priceColor).toBe('rgb(187, 35, 35)')
    for (const card of cards.filter((entry) => entry.broken)) {
      expect(card.nameColor).not.toBe('rgb(187, 35, 35)')
    }

    // 一板 3 家 + 断板 1 家，桌面宽度下排在同一行
    const firstBoards = layout.levels[layout.levels.length - 1].cards
    expect(firstBoards).toHaveLength(4)
    expect(new Set(firstBoards.map((card) => card.top)).size).toBe(1)
    expect(firstBoards[0].left).toBeLessThan(firstBoards[1].left)

    // 手机：板数落到卡片上方，卡片收成一列
    const phone = await inspectLadderPage(app, openedPath, 390)
    expect(phone.overflowX).toBeLessThanOrEqual(1)
    for (const level of phone.levels) {
      expect(level.headBottom).toBeLessThanOrEqual(level.cards[0].top)
      expect(new Set(level.cards.map((card) => card.left)).size).toBe(1)
    }

    // 用真实的 Chromium 打开这张网页，按桌面 / 手机 / 深色三个宽度截图（检查用，不是断言）
    writeFileSync(
      join(repositoryRoot, 'artifacts', 'tests', 'ladder-page-desktop.png'),
      await captureLadderPage(app, openedPath, 1440),
    )
    writeFileSync(
      join(repositoryRoot, 'artifacts', 'tests', 'ladder-page-mobile.png'),
      await captureLadderPage(app, openedPath, 390),
    )
    writeFileSync(
      join(repositoryRoot, 'artifacts', 'tests', 'ladder-page-dark.png'),
      await captureLadderPage(app, openedPath, 1440, { dark: true }),
    )
    writeFileSync(
      join(repositoryRoot, 'artifacts', 'tests', 'ladder-page-print.png'),
      await captureLadderPage(app, openedPath, 1440, { print: true }),
    )

    // 打印版式：按钮收起、每段改成块流（能分页）、每张卡都还在
    const printed = await inspectLadderPage(app, openedPath, 1440, { print: true })
    expect(printed.printButton).toBe('none')
    expect(printed.levelDisplay).toBe('block')
    expect(printed.levels.flatMap((level) => level.cards)).toHaveLength(cards.length)

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
    await page.getByTestId('stock-ladder-date-prev').click()
    await expect(ladder.getByTestId('stock-ladder-rung')).toHaveCount(3)
    await page.getByTestId('stock-ladder-date-next').click()
    await expect(ladder.getByTestId('stock-ladder-rung')).toHaveCount(3)
    expect(todayRequests()).toBe(beforeSwitch)

    // 刷新会重新抓当天
    await page.getByTestId('stock-ladder-refresh').click()
    await expect.poll(todayRequests).toBe(beforeSwitch + 1)

    // 行情只给"最新一笔"：把它的交易日拨到之后，这一天就再也问不到断板涨跌幅了。
    // 但收盘定稿时已经落库 —— 翻回这一天，那两格还在（旧实现到这里就只剩「断」）。
    const nextDay = new Date(today)
    nextDay.setDate(nextDay.getDate() + 1)
    quoteDay = ymd(nextDay)
    await page.getByTestId('stock-ladder-refresh').click()
    await expect(brokenMoutai.getByTestId('stock-ladder-chip-pct')).toHaveText('+3.33%')
    await expect(brokenKeruisi.getByTestId('stock-ladder-chip-pct')).toHaveText('-3.92%')
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
  // 天梯只谈交易日：页面默认落在最近一个交易日（周末打开就是周五），
  // 测试的"今天"也必须用同一个基准，否则周末跑时页面请求的是周五、夹具却在周日。
  while (base.getDay() === 0 || base.getDay() === 6) base.setDate(base.getDate() - 1)
  const today = new Date(base)
  // 天梯的「前一交易日」会跳过周末（`loadPreviousDay` 里直接记空、不发请求）：
  // 测试的"昨天"也得跟着跳，否则周日/周一时它会回溯到周五，而夹具只放在"昨天"。
  const previous = new Date(base)
  do {
    previous.setDate(previous.getDate() - 1)
  } while (previous.getDay() === 0 || previous.getDay() === 6)

  const pools: Record<string, unknown[]> = {
    [queryDate(today)]: [raw('600838', '上海九百', 4, 92500), raw('000001', '平安银行', 1, 93000)],
    [queryDate(previous)]: [raw('600838', '上海九百', 3, 92500), raw('600519', '贵州茅台', 1, 92800)],
  }

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (respondQuotes(url.pathname, response, { '600519': { latest: '1450.00', prevClose: '1500.00' } }, ymd(today))) {
      return
    }
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
      TRANSACTIONS_TEST_QUOTE_SOURCE: `http://127.0.0.1:${port}`,
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
    // 盘中同样带涨跌幅与价格：这两格跟的是实时行情
    await expect(
      ladder.getByTestId('stock-ladder-broken-chip').getByTestId('stock-ladder-chip-pct'),
    ).toHaveText('-3.33%')
    await expect(
      ladder.getByTestId('stock-ladder-broken-chip').getByTestId('stock-ladder-chip-price'),
    ).toContainText('1450.00')
    // 盘中是当时价，不是收盘价：标签跟着状态走
    await expect(ladder.getByTestId('stock-ladder-broken-chip')).toHaveAttribute(
      'title',
      /当时价 1450\.00/,
    )
    await expect(ladder.getByTestId('stock-ladder-chip').first()).toHaveAttribute(
      'title',
      /当时价 11\.00/,
    )

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
  // 天梯只谈交易日：页面默认落在最近一个交易日（周末打开就是周五），
  // 测试的"今天"也必须用同一个基准，否则周末跑时页面请求的是周五、夹具却在周日。
  while (base.getDay() === 0 || base.getDay() === 6) base.setDate(base.getDate() - 1)
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
    await expect(page.getByTestId('stock-ladder-open-page')).toBeDisabled()
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

test('连板天梯：首板很多时列内滚动，页面不跟着变长', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-stock-ladder-scroll-'))
  const home = join(root, 'home')
  const workspace = join(root, 'ws')
  const userData = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
  mkdirSync(userData, { recursive: true })
  writeFileSync(
    join(home, '.tr.dev.json'),
    JSON.stringify({
      width: 1400,
      height: 900,
      closeBehavior: 'quit',
      appearance: 'light',
      proxy: { mode: 'off', url: '' },
    }),
  )

  const base = new Date()
  base.setHours(0, 0, 0, 0)
  // 天梯只谈交易日：页面默认落在最近一个交易日（周末打开就是周五），
  // 测试的"今天"也必须用同一个基准，否则周末跑时页面请求的是周五、夹具却在周日。
  while (base.getDay() === 0 || base.getDay() === 6) base.setDate(base.getDate() - 1)
  const today = new Date(base)
  // 天梯的「前一交易日」会跳过周末（`loadPreviousDay` 里直接记空、不发请求）：
  // 测试的"昨天"也得跟着跳，否则周日/周一时它会回溯到周五，而夹具只放在"昨天"。
  const previous = new Date(base)
  do {
    previous.setDate(previous.getDate() - 1)
  } while (previous.getDay() === 0 || previous.getDay() === 6)

  const firstBoards = Array.from({ length: 60 }, (_, index) =>
    raw(`6${String(10000 + index).padStart(5, '0')}`, `首板${index + 1}`, 1, 92500 + index * 10),
  )
  const pools: Record<string, unknown[]> = {
    [queryDate(today)]: firstBoards,
    [queryDate(previous)]: [raw('600000', '昨日板', 1, 92500)],
  }

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (respondQuotes(url.pathname, response, { '600000': { latest: '10.45', prevClose: '10.00' } }, ymd(today))) {
      return
    }
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
      TRANSACTIONS_TEST_QUOTE_SOURCE: `http://127.0.0.1:${port}`,
      TRANSACTIONS_TEST_LADDER_NOW: String(at(today, 16)),
    }),
  })

  try {
    const page = await app.firstWindow()
    await page.getByTestId('open-workspace').click()
    await expect(page.getByTestId('workspace-state')).toContainText('已打开')
    await page.getByTestId('nav-settings').click()
    await createLedger(page, '滚动账本')
    await page.getByTestId('nav-stock').click()
    await page.getByTestId('stock-tab-ladder').click()

    const ladder = page.getByTestId('stock-ladder')
    await expect(ladder.getByTestId('stock-ladder-rung')).toHaveCount(1)

    // 列内由 OverlayScrollbars 接管滚动；页面本身不出现第二条滚动条
    const metrics = await page.evaluate(() => {
      const host = document.querySelector('.stock-ladder__list')
      const viewport = host?.querySelector('[data-overlayscrollbars-viewport]')
      const content = document.querySelector('.page-content')
      return {
        hasViewport: Boolean(viewport),
        scrollable: viewport ? viewport.scrollHeight > viewport.clientHeight + 1 : false,
        pageOverflow: content ? content.scrollHeight - content.clientHeight : 0,
      }
    })
    expect(metrics.hasViewport).toBe(true)
    expect(metrics.scrollable).toBe(true)
    expect(metrics.pageOverflow).toBeLessThanOrEqual(2)
  } finally {
    await app.close()
    server.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('连板天梯：窄列与窄窗下板块、标签都不被裁掉', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-stock-ladder-narrow-'))
  const home = join(root, 'home')
  const workspace = join(root, 'ws')
  const userData = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
  mkdirSync(userData, { recursive: true })
  writeFileSync(
    join(home, '.tr.dev.json'),
    JSON.stringify({
      width: 1400,
      height: 900,
      closeBehavior: 'quit',
      appearance: 'light',
      proxy: { mode: 'off', url: '' },
    }),
  )

  const base = new Date()
  base.setHours(0, 0, 0, 0)
  // 天梯只谈交易日：页面默认落在最近一个交易日（周末打开就是周五），
  // 测试的"今天"也必须用同一个基准，否则周末跑时页面请求的是周五、夹具却在周日。
  while (base.getDay() === 0 || base.getDay() === 6) base.setDate(base.getDate() - 1)
  const today = new Date(base)
  // 天梯的「前一交易日」会跳过周末（`loadPreviousDay` 里直接记空、不发请求）：
  // 测试的"昨天"也得跟着跳，否则周日/周一时它会回溯到周五，而夹具只放在"昨天"。
  const previous = new Date(base)
  do {
    previous.setDate(previous.getDate() - 1)
  } while (previous.getDay() === 0 || previous.getDay() === 6)

  // 7 层：每列只剩 ~180px，行换 66px 的三行版式
  const pools: Record<string, unknown[]> = {
    [queryDate(today)]: [
      raw('600001', '金安国纪', 7, 92500, 0, '光伏设备'),
      raw('600002', '方正科技', 6, 94800, 1, '元件'),
      raw('600003', '世运电路', 5, 103400, 0, '元件'),
      raw('600004', '豪恩汽电', 4, 92500, 0, '汽车零部件'),
      raw('600005', '联明股份', 3, 93000, 0, '汽车零部件'),
      raw('600006', '旺成科技', 2, 94600, 0, '银行'),
      raw('600007', '青岛食品', 1, 92500, 0, '休闲食品'),
      raw('600008', '光洋股份', 1, 93000, 0, '汽车零部件'),
    ],
    [queryDate(previous)]: [
      raw('600001', '金安国纪', 6, 92500, 0, '光伏设备'),
      raw('600002', '方正科技', 5, 94800, 1, '元件'),
      raw('600003', '世运电路', 4, 103400, 0, '元件'),
      raw('600004', '豪恩汽电', 3, 92500, 0, '汽车零部件'),
      raw('600005', '联明股份', 2, 93000, 0, '汽车零部件'),
      raw('600006', '旺成科技', 1, 94600, 0, '银行'),
      raw('600010', '大族数控', 3, 95000, 0, '专用设备'),
    ],
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
      TRANSACTIONS_TEST_LADDER_NOW: String(at(today, 16)),
    }),
  })

  try {
    const page = await app.firstWindow()
    await page.getByTestId('open-workspace').click()
    await expect(page.getByTestId('workspace-state')).toContainText('已打开')
    await page.getByTestId('nav-settings').click()
    await createLedger(page, '窄列账本')
    await page.getByTestId('nav-stock').click()
    await page.getByTestId('stock-tab-ladder').click()

    const ladder = page.getByTestId('stock-ladder')
    await expect(ladder.getByTestId('stock-ladder-rung')).toHaveCount(7)

    // 窄列：行换成 66px，板块与标签整行落在行内（此前被 48px 裁掉）
    const row = ladder.getByTestId('stock-ladder-chip').first()
    const rowBox = await row.evaluate((el) => {
      const tags = el.querySelector('.stock-ladder__item-tags')
      return {
        height: Math.round(el.getBoundingClientRect().height),
        overflow: tags
          ? Math.round(tags.getBoundingClientRect().bottom - el.getBoundingClientRect().bottom)
          : 999,
      }
    })
    expect(rowBox.height).toBe(66)
    expect(rowBox.overflow).toBeLessThanOrEqual(0)
    await expect(row.getByTestId('stock-ladder-chip-board')).toBeVisible()
    // 价格与名称在同一行：价格不能被裁掉，长度超出时先截名称
    const priced = await row.evaluate((el) => {
      const price = el.querySelector<HTMLElement>('[data-testid="stock-ladder-chip-price"]')
      const ident = el.querySelector<HTMLElement>('.stock-ladder__item-ident')
      return {
        priceVisible: price !== null && price.getBoundingClientRect().width > 0,
        priceRight: Math.round(price?.getBoundingClientRect().right ?? -1),
        identRight: Math.round(ident?.getBoundingClientRect().right ?? -2),
      }
    })
    expect(priced.priceVisible).toBe(true)
    expect(priced.priceRight).toBeLessThanOrEqual(priced.identRight + 1)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'stock-ladder-narrow-columns.png'),
    })

    // 七层稠密版导出：1440 一段一排；960 收窄 rail；手机数字落到卡片上方
    await stubOpenPath(app)
    const sevenLevelPath = await exportCurrentLadder(app, page)
    writeFileSync(
      join(repositoryRoot, 'artifacts', 'tests', 'ladder-page-seven-levels.png'),
      await captureLadderPage(app, sevenLevelPath, 1440),
    )
    writeFileSync(
      join(repositoryRoot, 'artifacts', 'tests', 'ladder-page-tablet.png'),
      await captureLadderPage(app, sevenLevelPath, 960),
    )

    // 七层也仍是纵向：960 宽下数字继续留在卡片左边，不挤成一栏
    const tabletLayout = await inspectLadderPage(app, sevenLevelPath, 960)
    expect(tabletLayout.levels.map((level) => level.label)).toEqual([
      '7 板',
      '6 板',
      '5 板',
      '4 板',
      '3 板',
      '2 板',
      '1 板',
    ])
    expect(tabletLayout.overflowX).toBeLessThanOrEqual(1)
    for (const level of tabletLayout.levels) {
      expect(level.headRight).toBeLessThanOrEqual(level.cards[0].left)
    }

    // 窄窗：分层行（chips）里标签不换行、格子有左右内边距
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(960, 900)
    })
    await page.waitForFunction(() => window.innerWidth < 1000)
    await expect(ladder.locator('.stock-ladder__chips').first()).toBeVisible()
    const chips = await ladder.evaluate((root) => {
      const items = [...root.querySelectorAll('.stock-ladder__chips .stock-ladder__item')]
      return items.map((item) => {
        const tags = item.querySelector('.stock-ladder__item-tags')
        const style = getComputedStyle(item)
        return {
          wrapped: tags ? tags.scrollHeight > tags.clientHeight + 1 : false,
          paddingLeft: parseFloat(style.paddingLeft),
        }
      })
    })
    expect(chips.length).toBeGreaterThan(0)
    expect(chips.every((chip) => !chip.wrapped)).toBe(true)
    expect(chips.every((chip) => chip.paddingLeft === 8)).toBe(true)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'stock-ladder-narrow-window.png'),
    })
  } finally {
    await app.close()
    server.close()
    rmSync(root, { recursive: true, force: true })
  }
})

