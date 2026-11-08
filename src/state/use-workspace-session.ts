import { useCallback, useEffect, useRef, useState } from 'react'

import type { ConfigSnapshot } from '../../shared/types/config'
import { WORKSPACE_CHANGED } from '../../shared/events'
import { errorMessage } from '../../shared/errors'

export interface WorkspaceSessionOptions {
  /** 启动配置：读到之后才能恢复上次的工作空间。 */
  config: ConfigSnapshot | null
  setBusy: (busy: boolean) => void
  onConfigChanged: (config: ConfigSnapshot) => void
  onError: (message: string) => void
}

export interface WorkspaceSession {
  /** 当前工作空间目录；空串 = 还没有工作空间。 */
  workspace: string
  workspaceIconUrl: string
  setWorkspaceIconUrl: (url: string) => void
  /** 首屏阻塞层：还没有工作空间、用户也还没选择「应用设置」时盖住外壳。 */
  blockingWorkspace: boolean
  /** 弹目录框换一个工作空间。 */
  openWorkspace: () => Promise<void>
  /** 直接打开一个已知目录（最近工作空间）：目录已被删掉就拒绝，不替它建。 */
  openWorkspaceAt: (dir: string) => Promise<void>
  /** 首屏阻塞层上的「应用设置」：先放行再切到设置页。 */
  dismissPrompt: () => void
}

/**
 * 工作空间会话：恢复上次的工作空间、打开 / 切换、图标，以及首屏「有没有工作空间」。
 *
 * 启动顺序与原来一致：配置先读到（`config` 由启动 hook 给出），再用 `workspace_get`
 * 取回上次目录；配置里还记着 `workspaceDir` 的那份需要真正 `workspace_open` 一次。
 */
export function useWorkspaceSession({
  config,
  setBusy,
  onConfigChanged,
  onError,
}: WorkspaceSessionOptions): WorkspaceSession {
  const [workspace, setWorkspace] = useState('')
  const [workspaceIconUrl, setWorkspaceIconUrl] = useState('')
  const [promptDismissed, setPromptDismissed] = useState(false)

  const alive = useRef(true)
  const restored = useRef(false)
  useEffect(
    () => () => {
      alive.current = false
    },
    [],
  )

  useEffect(() => {
    if (!config || restored.current) return
    restored.current = true
    void (async () => {
      try {
        const saved = await window.api.invoke('workspace_get')
        if (!alive.current) return
        setWorkspace(saved)

        if (config.workspaceDir) {
          try {
            await window.api.invoke('workspace_open', { workspaceDir: config.workspaceDir })
            if (alive.current) setWorkspace(config.workspaceDir)
          } catch (openError) {
            if (alive.current) onError(errorMessage(openError))
          }
        }
      } catch (startupError) {
        if (alive.current) onError(errorMessage(startupError))
      }
    })()
  }, [config, onError])

  useEffect(() => {
    window.api.onEvent((message) => {
      if (message.event === WORKSPACE_CHANGED && typeof message.payload === 'string') {
        setWorkspace(message.payload)
      }
    })
  }, [])

  useEffect(() => {
    let active = true
    if (!workspace) {
      setWorkspaceIconUrl('')
      return
    }
    void (async () => {
      try {
        const relative = await window.api.invoke('workspace_icon_get', {})
        const url = relative
          ? await window.api.invoke('asset_url', { filePath: relative })
          : ''
        if (active) setWorkspaceIconUrl(url)
      } catch {
        if (active) setWorkspaceIconUrl('')
      }
    })()
    return () => {
      active = false
    }
  }, [workspace])

  const refreshWorkspace = useCallback(async (): Promise<void> => {
    const directory = await window.api.invoke('workspace_get')
    setWorkspace(directory)
  }, [])

  const openWorkspace = useCallback(async (): Promise<void> => {
    setBusy(true)
    onError('')
    try {
      const picked = await window.api.invoke('dialog_open', { title: '选择工作空间' })
      if (!picked.canceled && picked.filePaths[0]) {
        await window.api.invoke('workspace_open', { workspaceDir: picked.filePaths[0] })
        await refreshWorkspace()
        // 最近工作空间跟着变了：设置页的数据分栏读的是配置里那一份。
        onConfigChanged(await window.api.invoke('config_get'))
      }
    } catch (openError) {
      onError(errorMessage(openError))
    } finally {
      setBusy(false)
    }
  }, [onConfigChanged, onError, refreshWorkspace, setBusy])

  const openWorkspaceAt = useCallback(
    async (dir: string): Promise<void> => {
      await window.api.invoke('workspace_open', { workspaceDir: dir, mustExist: true })
      await refreshWorkspace()
      onConfigChanged(await window.api.invoke('config_get'))
    },
    [onConfigChanged, refreshWorkspace],
  )

  const dismissPrompt = useCallback((): void => setPromptDismissed(true), [])

  return {
    workspace,
    workspaceIconUrl,
    setWorkspaceIconUrl,
    blockingWorkspace: !workspace && !promptDismissed,
    openWorkspace,
    openWorkspaceAt,
    dismissPrompt,
  }
}
