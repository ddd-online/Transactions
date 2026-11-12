import { IDENTITY_TONES, identityTone } from '../../shared/domain/identity-color'
import { parseYmd } from '../../shared/domain/calendar'
import { boardCounts, boardOf } from '../../shared/domain/limit-ladder'
import type { StockLimitLadder } from '../../shared/types/stock-limit'

/**
 * 天梯单页的主题与色板：浅色 / 深色两套字面量、板块色，以及把它们
 * 序列化成 CSS 变量的小工具。页面模板只负责把这里算好的颜色贴进 HTML。
 */

export interface LadderPageTheme {
  paper: string
  sheet: string
  ink: string
  ink2: string
  ink3: string
  rule: string
  ruleStrong: string
  accent: string
  select: string
  /** 断板卡片的底色：中性灰，浅色比纸面深一档、深色比纸面浅一档 */
  minor: string
  /** 标签面的底色与透明度：一层半透明白，压在任何一块彩卡或灰卡上都读得出来 */
  chip: string
  chipAlpha: number
  /** 涨停卡片的名称与价格：84% 语义红 + 16% 墨，八张彩卡上都过 4.5:1 */
  riseInk: string
  up: string
  down: string
  outlier: string
}

/** 与 `src/styles/tokens.css` 同值；`tests/unit/ladder-page.spec.ts` 盯着它别漂。 */
export const LADDER_PAGE_THEMES: { light: LadderPageTheme; dark: LadderPageTheme } = {
  light: {
    paper: '#f9fafb',
    sheet: '#ffffff',
    ink: '#0f1115',
    ink2: '#61666b',
    ink3: '#6b7078',
    rule: '#eceef1',
    ruleStrong: '#e2e4e8',
    accent: '#3964fe',
    select: 'rgba(57, 100, 254, 0.18)',
    minor: '#f3f4f6',
    chip: '#ffffff',
    chipAlpha: 0.55,
    riseInk: '#bb2323',
    up: '#dc2626',
    down: '#16a34a',
    outlier: '#d97706',
  },
  dark: {
    paper: '#0f1115',
    sheet: '#1c1f26',
    ink: '#f2f4f8',
    ink2: '#b6bcc6',
    ink3: '#8a919c',
    rule: 'rgba(255, 255, 255, 0.08)',
    ruleStrong: 'rgba(255, 255, 255, 0.12)',
    accent: '#3964fe',
    select: 'rgba(57, 100, 254, 0.4)',
    minor: '#14161a',
    chip: '#ffffff',
    chipAlpha: 0.1,
    riseInk: '#f78687',
    up: '#f87171',
    down: '#4ade80',
    outlier: '#fbbf24',
  },
}

/**
 * 纸上留给「多家涨停」的六个鲜艳色相（OKLCH 色相角，彼此差 45°）。
 *
 * 软件里的账本身份色不能直接铺成卡片：那八档里有四档是暖褐（琥珀 / 暖褐 / 土黄 / 驼色），
 * 并排就是四张分不出来的米色。纸上要的是「一眼认得出是哪一块」，
 * 所以另起一套等明度、等彩度、只走色相的六色 —— 六块一样重，谁也不比谁淡。
 *
 * 蓝色那一段（245° / 290°）故意留白：主色蓝是「只有一家」的专用色，见下面的单行色板。
 */
export const LADDER_BOARD_HUES = [20, 65, 110, 155, 200, 335] as const

export interface LadderBoardPalette {
  /** 板块汇总里的圆点 */
  tone: string
  /** 涨停卡片的底色 */
  background: string
  /** 卡片描边（断板同一色画成虚线） */
  border: string
  /** 板块名 */
  boardInk: string
  /** 涨停卡片里的次要文字（代码 / 封板时间）—— 跟着色相走，不在彩底上压中性灰 */
  subInk: string
}

/**
 * 七个色：前六个给多家涨停的板块，最后一个（索引 6）是主色蓝，
 * 只给「板块内只有一家」的板块。蓝的色相取自 `--transactions-color-primary`
 * （OKLCH 266.6°），明度与彩度和其他六档一致 —— 它只是身份，不是强调。
 *
 * 底色是色相浅一档的淡彩（浅色 L 0.93 / 彩度 0.06，深色 L 0.30 / 0.055）：
 * 涨停卡铺分类色，断板卡铺中性灰 —— 底色回答「今天还在不在板上」。
 *
 * 由 `scripts/ladder-board-palette.mjs` 算好后写死：对比度与色差在单测里逐条复核。
 */
export const LADDER_BOARD_PALETTES: { light: LadderBoardPalette[]; dark: LadderBoardPalette[] } = {
  light: [
    { tone: '#ca545a', background: '#ffd9d7', border: '#dc5d63', boardInk: '#932a33', subInk: '#694948' },
    { tone: '#bb6900', background: '#ffe0bf', border: '#cc7300', boardInk: '#873e00', subInk: '#644e38' },
    { tone: '#878600', background: '#eaecbe', border: '#939300', boardInk: '#5c5a00', subInk: '#545538' },
    { tone: '#009956', background: '#c9f4d7', border: '#00a75f', boardInk: '#006a2f', subInk: '#3e5a48' },
    { tone: '#0099a3', background: '#b9f5f8', border: '#00a7b2', boardInk: '#006a74', subInk: '#335a5c' },
    { tone: '#b559a3', background: '#ffd9f8', border: '#c562b2', boardInk: '#823073', subInk: '#62495c' },
    { tone: '#577ad9', background: '#d6e8ff', border: '#5f86ed', boardInk: '#314ea2', subInk: '#47526c' },
  ],
  dark: [
    { tone: '#f49191', background: '#462222', border: '#cd5f62', boardInk: '#ffb4b3', subInk: '#d0aead' },
    { tone: '#e5a059', background: '#41270c', border: '#be7100', boardInk: '#fcc087', subInk: '#cab39d' },
    { tone: '#b6b857', background: '#30300b', border: '#8c8c00', boardInk: '#d1d486', subInk: '#b8ba9d' },
    { tone: '#6dc88f', background: '#133621', border: '#269e5f', boardInk: '#98e2b1', subInk: '#a4bfac' },
    { tone: '#30c8cf', background: '#003639', border: '#009ea7', boardInk: '#76e2e7', subInk: '#9ac0c1' },
    { tone: '#e093cf', background: '#3f2339', border: '#b862a7', boardInk: '#f7b5e8', subInk: '#c8aec2' },
    { tone: '#8eaffe', background: '#212d49', border: '#5f81da', boardInk: '#b0ccff', subInk: '#acb7d2' },
  ],
}

/** 只有一家涨停的板块用这一档：主色蓝，永远排在鲜艳色相之后。 */
export const SINGLE_BOARD_SLOT = LADDER_BOARD_HUES.length

/**
 * 板块 → 色槽。
 *
 * 只有**多家涨停**（当日涨停家数 ≥ 2）的板块才占一个鲜艳色相：这张纸的颜色是
 * 「这个板块今天成群了」的信号，孤家寡人全用主色蓝 —— 蓝只表示「只有这一家」，
 * 于是颜色本身就能回答「哪些板块真的成了气候」。
 *
 * 成群板块的槽位：先按板块名哈希取一个（同一板块换一天大概率还是同一色），
 * 同一天撞到同一个槽就顺延到下一个空槽 —— 一张纸只讲一天，一天之内彼此分得开
 * 比跨天稳定更重要。超过六个成群板块时才开始复用色相。
 *
 * 槽位的顺序：先按涨停家数（`boardCounts` 的排法：家数多的在前、同数按名字），
 * 再补只出现在断板里的板块（按名字），所以汇总条上那一串圆点就是这张纸的图例。
 */
export function boardSlots(ladder: StockLimitLadder): Map<string, number> {
  const boards = boardCounts(ladder.rungs.flatMap((rung) => rung.entries))
  const counts = new Map(boards.map(({ board, count }) => [board, count]))
  const live = boards.map(({ board }) => board)
  const known = new Set(live)
  const extras = new Set<string>()
  for (const rung of ladder.rungs) {
    for (const entry of rung.broken) {
      const board = boardOf(entry)
      if (board && !known.has(board)) extras.add(board)
    }
  }
  const ordered = [...live, ...[...extras].sort((left, right) => (left < right ? -1 : 1))]

  const slots = new Map<string, number>()
  const used = new Set<number>()
  const hueCount = LADDER_BOARD_HUES.length
  for (const board of ordered) {
    if ((counts.get(board) ?? 0) < 2) {
      slots.set(board, SINGLE_BOARD_SLOT)
      continue
    }
    let slot = IDENTITY_TONES.indexOf(identityTone(board)) % hueCount
    for (let step = 0; step < hueCount && used.has(slot) && used.size < hueCount; step += 1) {
      slot = (slot + 1) % hueCount
    }
    used.add(slot)
    slots.set(board, slot)
  }
  return slots
}

/** 两个 `#rrggbb` 按权重混合；`weight` 是后者的占比。 */
export function mixHex(base: string, over: string, weight: number): string {
  const from = hexChannels(base)
  const to = hexChannels(over)
  const w = Math.min(1, Math.max(0, weight))
  const channels = from.map((value, index) => Math.round(value * (1 - w) + to[index] * w))
  return `#${channels.map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

/** 标签面：底色与透明度合成到卡片底色上，对比度算的就是这一层。 */
export function chipOver(background: string, theme: LadderPageTheme): string {
  return mixHex(background, theme.chip, theme.chipAlpha)
}

export function rgba(hex: string, alpha: number): string {
  const [red, green, blue] = hexChannels(hex)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function hexChannels(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ]
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** `2026-11-06` → `周五`；日期不合法时返回空串。 */
export function weekdayZh(ymd: string): string {
  const parsed = parseYmd(ymd)
  if (!parsed) return ''
  return WEEKDAYS[new Date(parsed.year, parsed.month - 1, parsed.day).getDay()] ?? ''
}

export function themeVars(theme: LadderPageTheme): string {
  return [
    `--paper:${theme.paper}`,
    `--sheet:${theme.sheet}`,
    `--ink:${theme.ink}`,
    `--ink-2:${theme.ink2}`,
    `--ink-3:${theme.ink3}`,
    `--rule:${theme.rule}`,
    `--rule-strong:${theme.ruleStrong}`,
    `--accent:${theme.accent}`,
    `--select:${theme.select}`,
    `--minor:${theme.minor}`,
    `--chip:${rgba(theme.chip, theme.chipAlpha)}`,
    `--rise-ink:${theme.riseInk}`,
  ].join(';')
}

/**
 * 标签的字色：一字与涨跌幅走语义红绿，炸板走 outlier 琥珀。
 *
 * 标签**不自带语义底色** —— 粉卡上再压一层粉色标签，那枚标签会整块消失。
 * 面统一用一层半透明白（浅色 55% / 深色 10%），语义只由字色承担；
 * 字压到 62% 墨 + 38% 语义色，换来的余量够它在每一块彩卡与灰卡上都过 4.5:1。
 */
export function ladderTagPalette(theme: LadderPageTheme): {
  upInk: string
  downInk: string
  hotInk: string
} {
  return {
    upInk: mixHex(theme.ink, theme.up, 0.62),
    downInk: mixHex(theme.ink, theme.down, 0.62),
    hotInk: mixHex(theme.ink, theme.outlier, 0.62),
  }
}

export function tagVars(theme: LadderPageTheme): string {
  const tag = ladderTagPalette(theme)
  return [
    `--chip:${rgba(theme.chip, theme.chipAlpha)}`,
    `--tag-up-ink:${tag.upInk}`,
    `--tag-down-ink:${tag.downInk}`,
    `--tag-hot-ink:${tag.hotInk}`,
  ].join(';')
}

export function boardRules(palettes: LadderBoardPalette[]): string {
  return palettes
    .map(
      (palette, slot) =>
        `.board-s${slot}{--tone:${palette.tone};--card-bg:${palette.background};--card-border:${palette.border};--board-ink:${palette.boardInk};--card-sub:${palette.subInk}}`,
    )
    .join('\n')
}
