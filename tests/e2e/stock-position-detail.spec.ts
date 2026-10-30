import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
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

/** 详情里的两段：信息区（行情 / 台账 / 复盘）与成交记录区，各自的盒子尺寸。 */
interface DetailBoxes {
  detailScrolls: boolean
  detailBottom: number
  tradesBottom: number
  tradesHeight: number
  infoScrolls: boolean
  infoHeight: number
}

async function readBoxes(page: import('@playwright/test').Page): Promise<DetailBoxes> {
  return page.evaluate(() => {
    const box = (selector: string): HTMLElement | null =>
      document.querySelector(selector) as HTMLElement | null
    const detail = box('.stock-detail')
    const info = box('.stock-detail__info')
    const infoViewport = info?.querySelector('[data-overlayscrollbars-viewport]') as HTMLElement | null
    const trades = box('.stock-detail__trades')
    const rect = (element: HTMLElement | null): DOMRect | null => element?.getBoundingClientRect() ?? null
    const detailRect = rect(detail)
    const tradesRect = rect(trades)
    return {
      detailScrolls: detail ? detail.scrollHeight > detail.clientHeight + 1 : false,
      detailBottom: Math.round(detailRect?.bottom ?? -1),
      tradesBottom: Math.round(tradesRect?.bottom ?? -1),
      tradesHeight: Math.round(tradesRect?.height ?? -1),
      infoScrolls: infoViewport
        ? infoViewport.scrollHeight > infoViewport.clientHeight + 1
        : false,
      infoHeight: Math.round(rect(info)?.height ?? -1),
    }
  })
}

test('股票持仓详情：成交记录吃掉剩余高度，表格自己滚而不是整列滚', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-detail-'))
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
    await createLedger(page, '股票账本')
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

    // 加到一屏放不下，成交记录区才会有得滚
    for (let index = 0; index < 9; index += 1) {
      await page.getByTestId('stock-position-add').click()
      await page.getByTestId('trade-price').fill(String(5 + index * 0.1))
      await page.getByTestId('trade-lots').fill('1')
      await page.getByTestId('trade-save').click()
      await expect(page.getByTestId('stock-trade')).toHaveCount(index + 2)
    }

    // 本轮复盘写长一点：窗口矮下去时应该是信息区自己滚，而不是把表格挤没
    await page.getByTestId('position-round-edit').click()
    await page.getByTestId('position-round-review').fill('买入理由：冰雪经济龙头股，超过雪人集团。'.repeat(14))
    await page.getByTestId('position-round-save').click()
    await expect(page.getByTestId('position-round-preview')).toContainText('冰雪经济龙头股')

    const wide = await readBoxes(page)
    // 整列不再滚动；成交记录区一直顶到详情底边
    expect(wide.detailScrolls).toBe(false)
    expect(wide.tradesBottom).toBe(wide.detailBottom)
    expect(wide.tradesHeight).toBeGreaterThan(200)
    expect(wide.infoScrolls).toBe(false)

    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'stock-detail-trades.png'),
    })

    // 窗口更矮时：成交记录保住最小高度，改由信息区自己滚
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setSize(1400, 700)
    })
    await page.waitForTimeout(400)
    const short = await readBoxes(page)
    expect(short.detailScrolls).toBe(false)
    expect(short.tradesBottom).toBe(short.detailBottom)
    expect(short.tradesHeight).toBeGreaterThanOrEqual(180)
    expect(short.infoScrolls).toBe(true)
    expect(short.infoHeight).toBeLessThan(wide.infoHeight)

    // 表格区自己滚：滚到底表头仍停在滚动区顶边
    await page.waitForSelector('.stock-detail__trades-scroll [data-overlayscrollbars-viewport]')
    const scrolled = await page.evaluate(() => {
      const viewport = document.querySelector(
        '.stock-detail__trades-scroll [data-overlayscrollbars-viewport]',
      ) as HTMLElement | null
      if (!viewport) return null
      viewport.scrollTo({ top: viewport.scrollHeight })
      const thead = document.querySelector('.stock-detail__trades-scroll .ant-table-thead')
      return {
        scrollTop: Math.round(viewport.scrollTop),
        scrollable: viewport.scrollHeight > viewport.clientHeight + 1,
        viewportTop: Math.round(viewport.getBoundingClientRect().top),
        theadTop: Math.round(thead?.getBoundingClientRect().top ?? -1),
      }
    })
    expect(scrolled?.scrollable).toBe(true)
    expect(scrolled!.scrollTop).toBeGreaterThan(0)
    expect(scrolled!.theadTop).toBe(scrolled!.viewportTop)

    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'stock-detail-trades-short.png'),
    })
  } finally {
    await app.close()
  }
})
