import type { JSX } from 'react'

import { milliToYuan } from '../../shared/domain/money'
import { boardOf, isOneWordBoard, ladderSealTime } from '../../shared/domain/limit-ladder'
import type { StockLimitBrokenEntry, StockLimitEntry } from '../../shared/types/stock-limit'
import { BoardLabel } from './stock-board-label'
import { StockCode } from './stock-code'

/** 涨跌幅标签的文字：带符号的两位小数（`+3.33%` / `-3.33%`）。 */
function ladderPctText(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
}

/** 涨红跌绿（与股票页 `.is-up` / `.is-down` 同一口径）；平盘不上色。 */
function pctTone(value: number): string {
  if (value > 0) return 'up'
  if (value < 0) return 'down'
  return 'flat'
}

export interface StockLadderItemProps {
  entry: StockLimitEntry | StockLimitBrokenEntry
  /** 昨日在这一层、今日没涨停 */
  broken?: boolean
  /** 盘中临时快照：这一行的价格是「当时价」而不是「收盘价」 */
  intraday?: boolean
}

/**
 * 连板天梯的一行：名称与价格在左、代码与封板时间在右；
 * 第二行是板块 + 标签（一字 / 炸 N / 断 / 开盘涨跌幅 / 断板当天的收盘涨跌幅），有才显示。
 * 板块名带身份色（同一板块同一色），行也是按板块聚在一起的。
 *
 * 价格：涨停池里的条目本来就是抓取那一刻的价（收盘后即收盘价）；
 * 开盘涨跌幅与断板的收盘两格都来自当天行情，没有那一笔就不显示。
 */
export function StockLadderItem({
  entry,
  broken = false,
  intraday = false,
}: StockLadderItemProps): JSX.Element {
  const oneWord = !broken && isOneWordBoard(entry)
  const seal = ladderSealTime(entry.firstSeal)
  // 开盘涨跌幅来自行情（今开对昨收）：涨停池里没有今开，历史日读的是当时存下的那一笔。
  const openPct = entry.openPct
  // 断板的涨跌幅是服务层用当天行情补出来的；没有当天行情就是 null（不显示这一格）。
  const todayPct = broken && 'todayPct' in entry ? entry.todayPct : null
  // 断板的价格同样来自当天行情；连板股的价格就是池子里的最新价（收盘后为收盘价）。
  // 0 表示池子没给这一格（不是"零元"），和断板缺行情一样不显示。
  const priceMilli = broken && 'todayPrice' in entry ? entry.todayPrice : entry.priceMilli
  const priceLabel = intraday ? '当时价' : '收盘价'
  const priceText = typeof priceMilli === 'number' && priceMilli > 0 ? milliToYuan(priceMilli) : ''
  const board = boardOf(entry)

  const tags: Array<{ key: string; text: string; tone: string }> = []
  if (oneWord) tags.push({ key: 'word', text: '一字', tone: 'word' })
  if (!broken && entry.brokenCount > 0) {
    tags.push({ key: 'broken', text: `炸 ${entry.brokenCount}`, tone: 'broken' })
  }
  if (broken) tags.push({ key: 'off', text: '断', tone: 'off' })
  // 开盘涨跌幅排在收盘涨跌幅前：同一行按时间先后读（09:30 竞价开盘 → 收盘）。
  if (typeof openPct === 'number') {
    tags.push({ key: 'open', text: `开 ${ladderPctText(openPct)}`, tone: pctTone(openPct) })
  }
  if (broken && typeof todayPct === 'number') {
    tags.push({ key: 'pct', text: ladderPctText(todayPct), tone: pctTone(todayPct) })
  }

  const detail = [
    `${entry.stockName} ${entry.stockCode}`,
    priceText ? `${priceLabel} ${priceText}` : '',
    broken
      ? `昨日首封 ${seal}，今日断板${typeof todayPct === 'number' ? ` ${ladderPctText(todayPct)}` : ''}`
      : `首封 ${seal}`,
    typeof openPct === 'number' ? `开盘 ${ladderPctText(openPct)}` : '',
    !broken && entry.brokenCount > 0 ? `炸板 ${entry.brokenCount} 次` : '',
    board ? `板块 ${board}` : '',
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      className={`stock-ladder__item${broken ? ' is-broken' : ' is-limit'}`}
      data-testid={broken ? 'stock-ladder-broken-chip' : 'stock-ladder-chip'}
      title={detail}
    >
      <div className="stock-ladder__item-main">
        <span className="stock-ladder__item-ident">
          <span className="stock-ladder__item-name">{entry.stockName}</span>
          {priceText ? (
            <span className="stock-ladder__item-price" data-testid="stock-ladder-chip-price">
              {/* 可见的只有数字：收/现的区别由这一页的状态行说明，读屏用它补全 */}
              <span className="sr-only">{priceLabel}</span>
              {priceText}
            </span>
          ) : null}
        </span>
        <span className="stock-ladder__item-quote">
          <StockCode code={entry.stockCode} testId="stock-ladder-chip-code" />
          <span className="stock-ladder__item-time">
            {broken ? `昨${seal}` : seal}
          </span>
        </span>
      </div>
      {board || tags.length > 0 ? (
        <div className="stock-ladder__item-tags">
          {board ? <BoardLabel board={board} testId="stock-ladder-chip-board" /> : null}
          {tags.map((tag) => (
            <span
              key={tag.key}
              className={`stock-ladder__tag stock-ladder__tag--${tag.tone}`}
              data-testid={
                tag.key === 'word'
                  ? 'stock-ladder-chip-word'
                  : tag.key === 'open'
                    ? 'stock-ladder-chip-open'
                    : tag.key === 'pct'
                      ? 'stock-ladder-chip-pct'
                      : undefined
              }
            >
              {tag.text}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
