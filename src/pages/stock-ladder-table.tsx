import { useEffect, useState, type JSX } from 'react'

import Listy from '@rc-component/listy'

import { ladderRows, type BoardCount, type LadderRow } from '../../shared/domain/limit-ladder'
import { formatTimestamp } from '../../shared/domain/time'
import type { StockLimitLadder } from '../../shared/types/stock-limit'
import { ScrollArea } from '../components/scroll-area'
import { BoardLabel } from './stock-board-label'
import { StockLadderItem } from './stock-ladder-item'
import { stockPercent } from './stock-format'

/** Listy 的 rowKey：连板与断板可能同名不同 code，用前缀分开。 */
function rowKey(row: LadderRow): string {
  return `${row.broken ? 'broken:' : ''}${row.entry.stockCode}`
}

/** 窄窗（分层行布局）不需要虚拟列表，按 CSS 断点切换。 */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const list = window.matchMedia(query)
    const update = (): void => setMatches(list.matches)
    update()
    list.addEventListener('change', update)
    return () => list.removeEventListener('change', update)
  }, [query])
  return matches
}

/** 抓取时间：只显示时分，日期用选择器本身表达。 */
export function fetchedText(seconds: number): string {
  return formatTimestamp(seconds, 'HH:mm')
}

/** 没有天梯可画时的文案：每种 status 说清"为什么没有"，别让空页自己解释。 */
export function emptyCopy(ladder: StockLimitLadder): { title: string; description: string } {
  if (ladder.status === 'offday') {
    return {
      title: '周末休市',
      description: 'A 股周末不开盘，没有当天的涨停数据；左右箭头可以翻到最近的交易日。',
    }
  }
  if (ladder.status === 'unavailable') {
    return {
      title: '数据源没有收录这一天',
      description: '数据源只保留最近一个多月；更早的日期要当时已经存到本地。',
    }
  }
  if (ladder.status === 'preopen') {
    return {
      title: '还没开盘',
      description: '09:30 开盘后才有当天的涨停数据；现在可以先看前一交易日。',
    }
  }
  if (ladder.temporary) {
    return { title: '今天还没有涨停数据', description: '刚开盘或盘中还没有涨停股，刷新看看。' }
  }
  return { title: '这一天没有涨停', description: '非交易日，或当天确实没有涨停股。' }
}

export interface StockLadderTableProps {
  ladder: StockLimitLadder
  /** 今日涨停的板块汇总：由面板算好，表格只负责画在表头 */
  boards: BoardCount[]
}

/**
 * 天梯的表格本体：板块汇总 → 前一交易日提示 → 一板一段的分层行。
 *
 * 宽窗用 Listy（不虚拟化）+ 滚动区，窄窗换成 chips；断点判断留在这里，
 * 因为它只决定表格用哪种布局。
 */
export function StockLadderTable({ ladder, boards }: StockLadderTableProps): JSX.Element {
  const narrow = useMediaQuery('(max-width: 1000px)')
  const maxLevel = ladder.metrics.maxLevel ?? null

  return (
    <>
      {boards.length > 0 ? (
        <header className="stock-ladder__boards" data-testid="stock-ladder-boards">
          <ul className="stock-ladder__boards-list">
            {boards.map(({ board, count }) => (
              <li
                className="stock-ladder__boards-item"
                key={board}
                data-testid="stock-ladder-board-count"
              >
                <BoardLabel board={board} testId="stock-ladder-board-name" />
                <span className="stock-ladder__boards-count" data-testid="stock-ladder-board-num">
                  {count}
                </span>
              </li>
            ))}
          </ul>
        </header>
      ) : null}

      {ladder.previousDate === null ? (
        <p className="stock-ladder__hint" data-testid="stock-ladder-no-previous">
          缺少前一交易日的数据，断板与晋级率暂不计入。
        </p>
      ) : null}

      <div className="stock-ladder__rungs" data-testid="stock-ladder-rungs">
        {ladder.rungs.map((rung) => {
          const rows = ladderRows(rung)
          return (
            <section
              key={rung.level}
              className={`stock-ladder__rung${rung.level === maxLevel ? ' is-top' : ''}`}
              data-testid="stock-ladder-rung"
              data-level={rung.level}
              aria-label={`${rung.level} 板`}
            >
              <div className="stock-ladder__rung-rail">
                <header className="stock-ladder__rung-head">
                  <span className="stock-ladder__level">
                    <span className="stock-ladder__level-num">{rung.level}</span>
                    <span className="stock-ladder__level-unit">板</span>
                  </span>
                  {rung.entries.length > 0 ? (
                    <span className="stock-ladder__rung-count">{rung.entries.length}</span>
                  ) : null}
                </header>
                <p className="stock-ladder__rung-rate">
                  {rung.level === 1
                    ? '首板'
                    : rung.rate === null
                      ? '—'
                      : `晋级 ${stockPercent(rung.rate, 0)}`}
                </p>
              </div>

              {narrow ? (
                <div className="stock-ladder__chips">
                  {rows.map((row) => (
                    <StockLadderItem
                      key={rowKey(row)}
                      entry={row.entry}
                      broken={row.broken}
                      intraday={ladder.temporary}
                    />
                  ))}
                </div>
              ) : (
                <ScrollArea className="stock-ladder__list">
                  <Listy
                    items={rows}
                    virtual={false}
                    rowKey={rowKey}
                    itemRender={(row: LadderRow) => (
                      <StockLadderItem entry={row.entry} broken={row.broken} intraday={ladder.temporary} />
                    )}
                  />
                </ScrollArea>
              )}
            </section>
          )
        })}
      </div>
    </>
  )
}
