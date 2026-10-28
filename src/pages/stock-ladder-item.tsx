import type { JSX } from 'react'

import { boardOf, isOneWordBoard } from '../../shared/domain/limit-ladder'
import type { StockLimitBrokenEntry, StockLimitEntry } from '../../shared/types/stock-limit'
import { BoardLabel } from './stock-board-label'

/** `HHMMSS` 整数 → `09:25`；缺值给破折号。 */
export function ladderSealTime(value: number): string {
  if (!Number.isInteger(value) || value <= 0) return '—'
  const text = String(value).padStart(6, '0')
  return `${text.slice(0, 2)}:${text.slice(2, 4)}`
}

/** 断板涨跌幅标签：带符号的两位小数（`+3.33%` / `-3.33%`）。 */
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
}

/**
 * 连板天梯的一行：名称在左、代码与封板时间在右；
 * 第二行是板块 + 标签（一字 / 炸 N / 断 + 断板当天的涨跌幅），有才显示。
 * 板块名带身份色（同一板块同一色），行也是按板块聚在一起的。
 */
export function StockLadderItem({ entry, broken = false }: StockLadderItemProps): JSX.Element {
  const oneWord = !broken && isOneWordBoard(entry)
  const seal = ladderSealTime(entry.firstSeal)
  // 断板的涨跌幅是服务层用当天行情补出来的；没有当天行情就是 null（不显示这一格）。
  const todayPct = broken && 'todayPct' in entry ? entry.todayPct : null
  const board = boardOf(entry)

  const tags: Array<{ key: string; text: string; tone: string }> = []
  if (oneWord) tags.push({ key: 'word', text: '一字', tone: 'word' })
  if (!broken && entry.brokenCount > 0) {
    tags.push({ key: 'broken', text: `炸 ${entry.brokenCount}`, tone: 'broken' })
  }
  if (broken) tags.push({ key: 'off', text: '断', tone: 'off' })
  if (broken && typeof todayPct === 'number') {
    tags.push({ key: 'pct', text: ladderPctText(todayPct), tone: pctTone(todayPct) })
  }

  const detail = [
    `${entry.stockName} ${entry.stockCode}`,
    broken
      ? `昨日首封 ${seal}，今日断板${typeof todayPct === 'number' ? ` ${ladderPctText(todayPct)}` : ''}`
      : `首封 ${seal}`,
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
        <span className="stock-ladder__item-name">{entry.stockName}</span>
        <span className="stock-ladder__item-quote">
          <span>{entry.stockCode}</span>
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
