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
import {
  LADDER_BOARD_PALETTES,
  LADDER_PAGE_THEMES,
  boardRules,
  boardSlots,
  tagVars,
  themeVars,
  weekdayZh,
} from './stock-ladder-page-theme'

/**
 * 主题与色板住在 `stock-ladder-page-theme`，这里原样 re-export ——
 * 调用方与 `tests/unit/ladder-page.spec.ts` 继续从本模块 import 这些名字。
 */
export {
  LADDER_BOARD_HUES,
  LADDER_BOARD_PALETTES,
  LADDER_PAGE_THEMES,
  boardSlots,
  ladderTagPalette,
  mixHex,
  weekdayZh,
} from './stock-ladder-page-theme'
export type { LadderBoardPalette, LadderPageTheme } from './stock-ladder-page-theme'

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
.tag-pair{display:inline-flex;align-items:center;gap:6px}
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
  const identity: string[] = []
  if (!broken && isOneWordBoard(entry)) identity.push('<span class="tag tag-word">一字</span>')
  if (!broken && entry.brokenCount > 0) {
    identity.push(`<span class="tag tag-hot">炸 ${entry.brokenCount}</span>`)
  }
  if (broken) identity.push('<span class="tag tag-off">断</span>')

  // 开盘与收盘是同一段时间的两端：各自带「开 / 收」，换行时整对一起走。
  const pcts: string[] = []
  if (typeof entry.openPct === 'number') {
    const tone = entry.openPct > 0 ? '' : entry.openPct < 0 ? ' is-down' : ' is-flat'
    pcts.push(`<span class="tag tag-pct${tone}">开 ${percentText(entry.openPct)}</span>`)
  }
  if (broken) {
    const todayPct = (entry as StockLimitBrokenEntry).todayPct
    if (typeof todayPct === 'number') {
      const tone = todayPct > 0 ? '' : todayPct < 0 ? ' is-down' : ' is-flat'
      pcts.push(`<span class="tag tag-pct${tone}">收 ${percentText(todayPct)}</span>`)
    }
  }

  return (
    identity.join('') +
    (pcts.length > 0 ? `<span class="tag-pair">${pcts.join('')}</span>` : '')
  )
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
