import { useCallback, useEffect, useState, type JSX } from 'react'

import type { ConfigSnapshot, FeatureFlags } from '../shared/types/config'
import type { Ledger } from '../shared/domain/models'
import {
  IMPORT_PROGRESS,
  UPDATE_DOWNLOAD_COMPLETE,
  UPDATE_DOWNLOAD_ERROR,
  UPDATE_DOWNLOAD_PROGRESS,
  WORKSPACE_CHANGED,
} from '../shared/events'
import { ERR_CODE_LEGACY_WORKSPACE } from '../shared/errors'
import type { LegacyImportProgress } from '../shared/types/import'
import type { UpdateSnapshot } from '../shared/domain/update'
import { RecordsPage } from './pages/records'
import { ChartsPage } from './pages/charts'
import { CategoryTagPage } from './pages/category-tag'
import { TemplatePage } from './pages/templates'
import { DashboardPage } from './pages/dashboard'
import { StockPage } from './pages/stock'
import { EventsPage } from './pages/events'
import { DiaryPage } from './pages/diary'
import { TodoPage } from './pages/todo'
import { ImportWizard } from './pages/import-wizard'
import { UpdatePanel } from './pages/update-panel'

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

const NAV: Array<[View, string, keyof FeatureFlags]> = [
  ['accounting', '记账', 'accounting'],
  ['stock', '股票', 'stock'],
  ['events', '事件', 'keyEvent'],
  ['diary', '日记', 'diary'],
  ['todo', '待办', 'todo'],
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
  const [importProgress, setImportProgress] = useState<LegacyImportProgress | null>(null)
  const [updateSnapshot, setUpdateSnapshot] = useState<UpdateSnapshot | null>(null)
  const [workspacePromptDismissed, setWorkspacePromptDismissed] = useState(false)
  const [proxyMode, setProxyMode] = useState('auto')
  const [proxyUrl, setProxyUrl] = useState('')
  const [workspaceIconUrl, setWorkspaceIconUrl] = useState('')

  useEffect(() => {
    let alive = true
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
        if (alive) setWorkspaceIconUrl(url)
      } catch {
        if (alive) setWorkspaceIconUrl('')
      }
    })()
    return () => {
      alive = false
    }
  }, [workspace])

  useEffect(() => {
    if (!config) return
    setProxyMode(config.proxy.mode)
    setProxyUrl(config.proxy.url)
  }, [config?.proxy.mode, config?.proxy.url])

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
      if (message.event === IMPORT_PROGRESS) {
        setImportProgress(message.payload as LegacyImportProgress)
      }
      if (
        message.event === UPDATE_DOWNLOAD_PROGRESS ||
        message.event === UPDATE_DOWNLOAD_COMPLETE ||
        message.event === UPDATE_DOWNLOAD_ERROR
      ) {
        setUpdateSnapshot(message.payload as UpdateSnapshot)
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
      if (typeof openError === 'object' && openError !== null && (openError as { code?: number }).code === ERR_CODE_LEGACY_WORKSPACE) {
        setView('settings')
      }
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
      const ledgerId = await window.api.invoke('ledger_create', { name, description: '' })
      await window.api.invoke('category_initialize', { ledgerId })
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

  const setCloseBehavior = useCallback(async (behavior: string): Promise<void> => {
    setError('')
    try {
      await window.api.invoke('config_set_close_behavior', { behavior })
      setConfig((current) => (current ? { ...current, closeBehavior: behavior } : current))
    } catch (closeError) {
      setError(errorMessage(closeError))
    }
  }, [])

  const saveProxy = useCallback(async (): Promise<void> => {
    setError('')
    try {
      const proxy = await window.api.invoke('config_set_proxy', {
        mode: proxyMode,
        url: proxyUrl,
      })
      setConfig((current) => (current ? { ...current, proxy } : current))
    } catch (proxyError) {
      setError(errorMessage(proxyError))
    }
  }, [proxyMode, proxyUrl])

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

  const changeWorkspaceIcon = useCallback(async (file: File | undefined): Promise<void> => {
    if (!file) return
    setError('')
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error ?? new Error('读取图标失败'))
        reader.readAsDataURL(file)
      })
      const relative = await window.api.invoke('workspace_icon_set', { data })
      if (relative) {
        setWorkspaceIconUrl(await window.api.invoke('asset_url', { filePath: relative }))
      }
    } catch (iconError) {
      setError(errorMessage(iconError))
    }
  }, [])

  const clearWorkspaceIcon = useCallback(async (): Promise<void> => {
    setError('')
    try {
      await window.api.invoke('workspace_icon_set', { data: '' })
      setWorkspaceIconUrl('')
    } catch (iconError) {
      setError(errorMessage(iconError))
    }
  }, [])

  const toggleLedgerFeature = useCallback(
    async (feature: string, enabled: boolean): Promise<void> => {
      if (!activeLedgerId) return
      setError('')
      try {
        const flags: FeatureFlags = await window.api.invoke('config_set_feature', {
          feature,
          enabled,
          ledgerId: activeLedgerId,
        })
        setConfig((current) =>
          current
            ? {
                ...current,
                ledgerFeatures: { ...current.ledgerFeatures, [activeLedgerId]: flags },
              }
            : current,
        )
      } catch (featureError) {
        setError(errorMessage(featureError))
      }
    },
    [activeLedgerId],
  )

  const effectiveFeatures = config
    ? { ...config.features, ...(config.ledgerFeatures[activeLedgerId] ?? {}) }
    : null

  useEffect(() => {
    if (view === 'settings') return
    const entry = NAV.find(([key]) => key === view)
    if (entry && effectiveFeatures?.[entry[2]] === false) setView('accounting')
  }, [effectiveFeatures, view])

  const finishImport = useCallback(async (targetDir: string): Promise<void> => {
    await window.api.invoke('workspace_open', { workspaceDir: targetDir })
    setWorkspace(targetDir)
    const rows = await window.api.invoke('ledger_list', { id: 'all' })
    setLedgers(rows)
  }, [])

  return (
    <>
      {!workspace && !workspacePromptDismissed ? (
        <div className="app-workspace-overlay" data-testid="workspace-overlay">
          <div className="app-workspace-card">
            <h1>Transactions</h1>
            <p className="m0-muted">选择一个工作空间开始；所有数据都保存在本地。</p>
            <div className="m0-actions" style={{ justifyContent: 'center' }}>
              <button
                type="button"
                data-testid="open-workspace"
                className="m0-primary"
                disabled={busy}
                onClick={() => void openWorkspace()}
              >
                选择工作空间
              </button>
              <button
                type="button"
                data-testid="open-import"
                className="m0-link"
                onClick={() => {
                  setWorkspacePromptDismissed(true)
                  setView('settings')
                }}
              >
                导入旧版数据
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <header className="app-titlebar">
        <span className="app-titlebar-title">Transactions</span>
        <div className="app-titlebar-actions">
          <button
            type="button"
            data-testid="window-minimize"
            onClick={() => void window.api.invoke('window_control', { action: 'minimize' })}
          >
            —
          </button>
          <button
            type="button"
            data-testid="window-maximize"
            onClick={() => void window.api.invoke('window_control', { action: 'maximize' })}
          >
            □
          </button>
          <button
            type="button"
            data-testid="window-close"
            className="app-titlebar-close"
            onClick={() => void window.api.invoke('window_control', { action: 'close' })}
          >
            ×
          </button>
        </div>
      </header>

      <div className="app-shell-body">
      <aside className="app-sidebar">
        <div className="app-brand">
          {workspaceIconUrl ? (
            <img className="app-brand-icon" data-testid="workspace-icon" src={workspaceIconUrl} alt="工作空间图标" />
          ) : null}
          <span className="m0-brand">Transactions</span>
          <span className="m0-tag">Electron</span>
        </div>

        <nav className="sidebar-nav">
          {NAV.filter(([, , feature]) => effectiveFeatures?.[feature] !== false).map(([key, label]) => (
            <button
              key={key}
              type="button"
              data-testid={`nav-${key}`}
              className={`nav-btn${view === key ? ' active' : ''}`}
              onClick={() => setView(key)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          {workspace ? (
            <button
              type="button"
              data-testid="open-workspace"
              className="m0-primary"
              disabled={busy}
              onClick={() => void openWorkspace()}
            >
              切换工作空间
            </button>
          ) : null}
          <span className="app-workspace" data-testid="workspace-state">
            {workspace ? `已打开：${workspace}` : '未打开工作空间'}
          </span>
          <button
            type="button"
            data-testid="nav-settings"
            className={`nav-btn nav-btn-secondary${view === 'settings' ? ' active' : ''}`}
            onClick={() => setView('settings')}
          >
            设置
          </button>
          <span className="m0-muted" data-testid="app-info">
            版本 {version}
          </span>
        </div>
      </aside>

      <main className="app-content">
        <div className="app-router-view">
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

            <ChartsPage ledgerId={activeLedgerId} />

            <CategoryTagPage ledgerId={activeLedgerId} />

            <TemplatePage ledgerId={activeLedgerId} />

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

        {view === 'stock' ? (
          <StockPage ledgerId={activeLedgerId} onLedgerChanged={() => void refreshLedgers()} />
        ) : null}

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
              <label className="m0-field">
                关闭窗口
                <select
                  data-testid="close-behavior"
                  className="m0-input"
                  value={config?.closeBehavior ?? 'quit'}
                  disabled={!config}
                  onChange={(event) => void setCloseBehavior(event.target.value)}
                >
                  <option value="quit">退出应用</option>
                  <option value="tray">最小化到托盘</option>
                  <option value="ask">每次询问</option>
                </select>
              </label>
              <div className="m0-import-row">
                <label className="m0-field m0-import-field">
                  网络代理
                  <select
                    className="m0-input"
                    data-testid="proxy-mode"
                    value={proxyMode}
                    disabled={!config}
                    onChange={(event) => setProxyMode(event.target.value)}
                  >
                    <option value="auto">跟随系统</option>
                    <option value="off">不使用代理</option>
                    <option value="manual">手动</option>
                  </select>
                </label>
                <label className="m0-field m0-import-field">
                  代理地址
                  <input
                    className="m0-input"
                    data-testid="proxy-url"
                    value={proxyUrl}
                    disabled={!config || proxyMode !== 'manual'}
                    onChange={(event) => setProxyUrl(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="m0-primary"
                  data-testid="proxy-save"
                  disabled={!config}
                  onClick={() => void saveProxy()}
                >
                  保存代理
                </button>
              </div>
              <div className="m0-import-row">
                <label className="m0-field m0-import-field">
                  工作空间图标
                  <input
                    className="m0-input"
                    type="file"
                    data-testid="workspace-icon-input"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={(event) => void changeWorkspaceIcon(event.target.files?.[0])}
                  />
                </label>
                <button
                  type="button"
                  className="m0-link"
                  data-testid="workspace-icon-clear"
                  onClick={() => void clearWorkspaceIcon()}
                >
                  清除图标
                </button>
              </div>
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
              {activeLedgerId ? (
                <div className="m0-features" data-testid="ledger-features">
                  <span className="m0-muted">本账本：</span>
                  {FEATURES.map(([key, label]) => (
                    <label key={key} className="m0-feature">
                      <input
                        type="checkbox"
                        data-testid={`ledger-feature-${key}`}
                        checked={effectiveFeatures?.[key] ?? true}
                        disabled={!config}
                        onChange={(event) => void toggleLedgerFeature(key, event.target.checked)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              ) : null}
            </section>

            <ImportWizard progress={importProgress} onImported={finishImport} />

            <UpdatePanel snapshot={updateSnapshot} onSnapshot={setUpdateSnapshot} />

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
        </div>
      </main>
      </div>
    </>
  )
}


















