/**
 * 「以网页打开」的单页模板。
 *
 * 这里盯四件事：
 * 1. 页面结构与内容（高板在前、价格 / 断板 / 标签齐全）；
 * 2. 文本转义（股票名与板块名来自外部数据源，绝不能进 HTML）；
 * 3. 颜色：主题令牌与 tokens.css 同值、字色与描边过 AA、板块色真的分得开、
 *    只有多家涨停的板块才占一个鲜艳色相（网页不继承软件的样式，只能在这里守）；
 * 4. 自包含：没有外部资源、没有脚本，字体由主进程注入。
 */

import { describe, expect, it } from 'vitest'

import type {
  StockLimitBrokenEntry,
  StockLimitEntry,
  StockLimitLadder,
  StockLimitRung,
} from '../../shared/types/stock-limit'
import {
  LADDER_BOARD_HUES,
  LADDER_BOARD_PALETTES,
  LADDER_PAGE_THEMES,
  SINGLE_BOARD_SLOT,
  boardSlots,
  chipOver,
  ladderTagPalette,
  mixHex,
  renderLadderPage,
  weekdayZh,
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
    openPct: null,
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

/** CIE Lab 与 ΔE76：八张卡的底色必须真的分得开，不能只是数值上不同。 */
function lab(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  const at = (offset: number): number => Number.parseInt(value.slice(offset, offset + 2), 16) / 255
  const [r, g, b] = [at(0), at(2), at(4)].map(linear)
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883
  const f = (channel: number): number =>
    channel > 0.008856 ? Math.cbrt(channel) : 7.787 * channel + 16 / 116
  const [fx, fy, fz] = [f(x), f(y), f(z)]
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

function deltaE(a: string, b: string): number {
  const [l1, a1, b1] = lab(a)
  const [l2, a2, b2] = lab(b)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

describe('ladder page palette', () => {
  const themes: Array<['light' | 'dark', string]> = [
    ['light', LIGHT],
    ['dark', DARK],
  ]

  it.each(themes)('matches the %s design tokens', (name, css) => {
    const theme = LADDER_PAGE_THEMES[name]
    const same = (palette: string, label: string): void => {
      const expected = token(css, label).replace(/\s+/g, '')
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
  })

  it.each(themes)('keeps every text on every card readable (%s)', (name) => {
    const theme = LADDER_PAGE_THEMES[name]
    expect(contrast(theme.ink, theme.sheet)).toBeGreaterThanOrEqual(AA)
    expect(contrast(theme.ink2, theme.sheet)).toBeGreaterThanOrEqual(AA)
    expect(contrast(theme.ink3, theme.sheet)).toBeGreaterThanOrEqual(AA)
    // 断板卡的灰底上还有板块名、次要字与标签
    expect(contrast(theme.ink, theme.minor)).toBeGreaterThanOrEqual(AA)
    expect(contrast(theme.ink2, theme.minor)).toBeGreaterThanOrEqual(AA)

    // 标签面是一层半透明白（浅色 55% / 深色 10%），压在白卡与灰卡上：
    // 三枚语义字色都要在两种卡面上过 AA
    const tag = ladderTagPalette(theme)
    for (const face of [theme.sheet, theme.minor]) {
      const chip = chipOver(face, theme)
      expect(contrast(tag.upInk, chip)).toBeGreaterThanOrEqual(AA)
      expect(contrast(tag.downInk, chip)).toBeGreaterThanOrEqual(AA)
      expect(contrast(tag.hotInk, chip)).toBeGreaterThanOrEqual(AA)
    }
    expect(contrast(theme.riseInk, theme.sheet)).toBeGreaterThanOrEqual(AA)

    for (const card of LADDER_BOARD_PALETTES[name]) {
      // 涨停卡铺分类色：正文、涨停红、代码行、板块名、语义标签都要过 AA
      expect(contrast(theme.ink, card.background)).toBeGreaterThanOrEqual(AA)
      expect(contrast(theme.riseInk, card.background)).toBeGreaterThanOrEqual(AA)
      expect(contrast(card.subInk, card.background)).toBeGreaterThanOrEqual(AA)
      expect(contrast(card.boardInk, card.background)).toBeGreaterThanOrEqual(AA)
      for (const ink of [tag.upInk, tag.downInk, tag.hotInk]) {
        expect(contrast(ink, chipOver(card.background, theme))).toBeGreaterThanOrEqual(AA)
      }
      // 断板卡的灰底上：板块名（描边 + 板块名都保留分类色）与中性次要字
      expect(contrast(card.boardInk, theme.minor)).toBeGreaterThanOrEqual(AA)
      expect(contrast(theme.ink2, theme.minor)).toBeGreaterThanOrEqual(AA)
      // 汇总条上的圆点是「有意义的图形」：3:1
      expect(contrast(card.tone, theme.paper)).toBeGreaterThanOrEqual(3)
      // 描边在彩底与灰底上都要看得见（断板改成虚线）
      expect(contrast(card.border, card.background)).toBeGreaterThanOrEqual(2)
      expect(contrast(card.border, theme.minor)).toBeGreaterThanOrEqual(2)
    }
  })

  it.each(themes)('saves the vivid hues for clusters and blue for singletons (%s)', (name) => {
    const cards = LADDER_BOARD_PALETTES[name]
    expect(cards).toHaveLength(LADDER_BOARD_HUES.length + 1)
    const clusters = cards.slice(0, SINGLE_BOARD_SLOT)
    const single = cards[SINGLE_BOARD_SLOT]
    for (let left = 0; left < clusters.length; left += 1) {
      for (let right = left + 1; right < clusters.length; right += 1) {
        // 相邻两档只差 45°；底色、描边与板块名都得真的分得开
        expect(deltaE(clusters[left].background, clusters[right].background)).toBeGreaterThanOrEqual(10)
        expect(deltaE(clusters[left].border, clusters[right].border)).toBeGreaterThanOrEqual(10)
        expect(deltaE(clusters[left].boardInk, clusters[right].boardInk)).toBeGreaterThanOrEqual(20)
      }
    }
    // 主色蓝与六个鲜艳色也分得开：「蓝 = 只有一家」才读得出来
    for (const card of clusters) {
      expect(deltaE(card.background, single.background)).toBeGreaterThanOrEqual(10)
      expect(deltaE(card.border, single.border)).toBeGreaterThanOrEqual(10)
      expect(deltaE(card.boardInk, single.boardInk)).toBeGreaterThanOrEqual(20)
    }
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

    // 一段一个板数、从上往下堆：不再是按板数分栏的横向网格
    expect(html).toContain('.ladder{display:flex;flex-direction:column;')
    expect(html).toContain('.level{display:grid;grid-template-columns:112px minmax(0,1fr)')
    expect(html).not.toContain('--levels')

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

  it('puts the board color on the border and the label, not in the fill', () => {
    // 光伏设备同层两家 → 占一个鲜艳色相；化学制药只有一家 → 主色蓝
    const ladder = fixture({
      rungs: [
        rung(1, [
          entry('600001', '金安国纪', 1, 92500, '光伏设备'),
          entry('600002', '阳光电源', 1, 92600, '光伏设备'),
          entry('600003', '新和成', 1, 92700, '化学制药'),
        ]),
      ],
    })
    const slots = boardSlots(ladder)
    const slot = slots.get('光伏设备')
    expect(slot).toBeTypeOf('number')
    expect(slot).toBeLessThan(SINGLE_BOARD_SLOT)
    expect(slots.get('化学制药')).toBe(SINGLE_BOARD_SLOT)

    const html = renderLadderPage(ladder)
    expect(html).toContain(
      `<li class="card board-s${slot}"><div class="card-top"><span class="name">金安国纪</span>`,
    )
    expect(html).toContain(
      `<li class="card board-s${SINGLE_BOARD_SLOT}"><div class="card-top"><span class="name">新和成</span>`,
    )
    // 汇总条上的圆点用同一个槽位 —— 那一排就是这张纸的图例
    expect(html).toContain(`<i class="dot board-s${slot}"></i><span>光伏设备</span>`)
    expect(html).toContain(
      `<i class="dot board-s${SINGLE_BOARD_SLOT}"></i><span>化学制药</span>`,
    )
    // 七个槽位都写进了样式：前六个鲜艳色相 + 主色蓝
    for (let index = 0; index < SINGLE_BOARD_SLOT + 1; index += 1) {
      expect(html).toContain(`.board-s${index}{--tone:`)
    }
    // 涨停卡铺分类色淡底，断板卡换灰色虚线框
    expect(html).toContain('border:1px solid var(--card-border);border-radius:12px;background:var(--card-bg)')
    expect(html).toContain('.card.is-broken{--card-sub:var(--ink-2);border-style:dashed;background:var(--minor)}')
    // 涨停的名字与价格用语义红（两处正好），断板退成中性的次要字
    expect(html.match(/color:var\(--rise-ink\)/g)).toHaveLength(2)
    expect(html).toContain('.is-broken .name,.is-broken .price{color:var(--card-sub)}')
  })

  it('colors only the boards with more than one limit-up', () => {
    // 断板-only 的板块（专用设备）与只有一家的板块都是主色蓝
    const slots = boardSlots(fixture())
    expect(slots.size).toBe(5)
    for (const slot of slots.values()) expect(slot).toBe(SINGLE_BOARD_SLOT)

    // 六个成群板块以内，各占一个互不相同的鲜艳槽位
    const clustered = (count: number): ReturnType<typeof boardSlots> =>
      boardSlots(
        fixture({
          rungs: [
            rung(
              1,
              Array.from({ length: count }, (_, index) => [
                entry(`60010${index}`, `股票${index}A`, 1, 92500, `板块${index}`),
                entry(`60020${index}`, `股票${index}B`, 1, 92600, `板块${index}`),
              ]).flat(),
            ),
          ],
        }),
      )
    const six = clustered(LADDER_BOARD_HUES.length)
    expect(six.size).toBe(LADDER_BOARD_HUES.length)
    expect(new Set(six.values()).size).toBe(LADDER_BOARD_HUES.length)
    for (const slot of six.values()) expect(slot).toBeLessThan(SINGLE_BOARD_SLOT)

    // 超过六个成群板块才开始复用色相，且不会卡死
    const crowded = clustered(10)
    expect(crowded.size).toBe(10)
    expect(new Set(crowded.values()).size).toBe(LADDER_BOARD_HUES.length)
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

  it('puts the open change before the close change', () => {
    const html = renderLadderPage(
      fixture({
        rungs: [
          rung(
            1,
            [entry('600001', '金安国纪', 1, 92500, '光伏设备', { openPct: 2.5 })],
            [
              broken(
                entry('600010', '大族数控', 1, 95000, '专用设备', { openPct: -1.2 }),
                1990,
                -3.33,
              ),
            ],
          ),
        ],
      }),
    )
    // 涨停行：只有开盘涨跌幅（收盘涨跌幅由「封在板上」本身说明）
    expect(html).toContain('<span class="tag tag-pct">开 +2.50%</span>')
    // 断板行：开在收前面，绿的是跌；两枚同一对，换行时一起走
    expect(html).toContain('<span class="tag tag-pct is-down">开 -1.20%</span>')
    expect(html).toContain('<span class="tag tag-pct is-down">收 -3.33%</span>')
    const openAt = html.indexOf('开 -1.20%')
    const closeAt = html.indexOf('收 -3.33%')
    expect(openAt).toBeGreaterThan(-1)
    expect(openAt).toBeLessThan(closeAt)
    // 一对涨跌幅包在同一个 tag-pair 里：换行拆不开
    expect(html).toContain(
      '<span class="tag-pair"><span class="tag tag-pct is-down">开 -1.20%</span>' +
        '<span class="tag tag-pct is-down">收 -3.33%</span></span>',
    )
  })

  it('mixes hex channels deterministically', () => {
    expect(mixHex('#ffffff', '#000000', 0.1)).toBe('#e6e6e6')
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080')
  })
})





