import { ipcMain } from 'electron'

import { commandSchemas, type CommandName } from '../../shared/commands'
import { AppError, toErrorEnvelope } from '../../shared/errors'
import { logError } from '../logging'
import type { HandlerMap } from './commands'

export interface InvokeOk {
  ok: true
  data: unknown
}

export interface InvokeError {
  ok: false
  error: { code: number; msg: string; status: number }
}

export type InvokeResult = InvokeOk | InvokeError

export function registerIpc(handlers: HandlerMap): void {
  ipcMain.handle('api:invoke', async (_event, rawName: unknown, rawRequest: unknown): Promise<InvokeResult> => {
    if (typeof rawName !== 'string' || !(rawName in commandSchemas)) {
      return {
        ok: false,
        error: toErrorEnvelope(new AppError(`未知命令: ${String(rawName)}`, { status: 400 })),
      }
    }

    const name = rawName as CommandName
    const parsed = commandSchemas[name].safeParse(rawRequest)
    if (!parsed.success) {
      logError(`IPC ${name} 请求参数不合法: ${parsed.error.message}`)
      return {
        ok: false,
        error: toErrorEnvelope(new AppError(`请求参数不合法: ${name}`, { status: 400 })),
      }
    }

    const handler = handlers[name]
    if (!handler) {
      return {
        ok: false,
        error: toErrorEnvelope(new AppError(`命令未实现: ${name}`)),
      }
    }

    try {
      const data = await handler(parsed.data)
      return { ok: true, data }
    } catch (error) {
      logError(`IPC ${name} 失败: ${error instanceof Error ? error.message : String(error)}`)
      return { ok: false, error: toErrorEnvelope(error) }
    }
  })
}
