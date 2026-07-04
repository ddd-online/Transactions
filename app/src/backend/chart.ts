import type { TrQueryConditionItem } from '@/types/billadm'
import type { TransactionRecord } from '@/types/billadm'
import dayjs from 'dayjs'

/**
 * 按时间聚合的交易记录数据
 */
export interface TimeSeriesData {
  time: string
  type: string  // 存储transactionType: income/expense/transfer
  label: string  // 图例显示名称
  amount: number
}

/**
 * 图表曲线配置
 */
export interface ChartLine {
  label: string              // 图例显示名称
  transactionType: string   // 交易类型：income/expense/transfer
  includeOutlier: boolean  // 是否包含离群值
  conditions: TrQueryConditionItem[]  // 查询条件
}

/**
 * 图表配置项
 */
export interface ChartConfig {
  title: string
  granularity: 'year' | 'month'
  lines: ChartLine[]
}

/**
 * 根据每条曲线的配置过滤后的交易记录，进行时间聚合
 * @param lineRecords - 每个line对应的过滤后交易记录
 * @param granularity - 时间粒度：year 或 month
 */
export function buildLineChartData(
  lineRecords: { label: string; type: string; items: TransactionRecord[] }[],
  granularity: 'year' | 'month'
): TimeSeriesData[] {
  if (lineRecords.length === 0) {
    return []
  }

  // 收集所有曲线的时间范围
  let minYear = Infinity,
    minMonth = Infinity
  let maxYear = -Infinity,
    maxMonth = -Infinity

  lineRecords.forEach((line) => {
    if (!line.items) return
    line.items.forEach((item) => {
      const date = dayjs(item.transactionAt * 1000)
      const year = date.year()
      const month = date.month() + 1

      if (year < minYear || (year === minYear && month < minMonth)) {
        minYear = year
        minMonth = month
      }
      if (year > maxYear || (year === maxYear && month > maxMonth)) {
        maxYear = year
        maxMonth = month
      }
    })
  })

  // 如果没有数据，使用当前时间范围
  if (minYear === Infinity) {
    const now = dayjs()
    minYear = now.year()
    minMonth = now.month() + 1
    maxYear = minYear
    maxMonth = minMonth
  }

  // 生成完整的时间轴
  const timeLabels: string[] = []
  if (granularity === 'year') {
    for (let y = minYear; y <= maxYear; y++) {
      timeLabels.push(String(y))
    }
  } else {
    let currentYear = minYear
    let currentMonth = minMonth
    while (currentYear < maxYear || (currentYear === maxYear && currentMonth <= maxMonth)) {
      timeLabels.push(`${currentYear}-${String(currentMonth).padStart(2, '0')}`)
      currentMonth++
      if (currentMonth > 12) {
        currentMonth = 1
        currentYear++
      }
    }
  }

  // 初始化时间数据结构
  const timeDataMap = new Map<string, Record<string, number>>()
  timeLabels.forEach((timeLabel) => {
    const initObj: Record<string, number> = {}
    lineRecords.forEach((line) => {
      initObj[line.label] = 0
    })
    timeDataMap.set(timeLabel, initObj)
  })

  // 聚合每条曲线的数据
  lineRecords.forEach((line) => {
    if (!line.items) return
    line.items.forEach((item) => {
      const date = dayjs(item.transactionAt * 1000)
      const timeLabel =
        granularity === 'year'
          ? String(date.year())
          : `${date.year()}-${String(date.month() + 1).padStart(2, '0')}`

      if (timeDataMap.has(timeLabel)) {
        const record = timeDataMap.get(timeLabel)!
        record[line.label] = (record[line.label] ?? 0) + item.price
      }
    })
  })

  // 转换为G2数据格式
  const result: TimeSeriesData[] = []
  timeLabels.forEach((timeLabel) => {
    const record = timeDataMap.get(timeLabel)!
    lineRecords.forEach((line) => {
      result.push({
        time: timeLabel,
        type: line.type,
        label: line.label,
        amount: (record[line.label] ?? 0) / 100, // 转换为元
      })
    })
  })

  return result
}

