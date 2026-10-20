import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { app } from 'electron'

import type { CommandName } from '../../shared/commands'
import { AppError, workspaceNotOpened } from '../../shared/errors'
import { IMPORT_PROGRESS, WORKSPACE_CHANGED } from '../../shared/events'
import type { ConfigStore } from '../config'
import type { FeatureFlags, ProxySetting } from '../../shared/types/config'
import { currentWorkspace, openWorkspace } from '../db'
import type { Db } from '../db/driver'
import { logInfo } from '../logging'
import { importLegacyWorkspace, probeLegacyWorkspace } from '../legacy/importer'
import { assetUrl, normalizeAssetRequestPath } from '../shell/asset-path'
import { setFeatureIn } from '../services/config'
import {
  createLedger,
  deleteLedgerById,
  listAllLedgers,
  modifyLedger,
  queryLedgerById,
} from '../services/ledger'
import { openDirectory } from '../shell/dialogs'
import { applyAppearance, registerWindowControl } from '../shell/window'
import { sendEvent } from './events'
import { validatedProxySetting } from '../../shared/domain/proxy'

export type Handler = (request: unknown) => unknown | Promise<unknown>
export type HandlerMap = Record<CommandName, Handler>

const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

export interface HandlerOptions {
  config: ConfigStore
}

function asObject(request: unknown): Record<string, unknown> {
  return typeof request === 'object' && request !== null ? (request as Record<string, unknown>) : {}
}

function workspaceDb(): Db {
  const workspace = currentWorkspace()
  if (!workspace) throw workspaceNotOpened()
  return workspace.db
}

export function createHandlers(options: HandlerOptions): HandlerMap {
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
      const workspaceDir = String(asObject(request).workspaceDir ?? '').trim()
      if (!workspaceDir) {
        throw new AppError('工作目录路径不能为空', { status: 400 })
      }

      const workspace = openWorkspace(workspaceDir)
      options.config.update((config) => {
        config.workspaceDir = workspace.directory
      })
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

    legacy_import_probe(request) {
      const workspaceDir = String(asObject(request).workspaceDir ?? '').trim()
      if (!workspaceDir) {
        throw new AppError('请选择旧工作空间目录', { status: 400 })
      }
      return probeLegacyWorkspace(workspaceDir)
    },

    async legacy_import_start(request) {
      const raw = asObject(request)
      const sourceDir = String(raw.sourceDir ?? '').trim()
      const targetDir = String(raw.targetDir ?? '').trim()
      if (!sourceDir || !targetDir) {
        throw new AppError('源目录与目标目录都不能为空', { status: 400 })
      }
      const report = await importLegacyWorkspace({
        sourceDir,
        targetDir,
        onProgress: (progress) => sendEvent(IMPORT_PROGRESS, progress),
      })
      logInfo(`旧数据导入完成: ${sourceDir} -> ${targetDir}`)
      return report
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
      if (behavior !== 'quit' && behavior !== 'tray' && behavior !== '') {
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

    config_set_proxy(request) {
      const raw = asObject(request)
      const setting = validatedProxySetting(
        String(raw.mode ?? ''),
        String(raw.url ?? ''),
      ) as ProxySetting
      options.config.update((config) => {
        config.proxy = setting
      })
      return setting
    },
  }
}
