/**
 * 股票复盘与统计命令：只读台账、统计筛选、日 / 轮复盘与轮标签。
 *
 * 统计筛选的解析在 shared/domain/statistics，本文件只做参数转换与错误包装。
 */
import { AppError } from '../../../shared/errors'
import {
  createStatisticsFilter,
  normalizeRecent,
  parseStrategyWire,
  withStrategy,
  type StatisticsFilter,
} from '../../../shared/domain/statistics'
import { getStockLedger, saveStockLedger } from '../../services/stock-ledger'
import { getStatisticsFor } from '../../services/stock-statistics'
import { updateDayReview, updateRoundReview, updateRoundTag } from '../../services/stock-review'
import type { HandlerMap } from '../commands'
import { asObject, queryNumber, workspaceDb, type HandlerContext } from './context'

export function createStockReviewHandlers(
  _ctx: HandlerContext,
): Pick<
  HandlerMap,
  | 'stock_ledger_get'
  | 'stock_ledger_save'
  | 'stock_statistics'
  | 'stock_day_review'
  | 'stock_round_review'
  | 'stock_round_tag'
> {
  return {
    stock_ledger_get(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return getStockLedger(workspaceDb(), ledgerId, {
        stockCode: raw.stock_code == null ? null : String(raw.stock_code),
        roundId: raw.round_id == null ? null : String(raw.round_id),
      })
    },

    stock_ledger_save(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return saveStockLedger(workspaceDb(), ledgerId, {
        stockCode: raw.stock_code == null ? null : String(raw.stock_code),
        roundId: raw.round_id == null ? null : String(raw.round_id),
        fields: {
          whyBuy: String(raw.why_buy ?? ''),
          stopLoss: String(raw.stop_loss ?? ''),
          takeProfit: String(raw.take_profit ?? ''),
          followedSystem: String(raw.followed_system ?? ''),
          summary: String(raw.summary ?? ''),
        },
      })
    },

    stock_statistics(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      let filter: StatisticsFilter
      try {
        filter = withStrategy(
          createStatisticsFilter(
            String(raw.start_month ?? ''),
            String(raw.end_month ?? ''),
            normalizeRecent(queryNumber(raw.recent)),
            String(raw.tag ?? ''),
          ),
          parseStrategyWire(String(raw.strategy ?? '')),
          queryNumber(raw.group_size),
        )
      } catch (error) {
        throw new AppError(error instanceof Error ? error.message : String(error), { status: 400 })
      }
      return getStatisticsFor(workspaceDb(), ledgerId, filter)
    },

    stock_day_review(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return updateDayReview(
        workspaceDb(),
        ledgerId,
        String(raw.code ?? ''),
        String(raw.date ?? ''),
        String(raw.review ?? ''),
      )
    },

    stock_round_review(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return updateRoundReview(
        workspaceDb(),
        ledgerId,
        String(raw.round_id ?? ''),
        String(raw.review ?? ''),
      )
    },

    stock_round_tag(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return updateRoundTag(
        workspaceDb(),
        ledgerId,
        String(raw.round_id ?? ''),
        String(raw.tag ?? ''),
      )
    },
  }
}
