/**
 * 股票账户类命令：资金 / 利息 / 出金、费率、交易标签、复盘模板、资金与操作记录。
 *
 * 这些命令只读写账户设置与流水，不碰行情，所以不需要行情数据源。
 */
import { AppError } from '../../../shared/errors'
import type { RoundFee } from '../../../shared/domain/models'
import * as stockAccount from '../../services/stock-account'
import type { HandlerMap } from '../commands'
import { asObject, workspaceDb, type HandlerContext } from './context'

export function createStockAccountHandlers(
  _ctx: HandlerContext,
): Pick<
  HandlerMap,
  | 'stock_account_summary'
  | 'stock_principal_add'
  | 'stock_interest_add'
  | 'stock_withdraw'
  | 'stock_fee_settings_get'
  | 'stock_fee_settings_put'
  | 'stock_tag_settings_get'
  | 'stock_tag_settings_put'
  | 'stock_review_template_get'
  | 'stock_review_template_put'
  | 'stock_fund_records'
  | 'stock_operation_list'
> {
  return {
    stock_account_summary(request) {
      const ledgerId = String(asObject(request).ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return stockAccount.getAccountSummary(workspaceDb(), ledgerId)
    },

    stock_principal_add(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      if (typeof raw.amount !== 'number') throw new AppError('amount is required', { status: 400 })
      return stockAccount.addPrincipalAtDate(
        workspaceDb(),
        ledgerId,
        raw.amount,
        String(raw.date ?? ''),
      )
    },

    stock_interest_add(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      if (typeof raw.amount !== 'number') throw new AppError('amount is required', { status: 400 })
      return stockAccount.addInterestAtDate(
        workspaceDb(),
        ledgerId,
        raw.amount,
        String(raw.date ?? ''),
      )
    },

    stock_withdraw(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      if (typeof raw.amount !== 'number') throw new AppError('amount is required', { status: 400 })
      return stockAccount.withdrawAtDate(
        workspaceDb(),
        ledgerId,
        raw.amount,
        String(raw.date ?? ''),
      )
    },

    stock_fee_settings_get(request) {
      const ledgerId = String(asObject(request).ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return stockAccount.getOrCreateFeeSetting(workspaceDb(), ledgerId)
    },

    stock_fee_settings_put(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      if (typeof raw.commission_rate !== 'number') {
        throw new AppError('commission_rate is required', { status: 400 })
      }
      const fee: RoundFee = {
        commissionRate: raw.commission_rate,
        minCommission: Number(raw.min_commission ?? 0),
        stampDutyRate: Number(raw.stamp_duty_rate ?? 0),
        transferFeeRate: Number(raw.transfer_fee_rate ?? 0),
      }
      return stockAccount.saveFeeSettings(workspaceDb(), ledgerId, fee)
    },

    stock_tag_settings_get(request) {
      const ledgerId = String(asObject(request).ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return stockAccount.getTradeTagsDto(workspaceDb(), ledgerId)
    },

    stock_tag_settings_put(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? raw.ledgerId ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      const tags = Array.isArray(raw.tags) ? raw.tags.map((tag) => String(tag)) : []
      return stockAccount.saveTradeTags(workspaceDb(), ledgerId, tags)
    },

    stock_review_template_get(request) {
      const ledgerId = String(asObject(request).ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      const db = workspaceDb()
      return {
        template: stockAccount.getReviewTemplate(db, ledgerId),
        dailyTemplate: stockAccount.getDailyReviewTemplate(db, ledgerId),
      }
    },

    stock_review_template_put(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? raw.ledgerId ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      const db = workspaceDb()
      const template = stockAccount.saveReviewTemplate(db, ledgerId, String(raw.template ?? ''))
      const dailyTemplate =
        raw.daily_template === undefined
          ? stockAccount.getDailyReviewTemplate(db, ledgerId)
          : stockAccount.saveDailyReviewTemplate(db, ledgerId, String(raw.daily_template))
      return { template, dailyTemplate }
    },

    stock_fund_records(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return stockAccount.listFundRecords(
        workspaceDb(),
        ledgerId,
        Number(raw.page ?? 1),
        Number(raw.page_size ?? raw.pageSize ?? 10),
      )
    },

    stock_operation_list(request) {
      const ledgerId = String(asObject(request).ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return stockAccount.listOperations(workspaceDb(), ledgerId)
    },
  }
}
