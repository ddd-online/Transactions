/**
 * 图表命令：自建图表的增删改查，以及图表页用的记账数据聚合。
 *
 * `tr_chart_data` / `tr_chart_pie_data` 虽然挂在 `tr_` 前缀下，但唯一的调用方是图表页，
 * 数据形状也是图表响应（ChartQueryResponse / ChartPieResponse），所以归到这里。
 */
import { AppError } from '../../../shared/errors'
import type { CreateChartRequest, UpdateChartRequest } from '../../../shared/types/chart'
import type {
  ChartPieQueryRequest,
  ChartQueryRequest,
} from '../../../shared/types/transaction'
import * as chartService from '../../services/chart'
import * as transactionService from '../../services/transaction-record'
import type { HandlerMap } from '../commands'
import { asObject, workspaceDb, type HandlerContext } from './context'

export function createChartHandlers(
  _ctx: HandlerContext,
): Pick<
  HandlerMap,
  | 'tr_chart_data'
  | 'tr_chart_pie_data'
  | 'chart_create'
  | 'chart_delete'
  | 'chart_list'
  | 'chart_update'
  | 'chart_update_sort'
> {
  return {
    tr_chart_data(request) {
      return transactionService.queryTrsForChart(workspaceDb(), request as ChartQueryRequest)
    },

    tr_chart_pie_data(request) {
      return transactionService.queryTrsForPieChart(
        workspaceDb(),
        request as ChartPieQueryRequest,
      )
    },

    chart_create(request) {
      return chartService.createChart(workspaceDb(), request as CreateChartRequest)
    },

    chart_delete(request) {
      const raw = asObject(request)
      const chartId = String(raw.chartId ?? raw.id ?? '')
      if (!chartId) throw new AppError('missing chart id', { status: 400 })
      chartService.deleteChartById(workspaceDb(), chartId)
      return null
    },

    chart_list(request) {
      const ledgerId = String(asObject(request).ledgerId ?? '')
      if (!ledgerId) throw new AppError('missing ledgerId', { status: 400 })
      return chartService.listChartsByLedgerId(workspaceDb(), ledgerId)
    },

    chart_update(request) {
      return chartService.updateChart(workspaceDb(), request as UpdateChartRequest)
    },

    chart_update_sort(request) {
      const raw = asObject(request)
      const chartId = String(raw.chartId ?? '')
      if (!chartId) throw new AppError('missing chart id', { status: 400 })
      chartService.updateChartSortOrder(workspaceDb(), chartId, Number(raw.sortOrder ?? 0))
      return null
    },
  }
}
