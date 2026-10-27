/**
 * 连板天梯的纯计算：把「今日涨停池 + 前一交易日涨停池」整理成
 * 分层天梯、断板分组与汇总指标。
 *
 * 这里不碰数据库、不碰网络，输入输出都是普通对象，单测直接用固定数据断言。
 * 口径：
 * * 层级 = 今日的连板数（东财 `lbc`），首板在左、最高板在右（升序）；
 * * 晋级率 = 今日 N 板家数 ÷ 昨日 (N−1) 板家数；
 * * 断板 = 昨日在池、今日不在池，按**昨日板数**分组降序；
 * * 整体晋级率 = 两日交集 ÷ 昨日涨停家数。
 */

import type {
  StockLimitBrokenGroup,
  StockLimitEntry,
  StockLimitMetrics,
  StockLimitRung,
} from '../types/stock-limit'

/** 一组天梯数据（不含日期、状态这些请求上下文）。 */
export interface LimitLadderData {
  rungs: StockLimitRung[]
  broken: StockLimitBrokenGroup[]
  metrics: StockLimitMetrics
}

/** 占比百分比：`round(part / whole * 10000) / 100`，与统计页同一取整口径。 */
function sharePercent(part: number, whole: number): number {
  if (whole <= 0) return 0
  return Math.round((part / whole) * 10_000) / 100
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
 * 此时晋级率与断板都算不出来，对应字段留 `null`，界面据此降级而不是显示 0。
 */
export function buildLimitLadder(
  today: readonly StockLimitEntry[],
  previous: readonly StockLimitEntry[] | null,
): LimitLadderData {
  const todayCodes = new Set(today.map((entry) => entry.stockCode))
  const previousByLevel = previous ? groupByLevel(previous) : null

  const levels = [...new Set(today.map((entry) => entry.level))].sort((left, right) => left - right)
  const rungs: StockLimitRung[] = levels.map((level) => {
    const entries = today.filter((entry) => entry.level === level).sort(byFirstSeal)
    const candidates =
      previous === null || level <= 1 ? null : (previousByLevel?.get(level - 1)?.length ?? 0)
    return {
      level,
      entries,
      candidates,
      rate: candidates !== null && candidates > 0 ? sharePercent(entries.length, candidates) : null,
    }
  })

  const broken: StockLimitBrokenGroup[] = []
  if (previous !== null) {
    const brokenByLevel = new Map<number, StockLimitEntry[]>()
    for (const entry of previous) {
      if (todayCodes.has(entry.stockCode)) continue
      const bucket = brokenByLevel.get(entry.level)
      if (bucket) bucket.push(entry)
      else brokenByLevel.set(entry.level, [entry])
    }
    for (const level of [...brokenByLevel.keys()].sort((left, right) => right - left)) {
      broken.push({ level, entries: (brokenByLevel.get(level) ?? []).sort(byFirstSeal) })
    }
  }

  const promotedCount =
    previous === null ? null : previous.filter((entry) => todayCodes.has(entry.stockCode)).length
  const brokenCount =
    previous === null ? null : previous.length - (promotedCount ?? 0)

  return {
    rungs,
    broken,
    metrics: {
      limitCount: today.length,
      previousCount: previous === null ? null : previous.length,
      maxLevel: levels.length === 0 ? null : levels[levels.length - 1],
      promotedCount,
      rate:
        promotedCount === null || previous === null || previous.length === 0
          ? null
          : sharePercent(promotedCount, previous.length),
      brokenCount,
    },
  }
}
