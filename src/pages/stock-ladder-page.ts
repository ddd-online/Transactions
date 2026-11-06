import { IDENTITY_TONES, identityTone, type IdentityTone } from '../../shared/domain/identity-color'
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
 *   不是在软件里那一屏的放大版 —— 列高从高到低、板块用身份色铺成卡片底色。
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
  up: string
  down: string
  outlier: string
  tones: Record<IdentityTone, string>
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
    up: '#dc2626',
    down: '#16a34a',
    outlier: '#d97706',
    tones: {
      forest: '#4a8e70',
      amber: '#c6963a',
      'slate-blue': '#5c8db5',
      vermillion: '#d9705a',
      'warm-brown': '#8c7b6e',
      ochre: '#9e8c7e',
      moss: '#6b9e7e',
      camel: '#b89a80',
    },
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
    up: '#f87171',
    down: '#4ade80',
    outlier: '#fbbf24',
    tones: {
      forest: '#5d9e80',
      amber: '#d4ae5e',
      'slate-blue': '#74a0c8',
      vermillion: '#e08a74',
      'warm-brown': '#a2907f',
      ochre: '#b0a092',
      moss: '#82b096',
      camel: '#c8ae94',
    },
  },
}

/** 浅色 / 深色都用的卡片色阶：底色 / 断板底色 / 描边 / 板块名文字。 */
export function ladderCardPalette(theme: LadderPageTheme, tone: IdentityTone): {
  tone: string
  background: string
  backgroundBroken: string
  border: string
  ink: string
} {
  const toneHex = theme.tones[tone]
  return {
    tone: toneHex,
    background: mixHex(theme.sheet, toneHex, 0.1),
    backgroundBroken: mixHex(theme.sheet, toneHex, 0.05),
    border: mixHex(theme.sheet, toneHex, 0.3),
    // 64% 色相 + 36% 墨色：最浅的两档（琥珀 / 驼色）压在 10% 底色上也过 4.5:1
    ink: mixHex(theme.ink, toneHex, 0.64),
  }
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
  ].join(';')
}

/** 标签底色 / 字色：一字与涨跌幅走语义红绿，炸板走 outlier 琥珀。 */
export function ladderTagPalette(theme: LadderPageTheme): {
  upBg: string
  upInk: string
  downBg: string
  downInk: string
  hotBg: string
  hotInk: string
} {
  return {
    upBg: mixHex(theme.sheet, theme.up, 0.1),
    upInk: mixHex(theme.ink, theme.up, 0.72),
    downBg: mixHex(theme.sheet, theme.down, 0.1),
    downInk: mixHex(theme.ink, theme.down, 0.72),
    hotBg: mixHex(theme.sheet, theme.outlier, 0.12),
    hotInk: mixHex(theme.ink, theme.outlier, 0.72),
  }
}

function tagVars(theme: LadderPageTheme): string {
  const tag = ladderTagPalette(theme)
  return [
    `--tag-up-bg:${tag.upBg}`,
    `--tag-up-ink:${tag.upInk}`,
    `--tag-down-bg:${tag.downBg}`,
    `--tag-down-ink:${tag.downInk}`,
    `--tag-hot-bg:${tag.hotBg}`,
    `--tag-hot-ink:${tag.hotInk}`,
  ].join(';')
}

function boardRules(theme: LadderPageTheme): string {
  return IDENTITY_TONES.map((tone) => {
    const palette = ladderCardPalette(theme, tone)
    return `.board-${tone}{--tone:${palette.tone};--card-bg:${palette.background};--card-bg-broken:${palette.backgroundBroken};--card-border:${palette.border};--board-ink:${palette.ink}}`
  }).join('\n')
}

function pageCss(): string {
  const light = LADDER_PAGE_THEMES.light
  const dark = LADDER_PAGE_THEMES.dark
  return `
/* impeccable-disable overused-font -- Inter / JetBrains Mono 是 DESIGN.md 钉下来的既定身份：界面用 Inter、数字用 JetBrains Mono；导出页跟着同一套字。 */
/* impeccable-disable design-system-color -- 这张网页要脱离应用单文件存在：颜色是 tokens.css 的令牌混合出来的字面量，字色 × 底色的对比度在 tests/unit/ladder-page.spec.ts 里逐条算过。 */
:root{color-scheme:light dark;${themeVars(light)};${tagVars(light)}}
${boardRules(light)}
@media (prefers-color-scheme:dark){
  :root{${themeVars(dark)};${tagVars(dark)}}
  ${boardRules(dark)}
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
.ladder{display:grid;grid-template-columns:repeat(var(--levels),minmax(0,1fr));align-items:start;gap:14px;margin-top:26px}
.level{min-width:0}
.level-head{display:flex;flex-direction:column;justify-content:flex-end;min-height:74px;padding-bottom:8px;border-bottom:1px solid var(--rule-strong)}
.level-title{display:flex;align-items:baseline;gap:3px;margin:0;font-weight:400}
.level-num{font-family:'JetBrains Mono','Cascadia Mono',Consolas,monospace;font-size:calc(16px + var(--level) * 3.2px);font-weight:500;line-height:1;letter-spacing:-0.02em;color:var(--ink)}
.level-unit{font-size:12px;color:var(--ink-3)}
.level-meta{margin:6px 0 0;font-family:'JetBrains Mono','Cascadia Mono',Consolas,monospace;font-size:11px;font-variant-numeric:tabular-nums;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cards{display:flex;flex-direction:column;gap:8px;margin:10px 0 0;padding:0;list-style:none}
.card{padding:10px 11px;border:1px solid var(--card-border);border-radius:12px;background:var(--card-bg)}
.card.is-broken{background:var(--card-bg-broken)}
.board-none{--card-bg:var(--sheet);--card-bg-broken:var(--minor);--card-border:var(--rule-strong);--board-ink:var(--ink-3)}
.card-top{display:flex;align-items:baseline;gap:8px}
.name{min-width:0;overflow:hidden;font-size:14px;font-weight:600;line-height:20px;color:var(--ink);text-overflow:ellipsis;white-space:nowrap}
.price{margin-left:auto;font-family:'JetBrains Mono','Cascadia Mono',Consolas,monospace;font-size:14px;font-weight:500;line-height:20px;font-variant-numeric:tabular-nums;color:var(--ink);white-space:nowrap}
.is-broken .name,.is-broken .price{color:var(--ink-2)}
.card-quote{display:flex;gap:8px;margin-top:3px;font-family:'JetBrains Mono','Cascadia Mono',Consolas,monospace;font-size:11px;font-variant-numeric:tabular-nums;color:var(--ink-2)}
.card-quote .seal{letter-spacing:0.02em}
.card-tags{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:7px}
.board{min-width:0;overflow:hidden;font-size:11px;color:var(--board-ink);text-overflow:ellipsis;white-space:nowrap;letter-spacing:0.01em}
.tag{flex:none;padding:0 5px;border-radius:6px;font-size:11px;line-height:16px;white-space:nowrap}
.tag-word{background:var(--tag-up-bg);color:var(--tag-up-ink);font-weight:500}
.tag-hot{background:var(--tag-hot-bg);color:var(--tag-hot-ink)}
.tag-off{background:var(--minor);color:var(--ink-2)}
.tag-pct{background:var(--tag-up-bg);color:var(--tag-up-ink);font-family:'JetBrains Mono','Cascadia Mono',Consolas,monospace;font-variant-numeric:tabular-nums}
.tag-pct.is-down{background:var(--tag-down-bg);color:var(--tag-down-ink)}
.tag-pct.is-flat{background:var(--minor);color:var(--ink-2)}
.colophon{display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px 18px;margin-top:36px;padding-top:12px;border-top:1px solid var(--rule);font-size:11px;line-height:1.6;color:var(--ink-3)}
.colophon p{margin:0;text-wrap:pretty}
.colophon .brand{font-family:'JetBrains Mono','Cascadia Mono',Consolas,monospace;font-size:11px;letter-spacing:0.08em;color:var(--ink-3)}
@media (max-width:1279px){
  .ladder{display:flex;flex-direction:column;align-items:stretch;gap:26px}
  .level{display:grid;grid-template-columns:150px minmax(0,1fr);gap:18px;padding-top:14px;border-top:1px solid var(--rule)}
  .level-head{min-height:0;padding-bottom:0;border-bottom:0}
  .level-meta{white-space:normal;overflow:visible;text-overflow:clip}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;margin-top:0}
}
@media (max-width:680px){
  .sheet{padding:22px 18px 24px}
  .masthead-main{flex-direction:column;gap:10px}
  .masthead-side{flex-direction:row;align-items:center;gap:12px}
  .title{font-size:24px}
  .summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 16px}
  .stat{padding:0;border-left:0}
  .level{grid-template-columns:1fr;gap:10px}
  .cards{grid-template-columns:1fr}
  .colophon{margin-top:26px}
}
@media print{
  :root{${themeVars(light)};${tagVars(light)}}
  ${boardRules(light)}
  html,body{background:#fff}
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .sheet{max-width:none;padding:0}
  .print{display:none}
  .ladder{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:16px}
  .level{display:block;padding-top:0;border-top:0}
  .level-head{min-height:60px;border-bottom:1px solid var(--rule-strong)}
  .cards{display:flex;flex-direction:column;gap:6px}
  .card{break-inside:avoid}
  .level-head{break-after:avoid}
  .colophon{margin-top:18px}
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

function boardsHtml(ladder: StockLimitLadder): string {
  const boards = boardCounts(ladder.rungs.flatMap((rung) => rung.entries))
  if (boards.length === 0) return ''
  const items = boards
    .map(
      ({ board, count }) =>
        `<span class="board-item"><i class="dot board-${identityTone(board)}"></i><span>${text(board)}</span><span class="count">${count}</span></span>`,
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
): string {
  const board = boardOf(entry)
  const toneClass = board ? ` board-${identityTone(board)}` : ' board-none'
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

function levelMeta(rung: StockLimitRung): string {
  const parts: string[] = []
  if (rung.entries.length > 0) parts.push(`${rung.entries.length} 家`)
  if (rung.level > 1 && rung.rate !== null) parts.push(`晋级 ${rateText(rung.rate)}`)
  if (rung.broken.length > 0) parts.push(`断 ${rung.broken.length}`)
  return parts.join(' · ')
}

function levelHtml(rung: StockLimitRung): string {
  const rows = ladderRows(rung)
  const cards = rows
    .map((row) => cardHtml(row.entry, row.broken))
    .join('')
  const meta = levelMeta(rung)
  return `<section class="level" style="--level:${rung.level}" aria-label="${rung.level} 板">` +
    `<header class="level-head"><h2 class="level-title"><span class="level-num">${rung.level}</span><span class="level-unit">板</span></h2>${
      meta ? `<p class="level-meta">${escapeHtml(meta)}</p>` : ''
    }</header>` +
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
 * 列按板数从高到低（7 板在左、首板在右）；每列内沿用天梯的板块分组顺序，
 * 断板跟在同板块的连板后面。调用方只在 `status === 'ok'` 时允许导出。
 */
export function renderLadderPage(ladder: StockLimitLadder): string {
  const levels = [...ladder.rungs].sort((left, right) => right.level - left.level)
  const weekday = weekdayZh(ladder.date)
  const title = `连板天梯 · ${ladder.date}`
  const ladderHtml = levels
    .map((rung) => levelHtml(rung))
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
${boardsHtml(ladder)}
${missingPrevious}
</header>
<div class="ladder" style="--levels:${Math.max(1, levels.length)}">
${ladderHtml}
</div>
${footerHtml(ladder)}
</main>
</body>
</html>
`
}
