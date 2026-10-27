import { useCallback, useEffect, useRef, useState, type JSX } from 'react'

import { addDays, weekdayCn } from '../../shared/domain/calendar'
import { isOneWordBoard } from '../../shared/domain/limit-ladder'
import { formatTimestamp, todayYmd } from '../../shared/domain/time'
import type { StockLimitEntry, StockLimitLadder } from '../../shared/types/stock-limit'
import { Button } from '../components/button'
import { DatePicker } from '../components/date-picker'
import { EmptyState } from '../components/empty-state'
import { Icon } from '../components/icon'
import { stockErrorMessage, stockPercent } from './stock-format'

/** `HHMMSS` 整数 → `09:25`；缺值给破折号。 */
function sealTimeText(value: number): string {
  if (!Number.isInteger(value) || value <= 0) return '—'
  const text = String(value).padStart(6, '0')
  return `${text.slice(0, 2)}:${text.slice(2, 4)}`
}

/** 抓取时间：只显示时分，日期用选择器本身表达。 */
function fetchedText(seconds: number): string {
  return formatTimestamp(seconds, 'HH:mm')
}

/**
 * 一只涨停股。`broken` 表示它是昨日的板、今天没接上：
 * 名字退到次级色，右下角换成「断」标记。
 */
function StockChip({
  entry,
  broken = false,
}: {
  entry: StockLimitEntry
  broken?: boolean
}): JSX.Element {
  const detail = [
    `${entry.stockName} ${entry.stockCode}`,
    `首封 ${sealTimeText(entry.firstSeal)}`,
    broken
      ? `昨日首封 ${sealTimeText(entry.firstSeal)}，今日断板`
      : [
          isOneWordBoard(entry) ? '一字板' : '',
          entry.brokenCount > 0 ? `炸板 ${entry.brokenCount} 次` : '',
        ]
          .filter(Boolean)
          .join(' · '),
    entry.industry,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <li
      className={`stock-ladder__chip${broken ? ' is-broken' : ''}`}
      data-testid={broken ? 'stock-ladder-broken-chip' : 'stock-ladder-chip'}
      title={detail}
    >
      <span className="stock-ladder__chip-head">
        <span className="stock-ladder__chip-name">{entry.stockName}</span>
        {!broken && isOneWordBoard(entry) ? (
          <span className="stock-ladder__chip-word" data-testid="stock-ladder-chip-word">
            一字
          </span>
        ) : null}
      </span>
      <span className="stock-ladder__chip-meta">
        <span className="stock-ladder__chip-code">{entry.stockCode}</span>
        <span className="stock-ladder__chip-time">
          {broken ? `昨${sealTimeText(entry.firstSeal)}` : sealTimeText(entry.firstSeal)}
        </span>
        {broken ? (
          <span className="stock-ladder__chip-tag">断</span>
        ) : entry.brokenCount > 0 ? (
          <span className="stock-ladder__chip-broken">炸 {entry.brokenCount}</span>
        ) : null}
      </span>
    </li>
  )
}

/**
 * 连板天梯：按交易日看涨停股的连板层级。
 *
 * 一天一屏：日期行 → 汇总数字 → 一板一列（首板在左、最高板在右）。
 * 断板不另起一段，直接挂在它昨日所在的那一列、排在今日连板股后面，
 * 名字退色并带「断」标记；那一层今天没人晋级时就只剩断板。
 * 盘中（当天 15:00 前）的数据是临时快照，服务层不会入库，界面在这里明说。
 */
export function StockLadderPanel(): JSX.Element {
  const today = todayYmd()
  const [date, setDate] = useState(today)
  const [ladder, setLadder] = useState<StockLimitLadder | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const requestRef = useRef(0)

  const load = useCallback(async (target: string, refresh: boolean): Promise<void> => {
    const token = requestRef.current + 1
    requestRef.current = token
    setLoading(true)
    setError('')
    // 翻日时先撤掉旧图，避免新日期下短暂显示上一天的数字；刷新则保留。
    if (!refresh) setLadder(null)
    try {
      const result = await window.api.invoke('stock_limit_ladder', { date: target, refresh })
      if (token !== requestRef.current) return
      setLadder(result)
    } catch (loadError) {
      if (token !== requestRef.current) return
      setLadder(null)
      setError(stockErrorMessage(loadError))
    } finally {
      if (token === requestRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(date, false)
  }, [date, load])

  /** 换前一天 / 后一天；后一天不能越过今天。 */
  const shiftDay = useCallback((delta: number): void => {
    setDate((current) => {
      const next = addDays(current, delta)
      if (next === null) return current
      return next > todayYmd() ? current : next
    })
  }, [])

  // ← / → 翻日（输入框里打字时不抢键）。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.closest('[role="dialog"]'))
      ) {
        return
      }
      if (event.key === 'ArrowLeft') shiftDay(-1)
      else if (event.key === 'ArrowRight') shiftDay(1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [shiftDay])

  const nextDay = addDays(date, 1)
  const canGoNext = nextDay !== null && nextDay <= today

  const maxLevel = ladder?.metrics.maxLevel ?? null
  const topName =
    maxLevel === null
      ? ''
      : (ladder?.rungs.find((rung) => rung.level === maxLevel)?.entries[0]?.stockName ?? '')

  const statusText = ((): string => {
    if (!ladder) return ''
    if (ladder.temporary) return '盘中临时数据 · 15:00 收盘后写入本地'
    if (ladder.stale) return `刷新失败，显示 ${fetchedText(ladder.fetchedAt)} 的本地缓存`
    if (ladder.fromCache) return `${fetchedText(ladder.fetchedAt)} 抓取 · 本地缓存`
    if (ladder.status === 'unavailable') return '数据源未收录这一天，本地也没有缓存'
    return `${fetchedText(ladder.fetchedAt)} 抓取 · 已写入本地`
  })()

  const renderBody = (): JSX.Element => {
    if (error) {
      return (
        <div className="stock-ladder__error" data-testid="stock-ladder-error">
          <Icon name="WarningCircle" size={16} />
          <span>{error}</span>
          <Button
            size="sm"
            variant="text"
            testId="stock-ladder-retry"
            onClick={() => void load(date, true)}
          >
            重试
          </Button>
        </div>
      )
    }
    if (!ladder) {
      return (
        <div className="stock-ladder__skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
      )
    }
    if (ladder.status !== 'ok') {
      return (
        <EmptyState
          testId="stock-ladder-empty"
          title={
            ladder.status === 'unavailable'
              ? '数据源没有收录这一天'
              : ladder.temporary
                ? '今天还没有涨停数据'
                : '这一天没有涨停'
          }
          description={
            ladder.status === 'unavailable'
              ? '数据源只保留最近一个多月；更早的日期要当时已经存到本地。'
              : ladder.temporary
                ? '非交易日，或还没开盘；开盘后刷新看看。'
                : '非交易日，或当天确实没有涨停股。'
          }
        />
      )
    }

    return (
      <>
        {ladder.previousDate === null ? (
          <p className="stock-ladder__hint" data-testid="stock-ladder-no-previous">
            缺少前一交易日的数据，断板与晋级率暂不计入。
          </p>
        ) : null}

        <div className="stock-ladder__rungs" data-testid="stock-ladder-rungs">
          {ladder.rungs.map((rung) => (
            <section
              key={rung.level}
              className={`stock-ladder__rung${rung.level === maxLevel ? ' is-top' : ''}`}
              data-testid="stock-ladder-rung"
              data-level={rung.level}
            >
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

              <ul className="stock-ladder__chips">
                {rung.entries.map((entry) => (
                  <StockChip key={entry.stockCode} entry={entry} />
                ))}
              </ul>

              {rung.broken.length > 0 ? (
                <div className="stock-ladder__rung-broken" data-testid="stock-ladder-broken">
                  <p className="stock-ladder__broken-note">断板 {rung.broken.length}</p>
                  <ul className="stock-ladder__chips">
                    {rung.broken.map((entry) => (
                      <StockChip key={entry.stockCode} entry={entry} broken />
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ))}
        </div>
      </>
    )
  }

  return (
    <div className="stock-ladder-view" data-testid="stock-ladder">
      <div className="stock-ladder__bar">
        <header className="stock-ladder__head">
          <div className="stock-ladder__heading">
            <span className="stock-ladder__kicker">连板天梯</span>
            <span
              className={`stock-ladder__status${ladder?.temporary ? ' is-live' : ''}`}
              data-testid="stock-ladder-status"
            >
              {statusText}
            </span>
          </div>
          <div className="stock-ladder__controls">
            <button
              type="button"
              className="tr-icon-btn stock-ladder__step"
              data-testid="stock-ladder-prev"
              aria-label="前一天"
              title="前一天"
              onClick={() => shiftDay(-1)}
            >
              <Icon name="ChevronLeft" size={16} />
            </button>
            <div className="stock-ladder__date">
              <DatePicker
                value={date}
                onChange={(next) => setDate(next > today ? today : next)}
                testId="stock-ladder-date"
                ariaLabel="选择交易日"
                disabledDate={(value) => value.format('YYYY-MM-DD') > today}
              />
              <span className="stock-ladder__weekday">{weekdayCn(date)}</span>
            </div>
            <button
              type="button"
              className="tr-icon-btn stock-ladder__step"
              data-testid="stock-ladder-next"
              aria-label="后一天"
              title="后一天"
              disabled={!canGoNext}
              onClick={() => shiftDay(1)}
            >
              <Icon name="ChevronRight" size={16} />
            </button>
            <Button
              size="sm"
              variant="text"
              testId="stock-ladder-today"
              disabled={date === today}
              onClick={() => setDate(today)}
            >
              今天
            </Button>
            <Button
              size="sm"
              variant="secondary"
              testId="stock-ladder-refresh"
              disabled={loading}
              icon={<Icon name="Reload" size={14} />}
              onClick={() => void load(date, true)}
            >
              刷新
            </Button>
          </div>
        </header>
      </div>

      <div className="stock-ladder__metrics" data-testid="stock-ladder-metrics">
        <div className="stock-ladder__metric">
          <span className="stock-ladder__metric-label">涨停</span>
          <span className="stock-ladder__metric-value">{ladder?.metrics.limitCount ?? '—'}</span>
          <span className="stock-ladder__metric-sub">
            {ladder?.metrics.previousCount === null || ladder?.metrics.previousCount === undefined
              ? '昨日 —'
              : `昨日 ${ladder.metrics.previousCount}`}
          </span>
        </div>
        <div className="stock-ladder__metric">
          <span className="stock-ladder__metric-label">空间板</span>
          <span className="stock-ladder__metric-value">
            {maxLevel === null ? '—' : `${maxLevel} 板`}
          </span>
          <span className="stock-ladder__metric-sub">{topName || '—'}</span>
        </div>
        <div className="stock-ladder__metric">
          <span className="stock-ladder__metric-label">晋级率</span>
          <span className="stock-ladder__metric-value">
            {ladder?.metrics.rate === null || ladder?.metrics.rate === undefined
              ? '—'
              : stockPercent(ladder.metrics.rate, 0)}
          </span>
          <span className="stock-ladder__metric-sub">
            {ladder?.metrics.promotedCount === null || ladder?.metrics.promotedCount === undefined
              ? '—'
              : `${ladder.metrics.promotedCount}/${ladder.metrics.previousCount ?? 0}`}
          </span>
        </div>
        <div className="stock-ladder__metric">
          <span className="stock-ladder__metric-label">断板</span>
          <span className="stock-ladder__metric-value">{ladder?.metrics.brokenCount ?? '—'}</span>
          <span className="stock-ladder__metric-sub">
            {ladder?.previousDate ? `对照 ${ladder.previousDate}` : '缺少昨日数据'}
          </span>
        </div>
      </div>

      {renderBody()}
    </div>
  )
}
