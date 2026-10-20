import { Menu, Tray, nativeImage } from 'electron'

import { logWarn } from '../logging'
import { resourcePath } from './window'

export interface TrayOptions {
  show: () => void
  quit: () => void
}

let tray: Tray | null = null

export function createTray(options: TrayOptions): Tray {
  if (tray) return tray

  const iconPath = resourcePath('icon.ico')
  const image = nativeImage.createFromPath(iconPath)
  if (image.isEmpty()) {
    logWarn(`托盘图标读取失败: ${iconPath}`)
  }

  tray = new Tray(image)
  tray.setToolTip('Transactions')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示主窗口', click: () => options.show() },
      { type: 'separator' },
      { label: '关闭程序', click: () => options.quit() },
    ]),
  )
  tray.on('click', () => options.show())
  return tray
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
