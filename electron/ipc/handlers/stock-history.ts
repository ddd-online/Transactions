/**
 * 股票历史与心得命令：轮次列表 / 单轮详情、统计摘要、心得与轮次选项、单只股票成交。
 */
import { AppError } from '../../../shared/errors'
import {
  getTradeHistoryDetail,
  getTradeHistorySummary,
  listTradeHistories,
} from '../../services/stock-history'
import {
  createLesson,
  listLessons,
  listRoundOptions,
  removeLesson,
  updateLesson,
} from '../../services/stock-lessons'
import { listStockTrades } from '../../services/stock-trades'
import type { HandlerMap } from '../commands'
import { asObject, createQuoteFetcher, workspaceDb, type HandlerContext } from './context'

export function createStockHistoryHandlers(
  _ctx: HandlerContext,
): Pick<
  HandlerMap,
  | 'stock_history'
  | 'stock_history_detail'
  | 'stock_history_summary'
  | 'stock_lesson_list'
  | 'stock_round_options'
  | 'stock_lesson_create'
  | 'stock_lesson_update'
  | 'stock_lesson_delete'
  | 'stock_trades'
> {
  return {
    async stock_history(request) {
      const ledgerId = String(asObject(request).ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return listTradeHistories(workspaceDb(), ledgerId, createQuoteFetcher())
    },

    stock_history_detail(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      const stockCode = String(raw.stock_code ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      if (!stockCode) throw new AppError('stock_code is required', { status: 400 })
      return getTradeHistoryDetail(workspaceDb(), ledgerId, stockCode)
    },

    stock_history_summary(request) {
      const ledgerId = String(asObject(request).ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return getTradeHistorySummary(workspaceDb(), ledgerId)
    },

    stock_lesson_list(request) {
      const ledgerId = String(asObject(request).ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return listLessons(workspaceDb(), ledgerId)
    },

    stock_round_options(request) {
      const ledgerId = String(asObject(request).ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return listRoundOptions(workspaceDb(), ledgerId)
    },

    stock_lesson_create(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return createLesson(
        workspaceDb(),
        ledgerId,
        String(raw.text ?? ''),
        String(raw.round_id ?? '') || null,
      )
    },

    stock_lesson_update(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      const id = String(raw.id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      if (!id) throw new AppError('id is required', { status: 400 })
      return updateLesson(
        workspaceDb(),
        ledgerId,
        id,
        String(raw.text ?? ''),
        String(raw.round_id ?? '') || null,
      )
    },

    stock_lesson_delete(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      const id = String(raw.id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      if (!id) throw new AppError('id is required', { status: 400 })
      removeLesson(workspaceDb(), ledgerId, id)
      return null
    },

    stock_trades(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      const stockCode = String(raw.stock_code ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return listStockTrades(workspaceDb(), ledgerId, stockCode)
    },
  }
}
