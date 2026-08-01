import type { TrQueryConditionItem } from '@/types/billadm'

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
 * 后端已完成聚合与补零，前端只做单位换算（分 -> 元）。
 * @param lines - 每条曲线的聚合序列点
 */
export function chartLinePointsToTimeSeries(
  lines: { label: string; type: string; data: { time: string; amount: number }[] }[]
): TimeSeriesData[] {
  if (lines.length === 0) {
    return []
  }
  const result: TimeSeriesData[] = []
  lines.forEach((line) => {
    line.data.forEach((point) => {
      result.push({
        time: point.time,
        type: line.type,
        label: line.label,
        amount: point.amount / 100, // 分 -> 元
      })
    })
  })
  return result
}

