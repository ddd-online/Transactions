import { join } from 'node:path'

import { app, BrowserWindow, dialog, nativeTheme, screen, shell } from 'electron'

import { WINDOW_STATE_CHANGED } from '../../shared/events'
import { logInfo, logWarn } from '../logging'
import { sendEvent } from '../ipc/events'
import type { ConfigStore } from '../config'
import { hasWorkspace } from '../db'
import { fitWindowBounds } from '../../shared/domain/window-bounds'

export interface WindowOptions {
  config: ConfigStore
  preloadPath: string
  devUrl?: string
}

interface CloseEvent {
  preventDefault(): void
}

let mainWindow: BrowserWindow | null = null
let options: WindowOptions | null = null
let quitting = false
let boundsTimer: NodeJS.Timeout | null = null

export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}

function isAllowedNavigation(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'app:') return true
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      const host = parsed.hostname
      return host === '127.0.0.1' || host === 'localhost'
    }
  } catch {
    return false
  }
  return false
}

export function applyAppearance(appearance: string): void {
  nativeTheme.themeSource = appearance === 'light' ? 'light' : appearance === 'dark' ? 'dark' : 'system'
}

export function saveWindowBounds(): void {
  const window = getMainWindow()
  if (!window || !options || window.isMinimized()) return
  const bounds = window.getNormalBounds()
  options.config.update((config) => {
    config.width = bounds.width
    config.height = bounds.height
    config.x = bounds.x
    config.y = bounds.y
  })
}

function scheduleSaveBounds(): void {
  if (boundsTimer) clearTimeout(boundsTimer)
  boundsTimer = setTimeout(() => {
    boundsTimer = null
    saveWindowBounds()
  }, 300)
}

export function quitApp(): void {
  quitting = true
  saveWindowBounds()
  app.quit()
}

export function setQuitting(value: boolean): void {
  quitting = value
}

function askCloseBehavior(window: BrowserWindow): void {
  const choice = dialog.showMessageBoxSync(window, {
    type: 'info',
    title: '关闭选项',
    message:
      '请选择关闭行为：\n「关闭应用」= 直接退出；「缩小到托盘」= 隐藏窗口继续运行。\n可在「设置 → 通用设置 → 关闭行为」中固定该选择。',
    buttons: ['关闭应用', '缩小到托盘'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  })
  if (choice === 0) {
    quitApp()
  } else {
    window.hide()
  }
}

function handleClose(window: BrowserWindow, event: CloseEvent): void {
  if (quitting) return
  event.preventDefault()

  if (!hasWorkspace()) {
    logInfo('工作空间尚未打开，关闭即退出')
    quitApp()
    return
  }

  saveWindowBounds()
  const config = options?.config.get()
  const behavior = process.env.TRANSACTIONS_TEST_CLOSE ?? config?.closeBehavior ?? ''
  if (behavior === 'tray') {
    window.hide()
    return
  }
  if (behavior === 'quit') {
    quitApp()
    return
  }
  askCloseBehavior(window)
}

export function createMainWindow(windowOptions: WindowOptions): BrowserWindow {
  options = windowOptions
  const existing = getMainWindow()
  if (existing) {
    existing.show()
    existing.focus()
    return existing
  }

  const config = windowOptions.config.get()
  applyAppearance(config.appearance)
  const display =
    config.x === null || config.y === null
      ? screen.getPrimaryDisplay()
      : screen.getDisplayMatching({
          x: config.x,
          y: config.y,
          width: config.width,
          height: config.height,
        })
  // workArea 与 BrowserWindow 的边界同为 DIP：再除 scaleFactor 会把可用区域按缩放比例
  // 缩小一遍，高 DPI 屏上窗口因此被夹到左上角且尺寸变矮，看起来像"没记住上次的窗口"。
  const bounds = fitWindowBounds(config, display.workArea)

  const window = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    frame: false,
    show: false,
    title: 'Transactions',
    backgroundColor: '#f5f6fa',
    autoHideMenuBar: true,
    webPreferences: {
      preload: windowOptions.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  })

  mainWindow = window

  window.on('ready-to-show', () => {
    window.show()
    window.setBounds(bounds)
  })
  window.on('close', (event) => handleClose(window, event))
  window.on('resize', scheduleSaveBounds)
  window.on('move', scheduleSaveBounds)
  window.on('maximize', () => sendEvent(WINDOW_STATE_CHANGED, true))
  window.on('unmaximize', () => sendEvent(WINDOW_STATE_CHANGED, false))
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })

  window.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url)) {
      logWarn(`拦截导航: ${url}`)
      event.preventDefault()
    }
  })
  window.webContents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/([a-z0-9-]+\.)*github\.com(\/|$)/i.test(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  if (windowOptions.devUrl) {
    void window.loadURL(windowOptions.devUrl)
  } else {
    void window.loadURL('app://local/index.html')
  }

  return window
}

export function showMainWindow(): void {
  const window = getMainWindow()
  if (window) {
    window.show()
    window.restore()
    window.focus()
    return
  }
  if (options) {
    createMainWindow(options)
  }
}

export function registerWindowControl(action: 'minimize' | 'maximize' | 'close'): void {
  const window = getMainWindow()
  if (!window) return
  if (action === 'minimize') {
    window.minimize()
    return
  }
  if (action === 'maximize') {
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
    return
  }
  window.close()
}

export function resourcePath(name: string): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'resources', name)
    : join(app.getAppPath(), 'resources', name)
}

