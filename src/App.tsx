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
import { ConfirmDialog } from './components/confirm-dialog'
import { ToastHost, notify } from './components/toast'
import { Switch } from './components/switch'
import { PageHeader } from './components/page-header'
import { Segmented } from './components/segmented'
import { PageLayout, PageRailProvider } from './components/page-layout'
import { Icon, type IconName } from './components/icon'

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
  ['todo', '待办', 'todo'],
  ['events', '事件', 'keyEvent'],
  ['diary', '日记', 'diary'],
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
  const [settingsTab, setSettingsTab] = useState<'general'|'features'|'diary'|'about'>('general')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [ledgerMenuOpen, setLedgerMenuOpen] = useState(false)
  const [accountingTab, setAccountingTab] = useState<
    'dashboard' | 'records' | 'charts' | 'tags' | 'templates'
  >('dashboard')
  const [importProgress, setImportProgress] = useState<LegacyImportProgress | null>(null)
  const [updateSnapshot, setUpdateSnapshot] = useState<UpdateSnapshot | null>(null)
  const [workspacePromptDismissed, setWorkspacePromptDismissed] = useState(false)
  const [proxyMode, setProxyMode] = useState('auto')
  const [proxyUrl, setProxyUrl] = useState('')
  const [proxyDetect, setProxyDetect] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
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
        setWorkspacePromptDismissed(true)
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
      notify('账本已创建')
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
        notify('账本已删除')
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
      notify('代理设置已保存')
    } catch (proxyError) {
      setError(errorMessage(proxyError))
    }
  }, [proxyMode, proxyUrl])

  const detectProxy = useCallback(async (): Promise<void> => {
    setError('')
    try {
      const result = await window.api.invoke('proxy_detect', {})
      setProxyDetect(`${result.source}${result.url ? ` · ${result.url}` : ''}`)
    } catch (detectError) {
      setError(errorMessage(detectError))
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
        notify('工作空间图标已更新')
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

  const activeLedgerName = ledgers.find((ledger) => ledger.id === activeLedgerId)?.name ?? '默认账本'
  const navIcon: Record<View, IconName> = {
    accounting: 'Transaction',
    stock: 'Sliders',
    todo: 'CheckCircle',
    events: 'Star',
    diary: 'Read',
    settings: 'Setting',
  }

  const pageTitle =
    view === 'settings' ? '应用设置' : (NAV.find(([key]) => key === view)?.[1] ?? '记账')

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

      <div className={`app-shell-body${sidebarCollapsed ? ' is-sidebar-collapsed' : ''}`}>
      <aside className="app-sidebar">
        <div className={`app-left-bar${sidebarCollapsed ? ' is-collapsed' : ''}`}>
          <div className="sidebar-ledger">
            <div className="ledger-anchor">
              <button
                type="button"
                className={`ledger-btn${sidebarCollapsed ? ' workspace-btn' : ''}${ledgerMenuOpen ? ' is-open' : ''}`}
                data-testid="ledger-trigger"
                aria-label={`切换账本，当前 ${activeLedgerName}`}
                onClick={() => setLedgerMenuOpen((open) => !open)}
              >
                <span className="workspace-mark">
                  {workspaceIconUrl ? (
                    <img
                      className="workspace-mark__image"
                      data-testid="workspace-icon"
                      src={workspaceIconUrl}
                      alt=""
                    />
                  ) : (
                    <svg className="app-mark" viewBox="0 0 1024 1024" aria-hidden="true">
                      <rect className="app-mark__plate" x="0" y="0" width="1024" height="1024" rx="200" ry="200" />
                      <path
                        className="app-mark__glyph"
                        transform="translate(220.909996509552 49.1699676513672)"
                        d="M363.01 322.09 L236.22 322.09 L236.22 685.1 L135.78 685.1 L135.78 322.09 L9.61 322.09 L9.61 240.56 L363.01 240.56 Z M572.57 456.01 C560.79 449.6 547.05 446.4 531.34 446.4 C510.05 446.4 493.42 454.2 481.43 469.81 C469.44 485.41 463.45 506.64 463.45 533.51 L463.45 685.1 L365.49 685.1 L365.49 367.66 L463.45 367.66 L463.45 426.56 L464.69 426.56 C480.19 383.57 508.09 362.08 548.39 362.08 C558.72 362.08 566.78 363.32 572.57 365.8 Z"
                      />
                    </svg>
                  )}
                </span>
                <span className="ledger-btn-name">{activeLedgerName}</span>
                <span className="ledger-btn-arrow">
                  <Icon name="Down" size={10} />
                </span>
              </button>
              {ledgerMenuOpen ? (
                <div className="ledger-menu-layer">
                  <div className="ledger-menu" role="menu">
                    {ledgers.length === 0 ? (
                      <div className="ledger-menu-empty">暂无账本</div>
                    ) : (
                      ledgers.map((ledger) => (
                        <div
                          key={ledger.id}
                          className={`ledger-menu-row${ledger.id === activeLedgerId ? ' is-active' : ''}`}
                        >
                          <button
                            type="button"
                            className="ledger-menu-name"
                            role="menuitem"
                            onClick={() => {
                              setActiveLedgerId(ledger.id)
                              setLedgerMenuOpen(false)
                            }}
                          >
                            <span className="ledger-dot ledger-dot--1" />
                            <span className="ledger-menu-name-text">{ledger.name}</span>
                          </button>
                        </div>
                      ))
                    )}
                    <div className="ledger-menu-divider" />
                    <button
                      type="button"
                      className="ledger-menu-create"
                      role="menuitem"
                      onClick={() => {
                        setLedgerMenuOpen(false)
                        setView('accounting')
                        setAccountingTab('dashboard')
                      }}
                    >
                      <span className="ledger-menu-create-icon">
                        <Icon name="Plus" size={14} />
                      </span>
                      <span>创建账本</span>
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <nav className="sidebar-nav" aria-label="主导航">
            {NAV.filter(([, , feature]) => effectiveFeatures?.[feature] !== false).map(([key, label]) => (
              <button
                key={key}
                type="button"
                data-testid={`nav-${key}`}
                className={`nav-btn${view === key ? ' active' : ''}`}
                aria-label={label}
                onClick={() => setView(key)}
              >
                <span className="nav-btn-icon">
                  <Icon name={navIcon[key]} size={18} />
                </span>
                <span className="nav-btn-text">{label}</span>
              </button>
            ))}
          </nav>

          <div className="sidebar-spacer" />
          <div className="sidebar-toggle-row">
            <button
              type="button"
              className="nav-btn nav-btn-secondary sidebar-toggle-btn"
              aria-label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
              onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            >
              <span className="nav-btn-icon">
                <Icon name={sidebarCollapsed ? 'MenuUnfold' : 'MenuFold'} size={18} />
              </span>
              <span className="nav-btn-text">{sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}</span>
            </button>
          </div>
          <div className="sidebar-bottom">
            <button
              type="button"
              data-testid="nav-settings"
              className={`nav-btn nav-btn-secondary${view === 'settings' ? ' active' : ''}`}
              aria-label="应用设置"
              onClick={() => setView('settings')}
            >
              <span className="nav-btn-icon">
                <Icon name="Setting" size={18} />
              </span>
              <span className="nav-btn-text">应用设置</span>
            </button>
          </div>
        </div>
      </aside>

      <main className="app-content">
        <PageHeader title={pageTitle} />
        <div className="app-top-bar">
          <div className="window-controls">
            <button
              type="button"
              className="window-btn"
              data-testid="window-minimize"
              title="最小化"
              onPointerDown={(event) => {
                if (event.button !== 0) return
                event.preventDefault()
                void window.api.invoke('window_control', { action: 'minimize' })
              }}
              onClick={(event) => {
                if (event.detail === 0) void window.api.invoke('window_control', { action: 'minimize' })
              }}
            >
              <Icon name="WindowMinimize" size={16} />
            </button>
            <button
              type="button"
              className="window-btn"
              data-testid="window-maximize"
              title="最大化"
              onPointerDown={(event) => {
                if (event.button !== 0) return
                event.preventDefault()
                void window.api.invoke('window_control', { action: 'maximize' })
              }}
              onClick={(event) => {
                if (event.detail === 0) void window.api.invoke('window_control', { action: 'maximize' })
              }}
            >
              <Icon name="WindowMaximize" size={14} />
            </button>
            <button
              type="button"
              className="window-btn window-btn--close"
              data-testid="window-close"
              title="关闭"
              onPointerDown={(event) => {
                if (event.button !== 0) return
                event.preventDefault()
                void window.api.invoke('window_control', { action: 'close' })
              }}
              onClick={(event) => {
                if (event.detail === 0) void window.api.invoke('window_control', { action: 'close' })
              }}
            >
              <Icon name="Close" size={16} />
            </button>
          </div>
        </div>
        <div className="app-router-view">
        {error ? (
          <p className="m0-error" data-testid="error">
            {error}
          </p>
        ) : null}

        {view === 'accounting' ? (
          <PageRailProvider
            rail={
                <div className="page-rail-nav">
                  {(
                    [
                      ['dashboard', '看板', 'Dashboard'],
                      ['records', '记录', 'Transaction'],
                      ['charts', '分析', 'LineChart'],
                      ['tags', '标签', 'Tag'],
                      ['templates', '模板', 'FileText'],
                    ] as const
                  ).map(([key, label, icon]) => (
                    <button
                      key={key}
                      type="button"
                      data-testid={`acct-tab-${key}`}
                      className={`page-rail-btn${accountingTab === key ? ' is-active' : ''}`}
                      title={label}
                      aria-label={label}
                      onClick={() => setAccountingTab(key)}
                    >
                      <span className="page-rail-btn-icon">
                        <Icon name={icon} size={18} />
                      </span>
                    </button>
                  ))}
                </div>
            }
          >
                  <select
                    data-testid="ledger-select"
                    className="sr-only"
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

            {accountingTab === 'dashboard' ? (
              <DashboardPage ledgerId={activeLedgerId} refreshToken={dataVersion} />
            ) : null}
            {accountingTab === 'records' ? (
              <RecordsPage
                ledgerId={activeLedgerId}
                onChanged={() => setDataVersion((value) => value + 1)}
              />
            ) : null}
            {accountingTab === 'charts' ? <ChartsPage ledgerId={activeLedgerId} /> : null}
            {accountingTab === 'tags' ? <CategoryTagPage ledgerId={activeLedgerId} /> : null}
            {accountingTab === 'templates' ? <TemplatePage ledgerId={activeLedgerId} /> : null}
          </PageRailProvider>
        ) : null}

        {view === 'stock' ? (
          <StockPage ledgerId={activeLedgerId} onLedgerChanged={() => void refreshLedgers()} />
        ) : null}

        {view === 'events' ? <EventsPage ledgerId={activeLedgerId} /> : null}

        {view === 'diary' ? <DiaryPage ledgerId={activeLedgerId} /> : null}

        {view === 'todo' ? <TodoPage ledgerId={activeLedgerId} /> : null}

        {view === 'settings' ? (
          <PageLayout contentClassName="settings-page-content">
                  <div className="ui-tabs st-tabs">
                    {(
                      [
                        ['general', '通用设置'],
                        ['features', '功能开关'],
                        ['diary', '日记配置'],
                        ['about', '关于软件'],
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        data-testid={`settings-tab-${key}`}
                        className={`ui-tabs__tab${settingsTab === key ? ' is-active' : ''}`}
                        onClick={() => setSettingsTab(key)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {settingsTab === 'general' ? (
                    <div className="st-list">
                      <div className="st-card">
                        <div className="st-card-info">
                          <span className="st-card-title">工作空间</span>
                          <span className="st-card-desc st-card-desc--mono">
                            {workspace ?? '尚未选择工作空间'}
                          </span>
                        </div>
                        <div className="st-card-action">
                          <button
                            type="button"
                            className="ui-btn ui-btn--secondary"
                            data-testid="open-workspace"
                            disabled={busy}
                            onClick={() => void openWorkspace()}
                          >
                            切换
                          </button>
                        </div>
                      </div>

                      <div className="st-card">
                        <div className="st-card-info">
                          <span className="st-card-title">软件图标</span>
                          <span className="st-card-desc">
                            侧栏左上角的方形图标；保存在当前工作空间里，切换工作空间会跟着换
                          </span>
                        </div>
                        <div className="st-card-action">
                          {workspaceIconUrl ? (
                            <img
                              className="st-icon-preview"
                              src={workspaceIconUrl}
                              alt=""
                            />
                          ) : null}
                          <input
                            className="m0-input"
                            type="file"
                            data-testid="workspace-icon-input"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            onChange={(event) => void changeWorkspaceIcon(event.target.files?.[0])}
                          />
                          <button
                            type="button"
                            className="ui-btn ui-btn--secondary"
                            data-testid="workspace-icon-clear"
                            onClick={() => void clearWorkspaceIcon()}
                          >
                            恢复默认
                          </button>
                        </div>
                      </div>

                      <div className="st-card">
                        <div className="st-card-info">
                          <span className="st-card-title">外观</span>
                          <span className="st-card-desc">界面配色，可跟随系统</span>
                        </div>
                        <div className="st-card-action">
                          <Segmented
                            testId="appearance"
                            value={config?.appearance ?? 'system'}
                            disabled={!config}
                            onChange={(value) => void setAppearance(value)}
                            options={[
                              { value: 'light', label: '浅色' },
                              { value: 'dark', label: '深色' },
                              { value: 'system', label: '跟随系统' },
                            ]}
                          />
                        </div>
                      </div>

                      <div className="st-card">
                        <div className="st-card-info">
                          <span className="st-card-title">关闭行为</span>
                          <span className="st-card-desc">点击右上角关闭按钮时的行为</span>
                        </div>
                        <div className="st-card-action">
                          <Segmented
                            testId="close-behavior"
                            value={config?.closeBehavior ?? 'quit'}
                            disabled={!config}
                            onChange={(value) => void setCloseBehavior(value)}
                            options={[
                              { value: 'quit', label: '直接退出' },
                              { value: 'tray', label: '最小化到托盘' },
                              { value: 'ask', label: '每次询问' },
                            ]}
                          />
                        </div>
                      </div>

                      <div className="st-card">
                        <div className="st-card-info">
                          <span className="st-card-title">代理</span>
                          <span className="st-card-desc">
                            网络请求（行情、更新检查）走 HTTP 代理；自动探测读取环境变量与 Windows 系统代理
                          </span>
                          {proxyDetect ? (
                            <span className="st-card-desc st-card-desc--mono" data-testid="proxy-detect-result">
                              {proxyDetect}
                            </span>
                          ) : null}
                        </div>
                        <div className="st-card-action">
                          <Segmented
                            testId="proxy-mode"
                            value={proxyMode}
                            disabled={!config}
                            onChange={(value) => setProxyMode(value)}
                            options={[
                              { value: 'off', label: '不使用' },
                              { value: 'auto', label: '自动探测' },
                              { value: 'manual', label: '手动' },
                            ]}
                          />
                          <input
                            className="m0-input"
                            data-testid="proxy-url"
                            placeholder="http://127.0.0.1:7890"
                            value={proxyUrl}
                            disabled={!config || proxyMode !== 'manual'}
                            onChange={(event) => setProxyUrl(event.target.value)}
                          />
                          <button
                            type="button"
                            className="ui-btn ui-btn--secondary"
                            data-testid="proxy-save"
                            disabled={!config}
                            onClick={() => void saveProxy()}
                          >
                            保存
                          </button>
                          <button
                            type="button"
                            className="ui-btn ui-btn--secondary"
                            data-testid="proxy-detect"
                            onClick={() => void detectProxy()}
                          >
                            检测
                          </button>
                        </div>
                      </div>

                      <div className="st-card">
                        <div className="st-card-info">
                          <span className="st-card-title">开发者工具</span>
                          <span className="st-card-desc">打开开发者工具，用于调试界面代码</span>
                        </div>
                        <div className="st-card-action">
                          <button
                            type="button"
                            className="ui-btn ui-btn--secondary"
                            data-testid="devtools-open"
                            onClick={() => void window.api.invoke('devtools_toggle', { enabled: true })}
                          >
                            打开
                          </button>
                        </div>
                      </div>

                      <div className="st-card">
                        <div className="st-card-info">
                          <span className="st-card-title">账本</span>
                          <span className="st-card-desc">新建或删除账本；侧栏左上角可切换当前账本</span>
                        </div>
                        <div className="st-card-action">
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
                            className="ui-btn ui-btn--secondary"
                            data-testid="ledger-create"
                            disabled={busy || !workspace}
                            onClick={() => void createLedger()}
                          >
                            新建
                          </button>
                        </div>
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
                                className="ui-btn ui-btn--text"
                                disabled={busy}
                                onClick={() => setDeleteTarget(ledger.id)}
                              >
                                删除
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}

                  {settingsTab === 'features' ? (
                    <div className="st-list">
                      <div className="st-card">
                        <div className="st-card-info">
                          <span className="st-card-title">功能开关</span>
                          <span className="st-card-desc">关闭后侧栏不再显示该功能；当前账本可单独覆盖</span>
                        </div>
                      </div>
                      <div className="st-card">
                        <div className="st-card-info">
                          <span className="st-card-title">全局</span>
                        </div>
                        <div className="st-card-action">
                          <div className="m0-features">
                            {FEATURES.map(([key, label]) => (
                              <Switch
                                key={key}
                                testId={`feature-${key}`}
                                label={label}
                                checked={config?.features[key] ?? true}
                                disabled={!config}
                                onChange={(checked) => void toggleFeature(key, checked)}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                      {activeLedgerId ? (
                        <div className="st-card">
                          <div className="st-card-info">
                            <span className="st-card-title">本账本</span>
                          </div>
                          <div className="st-card-action">
                            <div className="m0-features" data-testid="ledger-features">
                              {FEATURES.map(([key, label]) => (
                                <Switch
                                  key={key}
                                  testId={`ledger-feature-${key}`}
                                  label={label}
                                  checked={effectiveFeatures?.[key] ?? true}
                                  disabled={!config}
                                  onChange={(checked) => void toggleLedgerFeature(key, checked)}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {settingsTab === 'diary' ? (
                    <div className="st-list">
                      <div className="st-card">
                        <div className="st-card-info">
                          <span className="st-card-title">日记格式</span>
                          <span className="st-card-desc">每篇日记按 YYYY-MM-DD 保存；正文按纯文本呈现。</span>
                        </div>
                      </div>
                      <div className="st-card">
                        <div className="st-card-info">
                          <span className="st-card-title">导入 / 导出</span>
                          <span className="st-card-desc">按目录扫描或导出 YYYY-MM-DD.txt；入口在日记页。</span>
                        </div>
                        <div className="st-card-action">
                          <button
                            type="button"
                            className="ui-btn ui-btn--secondary"
                            onClick={() => setView('diary')}
                          >
                            前往日记
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {settingsTab === 'about' ? (
                    <>
                      <div className="st-list">
                        <div className="st-card">
                          <div className="st-card-info">
                            <span className="st-card-title">Transactions</span>
                            <span className="st-card-desc">版本 {version}</span>
                            <span className="st-card-desc st-card-desc--mono">
                              配置文件：{config?.configPath ?? '…'}（{config?.isDev ? '开发' : '生产'}）
                            </span>
                          </div>
                        </div>
                      </div>
                      <ImportWizard progress={importProgress} onImported={finishImport} />
                      <UpdatePanel snapshot={updateSnapshot} onSnapshot={setUpdateSnapshot} />
                    </>
                  ) : null}

                  {config?.isDev && settingsTab === 'about' ? (
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
                  ) : null}
          </PageLayout>
        ) : null}

        <ConfirmDialog
          open={deleteTarget !== null}
          title="删除账本"
          message="确定删除该账本及其全部记录？此操作不可撤销。"
          confirmText="删除"
          danger
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            const target = deleteTarget
            setDeleteTarget(null)
            if (target) void deleteLedger(target)
          }}
        />
        </div>
      </main>
      </div>
      <span className="sr-only" data-testid="workspace-state">
        {workspace ? `已打开：${workspace}` : '未打开工作空间'}
      </span>
      <span className="sr-only" data-testid="app-info">
        版本 {version}
      </span>
      <ToastHost />
    </>
  )
}





































