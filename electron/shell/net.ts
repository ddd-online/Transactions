import { net, session } from 'electron'

import type { ProxySetting } from '../../shared/types/config'
import { logWarn } from '../logging'

/**
 * 把应用代理设置应用到默认 session。
 *
 * - `off`：直连（显式 direct，避免继承环境变量）
 * - `manual`：固定 HTTP 代理（只支持 HTTP，与既有一致）
 * - `auto`：跟随系统代理
 */
export async function applyProxy(setting: ProxySetting): Promise<void> {
  try {
    if (setting.mode === 'off') {
      await session.defaultSession.setProxy({ mode: 'direct' })
    } else if (setting.mode === 'manual') {
      await session.defaultSession.setProxy({
        mode: 'fixed_servers',
        proxyRules: setting.url,
      })
    } else {
      await session.defaultSession.setProxy({ mode: 'system' })
    }
  } catch (error) {
    logWarn(`应用代理设置失败: ${String(error)}`)
  }
}

/** 走 session 代理的 fetch：行情与更新统一用它，不要在业务代码里直接用全局 fetch。 */
export function appFetch(input: string, init?: RequestInit): Promise<Response> {
  return net.fetch(input, init)
}
