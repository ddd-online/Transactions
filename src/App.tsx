import { useCallback, useEffect, useState, type JSX } from 'react'

import type { ConfigSnapshot, FeatureFlags } from '../shared/types/config'
import type { Ledger } from '../shared/domain/models'
import { WORKSPACE_CHANGED } from '../shared/events'
import { RecordsPage } from './pages/records'
import { DashboardPage } from './pages/dashboard'
import { StockPage } from './pages/stock'
import { EventsPage } from './pages/events'
import { DiaryPage } from './pages/diary'
import { TodoPage } from './pages/todo'

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'msg' in error) {
    return String((error as { msg: unknown }).msg)
  }
  if (error instanceof Error) return error.message
  return String(error)
}

const FEATURES: Array<[keyof FeatureFlags, string]> = [
  ['accounting', '记账'],
  ['stock', '股票'],
  ['todo', '待办'],
  ['keyEvent', '事件'],
  ['diary', '日记'],
]

type View = 'accounting' | 'stock' | 'events' | 'diary' | 'todo' | 'settings'

const NAV: Array<[View, string]> = [
  ['accounting', '记账'],
  ['stock', '股票'],
  ['events', '事件'],
  ['diary', '日记'],
  ['todo', '待办'],
]

export function App(): JSX.Element {
  const [version, setVersion] = useState('…')
  const [config, setConfig] = useState<ConfigSnapshot | null>(null)
  const [workspace, setWorkspace] = useState('')
  const [ledgers, setLedgers] = useState<Ledger[]>([])
  const [activeLedgerId, setActiveLedgerId] = useState('')
  const [dataVersion, setDataVersion] = useState(0)
  const [ledgerName, setLedgerName] = useState('')
  const [asset, setAsset] = useState('')
  const [assetLoaded, setAssetLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState<View>('accounting')

  useEffect(() => {
    const root = document.documentElement
    if (config?.appearance === 'light' || config?.appearance === 'dark') {
      root.dataset.theme = config.appearance
    } else {
      delete root.dataset.theme
    }
  }, [config?.appearance])

  const refreshWorkspace = useCallback(async (): Promise<void> => {
    const directory = await window.api.invoke('workspace_get')
    setWorkspace(directory)
  }, [])

  const refreshLedgers = useCallback(async (): Promise<void> => {
    if (!workspace) {
      setLedgers([])
      return
    }
    try {
      const rows = await window.api.invoke('ledger_list', { id: 'all' })
      setLedgers(rows)
    } catch (listError) {
      setError(errorMessage(listError))
    }
  }, [workspace])

  useEffect(() => {
    void refreshLedgers()
  }, [refreshLedgers])

  useEffect(() => {
    if (ledgers.length === 0) {
      setActiveLedgerId('')
      return
    }
    if (!ledgers.some((ledger) => ledger.id === activeLedgerId)) {
      setActiveLedgerId(ledgers[0].id)
    }
  }, [activeLedgerId, ledgers])

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

  const createLedger = useCallback(async (): Promise<void> => {
    const name = ledgerName.trim()
    if (!name) {
      setError('请输入账本名称')
      return
    }
    setBusy(true)
    setError('')
    try {
      await window.api.invoke('ledger_create', { name, description: '' })
      setLedgerName('')
      await refreshLedgers()
    } catch (createError) {
      setError(errorMessage(createError))
    } finally {
      setBusy(false)
    }
  }, [ledgerName, refreshLedgers])

  const deleteLedger = useCallback(
    async (id: string): Promise<void> => {
      setBusy(true)
      setError('')
      try {
        await window.api.invoke('ledger_delete', { id })
        await refreshLedgers()
      } catch (deleteError) {
        setError(errorMessage(deleteError))
      } finally {
        setBusy(false)
      }
    },
    [refreshLedgers],
  )

  const setAppearance = useCallback(async (appearance: string): Promise<void> => {
    setError('')
    try {
      await window.api.invoke('config_set_appearance', { appearance })
      setConfig((current) => (current ? { ...current, appearance } : current))
    } catch (appearanceError) {
      setError(errorMessage(appearanceError))
    }
  }, [])

  const toggleFeature = useCallback(
    async (feature: string, enabled: boolean): Promise<void> => {
      setError('')
      // 乐观更新：受控 checkbox 要立刻反映点击，不能等 IPC 回来再渲染。
      setConfig((current) =>
        current
          ? { ...current, features: { ...current.features, [feature]: enabled } }
          : current,
      )
      try {
        const features: FeatureFlags = await window.api.invoke('config_set_feature', {
          feature,
          enabled,
        })
        setConfig((current) => (current ? { ...current, features } : current))
      } catch (featureError) {
        setError(errorMessage(featureError))
        const snapshot = await window.api.invoke('config_get')
        setConfig(snapshot)
      }
    },
    [],
  )

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
    <div className="app">
      <aside className="app-sidebar">
        <div className="app-brand">
          <span className="m0-brand">Transactions</span>
          <span className="m0-tag">Electron</span>
        </div>

        <nav className="app-nav">
          {NAV.map(([key, label]) => (
            <button
              key={key}
              type="button"
              data-testid={`nav-${key}`}
              className={view === key ? 'app-nav-active' : ''}
              onClick={() => setView(key)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="app-sidebar-footer">
          <button
            type="button"
            data-testid="open-workspace"
            className="m0-primary"
            disabled={busy}
            onClick={() => void openWorkspace()}
          >
            {workspace ? '切换工作空间' : '选择工作空间'}
          </button>
          <span className="app-workspace" data-testid="workspace-state">
            {workspace ? `已打开：${workspace}` : '未打开工作空间'}
          </span>
          <button
            type="button"
            data-testid="nav-settings"
            className={view === 'settings' ? 'app-nav-active' : 'm0-link'}
            onClick={() => setView('settings')}
          >
            设置
          </button>
          <span className="m0-muted" data-testid="app-info">
            版本 {version}
          </span>
        </div>
      </aside>

      <main className="app-main">
        {error ? (
          <p className="m0-error" data-testid="error">
            {error}
          </p>
        ) : null}

        {view === 'accounting' ? (
          <>
            <div className="m0-actions m0-ledger-select">
              <label className="m0-field">
                当前账本
                <select
                  data-testid="ledger-select"
                  className="m0-input"
                  value={activeLedgerId}
                  onChange={(event) => setActiveLedgerId(event.target.value)}
                >
                  {ledgers.length === 0 ? <option value="">（无账本）</option> : null}
                  {ledgers.map((ledger) => (
                    <option key={ledger.id} value={ledger.id}>
                      {ledger.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <DashboardPage ledgerId={activeLedgerId} refreshToken={dataVersion} />

            <RecordsPage
              ledgerId={activeLedgerId}
              onChanged={() => setDataVersion((value) => value + 1)}
            />

            <section className="m0-card m0-card--wide">
              <h2>账本</h2>
              <div className="m0-actions">
                <input
                  data-testid="ledger-name"
                  className="m0-input"
                  placeholder="新账本名称"
                  value={ledgerName}
                  disabled={busy || !workspace}
                  onChange={(event) => setLedgerName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void createLedger()
                  }}
                />
                <button
                  type="button"
                  data-testid="ledger-create"
                  disabled={busy || !workspace}
                  onClick={() => void createLedger()}
                >
                  新建账本
                </button>
              </div>

              {ledgers.length === 0 ? (
                <p className="m0-muted" data-testid="ledger-empty">
                  {workspace ? '还没有账本' : '请先选择工作空间'}
                </p>
              ) : (
                <ul className="m0-ledgers">
                  {ledgers.map((ledger) => (
                    <li key={ledger.id} className="m0-ledger" data-testid="ledger-item">
                      <span>{ledger.name}</span>
                      <span className="m0-muted">{ledger.description}</span>
                      <button
                        type="button"
                        className="m0-link"
                        disabled={busy}
                        onClick={() => void deleteLedger(ledger.id)}
                      >
                        删除
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : null}

        {view === 'stock' ? <StockPage ledgerId={activeLedgerId} /> : null}

        {view === 'events' ? <EventsPage ledgerId={activeLedgerId} /> : null}

        {view === 'diary' ? <DiaryPage ledgerId={activeLedgerId} /> : null}

        {view === 'todo' ? <TodoPage ledgerId={activeLedgerId} /> : null}

        {view === 'settings' ? (
          <>
            <section className="m0-card m0-card--wide">
              <h1>设置</h1>
              <p className="m0-muted">
                配置文件：{config?.configPath ?? '…'}（{config?.isDev ? '开发' : '生产'}）
              </p>
              <label className="m0-field">
                外观
                <select
                  data-testid="appearance"
                  className="m0-input"
                  value={config?.appearance ?? 'system'}
                  disabled={!config}
                  onChange={(event) => void setAppearance(event.target.value)}
                >
                  <option value="system">跟随系统</option>
                  <option value="light">浅色</option>
                  <option value="dark">深色</option>
                </select>
              </label>
              <div className="m0-features">
                {FEATURES.map(([key, label]) => (
                  <label key={key} className="m0-feature">
                    <input
                      type="checkbox"
                      data-testid={`feature-${key}`}
                      checked={config?.features[key] ?? true}
                      disabled={!config}
                      onChange={(event) => void toggleFeature(key, event.target.checked)}
                    />
                    {label}
                  </label>
                ))}
              </div>
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
              <div className="m0-actions">
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
            </section>
          </>
        ) : null}
      </main>
    </div>
  )
}



