import { contextBridge, ipcRenderer } from 'electron'

type InvokeResponse =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: number; msg: string; status: number } }

const api = {
  async invoke(name: string, request?: unknown): Promise<unknown> {
    const response = (await ipcRenderer.invoke('api:invoke', name, request)) as InvokeResponse
    if (response.ok) return response.data
    throw response.error
  },
  onEvent(callback: (message: { event: string; payload: unknown }) => void): void {
    ipcRenderer.on('api:event', (_event, message: { event: string; payload: unknown }) => {
      callback(message)
    })
  },
  platform: process.platform,
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
}
