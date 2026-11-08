import { app, shell } from 'electron'

import type { CommandName } from '../../shared/commands'
import { AppError } from '../../shared/errors'
import type { ConfigStore } from '../config'
import { logInfo } from '../logging'
import { exportLadderPage } from '../services/ladder-export'
import * as stockAccount from '../services/stock-account'
import {
  getOverview,
  listPositions,
  updatePositionReview,
  updatePositionTag,
} from '../services/stock-positions'
import { getLimitLadder } from '../services/stock-limit'
import {
  getTradeHistoryDetail,
  getTradeHistorySummary,
  listTradeHistories,
} from '../services/stock-history'
import {
  createLesson,
  listLessons,
  listRoundOptions,
  removeLesson,
  updateLesson,
} from '../services/stock-lessons'
import { getStockLedger, saveStockLedger } from '../services/stock-ledger'
import { getStatisticsFor } from '../services/stock-statistics'
import { createTradeOrderWithRoundFee } from '../services/stock-trade-write'
import { archiveStockData, resetStockData } from '../services/stock-lifecycle'
import {
  deleteTradeOrder,
  previewRollback,
  previewTradeChange,
  rollbackLatest,
  updateTradeFill,
} from '../services/stock-trade-edit'
import { updateDayReview, updateRoundReview, updateRoundTag } from '../services/stock-review'
import { lookupStockName, refreshStockName } from '../services/stock-name'
import { listStockTrades } from '../services/stock-trades'
import { priceYuanToMilli } from '../../shared/domain/money'
import { todayYmd } from '../../shared/domain/time'
import {
  createStatisticsFilter,
  normalizeRecent,
  parseStrategyWire,
  withStrategy,
  type StatisticsFilter,
} from '../../shared/domain/statistics'
import type { RoundFee } from '../../shared/domain/models'
import { createChartHandlers } from './handlers/charts'
import {
  asObject,
  createHandlerContext,
  createLimitPoolSource,
  createQuoteFetcher,
  limitNowSeconds,
  queryNumber,
  workspaceDb,
} from './handlers/context'
import { createDiaryHandlers } from './handlers/diary'
import { createEventHandlers } from './handlers/events'
import { createLabelHandlers } from './handlers/labels'
import { createRecordHandlers } from './handlers/records'
import { createTodoHandlers } from './handlers/todo'
import { createSettingsHandlers } from './handlers/settings'
import { createShellHandlers } from './handlers/shell'

export type Handler = (request: unknown) => unknown | Promise<unknown>
export type HandlerMap = Record<CommandName, Handler>

export interface HandlerOptions {
  config: ConfigStore
}

export function createHandlers(options: HandlerOptions): HandlerMap {
  const ctx = createHandlerContext(options.config)

  return {
    ...createShellHandlers(ctx),
    ...createSettingsHandlers(ctx),
    ...createChartHandlers(ctx),
    ...createRecordHandlers(ctx),
    ...createLabelHandlers(ctx),
    ...createEventHandlers(ctx),
    ...createDiaryHandlers(ctx),
    ...createTodoHandlers(ctx),
    async update_check() {
      return ctx.updater.check(app.getVersion())
    },

    async update_download(request) {
      const raw = asObject(request)
      return ctx.updater.download(String(raw.url ?? ''), String(raw.digest ?? ''))
    },

    update_download_status() {
      return ctx.updater.snapshot()
    },

    update_cancel() {
      return ctx.updater.cancel()
    },

    update_install() {
      return ctx.updater.install()
    },

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

    async stock_history(request) {
      const ledgerId = String(asObject(request).ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return listTradeHistories(workspaceDb(), ledgerId, createQuoteFetcher())
    },

    async stock_limit_ladder(request) {
      const raw = asObject(request)
      const date = String(raw.date ?? '') || todayYmd()
      return getLimitLadder(workspaceDb(), createLimitPoolSource(), date, {
        refresh: raw.refresh === true,
        now: limitNowSeconds(),
        quotes: createQuoteFetcher(),
      })
    },

    /**
     * 把渲染层生成的天梯单页写到临时目录，再交给系统浏览器打开。
     *
     * 文件名由主进程按日期生成（不接受调用方给路径）：这条命令只做「一张当天网页」，
     * 不是通用的文件写入。字体在这里内嵌，页面离开这台机器也还是这套字。
     */
    async stock_ladder_open_page(request) {
      const raw = asObject(request)
      // 写文件 + 内嵌字体 + 交给浏览器都在 ladder-export 里；这里只做 adapter。
      const file = await exportLadderPage(
        { date: String(raw.date ?? ''), html: String(raw.html ?? '') },
        { tempDirectory: app.getPath('temp'), openPath: (target) => shell.openPath(target) },
      )
      logInfo(`天梯以网页打开: ${file}`)
      return file
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

    stock_trades(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      const stockCode = String(raw.stock_code ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return listStockTrades(workspaceDb(), ledgerId, stockCode)
    },

    // 数据安全底座：备份 / 恢复 / 最近工作空间（设置 → 数据）。
    // 纯逻辑在 shared/domain/backup，磁盘动作在 services/backup（不 import electron）。
  }
}







