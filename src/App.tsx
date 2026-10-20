import { useCallback, useEffect, useState, type JSX } from 'react'

import type { ConfigSnapshot } from '../shared/types/config'
import { WORKSPACE_CHANGED } from '../shared/events'

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'msg' in error) {
    return String((error as { msg: unknown }).msg)
  }
  if (error instanceof Error) return error.message
  return String(error)
}

export function App(): JSX.Element {
  const [version, setVersion] = useState('…')
  const [config, setConfig] = useState<ConfigSnapshot | null>(null)
  const [workspace, setWorkspace] = useState('')
  const [asset, setAsset] = useState('')
  const [assetLoaded, setAssetLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refreshWorkspace = useCallback(async (): Promise<void> => {
    const directory = await window.api.invoke('workspace_get')
    setWorkspace(directory)
  }, [])

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

        const savedWorkspace = await window.api.invoke('workspace_get')
        if (!alive) return
        setWorkspace(savedWorkspace)

        if (snapshot.workspaceDir) {
          try {
            await window.api.invoke('workspace_open', { workspaceDir: snapshot.workspaceDir })
            if (alive) setWorkspace(snapshot.workspaceDir)
          } catch (openError) {
            if (alive) setError(errorMessage(openError))
          }
        }
      } catch (startupError) {
        if (alive) setError(errorMessage(startupError))
      }
    })()

    window.api.onEvent((message) => {
      if (message.event === WORKSPACE_CHANGED && typeof message.payload === 'string') {
        setWorkspace(message.payload)
      }
    })

    return () => {
      alive = false
    }
  }, [])

  const openWorkspace = useCallback(async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const picked = await window.api.invoke('dialog_open', { title: '选择工作空间' })
      if (!picked.canceled && picked.filePaths[0]) {
        await window.api.invoke('workspace_open', { workspaceDir: picked.filePaths[0] })
        await refreshWorkspace()
      }
    } catch (openError) {
      setError(errorMessage(openError))
    } finally {
      setBusy(false)
    }
  }, [refreshWorkspace])

  const writeAsset = useCallback(async (): Promise<void> => {
    setBusy(true)
    setError('')
    setAssetLoaded(false)
    try {
      const relativePath = await window.api.invoke('debug_write_asset')
      const url = await window.api.invoke('asset_url', { filePath: relativePath })
      setAsset(url)
    } catch (assetError) {
      setError(errorMessage(assetError))
    } finally {
      setBusy(false)
    }
  }, [])

  return (
    <div className="m0">
      <header className="m0-header">
        <span className="m0-brand">Transactions</span>
        <span className="m0-tag">M0 冒烟</span>
      </header>

      <main className="m0-main">
        <section className="m0-card">
          <h1>Electron 迁移 · M0</h1>
          <p data-testid="app-info">版本 {version}</p>
          <p data-testid="workspace-state">
            {workspace ? `已打开：${workspace}` : '未打开工作空间'}
          </p>
          <p className="m0-muted">
            配置文件：{config?.configPath ?? '…'}（{config?.isDev ? '开发' : '生产'}）
          </p>

          <div className="m0-actions">
            <button
              type="button"
              data-testid="open-workspace"
              disabled={busy}
              onClick={() => void openWorkspace()}
            >
              选择工作空间
            </button>
            <button
              type="button"
              data-testid="write-asset"
              disabled={busy || !workspace}
              onClick={() => void writeAsset()}
            >
              写入示例资产
            </button>
          </div>

          {asset ? (
            <div className="m0-asset">
              <img
                data-testid="asset-img"
                className="m0-asset-image"
                src={asset}
                alt="trasset 示例"
                onLoad={() => setAssetLoaded(true)}
              />
              <span data-testid="asset-state">
                {assetLoaded ? 'trasset:// 已加载' : '加载中…'}
              </span>
            </div>
          ) : null}

          {error ? (
            <p className="m0-error" data-testid="error">
              {error}
            </p>
          ) : null}
        </section>

        <section className="m0-card">
          <h2>M0 验收</h2>
          <ul>
            <li>无边框窗口 / 托盘 / 单实例</li>
            <li>app:// 协议加载渲染产物</li>
            <li>node:sqlite 建库、校验、事务</li>
            <li>trasset:// 协议读取工作空间资产</li>
            <li>IPC 命令 + zod 边界校验</li>
            <li>Playwright 启动、点击、落库断言</li>
          </ul>
        </section>
      </main>
    </div>
  )
}
