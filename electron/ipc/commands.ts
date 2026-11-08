import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { join } from 'node:path'

import { app, clipboard, dialog, session, shell } from 'electron'

import type { CommandName } from '../../shared/commands'
import { AppError, workspaceNotOpened } from '../../shared/errors'
import { CLOSE_BEHAVIORS, type CloseBehavior } from '../../shared/domain/consts'
import { DEVTOOLS_STATE_CHANGED, WORKSPACE_CHANGED } from '../../shared/events'
import { addRecentWorkspace, resolveBackupDir } from '../../shared/domain/backup'
import type { ConfigStore } from '../config'
import type { FeatureFlags, ProxySetting } from '../../shared/types/config'
import { closeWorkspace, currentWorkspace, openWorkspace } from '../db'
import type { Db } from '../db/driver'
import { MIGRATIONS } from '../db/migrate'
import { logInfo, logWarn } from '../logging'
import { assetUrl, normalizeAssetRequestPath } from '../shell/asset-path'
import { exportLadderPage } from '../services/ladder-export'
import { backupDirProblem, createBackupService } from '../services/backup'
import { setFeatureIn } from '../services/config'
import * as categoryService from '../services/category'
import * as tagService from '../services/tag'
import * as transactionService from '../services/transaction-record'
import * as chartService from '../services/chart'
import * as diaryService from '../services/diary'
import * as keyEventService from '../services/key-event'
import * as todoService from '../services/todo'
import * as stockAccount from '../services/stock-account'
import {
  getOverview,
  listPositions,
  updatePositionReview,
  updatePositionTag,
} from '../services/stock-positions'
import { TencentStockQuoteFetcher } from '../services/stock-quote'
import { EastmoneyLimitPoolSource } from '../services/stock-limit-pool'
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
import {
  createTemplateDto,
  deleteTemplate,
  listTemplateDtos,
  updateTemplateSortOrder,
} from '../services/transaction-template'
import { listStockTrades } from '../services/stock-trades'
import {
  removeWorkspaceIcon,
  resolveAsset,
  saveWorkspaceIcon,
  workspaceIconRelative,
} from '../services/assets'
import { encodeJpeg } from '../services/image-codec'
import { prepareEventImage } from '../services/image-import'
import { UpdaterService } from '../services/updater'
import { applyProxy, appFetch } from '../shell/net'
import { priceYuanToMilli } from '../../shared/domain/money'
import { nowSeconds, todayYmd } from '../../shared/domain/time'
import {
  createStatisticsFilter,
  normalizeRecent,
  parseStrategyWire,
  withStrategy,
  type StatisticsFilter,
} from '../../shared/domain/statistics'
import type { RoundFee } from '../../shared/domain/models'
import type {
  ChartPieQueryRequest,
  ChartQueryRequest,
  TransactionRecordDto,
  TrQueryCondition,
} from '../../shared/types/transaction'
import type { CreateChartRequest, UpdateChartRequest } from '../../shared/types/chart'
import {
  createLedger,
  deleteLedgerById,
  listAllLedgers,
  modifyLedger,
  queryLedgerById,
} from '../services/ledger'
import { openDirectory, openFile } from '../shell/dialogs'
import {
  applyAppearance,
  getMainWindow,
  notifyQuitReady,
  quitApp,
  registerWindowControl,
} from '../shell/window'
import { sendEvent } from './events'
import { pickEnvProxy, validatedProxySetting } from '../../shared/domain/proxy'

export type Handler = (request: unknown) => unknown | Promise<unknown>
export type HandlerMap = Record<CommandName, Handler>

const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const updater = new UpdaterService({
  fetchImpl: (input, init) => appFetch(input, init as RequestInit),
  releaseApi: process.env.TRANSACTIONS_TEST_RELEASE_API,
  tempDir: process.env.TRANSACTIONS_TEST_UPDATE_DIR,
  onEvent: (event, snapshot) => sendEvent(event, snapshot),
  // 装完更新后同样是"退出"：走同一条收尾流程，窗口位置与工作空间都要落盘。
  quit: () => quitApp(),
})

function createQuoteFetcher(): TencentStockQuoteFetcher {
  const testBase = process.env.TRANSACTIONS_TEST_QUOTE_SOURCE
  return new TencentStockQuoteFetcher({
    fetchImpl: (url, signal) => appFetch(url, { signal }),
    ...(testBase ? { baseUrl: testBase } : {}),
    // 夹具服务器没有 GBK 编码器：要测中文名称时由测试指定 UTF-8 回包。
    ...(process.env.TRANSACTIONS_TEST_QUOTE_CHARSET === 'utf-8'
      ? { charset: 'utf-8' as const }
      : {}),
  })
}

/** 涨停池数据源：地址与代理都走注入的 fetch（测试可用环境变量指到本地服务）。 */
function createLimitPoolSource(): EastmoneyLimitPoolSource {
  const testBase = process.env.TRANSACTIONS_TEST_LIMIT_SOURCE
  return new EastmoneyLimitPoolSource({
    fetchImpl: (url, init) => appFetch(url, init),
    ...(testBase ? { baseUrl: testBase } : {}),
  })
}

/** 天梯的当前时间：测试环境可用 `TRANSACTIONS_TEST_LADDER_NOW` 钉住"盘中/收盘后"。 */
function limitNowSeconds(): number {
  const raw = process.env.TRANSACTIONS_TEST_LADDER_NOW
  if (raw) {
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) return Math.trunc(parsed)
  }
  return nowSeconds()
}

export interface HandlerOptions {
  config: ConfigStore
}

function asObject(request: unknown): Record<string, unknown> {
  return typeof request === 'object' && request !== null ? (request as Record<string, unknown>) : {}
}

/** QueryNumber 语义：数字/数字字符串 → 整数；空串或非数字 → null。 */
function queryNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : null
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null
  }
  return null
}

function workspaceDb(): Db {
  const workspace = currentWorkspace()
  if (!workspace) throw workspaceNotOpened()
  return workspace.db
}

/**
 * 恢复之后的「重启」。
 *
 * `TRANSACTIONS_TEST_RESTART=exit` 时只退出：E2E 自己再起一个进程，避免真的多开。
 */
function restartApp(): void {
  if (process.env.TRANSACTIONS_TEST_RESTART === 'exit') {
    quitApp()
    return
  }
  app.relaunch()
  quitApp()
}

/** 在资源管理器里打开一个目录；`shell.openPath` 用空串表示成功。 */
async function openDirectoryInShell(directory: string): Promise<void> {
  const failure = await shell.openPath(directory)
  if (failure) throw new AppError(failure, { status: 500 })
}

export function createHandlers(options: HandlerOptions): HandlerMap {
  const backup = createBackupService({
    workspace: currentWorkspace,
    backupDir: () => options.config.backupDir(),
    autoBackupEnabled: () => options.config.get().autoBackup,
    supportedSchemaVersion: MIGRATIONS[MIGRATIONS.length - 1].version,
    closeWorkspace,
    restart: restartApp,
    now: () => new Date(),
    log: logWarn,
  })

  return {
    app_info(request) {
      const field = String(asObject(request).field ?? '')
      switch (field) {
        case 'name':
          return app.getName()
        case 'version':
          return app.getVersion()
        case 'isDev':
          return String(!app.isPackaged)
        default:
          throw new AppError(`未知的 app_info 字段: ${field}`, { status: 400 })
      }
    },

    async update_check() {
      return updater.check(app.getVersion())
    },

    async update_download(request) {
      const raw = asObject(request)
      return updater.download(String(raw.url ?? ''), String(raw.digest ?? ''))
    },

    update_download_status() {
      return updater.snapshot()
    },

    update_cancel() {
      return updater.cancel()
    },

    update_install() {
      return updater.install()
    },

    config_get() {
      return options.config.snapshot()
    },

    config_file_path() {
      return options.config.path
    },

    workspace_get() {
      return options.config.get().workspaceDir
    },

    workspace_open(request) {
      const raw = asObject(request)
      const workspaceDir = String(raw.workspaceDir ?? '').trim()
      if (!workspaceDir) {
        throw new AppError('工作目录路径不能为空', { status: 400 })
      }

      const workspace = openWorkspace(workspaceDir, { mustExist: raw.mustExist === true })
      options.config.update((config) => {
        config.workspaceDir = workspace.directory
        // 最近工作空间：最新的在前、去重、最多 5 条（成功打开时才写）
        config.recentWorkspaces = addRecentWorkspace(
          config.recentWorkspaces,
          workspace.directory,
        )
      })
      // 每天第一次打开时的自动备份：失败只记日志，绝不能挡住「打开工作空间」
      try {
        const entry = backup.autoBackupIfNeeded()
        if (entry) logInfo(`自动备份完成: ${entry.name}`)
      } catch (error) {
        logWarn(`自动备份失败: ${error instanceof Error ? error.message : String(error)}`)
      }
      logInfo(`工作空间已打开: ${workspace.directory}`)
      sendEvent(WORKSPACE_CHANGED, workspace.directory)
      return null
    },

    asset_url(request) {
      const relativePath = normalizeAssetRequestPath(String(asObject(request).filePath ?? ''))
      if (!relativePath) {
        throw new AppError('非法资产路径', { status: 400 })
      }
      return assetUrl(relativePath)
    },

    async dialog_open(request) {
      const raw = asObject(request)
      return openDirectory({
        title: typeof raw.title === 'string' ? raw.title : undefined,
        defaultPath: typeof raw.defaultPath === 'string' ? raw.defaultPath : undefined,
      })
    },

    window_control(request) {
      const action = String(asObject(request).action ?? '')
      if (action !== 'minimize' && action !== 'maximize' && action !== 'close') {
        throw new AppError(`未知的窗口动作: ${action}`, { status: 400 })
      }
      registerWindowControl(action)
      return null
    },

    app_quit_ready() {
      notifyQuitReady()
      return null
    },

    clipboard_write_text(request) {
      const text = String(asObject(request).text ?? '')
      if (!text) throw new AppError('剪贴板内容为空', { status: 400 })
      clipboard.writeText(text)
      return null
    },

    debug_write_asset() {
      if (app.isPackaged) {
        throw new AppError('该命令只在开发构建可用', { status: 403 })
      }
      const workspace = currentWorkspace()
      if (!workspace) throw workspaceNotOpened()

      const relativePath = 'key_events/2026-01-01/m0.png'
      const directory = join(workspace.directory, 'data', 'assets', 'key_events', '2026-01-01')
      mkdirSync(directory, { recursive: true })
      writeFileSync(join(directory, 'm0.png'), Buffer.from(PNG_1X1, 'base64'))
      return relativePath
    },

    debug_echo(request) {
      return String(asObject(request).message ?? '')
    },

    ledger_list(request) {
      const id = String(asObject(request).id ?? '')
      if (!id) {
        throw new AppError('missing required query parameter: id', { status: 400 })
      }
      const db = workspaceDb()
      if (id === 'all') return listAllLedgers(db)
      return id.split(',').map((raw) => {
        const ledgerId = raw.trim()
        try {
          return queryLedgerById(db, ledgerId)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          throw new AppError(`查询账本 ${ledgerId} 失败: ${message}`, { status: 500 })
        }
      })
    },

    ledger_create(request) {
      const raw = asObject(request)
      if (typeof raw.name !== 'string') {
        throw new AppError('name在请求体中不存在', { status: 400 })
      }
      const description = typeof raw.description === 'string' ? raw.description : ''
      return createLedger(workspaceDb(), raw.name, description)
    },

    ledger_get(request) {
      const id = String(asObject(request).id ?? '')
      if (!id) throw new AppError('missing ledger id', { status: 400 })
      return queryLedgerById(workspaceDb(), id)
    },

    ledger_update(request) {
      const raw = asObject(request)
      const id = String(raw.id ?? '')
      if (!id) throw new AppError('missing ledger id', { status: 400 })
      if (typeof raw.name !== 'string') {
        throw new AppError('name在请求体中不存在', { status: 400 })
      }
      const description = typeof raw.description === 'string' ? raw.description : ''
      modifyLedger(workspaceDb(), id, raw.name, description)
      return null
    },

    ledger_delete(request) {
      const id = String(asObject(request).id ?? '')
      if (!id) throw new AppError('missing ledger id', { status: 400 })
      deleteLedgerById(workspaceDb(), id)
      return null
    },

    config_set_close_behavior(request) {
      const behavior = String(asObject(request).behavior ?? '')
      if (!CLOSE_BEHAVIORS.includes(behavior as CloseBehavior)) {
        throw new AppError('无效的关闭行为', { status: 400 })
      }
      options.config.update((config) => {
        config.closeBehavior = behavior
      })
      return null
    },

    config_set_appearance(request) {
      const appearance = String(asObject(request).appearance ?? '')
      if (appearance !== 'light' && appearance !== 'dark' && appearance !== 'system') {
        throw new AppError('无效的外观设置', { status: 400 })
      }
      options.config.update((config) => {
        config.appearance = appearance
      })
      applyAppearance(appearance)
      return null
    },

    config_set_feature(request) {
      const raw = asObject(request)
      const feature = String(raw.feature ?? '')
      const enabled = raw.enabled === true
      const ledgerId = typeof raw.ledgerId === 'string' ? raw.ledgerId : ''
      return options.config.update((config) =>
        setFeatureIn(config, ledgerId, feature, enabled),
      ) as FeatureFlags
    },

    config_set_key_event_linked_open(request) {
      const open = asObject(request).open === true
      return options.config.update((config) => {
        config.keyEventLinkedOpen = open
        return config.keyEventLinkedOpen
      })
    },

    config_set_sidebar_collapsed(request) {
      const collapsed = asObject(request).collapsed === true
      return options.config.update((config) => {
        config.sidebarCollapsed = collapsed
        return config.sidebarCollapsed
      })
    },

    config_set_chart_summary_collapsed(request) {
      const collapsed = asObject(request).collapsed === true
      return options.config.update((config) => {
        config.chartSummaryCollapsed = collapsed
        return config.chartSummaryCollapsed
      })
    },

    config_set_proxy(request) {
      const raw = asObject(request)
      const setting = validatedProxySetting(
        String(raw.mode ?? ''),
        String(raw.url ?? ''),
      ) as ProxySetting
      options.config.update((config) => {
        config.proxy = setting
      })
      void applyProxy(setting)
      return setting
    },

    category_list(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledgerId ?? '')
      if (!ledgerId) return []
      const transactionType = String(raw.type ?? raw.transactionType ?? '')
      const db = workspaceDb()
      const categories = categoryService.queryCategory(db, ledgerId, transactionType)
      const counts = categoryService.countRecordsByCategories(
        db,
        ledgerId,
        categories.map((category) => category.name),
      )
      return categories.map((category) => ({
        ...category,
        recordCount: counts[category.name] ?? 0,
      }))
    },

    category_create(request) {
      const raw = asObject(request)
      categoryService.createCategory(
        workspaceDb(),
        String(raw.ledgerId ?? ''),
        String(raw.name ?? ''),
        String(raw.transactionType ?? ''),
      )
      return null
    },

    category_delete(request) {
      const raw = asObject(request)
      const name = String(raw.name ?? '')
      const transactionType = String(raw.type ?? raw.transactionType ?? '')
      const ledgerId = String(raw.ledgerId ?? '')
      if (!name || !transactionType || !ledgerId) {
        throw new AppError('missing required parameters', { status: 400 })
      }
      categoryService.deleteCategory(workspaceDb(), ledgerId, name, transactionType)
      return null
    },

    category_update_sort(request) {
      const raw = asObject(request)
      categoryService.updateCategorySort(
        workspaceDb(),
        String(raw.ledgerId ?? ''),
        String(raw.name ?? ''),
        String(raw.transactionType ?? ''),
        Number(raw.sortOrder ?? 0),
      )
      return null
    },

    category_initialize(request) {
      const ledgerId = String(asObject(request).ledgerId ?? '')
      if (!ledgerId) throw new AppError('缺少 ledgerId 参数', { status: 400 })
      const [categories, tags] = categoryService.initializeCategories(workspaceDb(), ledgerId)
      return { categories, tags }
    },

    tag_list(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledgerId ?? '')
      if (!ledgerId) return []
      const categoryTransactionType = String(raw.categoryTransactionType ?? '')
      const db = workspaceDb()
      const tags = tagService.queryTags(db, ledgerId, categoryTransactionType)
      const counts = tagService.countRecordsByTags(
        db,
        ledgerId,
        tags.map((tag) => tag.name),
      )
      return tags.map((tag) => ({ ...tag, recordCount: counts[tag.name] ?? 0 }))
    },

    tag_create(request) {
      const raw = asObject(request)
      tagService.createTag(
        workspaceDb(),
        String(raw.ledgerId ?? ''),
        String(raw.name ?? ''),
        String(raw.categoryTransactionType ?? ''),
      )
      return null
    },

    tag_delete(request) {
      const raw = asObject(request)
      const name = String(raw.name ?? '')
      const categoryTransactionType = String(raw.categoryTransactionType ?? '')
      const ledgerId = String(raw.ledgerId ?? '')
      if (!name || !categoryTransactionType || !ledgerId) {
        throw new AppError('missing required parameters', { status: 400 })
      }
      tagService.deleteTag(workspaceDb(), ledgerId, name, categoryTransactionType)
      return null
    },

    tag_update_sort(request) {
      const raw = asObject(request)
      tagService.updateTagSort(
        workspaceDb(),
        String(raw.ledgerId ?? ''),
        String(raw.name ?? ''),
        String(raw.categoryTransactionType ?? ''),
        Number(raw.sortOrder ?? 0),
      )
      return null
    },

    tr_query(request) {
      return transactionService.queryTrsOnCondition(workspaceDb(), request as TrQueryCondition)
    },

    tr_chart_data(request) {
      return transactionService.queryTrsForChart(workspaceDb(), request as ChartQueryRequest)
    },

    tr_chart_pie_data(request) {
      return transactionService.queryTrsForPieChart(
        workspaceDb(),
        request as ChartPieQueryRequest,
      )
    },

    tr_create(request) {
      return transactionService.createTr(workspaceDb(), request as TransactionRecordDto)
    },

    tr_batch_create(request) {
      const dtos = request as TransactionRecordDto[]
      dtos.forEach((dto, index) => {
        try {
          transactionService.validateTransactionDto(dto)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          throw new AppError(`record ${index + 1}: ${message}`, { status: 400 })
        }
      })
      return transactionService.batchCreateTr(workspaceDb(), dtos)
    },

    tr_delete(request) {
      const id = String(asObject(request).id ?? '')
      if (!id) throw new AppError('missing transaction id', { status: 400 })
      transactionService.deleteTrById(workspaceDb(), id)
      return null
    },

    tr_link(request) {
      const raw = asObject(request)
      const transactionId = String(raw.transaction_id ?? '')
      const date = String(raw.date ?? '')
      if (!transactionId || !date) {
        throw new AppError('transaction_id and date are required', { status: 400 })
      }
      transactionService.linkToKeyEvent(workspaceDb(), transactionId, date)
      return date
    },

    tr_unlink(request) {
      const transactionId = String(asObject(request).transaction_id ?? '')
      if (!transactionId) {
        throw new AppError('transaction_id is required', { status: 400 })
      }
      transactionService.unlinkFromKeyEvent(workspaceDb(), transactionId)
      return transactionId
    },

    tr_linked_by_date(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      const date = String(raw.date ?? '')
      if (!date) throw new AppError('date is required', { status: 400 })
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return transactionService.queryLinkedByDate(workspaceDb(), ledgerId, date)
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

    diary_list_dates(request) {
      const ledgerId = String(asObject(request).ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return diaryService.listDates(workspaceDb(), ledgerId)
    },

    diary_get(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      const date = String(raw.date ?? '')
      if (!date) throw new AppError('missing date parameter', { status: 400 })
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return diaryService.getByDate(workspaceDb(), ledgerId, date)
    },

    diary_upsert(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      const date = String(raw.date ?? '')
      if (!date) throw new AppError('missing date parameter', { status: 400 })
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return diaryService.upsert(
        workspaceDb(),
        ledgerId,
        date,
        typeof raw.content === 'string' ? raw.content : '',
        typeof raw.mood === 'string' ? raw.mood : '',
      )
    },

    diary_delete(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      const date = String(raw.date ?? '')
      if (!date) throw new AppError('missing date parameter', { status: 400 })
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      diaryService.deleteByDate(workspaceDb(), ledgerId, date)
      return null
    },

    diary_import_scan(request) {
      const directory = String(asObject(request).directory ?? '')
      if (!directory) throw new AppError('directory is required', { status: 400 })
      return diaryService.scanDirectory(directory)
    },

    diary_import_file(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      const path = String(raw.path ?? '')
      const date = String(raw.date ?? '')
      if (!date) throw new AppError('missing date parameter', { status: 400 })
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return diaryService.importFile(workspaceDb(), ledgerId, path, date)
    },

    diary_export(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      const directory = String(raw.directory ?? '')
      if (!directory) throw new AppError('directory is required', { status: 400 })
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      const year = typeof raw.year === 'number' ? raw.year : 0
      const month = typeof raw.month === 'number' ? raw.month : 0
      if (!(year >= 0 && month >= 0 && month <= 12 && !(year === 0 && month !== 0))) {
        throw new AppError('invalid year/month range', { status: 400 })
      }
      return diaryService.exportToDirectory(workspaceDb(), ledgerId, directory, year, month)
    },

    key_event_list_by_year(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      const year = String(raw.year ?? '')
      if (!year) throw new AppError('missing year parameter', { status: 400 })
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return keyEventService.queryKeyEventsByYear(workspaceDb(), ledgerId, year)
    },

    key_event_dates_by_year(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      const year = String(raw.year ?? '')
      if (!year) throw new AppError('missing year parameter', { status: 400 })
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return keyEventService.queryDatesByYear(workspaceDb(), ledgerId, year)
    },

    key_event_get(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      const date = String(raw.date ?? '')
      if (!date) throw new AppError('missing date parameter', { status: 400 })
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return keyEventService.queryKeyEventByDate(workspaceDb(), ledgerId, date)
    },

    key_event_upsert(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      const date = String(raw.date ?? '')
      keyEventService.upsertKeyEvent(
        workspaceDb(),
        ledgerId,
        date,
        typeof raw.title === 'string' ? raw.title : '',
        typeof raw.content === 'string' ? raw.content : '',
        typeof raw.color === 'string' ? raw.color : '',
      )
      return date
    },

    key_event_delete(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      const date = String(raw.date ?? '')
      if (!date) throw new AppError('missing date parameter', { status: 400 })
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      const workspace = currentWorkspace()
      if (!workspace) throw workspaceNotOpened()
      keyEventService.deleteKeyEventByDate(workspace.db, workspace.directory, ledgerId, date)
      return null
    },

    key_event_images_list(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      const date = String(raw.date ?? '')
      if (!date) throw new AppError('missing date parameter', { status: 400 })
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return keyEventService.listImages(workspaceDb(), ledgerId, date)
    },

    async key_event_image_add(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      const date = String(raw.date ?? '')
      const data = typeof raw.data === 'string' ? raw.data : ''
      const thumb = typeof raw.thumb === 'string' ? raw.thumb : ''
      const motion = typeof raw.motion === 'string' ? raw.motion : ''
      if (!date) throw new AppError('missing date parameter', { status: 400 })
      if (!data) throw new AppError('invalid image data', { status: 400 })
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      const workspace = currentWorkspace()
      if (!workspace) throw workspaceNotOpened()
      // HEIC 在这里转码（Chromium 解码不了），实况视频同一笔记在同一行记录上。
      const files = await prepareEventImage(
        {
          dataUri: data,
          thumbDataUri: thumb || undefined,
          motionDataUri: motion || undefined,
        },
        { encodeJpeg },
      )
      return keyEventService.addImage(workspace.db, workspace.directory, ledgerId, date, files)
    },

    key_event_image_delete(request) {
      const id = String(asObject(request).id ?? '')
      if (!id) throw new AppError('missing image id parameter', { status: 400 })
      const workspace = currentWorkspace()
      if (!workspace) throw workspaceNotOpened()
      keyEventService.deleteImage(workspace.db, workspace.directory, id)
      return null
    },

    todo_cards(request) {
      const ledgerId = String(asObject(request).ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return todoService.listCards(workspaceDb(), ledgerId)
    },

    todo_history(request) {
      const ledgerId = String(asObject(request).ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return todoService.listHistory(workspaceDb(), ledgerId)
    },

    todo_card_create(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return todoService.createCard(
        workspaceDb(),
        ledgerId,
        typeof raw.title === 'string' ? raw.title : '',
      )
    },

    todo_card_delete(request) {
      const id = String(asObject(request).id ?? '')
      if (!id) throw new AppError('id is required', { status: 400 })
      todoService.deleteCard(workspaceDb(), id)
      return null
    },

    todo_card_sort(request) {
      const raw = asObject(request)
      const id = String(raw.id ?? '')
      if (!id) throw new AppError('id is required', { status: 400 })
      todoService.updateCardSort(workspaceDb(), id, Number(raw.sort_order ?? 0))
      return null
    },

    todo_item_create(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return todoService.createItem(
        workspaceDb(),
        ledgerId,
        String(raw.card_id ?? ''),
        typeof raw.title === 'string' ? raw.title : '',
        typeof raw.start_date === 'string' ? raw.start_date : '',
        typeof raw.due_date === 'string' ? raw.due_date : '',
        Number(raw.urgency ?? 0),
        Number(raw.importance ?? 0),
      )
    },

    todo_item_update(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return todoService.updateItem(
        workspaceDb(),
        ledgerId,
        String(raw.id ?? ''),
        typeof raw.title === 'string' ? raw.title : '',
        typeof raw.start_date === 'string' ? raw.start_date : '',
        typeof raw.due_date === 'string' ? raw.due_date : '',
        Number(raw.urgency ?? 0),
        Number(raw.importance ?? 0),
      )
    },

    todo_item_status(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return todoService.setItemStatus(
        workspaceDb(),
        ledgerId,
        String(raw.id ?? ''),
        typeof raw.status === 'string' ? raw.status : '',
      )
    },

    todo_item_delete(request) {
      const id = String(asObject(request).id ?? '')
      if (!id) throw new AppError('id is required', { status: 400 })
      todoService.deleteItem(workspaceDb(), id)
      return null
    },

    todo_progress_add(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return todoService.addProgress(
        workspaceDb(),
        ledgerId,
        String(raw.item_id ?? ''),
        typeof raw.content === 'string' ? raw.content : '',
      )
    },

    todo_progress_delete(request) {
      const id = String(asObject(request).id ?? '')
      if (!id) throw new AppError('id is required', { status: 400 })
      todoService.deleteProgress(workspaceDb(), id)
      return null
    },

    todo_progress_done(request) {
      const raw = asObject(request)
      const id = String(raw.id ?? '')
      if (!id) throw new AppError('id is required', { status: 400 })
      todoService.setProgressDone(workspaceDb(), id, raw.done === true)
      return null
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

    template_create(request) {
      const raw = asObject(request)
      return createTemplateDto(workspaceDb(), {
        templateId: String(raw.template_id ?? ''),
        ledgerId: String(raw.ledger_id ?? ''),
        templateName: String(raw.template_name ?? ''),
        transactionType: String(raw.transaction_type ?? ''),
        category: String(raw.category ?? ''),
        tags: Array.isArray(raw.tags) ? raw.tags.map((tag) => String(tag)) : [],
        flags: String(raw.flags ?? ''),
        description: String(raw.description ?? ''),
        sortOrder: Number(raw.sort_order ?? 0),
      })
    },

    template_list(request) {
      const ledgerId = String(asObject(request).ledger_id ?? '')
      if (!ledgerId) throw new AppError('missing ledgerId', { status: 400 })
      return listTemplateDtos(workspaceDb(), ledgerId)
    },

    template_delete(request) {
      const raw = asObject(request)
      const templateId = String(raw.id ?? raw.templateId ?? '')
      if (!templateId) throw new AppError('missing template id', { status: 400 })
      deleteTemplate(workspaceDb(), templateId)
      return null
    },

    template_update_sort(request) {
      const raw = asObject(request)
      const templateId = String(raw.id ?? '')
      if (!templateId) throw new AppError('missing template id', { status: 400 })
      updateTemplateSortOrder(workspaceDb(), templateId, Number(raw.sortOrder ?? 0))
      return null
    },

    stock_trades(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      const stockCode = String(raw.stock_code ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return listStockTrades(workspaceDb(), ledgerId, stockCode)
    },

    workspace_set(request) {
      const workspaceDir = String(asObject(request).workspaceDir ?? '')
      options.config.update((config) => {
        config.workspaceDir = workspaceDir
      })
      return null
    },

    workspace_icon_get() {
      const workspace = currentWorkspace()
      return workspace ? workspaceIconRelative(workspace.directory) : ''
    },

    workspace_icon_set(request) {
      const workspace = currentWorkspace()
      if (!workspace) throw workspaceNotOpened()
      const data = String(asObject(request).data ?? '')
      if (!data.trim()) {
        removeWorkspaceIcon(workspace.directory)
        return ''
      }
      return saveWorkspaceIcon(workspace.directory, data)
    },

    // 数据安全底座：备份 / 恢复 / 最近工作空间（设置 → 数据）。
    // 纯逻辑在 shared/domain/backup，磁盘动作在 services/backup（不 import electron）。
    backup_create() {
      return backup.createManual()
    },

    backup_list() {
      return backup.list()
    },

    backup_restore(request) {
      return backup.restore(String(asObject(request).path ?? ''))
    },

    async workspace_open_dir(request) {
      const target = String(asObject(request).target ?? '')
      if (target === 'workspace') {
        const workspace = currentWorkspace()
        if (!workspace) throw workspaceNotOpened()
        await openDirectoryInShell(workspace.directory)
        return null
      }
      if (target === 'backup') {
        const directory = options.config.backupDir()
        // 「打开备份目录」在还没备份过时也要能点开：先建出来
        mkdirSync(directory, { recursive: true })
        await openDirectoryInShell(directory)
        return null
      }
      throw new AppError(`未知的目录目标: ${target}`, { status: 400 })
    },

    backup_dir_set(request) {
      const requested = String(asObject(request).dir ?? '').trim()
      const resolved = resolveBackupDir(requested, options.config.documentsDir)
      const workspace = currentWorkspace()
      if (workspace) {
        // 不合格时既不写配置也不建目录：设置里能存下的位置，备份时就必须能写
        const problem = backupDirProblem(resolved, workspace.directory)
        if (problem) throw new AppError(problem, { status: 400 })
      }
      options.config.update((config) => {
        config.backupDir = requested
      })
      mkdirSync(resolved, { recursive: true })
      return options.config.snapshot()
    },

    config_set_auto_backup(request) {
      const enabled = asObject(request).enabled === true
      options.config.update((config) => {
        config.autoBackup = enabled
      })
      return options.config.snapshot()
    },

    dialog_open_file(request) {
      const raw = asObject(request)
      return openFile({
        title: typeof raw.title === 'string' ? raw.title : undefined,
        defaultPath: typeof raw.defaultPath === 'string' ? raw.defaultPath : undefined,
        extensions: Array.isArray(raw.extensions)
          ? raw.extensions.map((extension) => String(extension))
          : undefined,
      })
    },

    async proxy_resolve(request) {
      const raw = asObject(request)
      const setting = validatedProxySetting(
        String(raw.mode ?? ''),
        String(raw.url ?? ''),
      ) as ProxySetting
      const testAddress = process.env.TRANSACTIONS_TEST_PROXY_ADDRESS
      if (testAddress) return { url: testAddress }
      const saved = options.config.snapshot().proxy
      let resolved = ''
      try {
        await applyProxy(setting)
        try {
          resolved = await session.defaultSession.resolveProxy('https://api.github.com')
        } catch (error) {
          logWarn(`解析代理地址失败: ${error instanceof Error ? error.message : String(error)}`)
        }
      } finally {
        await applyProxy(saved)
      }
      if (!resolved) {
        // 系统解析不可用时，至少把环境变量里的代理显示出来，别让界面停在“未探测到”
        resolved = pickEnvProxy((key) => process.env[key] ?? null) ?? ''
      }
      if (!resolved) return { url: '直连' }
      const first = resolved.split(';')[0]?.trim() ?? ''
      const url = first.startsWith('PROXY ')
        ? first.slice('PROXY '.length)
        : first === 'DIRECT'
          ? '直连'
          : first
      return { url }
    },

    async proxy_test(request) {
      const raw = asObject(request)
      const setting = validatedProxySetting(
        String(raw.mode ?? ''),
        String(raw.url ?? ''),
      ) as ProxySetting
      const saved = options.config.snapshot().proxy
      const target =
        process.env.TRANSACTIONS_TEST_PROXY_TARGET ?? 'https://api.github.com/zen'
      const started = Date.now()
      let status: number | null = null
      let ok = false
      let message = ''
      try {
        await applyProxy(setting)
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 8000)
        try {
          const response = await appFetch(target, {
            method: 'GET',
            cache: 'no-store',
            signal: controller.signal,
            headers: { 'User-Agent': 'Transactions-proxy-test' },
          })
          status = response.status
          ok = status < 500
          message = ok
            ? `代理连通正常（${Date.now() - started} ms）`
            : `代理已连接，但目标返回 HTTP ${status}`
        } finally {
          clearTimeout(timer)
        }
      } catch (error) {
        message = `代理连接失败：${error instanceof Error ? error.message : String(error)}`
      } finally {
        await applyProxy(saved)
      }
      return {
        ok,
        status,
        latencyMs: Date.now() - started,
        url: setting.url,
        message,
      }
    },

    async file_save_image(request) {
      const workspace = currentWorkspace()
      if (!workspace) throw workspaceNotOpened()
      const relativePath = String(asObject(request).relativePath ?? '')
      const source = resolveAsset(workspace.directory, relativePath)
      const testTarget = process.env.TRANSACTIONS_TEST_SAVE_PATH
      const target = testTarget
        ? { canceled: false, filePath: testTarget }
        : await dialog.showSaveDialog({
            title: '保存图片',
            defaultPath: basename(source),
          })
      if (target.canceled || !target.filePath) return { success: false, canceled: true }
      try {
        copyFileSync(source, target.filePath)
        return { success: true }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },

    devtools_get_state() {
      return getMainWindow()?.webContents.isDevToolsOpened() ?? false
    },

    async devtools_toggle(request) {
      const enabled = asObject(request).enabled === true
      const window = getMainWindow()
      if (!window) return false
      const event = enabled ? 'devtools-opened' : 'devtools-closed'
      const settled = new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 1500)
        window.webContents.once(event as 'devtools-opened', () => {
          clearTimeout(timer)
          resolve()
        })
      })
      if (enabled) window.webContents.openDevTools({ mode: 'detach' })
      else window.webContents.closeDevTools()
      await settled
      const opened = window.webContents.isDevToolsOpened()
      sendEvent(DEVTOOLS_STATE_CHANGED, opened)
      return opened
    },
  }
}







