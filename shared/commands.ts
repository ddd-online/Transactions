import { z } from 'zod'

import type { ConfigSnapshot, DialogOpenResponse } from './types/config'
import type { LegacyImportProbe, LegacyImportReport } from './types/import'
import type { Ledger } from './domain/models'

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
}

export type CommandRes<N extends CommandName> = CommandResponses[N]

export const COMMAND_NAMES = Object.keys(commandSchemas) as CommandName[]
