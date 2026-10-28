/**
 * 连板天梯的纯计算：把「今日涨停池 + 前一交易日涨停池」整理成
 * 分层天梯与汇总指标。
 *
 * 这里不碰数据库、不碰网络，输入输出都是普通对象，单测直接用固定数据断言。
 * 口径：
 * * 层级 = 连板数（东财 `lbc`），首板在左、最高板在右（升序）；
 * * 层级取「今日 ∪ 昨日」：昨日 5 板今天全断，5 板这一层也要留下，
 *   断板股票就挂在它昨天所在的那一层、排在今日连板股后面；
 * * 一列里的行按**板块**（涨停池的行业字段）聚在一起，板块内按封板先后；
 * * 晋级率 = 今日 N 板家数 ÷ 昨日 (N−1) 板家数；该层今日无人时就是 0%；
 * * 整体晋级率 = 两日交集 ÷ 昨日涨停家数。
 */

import type {
  StockLimitBrokenEntry,
  StockLimitEntry,
  StockLimitMetrics,
  StockLimitRung,
} from '../types/stock-limit'

/** 一组天梯数据（不含日期、状态这些请求上下文）。 */
export interface LimitLadderData {
  rungs: StockLimitRung[]
  metrics: StockLimitMetrics
}

/** 占比百分比：`round(part / whole * 10000) / 100`，与统计页同一取整口径。 */
function sharePercent(part: number, whole: number): number {
  if (whole <= 0) return 0
  return Math.round((part / whole) * 10_000) / 100
}

/**
 * 一字板：集合竞价（09:25:00）就封死，且全天没炸过板。
 * 只看首次封板时间不够 —— 09:25 封板、10 点开板再回封的票首次时间仍是 09:25。
 */
export const ONE_WORD_SEAL_TIME = 92_500

export function isOneWordBoard(entry: StockLimitEntry): boolean {
  return entry.firstSeal === ONE_WORD_SEAL_TIME && entry.brokenCount === 0
}

/** 层内排序：封板早的在前，同刻按代码稳定排序。 */
function byFirstSeal(left: StockLimitEntry, right: StockLimitEntry): number {
  if (left.firstSeal !== right.firstSeal) return left.firstSeal - right.firstSeal
  return left.stockCode.localeCompare(right.stockCode)
}

function groupByLevel(entries: readonly StockLimitEntry[]): Map<number, StockLimitEntry[]> {
  const grouped = new Map<number, StockLimitEntry[]>()
  for (const entry of entries) {
    const bucket = grouped.get(entry.level)
    if (bucket) bucket.push(entry)
    else grouped.set(entry.level, [entry])
  }
  return grouped
}

/**
 * 组装天梯。
 *
 * `previous` 为 `null` 表示前一交易日缺失（数据源没收录、本地也没缓存）：
 * 此时晋级率算不出来、也没有断板，对应字段留 `null` / 空数组，界面据此降级。
 */
export function buildLimitLadder(
  today: readonly StockLimitEntry[],
  previous: readonly StockLimitEntry[] | null,
): LimitLadderData {
  const todayCodes = new Set(today.map((entry) => entry.stockCode))
  const todayByLevel = groupByLevel(today)
  const previousByLevel = previous ? groupByLevel(previous) : null

  // 断板先按昨日板数归好组：只有真的断了，那一层才需要出现在天梯里。
  // （昨天 5 板今天全部晋级 6 板时，5 板这一层不该留一个空列。）
  const brokenByLevel = new Map<number, StockLimitBrokenEntry[]>()
  if (previousByLevel) {
    for (const [level, entries] of previousByLevel) {
      const broken = entries
        .filter((entry) => !todayCodes.has(entry.stockCode))
        .sort(byFirstSeal)
        // 涨跌幅要问行情，纯函数这里给不出来：先留 null，服务层补上。
        .map((entry): StockLimitBrokenEntry => ({ ...entry, todayPct: null }))
      if (broken.length > 0) brokenByLevel.set(level, broken)
    }
  }

  const levelSet = new Set<number>(todayByLevel.keys())
  for (const level of brokenByLevel.keys()) levelSet.add(level)
  const levels = [...levelSet].sort((left, right) => left - right)

  const rungs: StockLimitRung[] = levels.map((level) => {
    const entries = (todayByLevel.get(level) ?? []).slice().sort(byFirstSeal)
    const candidates =
      previousByLevel === null || level <= 1
        ? null
        : (previousByLevel.get(level - 1)?.length ?? 0)
    return {
      level,
      entries,
      broken: brokenByLevel.get(level) ?? [],
      candidates,
      rate: candidates !== null && candidates > 0 ? sharePercent(entries.length, candidates) : null,
    }
  })

  const promotedCount =
    previous === null ? null : previous.filter((entry) => todayCodes.has(entry.stockCode)).length
  const brokenCount = previous === null ? null : previous.length - (promotedCount ?? 0)

  return {
    rungs,
    metrics: {
      limitCount: today.length,
      previousCount: previous === null ? null : previous.length,
      // 空间板只算今日：昨天的最高板今天断了，就不是今天的空间板。
      maxLevel: todayByLevel.size === 0 ? null : Math.max(...todayByLevel.keys()),
      promotedCount,
      rate:
        promotedCount === null || previous === null || previous.length === 0
          ? null
          : sharePercent(promotedCount, previous.length),
      brokenCount,
    },
  }
}

/** 天梯里的一行；`broken` 为 `true` 表示这是昨日在这一层、今天没涨停的股票。 */
export interface LadderRow {
  entry: StockLimitEntry | StockLimitBrokenEntry
  broken: boolean
}

/**
 * 板块 = 涨停池带过来的行业字段（东财 `hybk`）。
 *
 * 一只股票在东财有行业、概念、地域好几套板块，这里只取涨停池里那一个 ——
 * 它跟涨停数据同源、一起落库，历史日也能还原。空串（老数据没这个字段）留空。
 */
export function boardOf(entry: StockLimitEntry): string {
  return entry.industry.trim()
}

interface BoardGroup {
  board: string
  entries: StockLimitEntry[]
  broken: StockLimitBrokenEntry[]
}

/**
 * 分组排序：有连板的组在前，按**这一组今天最早的封板时间**；只有断板的组整组在后，
 * 按昨日最早封板。没有板块的（缺字段的老数据）当兜底桶，永远排在有名字的板块后面；
 * 其余同刻按板块名稳定排序。
 *
 * 「昨日封板」不能和「今日封板」放在一条线上比大小 —— 一组今天没人晋级时，
 * 它的 09:25 是昨天的 09:25，排到最前面会让人误以为今天最先动的是它。
 */
function compareBoardGroups(left: BoardGroup, right: BoardGroup): number {
  const leftLive = left.entries.length > 0
  const rightLive = right.entries.length > 0
  if (leftLive !== rightLive) return leftLive ? -1 : 1
  if ((left.board === '') !== (right.board === '')) return left.board === '' ? 1 : -1

  const sealOf = (group: BoardGroup): number =>
    Math.min(
      ...(group.entries.length > 0 ? group.entries : group.broken).map((entry) => entry.firstSeal),
    )
  const leftSeal = sealOf(left)
  const rightSeal = sealOf(right)
  if (leftSeal !== rightSeal) return leftSeal - rightSeal

  if (left.board === right.board) return 0
  return left.board < right.board ? -1 : 1
}

/**
 * 一列里从上到下的行序：**先按板块聚在一起**，板块内今日连板在前（按封板先后），
 * 断板跟在同板块的连板后面。界面直接按这个顺序渲染，不再自己拼数组。
 */
export function ladderRows(rung: StockLimitRung): LadderRow[] {
  const groups = new Map<string, BoardGroup>()
  const groupOf = (board: string): BoardGroup => {
    let group = groups.get(board)
    if (!group) {
      group = { board, entries: [], broken: [] }
      groups.set(board, group)
    }
    return group
  }
  for (const entry of rung.entries) groupOf(boardOf(entry)).entries.push(entry)
  for (const entry of rung.broken) groupOf(boardOf(entry)).broken.push(entry)

  return [...groups.values()].sort(compareBoardGroups).flatMap((group) => [
    ...group.entries
      .slice()
      .sort(byFirstSeal)
      .map((entry): LadderRow => ({ entry, broken: false })),
    ...group.broken
      .slice()
      .sort(byFirstSeal)
      .map((entry): LadderRow => ({ entry, broken: true })),
  ])
}
