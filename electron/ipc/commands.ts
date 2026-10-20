import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { app } from 'electron'

import type { CommandName } from '../../shared/commands'
import { AppError, workspaceNotOpened } from '../../shared/errors'
import { WORKSPACE_CHANGED } from '../../shared/events'
import type { ConfigStore } from '../config'
import { currentWorkspace, openWorkspace } from '../db'
import { logInfo } from '../logging'
import { assetUrl, normalizeAssetRequestPath } from '../shell/asset-path'
import { openDirectory } from '../shell/dialogs'
import { registerWindowControl } from '../shell/window'
import { sendEvent } from './events'

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
  }
}
