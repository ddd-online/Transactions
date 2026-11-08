/**
 * 股票交易命令：委托 / 成交写入、成交修改、委托删除、影响预览、重置 / 归档与回退。
 *
 * 费用算法只走 shared/domain 与 stock-trade-write，这里只负责请求解析。
 */
import { AppError } from '../../../shared/errors'
import { priceYuanToMilli } from '../../../shared/domain/money'
import type { RoundFee } from '../../../shared/domain/models'
import { createTradeOrderWithRoundFee } from '../../services/stock-trade-write'
import { archiveStockData, resetStockData } from '../../services/stock-lifecycle'
import {
  deleteTradeOrder,
  previewRollback,
  previewTradeChange,
  rollbackLatest,
  updateTradeFill,
} from '../../services/stock-trade-edit'
import type { HandlerMap } from '../commands'
import { asObject, workspaceDb, type HandlerContext } from './context'

export function createStockTradeHandlers(
  _ctx: HandlerContext,
): Pick<
  HandlerMap,
  | 'stock_trade_create'
  | 'stock_reset'
  | 'stock_archive'
  | 'stock_trade_update'
  | 'stock_trade_order_delete'
  | 'stock_trade_impact'
  | 'stock_operation_preview'
  | 'stock_operation_rollback'
> {
  return {
    stock_trade_create(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      const stockCode = String(raw.stock_code ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      if (!stockCode) throw new AppError('stock_code is required', { status: 400 })

      const rawFills = Array.isArray(raw.fills) ? raw.fills : []
      const fills = (
        rawFills.length > 0
          ? rawFills
          : [{ price: Number(raw.price ?? 0), lots: Number(raw.lots ?? 0) }]
      ).map((fill) => {
        const item = asObject(fill)
        return {
          priceMilli: priceYuanToMilli(Number(item.price ?? 0)),
          lots: Math.trunc(Number(item.lots ?? 0)),
        }
      })

      let roundFee: RoundFee | undefined = undefined
      if (typeof raw.round_fee === 'object' && raw.round_fee !== null) {
        const fee = asObject(raw.round_fee)
        roundFee = {
          commissionRate: Number(fee.commission_rate ?? 0),
          minCommission: Math.trunc(Number(fee.min_commission ?? 0)),
          stampDutyRate: Number(fee.stamp_duty_rate ?? 0),
          transferFeeRate: Number(fee.transfer_fee_rate ?? 0),
        }
      }

      return createTradeOrderWithRoundFee(workspaceDb(), {
        ledgerId,
        stockCode,
        stockName: String(raw.stock_name ?? ''),
        tradeType: String(raw.trade_type ?? ''),
        fills,
        tradeTime: Math.trunc(Number(raw.trade_time ?? 0)),
        remark: String(raw.remark ?? ''),
        tag: String(raw.tag ?? ''),
        roundFee,
      })
    },

    stock_reset(request) {
      const ledgerId = String(asObject(request).ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      resetStockData(workspaceDb(), ledgerId)
      return true
    },

    stock_archive(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      const name = String(raw.name ?? '').trim()
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      if (!name) throw new AppError('请输入账本名称', { status: 400 })
      return archiveStockData(workspaceDb(), ledgerId, name)
    },

    stock_trade_update(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      const tradeId = String(raw.id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return updateTradeFill(workspaceDb(), {
        ledgerId,
        tradeId,
        priceMilli: priceYuanToMilli(Number(raw.price ?? 0)),
        lots: Math.trunc(Number(raw.lots ?? 0)),
        tradeTime: Math.trunc(Number(raw.trade_time ?? 0)),
      })
    },

    stock_trade_order_delete(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      const orderId = String(raw.order_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      deleteTradeOrder(workspaceDb(), { ledgerId, orderId })
      return null
    },

    stock_trade_impact(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return previewTradeChange(workspaceDb(), {
        ledgerId,
        action: String(raw.action ?? ''),
        tradeId: String(raw.trade_id ?? ''),
        orderId: String(raw.order_id ?? ''),
        priceMilli: priceYuanToMilli(Number(raw.price ?? 0)),
        lots: Math.trunc(Number(raw.lots ?? 0)),
        tradeTime: Math.trunc(Number(raw.trade_time ?? 0)),
      })
    },

    stock_operation_preview(request) {
      const ledgerId = String(asObject(request).ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return previewRollback(workspaceDb(), ledgerId)
    },

    stock_operation_rollback(request) {
      const ledgerId = String(asObject(request).ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return rollbackLatest(workspaceDb(), ledgerId)
    },
  }
}
