import { BrowserWindow } from 'electron'

/** 主进程 → 渲染进程的事件广播（只发给现有窗口）。 */
export function sendEvent(event: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('api:event', { event, payload })
    }
  }
}
