/**
 * 连板天梯服务：按交易日取「今日 + 前一交易日」的涨停池，组装天梯。
 *
 * 缓存纪律（用户明确要求）：
 * * 库里已有该日数据 → 直接读库，不发请求；
 * * 库里没有 → 抓取；**收盘后**（当日 15:00 起，或过去的日子）写入本地；
 * * **当天 09:30–15:00** 抓到的只是盘中快照：照常渲染，但**不写任何表**，
 *   下次进入还是重新抓 —— 盘中数据每分钟都在变，存下来就是脏数据；
 * * **当天 09:30 之前不支持查看**：返回 `preopen`，不发请求、不写库；
 * * 未来日期一律拒绝；
 * * 前一交易日也缓存（它已经是确定数据），天梯的断板与晋级率都靠它。
 *
 * 断板不在涨停池里，它当天的涨跌幅只能问行情：只有行情自己的交易日与天梯日期相同才采信，
 * 行情失败一律当"没有"（断板照常显示，只是少一枚涨跌幅标签）。
 *
 * 数据源覆盖最近约一个月：更早且本地没缓存的日期返回 `unavailable`，
 * 不写空标记（免得数据源将来补了历史也永远读不到）。
 */

import { addDays, daysBetween, isWeekend, parseYmd } from '../../shared/domain/calendar'
import { buildLimitLadder } from '../../shared/domain/limit-ladder'
import { quoteChangePercent } from '../../shared/domain/stock'
import { formatTimestamp, nowSeconds, ymdToSeconds } from '../../shared/domain/time'
import { AppError } from '../../shared/errors'
import type { StockLimitEntry, StockLimitLadder } from '../../shared/types/stock-limit'
import type { StockQuoteDto } from '../../shared/types/stock-position'
import type { Db } from '../db/driver'
import {
  getLimitDay,
  listLimitEntries,
  saveLimitDay,
  type StockLimitDayRow,
} from '../db/dao/stock-limit'
import type { LimitPoolSource } from './stock-limit-pool'
import type { StockQuoteFetcher } from './stock-quote'

/** A 股开盘时刻：09:30（本地时间）。这之前没有当天数据可看。 */
export const LIMIT_OPEN_MINUTE = 9 * 60 + 30

/** A 股收盘时刻：15:00（本地时间）。盘中数据从这个点起才算定稿。 */
export const LIMIT_CLOSE_MINUTE = 15 * 60

/** 数据源覆盖窗口（天）。更早的日期抓不到就是"未收录"，不当成空涨停日缓存。 */
const RETENTION_DAYS = 45

/** 前一交易日最多回溯的日历天数（覆盖国庆 / 春节长假，含调休后的超长休市）。 */
const PREVIOUS_LOOKBACK_DAYS = 15

/**
 * 断板涨跌幅要问行情，而行情只有"最新一笔"，最多代表最近几个交易日；
 * 比这更早的日期不去请求（请求了也对不上，白等一次超时）。
 */
const BROKEN_QUOTE_DAYS = 4

export interface LimitLadderOptions {
  /** 强制重抓（仍受"盘中不写库"约束） */
  refresh?: boolean
  /** 当前 Unix 秒（测试注入时钟用） */
  now?: number
  /** 行情源：用来补断板当天的涨跌幅；不传就不补 */
  quotes?: StockQuoteFetcher
}

/** 组装天梯时需要的请求上下文。 */
interface LadderContext {
  now: number
  fetchedAt: number
  temporary: boolean
  fromCache: boolean
  stale: boolean
}

/** 某日某个时刻（分钟数，从 00:00 起）的 Unix 秒。 */
function minuteSeconds(date: string, minute: number): number | null {
  const dayStart = ymdToSeconds(date)
  return dayStart === null ? null : dayStart + minute * 60
}

/** 不是（本地）今天、但又被请求查看未来时，前面的日期比较已经拦掉了。 */
function isBeforeOpen(date: string, now: number): boolean {
  const openAt = minuteSeconds(date, LIMIT_OPEN_MINUTE)
  return openAt !== null && now < openAt
}

/** 该日的数据是否已经定稿（过去的日期，或当天已过 15:00）。 */
function isClosed(date: string, today: string, now: number): boolean {
  if (date < today) return true
  if (date > today) return false
  const closeAt = minuteSeconds(date, LIMIT_CLOSE_MINUTE)
  return closeAt !== null && now >= closeAt
}

function emptyLadder(
  date: string,
  now: number,
  status: 'preopen' | 'unavailable',
): StockLimitLadder {
  return {
    date,
    previousDate: null,
    status,
    temporary: false,
    fromCache: false,
    stale: false,
    fetchedAt: now,
    source: 'eastmoney',
    rungs: [],
    metrics: {
      limitCount: 0,
      previousCount: null,
      maxLevel: null,
      promotedCount: null,
      rate: null,
      brokenCount: null,
    },
  }
}

function unavailable(date: string, now: number): StockLimitLadder {
  return emptyLadder(date, now, 'unavailable')
}

function readCached(db: Db, day: StockLimitDayRow, date: string): StockLimitEntry[] {
  return day.status === 'ok' ? listLimitEntries(db, date) : []
}

/**
 * 找前一交易日的涨停池。
 *
 * 先读库；库里没有就往前逐日探测（周末直接记空，不浪费请求）。
 * 任何一个候选日抓取失败都停止回溯、返回 `null` —— 天梯本身照常显示，
 * 只是断板与晋级率降级，不因为"昨天"把整页拖垮。
 */
async function loadPreviousDay(
  db: Db,
  source: LimitPoolSource,
  date: string,
  now: number,
): Promise<{ date: string | null; entries: StockLimitEntry[] | null }> {
  let cursor = date
  for (let step = 0; step < PREVIOUS_LOOKBACK_DAYS; step += 1) {
    const previous = addDays(cursor, -1)
    if (previous === null) break
    cursor = previous

    const cached = getLimitDay(db, cursor)
    if (cached) {
      if (cached.status === 'ok') return { date: cursor, entries: readCached(db, cached, cursor) }
      continue // 空的日标记（周末 / 节假日）继续往前
    }

    if (isWeekend(cursor)) {
      saveLimitDay(db, cursor, [], now)
      continue
    }

    let entries: StockLimitEntry[]
    try {
      entries = await source.fetchDay(cursor)
    } catch {
      break
    }

    if (entries.length > 0) {
      saveLimitDay(db, cursor, entries, now)
      return { date: cursor, entries }
    }
    saveLimitDay(db, cursor, [], now)
  }
  return { date: null, entries: null }
}

function isBeyondRetention(date: string, today: string): boolean {
  const days = daysBetween(date, today)
  return days !== null && days > RETENTION_DAYS
}

/** 组装最终 DTO：补齐前一交易日，再交给纯函数分层。 */
async function finish(
  db: Db,
  source: LimitPoolSource,
  date: string,
  entries: StockLimitEntry[],
  context: LadderContext,
): Promise<StockLimitLadder> {
  const previous = await loadPreviousDay(db, source, date, context.now)
  const data = buildLimitLadder(entries, previous.entries)
  return {
    date,
    previousDate: previous.date,
    status: entries.length > 0 ? 'ok' : 'empty',
    temporary: context.temporary,
    fromCache: context.fromCache,
    stale: context.stale,
    fetchedAt: context.fetchedAt,
    source: 'eastmoney',
    ...data,
  }
}

/**
 * 给断板条目补上"当天涨跌幅"。
 *
 * 断板的票已经不在涨停池里了，它今天走得怎么样只能问行情；而行情只有最新一笔，
 * 所以只采信**行情自己的交易日与天梯日期相同**的那一笔 —— 否则就是把别的交易日的
 * 涨跌贴到这一天上。周末看周五的天梯时它正好对得上；更早的日期对不上，也就不去请求。
 *
 * 行情是外部临时数据，任何失败都当"没有"：断板条目照常显示，只是没有涨跌幅标签。
 */
async function attachBrokenPct(
  ladder: StockLimitLadder,
  quotes: StockQuoteFetcher | undefined,
  today: string,
): Promise<StockLimitLadder> {
  if (!quotes) return ladder
  const age = daysBetween(ladder.date, today)
  if (age === null || age > BROKEN_QUOTE_DAYS) return ladder

  const codes = [
    ...new Set(ladder.rungs.flatMap((rung) => rung.broken.map((entry) => entry.stockCode))),
  ]
  if (codes.length === 0) return ladder

  let fetched: Map<string, StockQuoteDto>
  try {
    fetched = await quotes.fetchQuotes(codes)
  } catch {
    return ladder
  }

  return {
    ...ladder,
    rungs: ladder.rungs.map((rung) => ({
      ...rung,
      broken: rung.broken.map((entry) => {
        const quote = fetched.get(entry.stockCode)
        if (!quote || quote.quoteDate !== ladder.date) return entry
        const pct = quoteChangePercent(quote.latestPrice, quote.prevClose)
        return pct === null ? entry : { ...entry, todayPct: pct }
      }),
    })),
  }
}

/**
 * 取某一天的天梯。
 *
 * `date` 为 `YYYY-MM-DD`；`now` 可注入（测试用），生产由 IPC 层传当前时间。
 */
export async function getLimitLadder(
  db: Db,
  source: LimitPoolSource,
  date: string,
  options: LimitLadderOptions = {},
): Promise<StockLimitLadder> {
  const now = options.now ?? nowSeconds()
  if (parseYmd(date) === null) throw new AppError('日期格式无效', { status: 400 })

  const today = formatTimestamp(now, 'YYYY-MM-DD')
  if (date > today) throw new AppError('不能查看未来日期', { status: 400 })

  // 当天 09:30 之前：没有临时数据可看，也不该发请求或写库。
  if (date === today && isBeforeOpen(date, now)) {
    return emptyLadder(date, now, 'preopen')
  }

  const closed = isClosed(date, today, now)
  const cached = getLimitDay(db, date)
  const cacheUsable = cached !== null && closed

  let entries: StockLimitEntry[]
  let fetchedAt: number
  let stale = false
  let fromCache = false

  if (!options.refresh && cacheUsable && cached) {
    entries = readCached(db, cached, date)
    fetchedAt = cached.fetchedAt
    fromCache = true
  } else {
    try {
      entries = await source.fetchDay(date)
    } catch (error) {
      // 有缓存就退回缓存（页面照常可用），没有才把错误抛给界面。
      if (cacheUsable && cached) {
        return attachBrokenPct(
          await finish(db, source, date, readCached(db, cached, date), {
            now,
            fetchedAt: cached.fetchedAt,
            temporary: false,
            fromCache: true,
            stale: true,
          }),
          options.quotes,
          today,
        )
      }
      throw error
    }

    fetchedAt = now

    if (closed) {
      if (entries.length === 0 && cached?.status === 'ok') {
        // 刷新反而没数据：保留已有的，不拿空结果覆盖。
        entries = readCached(db, cached, date)
        fetchedAt = cached.fetchedAt
        fromCache = true
        stale = true
      } else if (entries.length === 0 && isBeyondRetention(date, today)) {
        return unavailable(date, now)
      } else {
        saveLimitDay(db, date, entries, now)
      }
    }
    // 盘中：只渲染，不写库（temporary 天然为 true）
  }

  return attachBrokenPct(
    await finish(db, source, date, entries, {
      now,
      fetchedAt,
      temporary: !closed,
      fromCache,
      stale,
    }),
    options.quotes,
    today,
  )
}
