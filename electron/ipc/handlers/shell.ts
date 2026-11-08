/**
 * 外壳类命令：应用信息、工作空间、窗口 / 对话框 / 剪贴板、资源 URL、调试与 DevTools。
 *
 * 这些都是「不碰业务数据」的命令；业务写操作在各自的领域文件里。
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { join } from 'node:path'

import { app, clipboard, dialog } from 'electron'

import { addRecentWorkspace } from '../../../shared/domain/backup'
import { AppError, errorMessage, workspaceNotOpened } from '../../../shared/errors'
import { DEVTOOLS_STATE_CHANGED, WORKSPACE_CHANGED } from '../../../shared/events'
import { currentWorkspace, openWorkspace } from '../../db'
import { logInfo, logWarn } from '../../logging'
import { removeWorkspaceIcon, resolveAsset, saveWorkspaceIcon, workspaceIconRelative } from '../../services/assets'
import { assetUrl, normalizeAssetRequestPath } from '../../shell/asset-path'
import { openDirectory, openFile } from '../../shell/dialogs'
import { getMainWindow, notifyQuitReady, registerWindowControl } from '../../shell/window'
import type { HandlerMap } from '../commands'
import { sendEvent } from '../events'
import { openDirectoryInShell, asObject, type HandlerContext } from './context'

const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

export function createShellHandlers(
  ctx: HandlerContext,
): Pick<
  HandlerMap,
  | 'app_info'
  | 'workspace_get'
  | 'workspace_open'
  | 'asset_url'
  | 'dialog_open'
  | 'window_control'
  | 'app_quit_ready'
  | 'clipboard_write_text'
  | 'debug_write_asset'
  | 'debug_echo'
  | 'workspace_set'
  | 'workspace_icon_get'
  | 'workspace_icon_set'
  | 'workspace_open_dir'
  | 'dialog_open_file'
  | 'file_save_image'
  | 'devtools_get_state'
  | 'devtools_toggle'
> {
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

    workspace_get() {
      return ctx.config.get().workspaceDir
    },

    workspace_open(request) {
      const raw = asObject(request)
      const workspaceDir = String(raw.workspaceDir ?? '').trim()
      if (!workspaceDir) {
        throw new AppError('工作目录路径不能为空', { status: 400 })
      }

      const workspace = openWorkspace(workspaceDir, { mustExist: raw.mustExist === true })
      ctx.config.update((config) => {
        config.workspaceDir = workspace.directory
        // 最近工作空间：最新的在前、去重、最多 5 条（成功打开时才写）
        config.recentWorkspaces = addRecentWorkspace(
          config.recentWorkspaces,
          workspace.directory,
        )
      })
      // 每天第一次打开时的自动备份：失败只记日志，绝不能挡住「打开工作空间」
      try {
        const entry = ctx.backup.autoBackupIfNeeded()
        if (entry) logInfo(`自动备份完成: ${entry.name}`)
      } catch (error) {
        logWarn(`自动备份失败: ${errorMessage(error)}`)
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

    workspace_set(request) {
      const workspaceDir = String(asObject(request).workspaceDir ?? '')
      ctx.config.update((config) => {
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

    async workspace_open_dir(request) {
      const target = String(asObject(request).target ?? '')
      if (target === 'workspace') {
        const workspace = currentWorkspace()
        if (!workspace) throw workspaceNotOpened()
        await openDirectoryInShell(workspace.directory)
        return null
      }
      if (target === 'backup') {
        const directory = ctx.config.backupDir()
        // 「打开备份目录」在还没备份过时也要能点开：先建出来
        mkdirSync(directory, { recursive: true })
        await openDirectoryInShell(directory)
        return null
      }
      throw new AppError(`未知的目录目标: ${target}`, { status: 400 })
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
