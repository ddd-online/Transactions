/**
 * 股票持仓类命令：总览、持仓列表、持仓复盘 / 标签、名称查询与刷新。
 *
 * 行情通过 `createQuoteFetcher()` 注入；配置了测试环境变量时会指向本地服务。
 */
import { AppError } from '../../../shared/errors'
import {
  getOverview,
  listPositions,
  updatePositionReview,
  updatePositionTag,
} from '../../services/stock-positions'
import { lookupStockName, refreshStockName } from '../../services/stock-name'
import type { HandlerMap } from '../commands'
import { asObject, createQuoteFetcher, workspaceDb, type HandlerContext } from './context'

export function createStockPositionHandlers(
  _ctx: HandlerContext,
): Pick<
  HandlerMap,
  | 'stock_overview'
  | 'stock_positions'
  | 'stock_position_review'
  | 'stock_position_tag'
  | 'stock_name'
  | 'stock_name_refresh'
> {
  return {
    async stock_overview(request) {
      const ledgerId = String(asObject(request).ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return getOverview(workspaceDb(), ledgerId, createQuoteFetcher())
    },

    async stock_positions(request) {
      const ledgerId = String(asObject(request).ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return listPositions(workspaceDb(), ledgerId, createQuoteFetcher())
    },

    stock_position_review(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      const code = String(raw.code ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return updatePositionReview(workspaceDb(), ledgerId, code, String(raw.review ?? ''))
    },

    stock_position_tag(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      const code = String(raw.code ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return updatePositionTag(workspaceDb(), ledgerId, code, String(raw.tag ?? ''))
    },

    async stock_name(request) {
      const stockCode = String(asObject(request).stock_code ?? '')
      if (!stockCode) throw new AppError('stock_code is required', { status: 400 })
      return lookupStockName(workspaceDb(), createQuoteFetcher(), stockCode)
    },

    async stock_name_refresh(request) {
      const raw = asObject(request)
      return refreshStockName(
        workspaceDb(),
        createQuoteFetcher(),
        String(raw.ledger_id ?? ''),
        String(raw.stock_code ?? ''),
      )
    },
  }
}
