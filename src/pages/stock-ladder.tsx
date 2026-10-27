import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { createPortal } from 'react-dom'

import Listy from '@rc-component/listy'

import { addDays } from '../../shared/domain/calendar'
import { formatTimestamp, todayYmd } from '../../shared/domain/time'
import type {
  StockLimitEntry,
  StockLimitLadder,
  StockLimitMetrics,
  StockLimitRung,
} from '../../shared/types/stock-limit'
import { Button } from '../components/button'
import { EmptyState } from '../components/empty-state'
import { Icon } from '../components/icon'
import { ScrollArea } from '../components/scroll-area'
import { TimeRangePicker } from '../components/time-range-picker'
import { StockLadderItem } from './stock-ladder-item'
import { stockErrorMessage, stockPercent } from './stock-format'

/** 一列里的行：今日连板在前，断板个股直接跟在后。 */
type LadderRow = { key: string; entry: StockLimitEntry; broken: boolean }

function rungRows(rung: StockLimitRung): LadderRow[] {
  return [
    ...rung.entries.map((entry) => ({ key: entry.stockCode, entry, broken: false })),
    ...rung.broken.map((entry) => ({ key: `broken:${entry.stockCode}`, entry, broken: true })),
  ]
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
function fetchedText(seconds: number): string {
  return formatTimestamp(seconds, 'HH:mm')
}

/**
 * 连板天梯：按交易日看涨停股的连板层级。
 *
 * 一天一屏：日期行 → 汇总数字 → 一板一列（首板在左、最高板在右）。
 * 断板不另起一段，直接挂在它昨日所在的那一列、排在今日连板股后面，
 * 名字退色并带「断」标记；那一层今天没人晋级时就只剩断板。
 * 盘中（当天 15:00 前）的数据是临时快照，服务层不会入库，界面在这里明说。
 */
export interface StockLadderSummary {
  metrics: StockLimitMetrics
  /** 今日空间板的股票名（没有涨停为空串） */
  topName: string
}

/** 天梯页脚要显示的那几个数字；面板拉完数据后交给外层底栏。 */
function summaryOf(ladder: StockLimitLadder): StockLadderSummary {
  const maxLevel = ladder.metrics.maxLevel
  const topName =
    maxLevel === null
      ? ''
      : (ladder.rungs.find((rung) => rung.level === maxLevel)?.entries[0]?.stockName ?? '')
  return { metrics: ladder.metrics, topName }
}

export interface StockLadderPanelProps {
  /** 汇总数字变化（外层用 `PageLayout` 的底栏展示） */
  onSummaryChange?: (summary: StockLadderSummary | null) => void
  /** 外层 `PageLayout.toolbar` 里的空槽；日期行用 portal 渲染进去 */
  toolbarHost?: HTMLElement | null
}

export function StockLadderPanel({
  onSummaryChange,
  toolbarHost = null,
}: StockLadderPanelProps): JSX.Element {
  const today = todayYmd()
  const [date, setDate] = useState(today)
  const [ladder, setLadder] = useState<StockLimitLadder | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const requestRef = useRef(0)
  const narrow = useMediaQuery('(max-width: 1000px)')
  const load = useCallback(
    async (target: string, refresh: boolean): Promise<void> => {
      const token = requestRef.current + 1
      requestRef.current = token
      setLoading(true)
      setError('')
      // 翻日时先撤掉旧图，避免新日期下短暂显示上一天的数字；刷新则保留。
      if (!refresh) {
        setLadder(null)
        onSummaryChange?.(null)
      }
      try {
        const result = await window.api.invoke('stock_limit_ladder', { date: target, refresh })
        if (token !== requestRef.current) return
        setLadder(result)
        // 没有涨停数据的日子（休市 / 未收录 / 开盘前）底栏留占位符：
        // 拿空池去和昨天比，会算出「断板 52」这种没有意义的数字。
        onSummaryChange?.(result.status === 'ok' ? summaryOf(result) : null)
      } catch (loadError) {
        if (token !== requestRef.current) return
        setLadder(null)
        onSummaryChange?.(null)
        setError(stockErrorMessage(loadError))
      } finally {
        if (token === requestRef.current) setLoading(false)
      }
    },
    [onSummaryChange],
  )

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

  const maxLevel = ladder?.metrics.maxLevel ?? null

  const statusText = ((): string => {
    if (!ladder) return ''
    if (ladder.status === 'preopen') return '开盘前 · 9:30 后才有当天数据'
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
              : ladder.status === 'preopen'
                ? '还没开盘'
                : ladder.temporary
                  ? '今天还没有涨停数据'
                  : '这一天没有涨停'
          }
          description={
            ladder.status === 'unavailable'
              ? '数据源只保留最近一个多月；更早的日期要当时已经存到本地。'
              : ladder.status === 'preopen'
                ? '9:30 开盘后才有当天的涨停数据；现在可以先看前一交易日。'
                : ladder.temporary
                  ? '刚开盘或盘中还没有涨停股，刷新看看。'
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
          {ladder.rungs.map((rung) => {
            const rows = rungRows(rung)
            return (
              <section
                key={rung.level}
                className={`stock-ladder__rung${rung.level === maxLevel ? ' is-top' : ''}`}
                data-testid="stock-ladder-rung"
                data-level={rung.level}
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
                    {rung.entries.map((entry) => (
                      <StockLadderItem key={entry.stockCode} entry={entry} />
                    ))}
                    {rung.broken.map((entry) => (
                      <StockLadderItem key={entry.stockCode} entry={entry} broken />
                    ))}
                  </div>
                ) : (
                  <ScrollArea className="stock-ladder__list">
                    <Listy
                      items={rows}
                      virtual={false}
                      rowKey={(row: LadderRow) => row.key}
                      classNames={{ root: 'stock-ladder__listy' }}
                      itemRender={(row: LadderRow) => (
                        <StockLadderItem entry={row.entry} broken={row.broken} />
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

  const toolbar = (
    <header className="stock-ladder__head">
      <div className="stock-ladder__controls">
        <TimeRangePicker
          testId="stock-ladder-date"
          mode="date"
          start={date}
          end={date}
          dayOnly
          maxDate={today}
          onModeChange={() => undefined}
          onRangeChange={(next) => setDate(next && next <= today ? next : today)}
        />
        <span
          className={`stock-ladder__status${ladder?.temporary ? ' is-live' : ''}`}
          data-testid="stock-ladder-status"
        >
          {statusText}
        </span>
      </div>
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
    </header>
  )

  return (
    <div className="stock-ladder-view" data-testid="stock-ladder">
      {toolbarHost ? createPortal(toolbar, toolbarHost) : null}

      {renderBody()}
    </div>
  )
}

/** 天梯的底栏：四个汇总数字，口径与记录页底栏一致。 */
export function StockLadderFooter({
  summary,
}: {
  summary: StockLadderSummary | null
}): JSX.Element {
  const metrics = summary?.metrics ?? null
  const rate =
    metrics?.rate === null || metrics?.rate === undefined ? '—' : stockPercent(metrics.rate, 0)
  const previousCount =
    metrics?.previousCount === null || metrics?.previousCount === undefined
      ? null
      : metrics.previousCount
  const promoted =
    metrics?.promotedCount === null || metrics?.promotedCount === undefined
      ? null
      : metrics.promotedCount

  return (
    <div className="statistics-footer stock-ladder-footer" data-testid="stock-ladder-footer">
      <div className="statistics-footer-item">
        <span className="statistics-footer-item-label">涨停</span>
        <span className="statistics-footer-item-value">
          {metrics ? metrics.limitCount : '—'}
          {summary ? (
            <span className="stock-ladder-footer__note">
              {previousCount === null ? '昨 —' : `昨 ${previousCount}`}
            </span>
          ) : null}
        </span>
      </div>
      <div className="statistics-footer-divider" />
      <div className="statistics-footer-item">
        <span className="statistics-footer-item-label">空间板</span>
        <span className="statistics-footer-item-value">
          {metrics?.maxLevel === null || metrics?.maxLevel === undefined
            ? '—'
            : `${metrics.maxLevel} 板`}
          {summary ? (
            <span className="stock-ladder-footer__note">{summary.topName || '—'}</span>
          ) : null}
        </span>
      </div>
      <div className="statistics-footer-divider" />
      <div className="statistics-footer-item">
        <span className="statistics-footer-item-label">晋级率</span>
        <span className="statistics-footer-item-value">
          {rate}
          {summary ? (
            <span className="stock-ladder-footer__note">
              {promoted === null ? '—' : `${promoted}/${previousCount ?? 0}`}
            </span>
          ) : null}
        </span>
      </div>
      <div className="statistics-footer-divider" />
      <div className="statistics-footer-item">
        <span className="statistics-footer-item-label">断板</span>
        <span className="statistics-footer-item-value">
          {metrics?.brokenCount === null || metrics?.brokenCount === undefined
            ? '—'
            : metrics.brokenCount}
        </span>
      </div>
    </div>
  )
}
