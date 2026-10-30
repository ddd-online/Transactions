import { z } from 'zod'

import type { ConfigSnapshot, DialogOpenResponse, FeatureFlags, ProxySetting } from './types/config'
import type { SourceImportProbe, SourceImportReport } from './types/import'
import type { CategoryDto, InitializeCategoriesResponse, TagDto } from './types/category'
import type { ChartDto } from './types/chart'
import type {
  DiaryDateItem,
  DiaryEntry,
  KeyEvent,
  KeyEventImage,
} from './domain/models'
import type { DiaryExportResult, DiaryScanResponse } from './types/diary'
import type {
  StockAccountSummary,
  StockFundRecordPage,
  StockOperationDto,
  StockReviewSettingDto,
  StockTradeTagSettingDto,
} from './types/stock'
import type { StockFeeSetting } from './domain/models'
import type { StockOverviewDto, StockPositionDto, StockDayReviewDto, StockNameDto } from './types/stock-position'
import type {
  StockTradeHistoryDetailDto,
  StockTradeHistoryDto,
  StockTradeHistorySummaryDto,
  StockTradeDto,
} from './types/stock-history'
import type { StockStatisticsDto } from './types/stock-statistics'
import type { StockLessonDto, StockRoundOptionDto } from './types/stock-lesson'
import type { StockLedgerDto } from './types/stock-ledger'
import type { StockLimitLadder } from './types/stock-limit'
import type { TransactionTemplateDto } from './types/template'
import type { FileSaveResponse, ProxyResolveResponse, ProxyTestResponse } from './types/shell'
import type { UpdateInstallResponse, UpdateSnapshot } from './domain/update'
import type {
  StockOperationRollbackDto,
  StockOperationRollbackPreviewDto,
  StockTradeImpactDto,
} from './types/stock-trade-edit'
import type {
  TodoCardDto,
  TodoHistoryDto,
  TodoItemDto,
  TodoProgressDto,
} from './types/todo'
import type {
  ChartQueryResponse,
  TransactionRecordDto,
  TrQueryResult,
} from './types/transaction'
import type { Ledger } from './domain/models'

const queryConditionItemSchema = z.object({
  transactionType: z.string().default(''),
  category: z.string().default(''),
  tags: z.array(z.string()).default([]),
  tagPolicy: z.string().default(''),
  tagNot: z.boolean().default(false),
  description: z.string().default(''),
})

const transactionRecordDtoSchema = z.object({
  ledgerId: z.string().default(''),
  transactionId: z.string().default(''),
  price: z.number().default(0),
  transactionType: z.string().default(''),
  category: z.string().default(''),
  description: z.string().default(''),
  tags: z.array(z.string()).default([]),
  transactionAt: z.number().default(0),
  outlier: z.boolean().default(false),
  keyEventDate: z.string().default(''),
})

const trQueryConditionSchema = z.object({
  ledgerId: z.string().default(''),
  offset: z.number().default(-1),
  limit: z.number().default(-1),
  tsRange: z.array(z.number()).default([]),
  items: z.array(queryConditionItemSchema).default([]),
  sortFields: z.array(z.object({ field: z.string(), order: z.string() })).default([]),
})

const chartLineSchema = z.object({
  label: z.string().default(''),
  transactionType: z.string().default(''),
  includeOutlier: z.boolean().default(false),
  conditions: z.array(queryConditionItemSchema).default([]),
})

const createChartSchema = z.object({
  ledgerId: z.string().default(''),
  title: z.string().default(''),
  granularity: z.string().default('month'),
  lines: z.array(chartLineSchema).default([]),
  chartType: z.string().default('line'),
})

const updateChartSchema = z.object({
  chartId: z.string().default(''),
  title: z.string().default(''),
  granularity: z.string().default('month'),
  lines: z.array(chartLineSchema).default([]),
  chartType: z.string().default('line'),
  sortOrder: z.number().default(0),
})

/**
 * IPC 命令目录：名字 + 请求形状。
 *
 * 请求形状用 zod 在 main 边界解析，响应类型单独映射（`CommandResponses`）。
 */
export const commandSchemas = {
  app_info: z.object({ field: z.enum(['name', 'version', 'isDev']) }),
  config_get: z.undefined(),
  config_file_path: z.undefined(),
  workspace_get: z.undefined(),
  workspace_open: z.object({ workspaceDir: z.string() }),
  asset_url: z.object({ filePath: z.string() }),
  dialog_open: z.object({
    title: z.string().optional(),
    defaultPath: z.string().optional(),
  }),
  window_control: z.object({
    action: z.enum(['minimize', 'maximize', 'close']),
  }),
  /** 把纯文本写进系统剪贴板（股票代码这类要粘到别处的短文本）。 */
  clipboard_write_text: z.object({
    text: z.string().min(1),
  }),
  /** M0 冒烟用：写一张 1×1 PNG 到工作空间资产目录，验证 trasset://。 */
  debug_write_asset: z.undefined(),
  debug_echo: z.object({ message: z.string() }),
  source_import_probe: z.object({ workspaceDir: z.string() }),
  source_import_start: z.object({ sourceDir: z.string(), targetDir: z.string() }),
  ledger_list: z.object({ id: z.string() }),
  ledger_create: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
  }),
  ledger_get: z.object({ id: z.string() }),
  ledger_update: z.object({
    id: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
  }),
  ledger_delete: z.object({ id: z.string() }),
  config_set_close_behavior: z.object({ behavior: z.string() }),
  config_set_appearance: z.object({ appearance: z.string() }),
  config_set_feature: z.object({
    feature: z.string(),
    enabled: z.boolean(),
    ledgerId: z.string().optional(),
  }),
  config_set_key_event_linked_open: z.object({ open: z.boolean() }),
  config_set_sidebar_collapsed: z.object({ collapsed: z.boolean() }),
  config_set_chart_summary_collapsed: z.object({ collapsed: z.boolean() }),
  config_set_proxy: z.object({ mode: z.string(), url: z.string() }),
  category_list: z.object({
    type: z.string().optional(),
    transactionType: z.string().optional(),
    ledgerId: z.string(),
  }),
  category_create: z.object({
    ledgerId: z.string(),
    name: z.string(),
    transactionType: z.string(),
    sortOrder: z.number().optional(),
  }),
  category_delete: z.object({
    name: z.string(),
    type: z.string().optional(),
    transactionType: z.string().optional(),
    ledgerId: z.string(),
  }),
  category_update_sort: z.object({
    ledgerId: z.string(),
    name: z.string(),
    transactionType: z.string(),
    sortOrder: z.number(),
  }),
  category_initialize: z.object({ ledgerId: z.string() }),
  tag_list: z.object({ categoryTransactionType: z.string(), ledgerId: z.string() }),
  tag_create: z.object({
    ledgerId: z.string(),
    name: z.string(),
    categoryTransactionType: z.string(),
    sortOrder: z.number().optional(),
  }),
  tag_delete: z.object({
    name: z.string(),
    categoryTransactionType: z.string(),
    ledgerId: z.string(),
  }),
  tag_update_sort: z.object({
    ledgerId: z.string(),
    name: z.string(),
    categoryTransactionType: z.string(),
    sortOrder: z.number(),
  }),
  tr_query: trQueryConditionSchema,
  tr_chart_data: z.object({
    ledgerId: z.string().default(''),
    tsRange: z.array(z.number()).default([]),
    granularity: z.string().default('month'),
    lines: z.array(chartLineSchema).default([]),
  }),
  tr_create: transactionRecordDtoSchema,
  tr_batch_create: z.array(transactionRecordDtoSchema),
  tr_delete: z.object({ id: z.string() }),
  tr_link: z.object({ transaction_id: z.string(), date: z.string() }),
  tr_unlink: z.object({ transaction_id: z.string() }),
  tr_linked_by_date: z.object({ ledger_id: z.string(), date: z.string() }),
  chart_create: createChartSchema,
  chart_delete: z.object({
    chartId: z.string().optional(),
    id: z.string().optional(),
  }),
  chart_list: z.object({ ledgerId: z.string() }),
  chart_update: updateChartSchema,
  chart_update_sort: z.object({ chartId: z.string(), sortOrder: z.number() }),
  diary_list_dates: z.object({ ledger_id: z.string() }),
  diary_get: z.object({ ledger_id: z.string(), date: z.string() }),
  diary_upsert: z.object({
    ledger_id: z.string(),
    date: z.string(),
    content: z.string().nullable().optional(),
    mood: z.string().nullable().optional(),
  }),
  diary_delete: z.object({ ledger_id: z.string(), date: z.string() }),
  diary_import_scan: z.object({ directory: z.string() }),
  diary_import_file: z.object({
    ledger_id: z.string(),
    path: z.string(),
    date: z.string(),
  }),
  diary_export: z.object({
    ledger_id: z.string(),
    directory: z.string(),
    year: z.number().nullable().optional(),
    month: z.number().nullable().optional(),
  }),
  key_event_list_by_year: z.object({ ledger_id: z.string(), year: z.string() }),
  key_event_dates_by_year: z.object({ ledger_id: z.string(), year: z.string() }),
  key_event_get: z.object({ ledger_id: z.string(), date: z.string() }),
  key_event_upsert: z.object({
    ledger_id: z.string(),
    date: z.string(),
    title: z.string().nullable().optional(),
    content: z.string().nullable().optional(),
    color: z.string().nullable().optional(),
  }),
  key_event_delete: z.object({ ledger_id: z.string(), date: z.string() }),
  key_event_images_list: z.object({ ledger_id: z.string(), date: z.string() }),
  key_event_image_add: z.object({
    ledger_id: z.string(),
    date: z.string(),
    data: z.string().nullable().optional(),
    thumb: z.string().nullable().optional(),
  }),
  key_event_image_delete: z.object({ id: z.string() }),
  todo_cards: z.object({ ledger_id: z.string() }),
  todo_history: z.object({ ledger_id: z.string() }),
  todo_card_create: z.object({ ledger_id: z.string(), title: z.string().nullable().optional() }),
  todo_card_delete: z.object({ id: z.string() }),
  todo_card_sort: z.object({ id: z.string(), sort_order: z.number().nullable().optional() }),
  todo_item_create: z.object({
    ledger_id: z.string(),
    card_id: z.string(),
    title: z.string().nullable().optional(),
    start_date: z.string().nullable().optional(),
    due_date: z.string().nullable().optional(),
    urgency: z.number().nullable().optional(),
    importance: z.number().nullable().optional(),
  }),
  todo_item_update: z.object({
    ledger_id: z.string(),
    id: z.string(),
    title: z.string().nullable().optional(),
    start_date: z.string().nullable().optional(),
    due_date: z.string().nullable().optional(),
    urgency: z.number().nullable().optional(),
    importance: z.number().nullable().optional(),
  }),
  todo_item_status: z.object({
    ledger_id: z.string(),
    id: z.string(),
    status: z.string().nullable().optional(),
  }),
  todo_item_delete: z.object({ id: z.string() }),
  todo_progress_add: z.object({
    ledger_id: z.string(),
    item_id: z.string(),
    content: z.string().nullable().optional(),
  }),
  todo_progress_delete: z.object({ id: z.string() }),
  todo_progress_done: z.object({ id: z.string(), done: z.boolean().nullable().optional() }),
  stock_account_summary: z.object({ ledger_id: z.string() }),
  stock_principal_add: z.object({
    ledger_id: z.string(),
    amount: z.number().nullable().optional(),
    date: z.string().default(''),
  }),
  stock_interest_add: z.object({
    ledger_id: z.string(),
    amount: z.number().nullable().optional(),
    date: z.string().default(''),
  }),
  stock_withdraw: z.object({
    ledger_id: z.string(),
    amount: z.number().nullable().optional(),
    date: z.string().default(''),
  }),
  stock_fee_settings_get: z.object({ ledger_id: z.string() }),
  stock_fee_settings_put: z.object({
    ledger_id: z.string(),
    commission_rate: z.number().nullable().optional(),
    min_commission: z.number().nullable().optional(),
    stamp_duty_rate: z.number().nullable().optional(),
    transfer_fee_rate: z.number().nullable().optional(),
  }),
  stock_tag_settings_get: z.object({ ledger_id: z.string() }),
  stock_tag_settings_put: z.object({
    ledger_id: z.string().optional(),
    ledgerId: z.string().optional(),
    tags: z.array(z.string()).default([]),
  }),
  stock_review_template_get: z.object({ ledger_id: z.string() }),
  stock_review_template_put: z.object({
    ledger_id: z.string().optional(),
    ledgerId: z.string().optional(),
    template: z.string().default(''),
    daily_template: z.string().optional(),
  }),
  stock_fund_records: z.object({
    ledger_id: z.string(),
    page: z.number().nullable().optional(),
    page_size: z.number().nullable().optional(),
    pageSize: z.number().nullable().optional(),
  }),
  stock_operation_list: z.object({ ledger_id: z.string() }),
  stock_overview: z.object({ ledger_id: z.string() }),
  stock_positions: z.object({ ledger_id: z.string() }),
  stock_position_review: z.object({
    ledger_id: z.string(),
    code: z.string(),
    review: z.string().default(''),
  }),
  stock_position_tag: z.object({
    ledger_id: z.string(),
    code: z.string(),
    tag: z.string().default(''),
  }),
  stock_history: z.object({ ledger_id: z.string() }),
  stock_history_detail: z.object({ ledger_id: z.string(), stock_code: z.string() }),
  stock_history_summary: z.object({ ledger_id: z.string() }),
  stock_lesson_list: z.object({ ledger_id: z.string() }),
  stock_round_options: z.object({ ledger_id: z.string() }),
  stock_lesson_create: z.object({
    ledger_id: z.string(),
    text: z.string().default(''),
    round_id: z.string().nullable().optional(),
  }),
  stock_lesson_update: z.object({
    ledger_id: z.string(),
    id: z.string(),
    text: z.string().default(''),
    round_id: z.string().nullable().optional(),
  }),
  stock_lesson_delete: z.object({ ledger_id: z.string(), id: z.string() }),
  stock_ledger_get: z.object({
    ledger_id: z.string(),
    stock_code: z.string().nullable().optional(),
    round_id: z.string().nullable().optional(),
  }),
  stock_ledger_save: z.object({
    ledger_id: z.string(),
    stock_code: z.string().nullable().optional(),
    round_id: z.string().nullable().optional(),
    why_buy: z.string().default(''),
    stop_loss: z.string().default(''),
    take_profit: z.string().default(''),
    followed_system: z.string().default(''),
    summary: z.string().default(''),
  }),
  stock_statistics: z.object({
    ledger_id: z.string(),
    start_month: z.string().default(''),
    end_month: z.string().default(''),
    recent: z.union([z.number(), z.string()]).nullable().optional(),
    tag: z.string().default(''),
    strategy: z.string().nullable().optional(),
    group_size: z.union([z.number(), z.string()]).nullable().optional(),
  }),
  stock_trade_create: z.object({
    ledger_id: z.string(),
    stock_code: z.string().default(''),
    stock_name: z.string().default(''),
    trade_type: z.string().default(''),
    trade_time: z.number().default(0),
    remark: z.string().default(''),
    tag: z.string().default(''),
    fills: z.array(z.object({ price: z.number(), lots: z.number() })).default([]),
    price: z.number().default(0),
    lots: z.number().default(0),
    round_fee: z
      .object({
        commission_rate: z.number(),
        min_commission: z.number().default(0),
        stamp_duty_rate: z.number().default(0),
        transfer_fee_rate: z.number().default(0),
      })
      .nullable()
      .optional(),
  }),
  stock_reset: z.object({ ledger_id: z.string() }),
  stock_archive: z.object({ ledger_id: z.string(), name: z.string().default('') }),
  stock_trade_update: z.object({
    ledger_id: z.string(),
    id: z.string(),
    price: z.number().default(0),
    lots: z.number().default(0),
    trade_time: z.number().default(0),
  }),
  stock_trade_order_delete: z.object({
    ledger_id: z.string(),
    order_id: z.string().default(''),
  }),
  stock_trade_impact: z.object({
    ledger_id: z.string(),
    action: z.string().default(''),
    trade_id: z.string().default(''),
    order_id: z.string().default(''),
    price: z.number().default(0),
    lots: z.number().default(0),
    trade_time: z.number().default(0),
  }),
  stock_operation_preview: z.object({ ledger_id: z.string() }),
  stock_operation_rollback: z.object({ ledger_id: z.string() }),
  update_check: z.object({}),
  update_download: z.object({
    url: z.string(),
    digest: z.string().nullable().optional(),
  }),
  update_download_status: z.object({}),
  update_cancel: z.object({}),
  update_install: z.object({}),
  stock_day_review: z.object({
    ledger_id: z.string(),
    code: z.string(),
    date: z.string(),
    review: z.string().default(''),
  }),
  stock_round_review: z.object({
    ledger_id: z.string(),
    round_id: z.string(),
    review: z.string().default(''),
  }),
  stock_round_tag: z.object({
    ledger_id: z.string(),
    round_id: z.string(),
    tag: z.string().default(''),
  }),
  stock_name: z.object({ stock_code: z.string() }),
  stock_limit_ladder: z.object({
    date: z.string().default(''),
    refresh: z.boolean().default(false),
  }),
  stock_trades: z.object({ ledger_id: z.string(), stock_code: z.string() }),
  template_create: z.object({
    template_id: z.string().default(''),
    ledger_id: z.string().default(''),
    template_name: z.string().default(''),
    transaction_type: z.string().default(''),
    category: z.string().default(''),
    tags: z.array(z.string()).default([]),
    flags: z.string().default(''),
    description: z.string().default(''),
    sort_order: z.number().default(0),
  }),
  template_list: z.object({ ledger_id: z.string() }),
  template_delete: z.object({
    id: z.string().optional(),
    templateId: z.string().optional(),
  }),
  template_update_sort: z.object({
    id: z.string(),
    ledger_id: z.string().default(''),
    ledgerId: z.string().optional(),
    sortOrder: z.number().default(0),
  }),
  workspace_set: z.object({ workspaceDir: z.string() }),
  workspace_icon_get: z.object({}),
  workspace_icon_set: z.object({ data: z.string().default('') }),
  proxy_test: z.object({ mode: z.string(), url: z.string().default('') }),
  proxy_resolve: z.object({ mode: z.string(), url: z.string().default('') }),
  file_save_image: z.object({ relativePath: z.string() }),
  devtools_get_state: z.object({}),
  devtools_toggle: z.object({ enabled: z.boolean() }),
} as const

export type CommandName = keyof typeof commandSchemas

export type CommandReq<N extends CommandName> = z.infer<(typeof commandSchemas)[N]>

export interface CommandResponses {
  app_info: string
  config_get: ConfigSnapshot
  config_file_path: string
  workspace_get: string
  workspace_open: null
  asset_url: string
  dialog_open: DialogOpenResponse
  window_control: null
  clipboard_write_text: null
  debug_write_asset: string
  debug_echo: string
  source_import_probe: SourceImportProbe
  source_import_start: SourceImportReport
  ledger_list: Ledger[]
  ledger_create: string
  ledger_get: Ledger
  ledger_update: null
  ledger_delete: null
  config_set_close_behavior: null
  config_set_appearance: null
  config_set_feature: FeatureFlags
  config_set_key_event_linked_open: boolean
  config_set_sidebar_collapsed: boolean
  config_set_chart_summary_collapsed: boolean
  config_set_proxy: ProxySetting
  category_list: CategoryDto[]
  category_create: null
  category_delete: null
  category_update_sort: null
  category_initialize: InitializeCategoriesResponse
  tag_list: TagDto[]
  tag_create: null
  tag_delete: null
  tag_update_sort: null
  tr_query: TrQueryResult
  tr_chart_data: ChartQueryResponse
  tr_create: string
  tr_batch_create: number
  tr_delete: null
  tr_link: string
  tr_unlink: string
  tr_linked_by_date: TransactionRecordDto[]
  chart_create: ChartDto
  chart_delete: null
  chart_list: ChartDto[]
  chart_update: ChartDto
  chart_update_sort: null
  diary_list_dates: DiaryDateItem[]
  diary_get: DiaryEntry
  diary_upsert: DiaryEntry
  diary_delete: null
  diary_import_scan: DiaryScanResponse
  diary_import_file: DiaryEntry
  diary_export: DiaryExportResult
  key_event_list_by_year: KeyEvent[]
  key_event_dates_by_year: string[]
  key_event_get: KeyEvent
  key_event_upsert: string
  key_event_delete: null
  key_event_images_list: KeyEventImage[]
  key_event_image_add: KeyEventImage
  key_event_image_delete: null
  todo_cards: TodoCardDto[]
  todo_history: TodoHistoryDto[]
  todo_card_create: TodoCardDto
  todo_card_delete: null
  todo_card_sort: null
  todo_item_create: TodoItemDto
  todo_item_update: TodoItemDto
  todo_item_status: TodoItemDto
  todo_item_delete: null
  todo_progress_add: TodoProgressDto
  todo_progress_delete: null
  todo_progress_done: null
  stock_account_summary: StockAccountSummary
  stock_principal_add: StockAccountSummary
  stock_interest_add: StockAccountSummary
  stock_withdraw: StockAccountSummary
  stock_fee_settings_get: StockFeeSetting
  stock_fee_settings_put: StockFeeSetting
  stock_tag_settings_get: StockTradeTagSettingDto
  stock_tag_settings_put: StockTradeTagSettingDto
  stock_review_template_get: StockReviewSettingDto
  stock_review_template_put: StockReviewSettingDto
  stock_fund_records: StockFundRecordPage
  stock_operation_list: StockOperationDto[]
  stock_overview: StockOverviewDto
  stock_positions: StockPositionDto[]
  stock_position_review: StockPositionDto
  stock_position_tag: StockPositionDto
  stock_history: StockTradeHistoryDto[]
  stock_history_detail: StockTradeHistoryDetailDto
  stock_history_summary: StockTradeHistorySummaryDto
  stock_lesson_list: StockLessonDto[]
  stock_round_options: StockRoundOptionDto[]
  stock_lesson_create: StockLessonDto
  stock_lesson_update: StockLessonDto
  stock_lesson_delete: null
  stock_ledger_get: StockLedgerDto
  stock_ledger_save: StockLedgerDto
  stock_statistics: StockStatisticsDto
  stock_trade_create: StockTradeDto[]
  stock_reset: boolean
  stock_archive: string
  stock_trade_update: StockTradeDto
  stock_trade_order_delete: null
  stock_trade_impact: StockTradeImpactDto
  stock_operation_preview: StockOperationRollbackPreviewDto
  stock_operation_rollback: StockOperationRollbackDto
  update_check: UpdateSnapshot
  update_download: UpdateSnapshot
  update_download_status: UpdateSnapshot
  update_cancel: UpdateSnapshot
  update_install: UpdateInstallResponse
  stock_day_review: StockDayReviewDto[]
  stock_round_review: StockTradeHistoryDetailDto
  stock_round_tag: StockTradeHistoryDetailDto
  stock_name: StockNameDto
  stock_limit_ladder: StockLimitLadder
  stock_trades: StockTradeDto[]
  template_create: string
  template_list: TransactionTemplateDto[]
  template_delete: null
  template_update_sort: null
  workspace_set: null
  workspace_icon_get: string
  workspace_icon_set: string
  proxy_test: ProxyTestResponse
  proxy_resolve: ProxyResolveResponse
  file_save_image: FileSaveResponse
  devtools_get_state: boolean
  devtools_toggle: boolean
}

export type CommandRes<N extends CommandName> = CommandResponses[N]

export const COMMAND_NAMES = Object.keys(commandSchemas) as CommandName[]

