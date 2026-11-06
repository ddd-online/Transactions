/**
 * 「以网页打开」的单页模板。
 *
 * 这里盯四件事：
 * 1. 页面结构与内容（高板在前、价格 / 断板 / 标签齐全）；
 * 2. 文本转义（股票名与板块名来自外部数据源，绝不能进 HTML）；
 * 3. 颜色：与 tokens.css 同值、卡片底色与文字都过 AA（网页不继承软件的样式，只能在这里守）；
 * 4. 自包含：没有外部资源、没有脚本，字体由主进程注入。
 */

import { describe, expect, it } from 'vitest'

import { IDENTITY_TONES, identityTone } from '../../shared/domain/identity-color'
import type {
  StockLimitBrokenEntry,
  StockLimitEntry,
  StockLimitLadder,
  StockLimitRung,
} from '../../shared/types/stock-limit'
import {
  LADDER_PAGE_THEMES,
  ladderCardPalette,
  ladderTagPalette,
  mixHex,
  renderLadderPage,
  weekdayZh,
  type LadderPageTheme,
} from '../../src/pages/stock-ladder-page'
import { block, token, tokensCss } from './css-tokens'

const LIGHT = block(tokensCss, ':root')
const DARK = block(tokensCss, "[data-theme='dark']")

function entry(
  stockCode: string,
  stockName: string,
  level: number,
  firstSeal: number,
  board: string,
  overrides: Partial<StockLimitEntry> = {},
): StockLimitEntry {
  return {
    stockCode,
    stockName,
    market: 1,
    priceMilli: 11000,
    pct: 10,
    amountCents: 100,
    floatMvCents: 200,
    turnover: 3.5,
    level,
    firstSeal,
    lastSeal: firstSeal,
    brokenCount: 0,
    sealFundCents: 300,
    industry: board,
    statDays: level,
    statCount: level,
    ...overrides,
  }
}

function broken(
  base: StockLimitEntry,
  todayPrice: number | null,
  todayPct: number | null,
): StockLimitBrokenEntry {
  return { ...base, todayPrice, todayPct }
}

function rung(
  level: number,
  entries: StockLimitEntry[],
  brokenEntries: StockLimitBrokenEntry[] = [],
  rate: number | null = null,
): StockLimitRung {
  return { level, entries, broken: brokenEntries, candidates: null, rate }
}

function fixture(overrides: Partial<StockLimitLadder> = {}): StockLimitLadder {
  return {
    date: '2026-11-06',
    previousDate: '2026-11-05',
    status: 'ok',
    temporary: false,
    fromCache: false,
    stale: false,
    fetchedAt: Math.trunc(new Date(2026, 10, 6, 16, 0, 0).getTime() / 1000),
    source: 'eastmoney',
    rungs: [
      rung(1, [
        entry('600002', '方正科技', 1, 94800, '元件', { brokenCount: 1 }),
        entry('600838', '上海九百', 1, 92500, '一般零售'),
      ]),
      rung(7, [entry('600001', '金安国纪', 7, 92500, '光伏设备')], [], 100),
      rung(
        3,
        [entry('600005', '联明股份', 3, 93000, '汽车零部件')],
        [broken(entry('600010', '大族数控', 2, 95000, '专用设备'), 1990, -1.97)],
        66.67,
      ),
    ],
    metrics: {
      limitCount: 4,
      previousCount: 3,
      maxLevel: 7,
      promotedCount: 2,
      rate: 66.67,
      brokenCount: 1,
    },
    ...overrides,
  }
}

// ---------------------------------------------------------------- 颜色计算

function linear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const value = hex.replace('#', '')
  const at = (offset: number): number => Number.parseInt(value.slice(offset, offset + 2), 16) / 255
  const [r, g, b] = [at(0), at(2), at(4)].map(linear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((left, right) => right - left)
  return (high + 0.05) / (low + 0.05)
}

const AA = 4.5

describe('ladder page palette', () => {
  const themes: Array<[string, LadderPageTheme, string]> = [
    ['light', LADDER_PAGE_THEMES.light, LIGHT],
    ['dark', LADDER_PAGE_THEMES.dark, DARK],
  ]

  it.each(themes)('matches the %s design tokens', (_name, theme, css) => {
    const same = (palette: string, name: string): void => {
      const expected = token(css, name).replace(/\s+/g, '')
      expect(sameValue(palette)).toBe(expected)
    }
    same(theme.paper, 'color-bg-base')
    same(theme.sheet, 'color-card-surface')
    same(theme.ink, 'color-text-major')
    same(theme.ink2, 'color-text-secondary')
    same(theme.ink3, 'color-text-tertiary')
    same(theme.rule, 'color-divider')
    same(theme.ruleStrong, 'color-border-l2')
    same(theme.accent, 'color-primary')
    same(theme.minor, 'color-minor-background')
    same(theme.up, 'color-expense')
    same(theme.down, 'color-income')
    same(theme.outlier, 'color-outlier')
    for (const tone of IDENTITY_TONES) same(theme.tones[tone], `ledger-${tone}`)
  })

  it.each(themes)('keeps every text on every card readable (%s)', (_name, theme) => {
    expect(contrast(theme.ink, theme.sheet)).toBeGreaterThanOrEqual(AA)
    expect(contrast(theme.ink2, theme.sheet)).toBeGreaterThanOrEqual(AA)
    expect(contrast(theme.ink3, theme.sheet)).toBeGreaterThanOrEqual(AA)

    const tag = ladderTagPalette(theme)
    expect(contrast(tag.upInk, tag.upBg)).toBeGreaterThanOrEqual(AA)
    expect(contrast(tag.downInk, tag.downBg)).toBeGreaterThanOrEqual(AA)
    expect(contrast(tag.hotInk, tag.hotBg)).toBeGreaterThanOrEqual(AA)

    for (const tone of IDENTITY_TONES) {
      const card = ladderCardPalette(theme, tone)
      // 卡片底色是板块色，所以正文、次要文字、板块名、断板底色都要单独过 AA
      expect(contrast(theme.ink, card.background)).toBeGreaterThanOrEqual(AA)
      expect(contrast(theme.ink2, card.background)).toBeGreaterThanOrEqual(AA)
      expect(contrast(theme.ink2, card.backgroundBroken)).toBeGreaterThanOrEqual(AA)
      expect(contrast(card.ink, card.background)).toBeGreaterThanOrEqual(AA)
      expect(contrast(card.ink, card.backgroundBroken)).toBeGreaterThanOrEqual(AA)
    }
    // 「断」标签压在次要底色上
    expect(contrast(theme.ink2, theme.minor)).toBeGreaterThanOrEqual(AA)
  })
})

/** `mixHex` 输出与令牌里的写法可能一个是 `rgba(...)`；先把空白去掉再比。 */
function sameValue(value: string): string {
  return value.replace(/\s+/g, '')
}

describe('weekdayZh', () => {
  it('names the day of week without a timezone detour', () => {
    expect(weekdayZh('2026-11-06')).toBe('周五')
    expect(weekdayZh('2026-11-07')).toBe('周六')
    expect(weekdayZh('2026-11-08')).toBe('周日')
    expect(weekdayZh('not-a-date')).toBe('')
  })
})

describe('renderLadderPage', () => {
  it('orders the ladder from the highest board down and keeps every card', () => {
    const html = renderLadderPage(fixture())

    const high = html.indexOf('aria-label="7 板"')
    const middle = html.indexOf('aria-label="3 板"')
    const low = html.indexOf('aria-label="1 板"')
    expect(high).toBeGreaterThan(-1)
    expect(high).toBeLessThan(middle)
    expect(middle).toBeLessThan(low)
    expect(html).toContain('--levels:3')

    // 七板 1 行、三板 1 行 + 1 行断板、一板 2 行
    expect(html.match(/class="card /g)).toHaveLength(5)
    expect(html).toContain('联明股份')
    expect(html).toContain('大族数控')
    expect(html).toContain('11.00')
    expect(html).toContain('1.99')
    expect(html).toContain('09:25')
    expect(html).toContain('昨09:50')
  })

  it('renders the masthead summary, status and footer honesty', () => {
    const html = renderLadderPage(fixture())
    expect(html).toContain('<h1 class="title">连板天梯</h1>')
    expect(html).toContain('2026-11-06')
    expect(html).toContain('周五')
    expect(html).toContain('收盘后定稿')
    expect(html).toContain('涨停')
    expect(html).toContain('空间板')
    expect(html).toContain('晋级率')
    expect(html).toContain('断板')
    expect(html).toContain('价格为当天收盘价')
    expect(html).toContain('打印 / 存为 PDF')
    expect(html).toContain('onclick="window.print()"')
  })

  it('says so when the day was snapshotted intraday', () => {
    const html = renderLadderPage(fixture({ temporary: true }))
    expect(html).toContain('盘中快照')
    expect(html).toContain('价格为抓取时的价格')
    expect(html).not.toContain('收盘后定稿')
  })

  it('notes a missing previous trading day', () => {
    const html = renderLadderPage(
      fixture({ previousDate: null, metrics: { ...fixture().metrics, previousCount: null } }),
    )
    expect(html).toContain('缺少前一交易日数据')
  })

  it('tints cards by board, with the board name in the same tone', () => {
    const html = renderLadderPage(fixture())
    const tone = identityTone('光伏设备')
    expect(html).toContain(
      `<li class="card board-${tone}"><div class="card-top"><span class="name">金安国纪</span>`,
    )
    const palette = ladderCardPalette(LADDER_PAGE_THEMES.light, tone)
    expect(html).toContain(`.board-${tone}{--tone:${palette.tone};--card-bg:${palette.background}`)
    // 断板用同一板块的浅一档底色
    const brokenTone = identityTone('专用设备')
    const brokenPalette = ladderCardPalette(LADDER_PAGE_THEMES.light, brokenTone)
    expect(html).toContain(`--card-bg-broken:${brokenPalette.backgroundBroken}`)
    expect(brokenPalette.backgroundBroken).not.toBe(brokenPalette.background)
  })

  it('escapes external text from the pool', () => {
    const html = renderLadderPage(
      fixture({
        rungs: [
          rung(1, [
            entry('600999', '<script>alert(1)</script>', 1, 92500, '<b>板块</b>'),
          ]),
        ],
      }),
    )
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).not.toContain('<b>板块</b>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('&lt;b&gt;板块&lt;/b&gt;')
  })

  it('is self-contained and quiet: no external loads, no scripts', () => {
    const html = renderLadderPage(fixture())
    expect(html).not.toMatch(/\b(?:https?:\/\/|src=|href=)/)
    expect(html).not.toMatch(/<script[\s>]/i)
    expect(html).not.toContain('color-mix(')
    expect(html).toContain('prefers-color-scheme:dark')
    expect(html).toContain('@media print')
    expect(html).toContain("font-family:'Inter'")
    expect(html).toContain("font-family:'JetBrains Mono'")
    expect(html).toContain('@page{size:A4 landscape')
  })

  it('leaves the price out when the quote never arrived', () => {
    const html = renderLadderPage(
      fixture({
        rungs: [
          rung(1, [], [broken(entry('600010', '大族数控', 1, 95000, '专用设备'), null, null)]),
        ],
      }),
    )
    expect(html).toContain('大族数控')
    expect(html).not.toContain('class="price"')
    expect(html).not.toContain('tag tag-pct')
    expect(html).toContain('<span class="tag tag-off">断</span>')
  })

  it('mixes hex channels deterministically', () => {
    expect(mixHex('#ffffff', '#000000', 0.1)).toBe('#e6e6e6')
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080')
  })
})
