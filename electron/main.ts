import { dirname, join } from 'node:path'

import { app, dialog, Menu, session } from 'electron'

import { ConfigStore } from './config'
import { closeWorkspace, currentWorkspace } from './db'
import { createHandlers } from './ipc/commands'
import { registerIpc } from './ipc/router'
import { initLogging, logError, logStartup } from './logging'
import { createTray } from './shell/tray'
import { applyProxy } from './shell/net'
import {
  createMainWindow,
  applyAppearance,
  quitApp,
  setQuitting,
  showMainWindow,
} from './shell/window'
import {
  registerAppProtocol,
  registerAssetProtocol,
  registerSchemesPrivileged,
} from './shell/protocols'

registerSchemesPrivileged()

// 测试隔离：让每个 E2E 实例有独立的 userData（单实例锁与 Chromium 缓存都按它隔离）。
// 开发/打包也必须各用一份：打包版的应用名是 Transactions、开发版是 transactions，
// Windows 路径不区分大小写，默认会落进同一个目录 —— 安装版开着时 `pnpm dev` 会因
// 单实例锁已占、Chromium 缓存被占用（Unable to move the cache）而直接退出。
// 业务数据不在这里（账本在工作空间、配置在 ~/.tr.json / ~/.tr.dev.json），换目录只影响缓存。
if (process.env.TRANSACTIONS_USER_DATA) {
  app.setPath('userData', process.env.TRANSACTIONS_USER_DATA)
} else if (!app.isPackaged) {
  app.setPath('userData', join(app.getPath('appData'), 'Transactions Dev'))
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => showMainWindow())
  app.on('window-all-closed', () => {
    // 托盘常驻：窗口关闭不等于进程退出（退出走 quitApp / 托盘「关闭程序」）
  })
  app.on('before-quit', () => {
    setQuitting(true)
    closeWorkspace()
  })
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault())
  })

  app.commandLine.appendSwitch(
    'enable-features',
    'OverlayScrollbar,FluentScrollbar,FluentOverlayScrollbar',
  )
  app.commandLine.appendSwitch(
    'disable-features',
    'msWebOOUI,msPdfOOUI,msSmartScreenProtection',
  )
  app.setAppUserModelId('com.github.Transactions')

  void app
    .whenReady()
    .then(() => {
      const isDev = !app.isPackaged
      const appDirectory = isDev ? join(app.getAppPath(), 'output') : dirname(app.getPath('exe'))
      initLogging(appDirectory)

      const config = ConfigStore.forApp(isDev)
      logStartup(isDev, config.path)
      applyAppearance(config.get().appearance)
      void applyProxy(config.get().proxy)

      registerAppProtocol(join(__dirname, '../renderer'))
      registerAssetProtocol(() => {
        const workspace = currentWorkspace()
        return workspace ? join(workspace.directory, 'data', 'assets') : null
      })

      Menu.setApplicationMenu(null)
      session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => {
        callback(false)
      })

      const devUrl = process.env.ELECTRON_RENDERER_URL
      createMainWindow({
        config,
        preloadPath: join(__dirname, '../preload/index.js'),
        ...(devUrl ? { devUrl } : {}),
      })

      createTray({ show: showMainWindow, quit: quitApp })
      registerIpc(createHandlers({ config }))

      app.on('activate', () => showMainWindow())
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      logError(`启动失败: ${message}`)
      dialog.showErrorBox('Transactions 启动失败', message)
      app.quit()
    })
}

