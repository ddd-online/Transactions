import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { createPortal } from 'react-dom'

import { addDays, latestTradingDay } from '../../shared/domain/calendar'
import { boardCounts } from '../../shared/domain/limit-ladder'
import { todayYmd } from '../../shared/domain/time'
import type { StockLimitLadder, StockLimitMetrics } from '../../shared/types/stock-limit'
import { Button } from '../components/button'
import { EmptyState } from '../components/empty-state'
import { Icon } from '../components/icon'
import { TimeRangePicker } from '../components/time-range-picker'
import { notify } from '../components/toast'
import { renderLadderPage } from './stock-ladder-page'
import { stockErrorMessage, stockPercent } from './stock-format'
import { StockLadderTable, emptyCopy, fetchedText } from './stock-ladder-table'

/**
 * 连板天梯：按交易日看涨停股的连板层级。
 *
 * 一天一屏：日期行 → 汇总数字 → 一板一列（首板在左、最高板在右）。
 * 断板不另起一段，直接挂在它昨日所在的那一列、跟在同板块的今日连板股后面，
 * 名字退色并带「断」标记；那一层今天没人晋级时就只剩断板。
 * 列里先按板块聚在一起，板块内按封板先后 —— 顺序由 `ladderRows` 给。
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
  // 天梯只谈交易日：周末打开时默认落在最近一个交易日（周五），不拿周六 / 周日
  // 空着开场；手选到周末会看到「周末休市」，不会显示别的交易日的池子。
  const today = latestTradingDay(todayYmd())
  const [date, setDate] = useState(today)
  const [ladder, setLadder] = useState<StockLimitLadder | null>(null)
  const [loading, setLoading] = useState(false)
  const [openingPage, setOpeningPage] = useState(false)
  const [error, setError] = useState('')
  const requestRef = useRef(0)
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

  // 工具栏下的板块汇总：只数今日涨停，家数多的板块在前。
  const boards =
    ladder && ladder.status === 'ok'
      ? boardCounts(ladder.rungs.flatMap((rung) => rung.entries))
      : []

  /** 把当前这一份天梯渲染成单页网页，交给主进程写盘并请系统浏览器打开。 */
  const openAsPage = useCallback(async (): Promise<void> => {
    if (!ladder || ladder.status !== 'ok') return
    setOpeningPage(true)
    try {
      await window.api.invoke('stock_ladder_open_page', {
        date: ladder.date,
        html: renderLadderPage(ladder),
      })
      notify('已以网页打开')
    } catch (pageError) {
      notify(stockErrorMessage(pageError), 'error')
    } finally {
      setOpeningPage(false)
    }
  }, [ladder])

  const statusText = ((): string => {
    if (!ladder) return ''
    if (ladder.status === 'offday') return '周末休市 · 没有当天的涨停数据'
    if (ladder.status === 'preopen') return '开盘前 · 09:30 后才有当天数据'
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
      const copy = emptyCopy(ladder)
      return (
        <EmptyState testId="stock-ladder-empty" title={copy.title} description={copy.description} />
      )
    }

    return <StockLadderTable ladder={ladder} boards={boards} />
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
      </div>
      <div className="stock-ladder__actions">
        <span
          className={`stock-ladder__status${ladder?.stale ? ' is-warning' : ladder?.temporary ? ' is-live' : ''}`}
          data-testid="stock-ladder-status"
          role="status"
          aria-live="polite"
        >
          {statusText}
        </span>
        <Button
          size="sm"
          variant="secondary"
          testId="stock-ladder-open-page"
          // 只导出**屏幕上这一份**：换日期后、新数据回来之前，body 里还是上一天的天梯，
          // 这时点它会把「看着像新日子、其实是旧数据」的页面发出去。
          disabled={loading || ladder?.status !== 'ok' || ladder?.date !== date}
          loading={openingPage}
          icon={<Icon name="Export" size={14} />}
          onClick={() => void openAsPage()}
        >
          以网页打开
        </Button>
        <Button
          size="sm"
          variant="secondary"
          testId="stock-ladder-refresh"
          loading={loading}
          icon={<Icon name="Reload" size={14} />}
          onClick={() => void load(date, true)}
        >
          刷新
        </Button>
      </div>
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
