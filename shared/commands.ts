import { z } from 'zod'

import type { ConfigSnapshot, DialogOpenResponse, FeatureFlags, ProxySetting } from './types/config'
import type { LegacyImportProbe, LegacyImportReport } from './types/import'
import type { CategoryDto, InitializeCategoriesResponse, TagDto } from './types/category'
import type { ChartDto } from './types/chart'
import type {
  DiaryDateItem,
  DiaryEntry,
} from './domain/models'
import type { DiaryExportResult, DiaryScanResponse } from './types/diary'
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
 * 名字与旧版 0.20.0 的 117 条保持一致；M0 先落最小集合，其余在 M1–M3 补齐。
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
  /** M0 冒烟用：写一张 1×1 PNG 到工作空间资产目录，验证 trasset://。 */
  debug_write_asset: z.undefined(),
  debug_echo: z.object({ message: z.string() }),
  legacy_import_probe: z.object({ workspaceDir: z.string() }),
  legacy_import_start: z.object({ sourceDir: z.string(), targetDir: z.string() }),
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
  debug_write_asset: string
  debug_echo: string
  legacy_import_probe: LegacyImportProbe
  legacy_import_start: LegacyImportReport
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
}

export type CommandRes<N extends CommandName> = CommandResponses[N]

export const COMMAND_NAMES = Object.keys(commandSchemas) as CommandName[]
