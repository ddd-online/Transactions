import type { JSX } from 'react'

import { isOneWordBoard } from '../../shared/domain/limit-ladder'
import type { StockLimitEntry } from '../../shared/types/stock-limit'

/** `HHMMSS` 整数 → `09:25`；缺值给破折号。 */
export function ladderSealTime(value: number): string {
  if (!Number.isInteger(value) || value <= 0) return '—'
  const text = String(value).padStart(6, '0')
  return `${text.slice(0, 2)}:${text.slice(2, 4)}`
}

export interface StockLadderItemProps {
  entry: StockLimitEntry
  /** 昨日在这一层、今日没涨停 */
  broken?: boolean
}

/**
 * 连板天梯的一行：名称在左、代码与封板时间在右；
 * 第二行是标签（一字 / 炸 N / 断），有才显示。
 */
export function StockLadderItem({ entry, broken = false }: StockLadderItemProps): JSX.Element {
  const oneWord = !broken && isOneWordBoard(entry)
  const seal = ladderSealTime(entry.firstSeal)

  const tags: Array<{ key: string; text: string; tone: string }> = []
  if (oneWord) tags.push({ key: 'word', text: '一字', tone: 'word' })
  if (!broken && entry.brokenCount > 0) {
    tags.push({ key: 'broken', text: `炸 ${entry.brokenCount}`, tone: 'broken' })
  }
  if (broken) tags.push({ key: 'off', text: '断', tone: 'off' })

  const detail = [
    `${entry.stockName} ${entry.stockCode}`,
    broken ? `昨日首封 ${seal}，今日断板` : `首封 ${seal}`,
    !broken && entry.brokenCount > 0 ? `炸板 ${entry.brokenCount} 次` : '',
    entry.industry,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      className={`stock-ladder__item${broken ? ' is-broken' : ''}`}
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
      {tags.length > 0 ? (
        <div className="stock-ladder__item-tags">
          {tags.map((tag) => (
            <span
              key={tag.key}
              className={`stock-ladder__tag stock-ladder__tag--${tag.tone}`}
              data-testid={tag.key === 'word' ? 'stock-ladder-chip-word' : undefined}
            >
              {tag.text}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
