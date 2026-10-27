/**
 * 连板天梯的纯计算：把「今日涨停池 + 前一交易日涨停池」整理成
 * 分层天梯与汇总指标。
 *
 * 这里不碰数据库、不碰网络，输入输出都是普通对象，单测直接用固定数据断言。
 * 口径：
 * * 层级 = 连板数（东财 `lbc`），首板在左、最高板在右（升序）；
 * * 层级取「今日 ∪ 昨日」：昨日 5 板今天全断，5 板这一层也要留下，
 *   断板股票就挂在它昨天所在的那一层、排在今日连板股后面；
 * * 晋级率 = 今日 N 板家数 ÷ 昨日 (N−1) 板家数；该层今日无人时就是 0%；
 * * 整体晋级率 = 两日交集 ÷ 昨日涨停家数。
 */

import type {
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
  const brokenByLevel = new Map<number, StockLimitEntry[]>()
  if (previousByLevel) {
    for (const [level, entries] of previousByLevel) {
      const broken = entries
        .filter((entry) => !todayCodes.has(entry.stockCode))
        .sort(byFirstSeal)
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
