import { useEffect, useState } from 'react'

import {
  UPDATE_DOWNLOAD_COMPLETE,
  UPDATE_DOWNLOAD_ERROR,
  UPDATE_DOWNLOAD_PROGRESS,
  WINDOW_STATE_CHANGED,
} from '../../shared/events'
import type { UpdateSnapshot } from '../../shared/domain/update'
import type { ConfigSnapshot } from '../../shared/types/config'
import { errorMessage } from '../../shared/errors'

export interface AppStartupOptions {
  onError: (message: string) => void
}

export interface AppStartup {
  version: string
  config: ConfigSnapshot | null
  setConfig: (config: ConfigSnapshot) => void
  /** 检查更新 / 下载进度：设置页「关于」分栏读它。 */
  updateSnapshot: UpdateSnapshot | null
  setUpdateSnapshot: (snapshot: UpdateSnapshot | null) => void
  /** 窗口是否最大化：顶部窗口控制据此换图标与提示。 */
  maximized: boolean
}

/**
 * 启动时要先拿到的那几样：版本号、配置，以及之后一直推送的更新 / 窗口状态事件。
 *
 * 配置在这里读到之后，工作空间会话才会去恢复上次的目录 —— 启动顺序仍是
 * 「版本与配置 → workspace_get → 打开 workspaceDir」。
 */
export function useAppStartup({ onError }: AppStartupOptions): AppStartup {
  const [version, setVersion] = useState('…')
  const [config, setConfig] = useState<ConfigSnapshot | null>(null)
  const [updateSnapshot, setUpdateSnapshot] = useState<UpdateSnapshot | null>(null)
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const [appVersion, snapshot] = await Promise.all([
          window.api.invoke('app_info', { field: 'version' }),
          window.api.invoke('config_get'),
        ])
        if (!alive) return
        setVersion(appVersion)
        setConfig(snapshot)
      } catch (startupError) {
        if (alive) onError(errorMessage(startupError))
      }
    })()

    window.api.onEvent((message) => {
      if (message.event === UPDATE_DOWNLOAD_PROGRESS ||
        message.event === UPDATE_DOWNLOAD_COMPLETE ||
        message.event === UPDATE_DOWNLOAD_ERROR
      ) {
        setUpdateSnapshot(message.payload as UpdateSnapshot)
      }
      if (message.event === WINDOW_STATE_CHANGED) {
        setMaximized(message.payload === true)
      }
    })

    return () => {
      alive = false
    }
  }, [onError])

  useEffect(() => {
    const root = document.documentElement
    if (config?.appearance === 'light' || config?.appearance === 'dark') {
      root.dataset.theme = config.appearance
    } else {
      delete root.dataset.theme
    }
  }, [config?.appearance])

  return { version, config, setConfig, updateSnapshot, setUpdateSnapshot, maximized }
}
