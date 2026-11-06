import { IDENTITY_TONES, identityTone } from '../../shared/domain/identity-color'
import { parseYmd } from '../../shared/domain/calendar'
import {
  boardCounts,
  boardOf,
  isOneWordBoard,
  ladderRows,
  ladderSealTime,
} from '../../shared/domain/limit-ladder'
import { milliToYuan } from '../../shared/domain/money'
import { formatTimestamp } from '../../shared/domain/time'
import type {
  StockLimitBrokenEntry,
  StockLimitEntry,
  StockLimitLadder,
  StockLimitRung,
} from '../../shared/types/stock-limit'

/**
 * 「以网页打开」的天梯单页：把当前这一份天梯渲染成一张自包含的 HTML。
 *
 * 约束：
 * * 与软件同一套世界（纸面、墨色、主色、语义红绿、等宽数字），但按「读」的尺度排版，
 *   不是在软件里那一屏的放大版 —— 一个板数一段、从上到下由高到低，
 *   板块用身份色铺成卡片底色。
 * * 单文件：样式内联、字体由主进程以 base64 注入（见 `LADDER_PAGE_FONT_MARKER`），
 *   不联网、不引外部资源；唯一的脚本是「打印 / 存为 PDF」那一下 `window.print()`。
 * * 颜色按浅色 / 深色两套预先算成字面量（不依赖 `color-mix`），并随
 *   `prefers-color-scheme` 切换；打印一律落回浅色纸面。
 * * 卡片底色只做「这是哪个板块」的辅助，板块名始终以文字出现，颜色从不单独承担信息。
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
  minor: string
  /** 卡片上标签的面：一层半透明白，压在任何一块底色上都读得出来 */
  chip: string
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
    chip: 'rgba(255, 255, 255, 0.55)',
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
    chip: 'rgba(255, 255, 255, 0.1)',
    riseInk: '#f78687',
    up: '#f87171',
    down: '#4ade80',
    outlier: '#fbbf24',
  },
}

/**
 * 纸上的八个板块色相（OKLCH 色相角，彼此差 45°）。
 *
 * 软件里的账本身份色不能直接铺成卡片：那八档里有四档是暖褐（琥珀 / 暖褐 / 土黄 / 驼色），
 * 做成卡片底色就是四张分不出来的米色。纸上要的是「一眼认得出是哪一块」，
 * 所以另起一套等明度、等彩度、只走色相的八色 —— 八张卡一样重，谁也不比谁淡。
 */
export const LADDER_BOARD_HUES = [20, 65, 110, 155, 200, 245, 290, 335] as const

export interface LadderBoardPalette {
  /** 板块汇总里的圆点 */
  tone: string
  /** 卡片底色 */
  background: string
  /** 断板卡片底色：同一色相浅一档 */
  backgroundBroken: string
  /** 描边（断板用同一色画成虚线） */
  border: string
  /** 板块名 */
  boardInk: string
  /** 卡片里的次要文字（代码 / 封板时间）—— 跟着色相走，不在彩底上压中性灰 */
  subInk: string
}

/** 由 `artifacts/board-palette.mjs` 算好后写死：对比度与色差在单测里逐条复核。 */
export const LADDER_BOARD_PALETTES: { light: LadderBoardPalette[]; dark: LadderBoardPalette[] } = {
  light: [
    { tone: '#ca545a', background: '#ffd9d7', backgroundBroken: '#ffe6e5', border: '#e47b7c', boardInk: '#932a33', subInk: '#694948' },
    { tone: '#bb6900', background: '#ffe0bf', backgroundBroken: '#ffebd5', border: '#d58c3b', boardInk: '#873e00', subInk: '#644e38' },
    { tone: '#878600', background: '#eaecbe', backgroundBroken: '#f1f3d5', border: '#a4a537', boardInk: '#5c5a00', subInk: '#545538' },
    { tone: '#009956', background: '#c9f4d7', backgroundBroken: '#dcf9e5', border: '#51b67a', boardInk: '#006a2f', subInk: '#3e5a48' },
    { tone: '#0099a3', background: '#b9f5f8', backgroundBroken: '#d2f9fb', border: '#00b6be', boardInk: '#006a74', subInk: '#335a5c' },
    { tone: '#0486d3', background: '#c7edff', backgroundBroken: '#dbf4ff', border: '#4fa6e9', boardInk: '#00599c', subInk: '#3d556a' },
    { tone: '#816dd2', background: '#e7e2ff', backgroundBroken: '#efecff', border: '#9e8fe9', boardInk: '#57429c', subInk: '#524e6a' },
    { tone: '#b559a3', background: '#ffd9f8', backgroundBroken: '#ffe7fb', border: '#d07ebe', boardInk: '#823073', subInk: '#62495c' },
  ],
  dark: [
    { tone: '#f49191', background: '#462222', backgroundBroken: '#351c1c', border: '#9e4c4e', boardInk: '#ffb4b3', subInk: '#d0aead' },
    { tone: '#e5a059', background: '#41270c', backgroundBroken: '#31200e', border: '#935a11', boardInk: '#fcc087', subInk: '#cab39d' },
    { tone: '#b6b857', background: '#30300b', backgroundBroken: '#25260d', border: '#6d6e0a', boardInk: '#d1d486', subInk: '#b8ba9d' },
    { tone: '#6dc88f', background: '#133621', backgroundBroken: '#132a1b', border: '#267b4c', boardInk: '#98e2b1', subInk: '#a4bfac' },
    { tone: '#30c8cf', background: '#003639', backgroundBroken: '#052a2c', border: '#007b82', boardInk: '#76e2e7', subInk: '#9ac0c1' },
    { tone: '#6bb9f8', background: '#133047', backgroundBroken: '#122636', border: '#266ea4', boardInk: '#95d5ff', subInk: '#a3bbd0' },
    { tone: '#b0a4f8', background: '#2e2947', backgroundBroken: '#242136', border: '#695ca3', boardInk: '#ccc3ff', subInk: '#b6b4d0' },
    { tone: '#e093cf', background: '#3f2339', backgroundBroken: '#301c2c', border: '#8f4e82', boardInk: '#f7b5e8', subInk: '#c8aec2' },
  ],
}


/**
 * 板块 → 色相槽位。
 *
 * 先按板块名哈希取一个槽（同一个板块换一天大概率还是同一个颜色），
 * 同一天撞到同一个槽就顺延到下一个空槽 —— 一块纸只讲一天，一天之内彼此分得开
 * 比跨天稳定更重要。板块超过八个时才开始复用色相。
 *
 * 槽位的顺序：先按涨停家数（`boardCounts` 的排法：家数多的在前、同数按名字），
 * 再补只出现在断板里的板块（按名字），所以汇总条上那一串圆点就是这张纸的图例。
 */
export function boardSlots(ladder: StockLimitLadder): Map<string, number> {
  const live = boardCounts(ladder.rungs.flatMap((rung) => rung.entries)).map(({ board }) => board)
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function text(value: string): string {
  return escapeHtml(value.trim())
}

function percentText(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
}

function rateText(value: number): string {
  return `${Math.round(value)}%`
}

function themeVars(theme: LadderPageTheme): string {
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
    `--chip:${theme.chip}`,
    `--rise-ink:${theme.riseInk}`,
  ].join(';')
}

/**
 * 标签的字色：一字与涨跌幅走语义红绿，炸板走 outlier 琥珀。
 *
 * 标签**不再自带一层语义底色** —— 卡片本身就是一块彩底，粉卡上再压一层粉色标签，
 * 那枚标签会整块消失。面统一用同一片浅色（`--chip`，白 55% / 深色下白 10%），
 * 语义只由字色承担，换到任何一块底色上都读得出来。字压到 62% 墨 + 38% 语义色，
 * 换来的余量够它在最深的几块卡面上也过 4.5:1。
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

function tagVars(theme: LadderPageTheme): string {
  const tag = ladderTagPalette(theme)
  return [
    `--chip:${theme.chip}`,
    `--tag-up-ink:${tag.upInk}`,
    `--tag-down-ink:${tag.downInk}`,
    `--tag-hot-ink:${tag.hotInk}`,
  ].join(';')
}

function boardRules(palettes: LadderBoardPalette[]): string {
  return palettes
    .map(
      (palette, slot) =>
        `.board-s${slot}{--tone:${palette.tone};--card-bg:${palette.background};--card-bg-broken:${palette.backgroundBroken};--card-border:${palette.border};--board-ink:${palette.boardInk};--card-sub:${palette.subInk}}`,
    )
    .join('\n')
}

function pageCss(): string {
  const light = LADDER_PAGE_THEMES.light
  const dark = LADDER_PAGE_THEMES.dark
  return `
/* impeccable-disable overused-font -- Inter / JetBrains Mono 是 DESIGN.md 钉下来的既定身份：界面用 Inter、数字用 JetBrains Mono；导出页跟着同一套字。 */
/* impeccable-disable design-system-color -- 这张网页要脱离应用单文件存在：主题色是 tokens.css 的令牌抄成的字面量，板块八色是纸上自己的一套（等明度等彩度的八个色相，由 scripts/ladder-board-palette.mjs 算出），字色 × 底色的对比度在 tests/unit/ladder-page.spec.ts 里逐条算过。 */
/* impeccable-disable design-system-font-size -- 11px 是 DESIGN.md 的 micro-label 档、24px 是窄屏标题的 display-sm；单文件页面不引变量，只能写字面量。 */
:root{color-scheme:light dark;${themeVars(light)};${tagVars(light)}}
${boardRules(LADDER_BOARD_PALETTES.light)}
@media (prefers-color-scheme:dark){
  :root{${themeVars(dark)};${tagVars(dark)}}
  ${boardRules(LADDER_BOARD_PALETTES.dark)}
}
*{box-sizing:border-box}
html{background:var(--paper)}
body{margin:0;background:var(--paper);color:var(--ink);font-family:'Inter','Segoe UI',system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
::selection{background:var(--select);color:var(--ink)}
.sheet{max-width:1440px;margin:0 auto;padding:40px 40px 30px}
.masthead{padding-bottom:18px;border-bottom:1px solid var(--rule-strong)}
.masthead-main{display:flex;align-items:flex-start;justify-content:space-between;gap:24px}
.title{margin:0;font-size:28px;font-weight:600;line-height:1.15;letter-spacing:-0.02em;text-wrap:balance}
.masthead-side{display:flex;flex-direction:column;align-items:flex-end;gap:8px}
.date-line{margin:0;font-family:'JetBrains Mono','Cascadia Mono',Consolas,monospace;font-size:14px;font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap}
.date-line .weekday{margin-left:6px;font-family:inherit;font-size:12px;font-weight:400;color:var(--ink-3)}
.date-line .status{margin-left:8px;font-family:inherit;font-size:11px;font-weight:400;color:var(--ink-3)}
.print{padding:4px 11px;border:1px solid var(--rule-strong);border-radius:8px;background:transparent;color:var(--ink-2);font:inherit;font-size:12px;line-height:20px;cursor:pointer;transition:color 120ms ease,border-color 120ms ease}
.print:hover{color:var(--ink);border-color:var(--ink-3)}
.print:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.print:active{translate:0 1px}
.summary{display:flex;flex-wrap:wrap;align-items:baseline;margin:16px 0 0;padding:0;list-style:none;row-gap:8px}
.stat{display:flex;align-items:baseline;gap:6px;padding:0 16px;border-left:1px solid var(--rule)}
.stat:first-child{padding-left:0;border-left:0}
.stat-label{font-size:12px;color:var(--ink-3)}
.stat-value{font-family:'JetBrains Mono','Cascadia Mono',Consolas,monospace;font-size:16px;font-weight:500;font-variant-numeric:tabular-nums;color:var(--ink)}
.stat-note{font-family:'JetBrains Mono','Cascadia Mono',Consolas,monospace;font-size:11px;color:var(--ink-3);font-variant-numeric:tabular-nums}
.boards{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;margin:12px 0 0;font-size:12px;color:var(--ink-2)}
.boards-label{color:var(--ink-3)}
.board-item{display:inline-flex;align-items:center;gap:6px}
.dot{width:7px;height:7px;border-radius:50%;background:var(--tone)}
.board-item .count{font-family:'JetBrains Mono','Cascadia Mono',Consolas,monospace;font-size:11px;color:var(--ink-3);font-variant-numeric:tabular-nums}
.note{margin:10px 0 0;font-size:12px;color:var(--ink-3)}
.ladder{display:flex;flex-direction:column;margin-top:14px}
.level{display:grid;grid-template-columns:112px minmax(0,1fr);column-gap:26px;padding:22px 0 24px}
.level + .level{border-top:1px solid var(--rule)}
.level-head{display:flex;flex-direction:column;align-items:flex-start;gap:7px;padding-top:2px}
.level-title{display:flex;align-items:baseline;gap:4px;margin:0;font-weight:400}
.level-num{font-family:'JetBrains Mono','Cascadia Mono',Consolas,monospace;font-size:min(calc(18px + var(--level) * 5px),58px);font-weight:500;line-height:1;letter-spacing:-0.03em;font-variant-numeric:tabular-nums;color:var(--ink)}
.level-unit{font-size:12px;color:var(--ink-3)}
.level-meta{display:flex;flex-direction:column;gap:2px;margin:0;font-family:'JetBrains Mono','Cascadia Mono',Consolas,monospace;font-size:11px;line-height:1.45;font-variant-numeric:tabular-nums;color:var(--ink-3)}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(208px,1fr));align-content:start;gap:8px;margin:0;padding:0;list-style:none}
.card{padding:10px 11px;border:1px solid var(--card-border);border-radius:12px;background:var(--card-bg)}
.card.is-broken{border-style:dashed;background:var(--card-bg-broken)}
.board-none{--card-bg:var(--sheet);--card-bg-broken:var(--minor);--card-border:var(--rule-strong);--board-ink:var(--ink-3);--card-sub:var(--ink-2)}
.card-top{display:flex;align-items:baseline;gap:8px}
.name{min-width:0;overflow:hidden;font-size:14px;font-weight:600;line-height:20px;color:var(--rise-ink);text-overflow:ellipsis;white-space:nowrap}
.price{margin-left:auto;font-family:'JetBrains Mono','Cascadia Mono',Consolas,monospace;font-size:14px;font-weight:500;line-height:20px;font-variant-numeric:tabular-nums;color:var(--rise-ink);white-space:nowrap}
.is-broken .name,.is-broken .price{color:var(--card-sub)}
.card-quote{display:flex;gap:8px;margin-top:3px;font-family:'JetBrains Mono','Cascadia Mono',Consolas,monospace;font-size:11px;font-variant-numeric:tabular-nums;color:var(--card-sub)}
.card-quote .seal{letter-spacing:0.02em}
.card-tags{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:7px}
.board{min-width:0;overflow:hidden;font-size:11px;color:var(--board-ink);text-overflow:ellipsis;white-space:nowrap;letter-spacing:0.01em}
.tag{flex:none;padding:0 5px;border-radius:6px;background:var(--chip);font-size:11px;line-height:16px;white-space:nowrap}
.tag-word{color:var(--tag-up-ink);font-weight:500}
.tag-hot{color:var(--tag-hot-ink)}
.tag-off{color:var(--card-sub)}
.tag-pct{color:var(--tag-up-ink);font-family:'JetBrains Mono','Cascadia Mono',Consolas,monospace;font-variant-numeric:tabular-nums}
.tag-pct.is-down{color:var(--tag-down-ink)}
.tag-pct.is-flat{color:var(--ink-2)}
.colophon{display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px 18px;margin-top:36px;padding-top:12px;border-top:1px solid var(--rule);font-size:11px;line-height:1.6;color:var(--ink-3)}
.colophon p{margin:0;text-wrap:pretty}
.colophon .brand{font-family:'JetBrains Mono','Cascadia Mono',Consolas,monospace;font-size:11px;letter-spacing:0.08em;color:var(--ink-3)}
@media (max-width:1100px){
  .level{grid-template-columns:96px minmax(0,1fr);column-gap:20px}
  .level-num{font-size:min(calc(16px + var(--level) * 4px),48px)}
  .cards{grid-template-columns:repeat(auto-fill,minmax(188px,1fr))}
}
@media (max-width:760px){
  .sheet{padding:22px 18px 24px}
  .masthead-main{flex-direction:column;gap:10px}
  .masthead-side{flex-direction:row;align-items:center;gap:12px}
  .title{font-size:24px}
  .summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 16px}
  .stat{padding:0;border-left:0}
  .level{grid-template-columns:minmax(0,1fr);row-gap:10px;padding:18px 0 20px}
  .level-head{flex-direction:row;flex-wrap:wrap;align-items:baseline;gap:2px 10px;padding-top:0}
  .level-num{font-size:min(calc(16px + var(--level) * 3px),36px)}
  .level-meta{flex-direction:row;flex-wrap:wrap;gap:2px 6px}
  .level-meta span + span::before{content:'·';margin-right:6px}
  .colophon{margin-top:22px}
}
@media print{
  :root{${themeVars(light)};${tagVars(light)}}
  ${boardRules(LADDER_BOARD_PALETTES.light)}
  html,body{background:#fff}
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .sheet{max-width:none;padding:0}
  .print{display:none}
  .ladder{margin-top:12px}
  .level{display:block;padding:10px 0}
  .level-head{display:flex;flex-direction:row;flex-wrap:wrap;align-items:baseline;gap:2px 8px;padding-top:0;break-after:avoid}
  .level-num{font-size:calc(14px + var(--level) * 2.5px)}
  .level-meta{flex-direction:row;flex-wrap:wrap;gap:2px 6px;font-size:11px}
  .level-meta span + span::before{content:'·';margin-right:6px}
  .cards{display:block;margin-top:8px}
  .card{display:inline-block;width:184px;margin:0 6px 6px 0;vertical-align:top;break-inside:avoid}
  .colophon{margin-top:16px}
  @page{size:A4 landscape;margin:10mm}
}
@media (prefers-reduced-motion:reduce){
  *{transition:none!important}
}
`
}

function summaryItem(label: string, value: string, note = ''): string {
  return `<li class="stat"><span class="stat-label">${label}</span><span class="stat-value">${value}</span>${
    note ? `<span class="stat-note">${note}</span>` : ''
  }</li>`
}

function summaryHtml(ladder: StockLimitLadder): string {
  const metrics = ladder.metrics
  const rate = metrics.rate === null ? '—' : rateText(metrics.rate)
  const promoted =
    metrics.promotedCount === null
      ? '—'
      : `${metrics.promotedCount}/${metrics.previousCount ?? 0}`
  const previous = metrics.previousCount === null ? '昨 —' : `昨 ${metrics.previousCount}`
  const top = metrics.maxLevel === null ? '—' : `${metrics.maxLevel} 板`
  const topNote =
    metrics.maxLevel === null
      ? ''
      : text(
          ladder.rungs.find((rung) => rung.level === metrics.maxLevel)?.entries[0]?.stockName ?? '',
        )
  return `<ul class="summary">${[
    summaryItem('涨停', String(metrics.limitCount), previous),
    summaryItem('空间板', top, topNote),
    summaryItem('晋级率', rate, promoted),
    summaryItem('断板', metrics.brokenCount === null ? '—' : String(metrics.brokenCount)),
  ].join('')}</ul>`
}

function boardsHtml(ladder: StockLimitLadder, slots: Map<string, number>): string {
  const boards = boardCounts(ladder.rungs.flatMap((rung) => rung.entries))
  if (boards.length === 0) return ''
  const items = boards
    .map(
      ({ board, count }) =>
        `<span class="board-item"><i class="dot board-s${slots.get(board) ?? 0}"></i><span>${text(board)}</span><span class="count">${count}</span></span>`,
    )
    .join('')
  return `<p class="boards"><span class="boards-label">板块</span>${items}</p>`
}

function tagsOf(entry: StockLimitEntry | StockLimitBrokenEntry, broken: boolean): string {
  const tags: string[] = []
  if (!broken && isOneWordBoard(entry)) tags.push('<span class="tag tag-word">一字</span>')
  if (!broken && entry.brokenCount > 0) {
    tags.push(`<span class="tag tag-hot">炸 ${entry.brokenCount}</span>`)
  }
  if (broken) {
    tags.push('<span class="tag tag-off">断</span>')
    const todayPct = (entry as StockLimitBrokenEntry).todayPct
    if (typeof todayPct === 'number') {
      const tone = todayPct > 0 ? '' : todayPct < 0 ? ' is-down' : ' is-flat'
      tags.push(
        `<span class="tag tag-pct${tone}">${percentText(todayPct)}</span>`,
      )
    }
  }
  return tags.join('')
}

function priceOf(entry: StockLimitEntry | StockLimitBrokenEntry, broken: boolean): string {
  const milli = broken
    ? (entry as StockLimitBrokenEntry).todayPrice
    : (entry as StockLimitEntry).priceMilli
  return typeof milli === 'number' && milli > 0 ? milliToYuan(milli) : ''
}

function cardHtml(
  entry: StockLimitEntry | StockLimitBrokenEntry,
  broken: boolean,
  slots: Map<string, number>,
): string {
  const board = boardOf(entry)
  const slot = board ? slots.get(board) : undefined
  const toneClass = slot === undefined ? ' board-none' : ` board-s${slot}`
  const price = priceOf(entry, broken)
  const seal = ladderSealTime(entry.firstSeal)
  return `<li class="card${toneClass}${broken ? ' is-broken' : ''}">` +
    `<div class="card-top"><span class="name">${text(entry.stockName)}</span>${
      price ? `<span class="price">${price}</span>` : ''
    }</div>` +
    `<div class="card-quote"><span class="code">${text(entry.stockCode)}</span><span class="seal">${
      broken ? `昨${escapeHtml(seal)}` : escapeHtml(seal)
    }</span></div>` +
    `<div class="card-tags">${
      board ? `<span class="board">${text(board)}</span>` : ''
    }${tagsOf(entry, broken)}</div>` +
    '</li>'
}

/** 这一段的三个数：家数 / 晋级率 / 断板数；各自一格，窄轨里不会挂在半个分隔符上。 */
function levelMeta(rung: StockLimitRung): string[] {
  const parts: string[] = []
  if (rung.entries.length > 0) parts.push(`${rung.entries.length} 家`)
  if (rung.level > 1 && rung.rate !== null) parts.push(`晋级 ${rateText(rung.rate)}`)
  if (rung.broken.length > 0) parts.push(`断 ${rung.broken.length}`)
  return parts
}

/**
 * 段 = 板数（左轨，数字随板数变大）+ 卡片流（右侧）。
 * 家数 / 晋级率 / 断板数压在数字下面，和它说的是同一件事；三段都是小字，
 * 放到页面另一头就会和它对不上主人。
 */
function levelHtml(rung: StockLimitRung, slots: Map<string, number>): string {
  const rows = ladderRows(rung)
  const cards = rows
    .map((row) => cardHtml(row.entry, row.broken, slots))
    .join('')
  const meta = levelMeta(rung)
  const metaHtml =
    meta.length > 0
      ? `<p class="level-meta">${meta.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</p>`
      : ''
  return `<section class="level" style="--level:${rung.level}" aria-label="${rung.level} 板">` +
    `<header class="level-head"><h2 class="level-title"><span class="level-num">${rung.level}</span><span class="level-unit">板</span></h2>${metaHtml}</header>` +
    `<ul class="cards">${cards}</ul>` +
    '</section>'
}

function footerHtml(ladder: StockLimitLadder): string {
  const fetched = formatTimestamp(ladder.fetchedAt, 'HH:mm')
  const parts = ['数据来源：东方财富涨停股池', `${fetched} 抓取`]
  if (ladder.temporary) {
    parts.push('盘中快照，15:00 后定稿', '价格为抓取时的价格')
  } else if (ladder.stale) {
    parts.push('刷新失败，显示本地缓存', '价格为当天收盘价')
  } else if (ladder.fromCache) {
    parts.push('本地缓存', '价格为当天收盘价')
  } else {
    parts.push('收盘后定稿', '价格为当天收盘价')
  }
  return `<footer class="colophon"><p>${parts.map(escapeHtml).join(' · ')}</p><p class="brand">TRANSACTIONS</p></footer>`
}

function statusText(ladder: StockLimitLadder): string {
  if (ladder.temporary) return '盘中快照'
  if (ladder.stale) return '刷新失败 · 本地缓存'
  if (ladder.fromCache) return '本地缓存'
  return '收盘后定稿'
}

/**
 * 天梯 → 一张自包含的单页 HTML。
 *
 * 板数从上到下递减（空间板在最上、首板在最后一段）；每段左侧是这一段的板数，
 * 段内沿用天梯的板块分组顺序，断板跟在同板块的连板后面（虚线框 + 浅一档的底）。
 * 调用方只在 `status === 'ok'` 时允许导出。
 */
export function renderLadderPage(ladder: StockLimitLadder): string {
  const levels = [...ladder.rungs].sort((left, right) => right.level - left.level)
  const slots = boardSlots(ladder)
  const weekday = weekdayZh(ladder.date)
  const title = `连板天梯 · ${ladder.date}`
  const ladderHtml = levels
    .map((rung) => levelHtml(rung, slots))
    .join('')
  const missingPrevious =
    ladder.previousDate === null
      ? '<p class="note">缺少前一交易日数据，断板与晋级率未计入。</p>'
      : ''
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="generator" content="Transactions">
<title>${escapeHtml(title)}</title>
<style>${pageCss()}</style>
</head>
<body>
<main class="sheet">
<header class="masthead">
<div class="masthead-main">
<h1 class="title">连板天梯</h1>
<div class="masthead-side">
<p class="date-line"><time datetime="${escapeHtml(ladder.date)}">${escapeHtml(ladder.date)}</time><span class="weekday">${escapeHtml(weekday)}</span><span class="status">${escapeHtml(statusText(ladder))}</span></p>
<button class="print" type="button" onclick="window.print()">打印 / 存为 PDF</button>
</div>
</div>
${summaryHtml(ladder)}
${boardsHtml(ladder, slots)}
${missingPrevious}
</header>
<div class="ladder">
${ladderHtml}
</div>
${footerHtml(ladder)}
</main>
</body>
</html>
`
}
