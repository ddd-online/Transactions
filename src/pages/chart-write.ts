import type { ChartLine } from '../../shared/domain/models'
import type { ChartDto } from '../../shared/types/chart'

/**
 * 图表的整行回写：只换曲线，其余字段照抄这一份。
 *
 * 服务端返回的那一份就是新的图表 —— 调用方直接用它替换列表里的那一行。
 * 「加一条曲线」「删一条曲线」「编辑器里保存」都走这一条，不各写一遍字段清单。
 */
export async function updateChartLines(chart: ChartDto, lines: ChartLine[]): Promise<ChartDto> {
  return window.api.invoke('chart_update', {
    chartId: chart.chartId,
    title: chart.title,
    granularity: chart.granularity,
    lines,
    chartType: chart.chartType,
    groupField: chart.groupField,
    groupTransactionType: chart.groupTransactionType,
    groupCategory: chart.groupCategory,
    sortOrder: chart.sortOrder,
  })
}
