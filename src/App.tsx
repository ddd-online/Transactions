import { useCallback, useEffect, useRef, useState, type JSX } from 'react'

import type { ConfigSnapshot, FeatureFlags } from '../shared/types/config'
import type { Ledger } from '../shared/domain/models'
import {
  IMPORT_PROGRESS,
  UPDATE_DOWNLOAD_COMPLETE,
  UPDATE_DOWNLOAD_ERROR,
  UPDATE_DOWNLOAD_PROGRESS,
  WORKSPACE_CHANGED,
} from '../shared/events'
import { ERR_CODE_SOURCE_WORKSPACE } from '../shared/errors'
import type { SourceImportProgress } from '../shared/types/import'
import type { UpdateSnapshot } from '../shared/domain/update'
import { RecordsPage } from './pages/records'
import { ChartsPage } from './pages/charts'
import { CategoryTagPage } from './pages/category-tag'
import { TemplatePage } from './pages/templates'
import { StockPage } from './pages/stock'
import { EventsPage } from './pages/events'
import { DiaryPage } from './pages/diary'
import { TodoPage } from './pages/todo'
import { AntdProvider } from './components/antd-provider'
import { Input, Modal, Switch as AntSwitch } from 'antd'
import { AppMark } from './components/app-mark'
import { Button } from './components/button'
import { ImportWizard } from './pages/import-wizard'
import { DiaryTransfer } from './pages/diary-transfer'
import { UpdatePanel } from './pages/update-panel'
import { ConfirmDialog } from './components/confirm-dialog'
import { notify } from './components/toast'
import { PageHeader } from './components/page-header'
import { Segmented } from './components/segmented'
import { PageLayout, PageRailProvider } from './components/page-layout'
import { SettingsRow } from './components/settings-row'
import { FileButton } from './components/file-button'
import { Icon, type IconName } from './components/icon'

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'msg' in error) {
    return String((error as { msg: unknown }).msg)
  }
  if (error instanceof Error) return error.message
  return String(error)
}

const FEATURES: Array<{
  key: keyof FeatureFlags
  title: string
  description: string
}> = [
  {
    key: 'accounting',
    title: '记账',
    description: '记录 / 分析 / 标签 / 模板，默认功能',
  },
  {
    key: 'stock',
    title: '股票',
    description: '建仓、持仓、成交与资金记录、行情统计',
  },
  {
    key: 'keyEvent',
    title: '事件',
    description: '关键事件与日记、交易的关联',
  },
  {
    key: 'diary',
    title: '日记',
    description: '按账本隔离的纯文本日记，可导入导出 txt',
  },
  {
    key: 'todo',
    title: '待办',
    description: '卡片式待办、进度记录与四象限视图',
  },
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
  const [ledgerName, setLedgerName] = useState('')
  const [ledgerDescription, setLedgerDescription] = useState('')
  const [ledgerDialogOpen, setLedgerDialogOpen] = useState(false)
  const [ledgerError, setLedgerError] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState<View>('accounting')
  const [settingsTab, setSettingsTab] = useState<'general'|'features'|'diary'|'data'|'about'>('general')
  const [ledgerMenuOpen, setLedgerMenuOpen] = useState(false)
  const [accountingTab, setAccountingTab] = useState<
    'records' | 'charts' | 'tags' | 'templates'
  >('records')
  const [importProgress, setImportProgress] = useState<SourceImportProgress | null>(null)
  const [updateSnapshot, setUpdateSnapshot] = useState<UpdateSnapshot | null>(null)
  const [workspacePromptDismissed, setWorkspacePromptDismissed] = useState(false)
  const [proxyMode, setProxyMode] = useState('auto')
  const [proxyUrl, setProxyUrl] = useState('')
  const [proxyTesting, setProxyTesting] = useState(false)
  const [proxyResolved, setProxyResolved] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [workspaceIconUrl, setWorkspaceIconUrl] = useState('')
  const ledgerMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ledgerMenuOpen) return
    const onPointerDown = (event: PointerEvent): void => {
      if (ledgerMenuRef.current && !ledgerMenuRef.current.contains(event.target as Node)) {
        setLedgerMenuOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setLedgerMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [ledgerMenuOpen])

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
    if (!config || proxyMode !== 'auto') {
      setProxyResolved('')
      return
    }
    let alive = true
    setProxyResolved('探测中…')
    void (async () => {
      try {
        const result = await window.api.invoke('proxy_resolve', { mode: 'auto', url: '' })
        if (alive) setProxyResolved(result.url || '直连')
      } catch {
        if (alive) setProxyResolved('未探测到')
      }
    })()
    return () => {
      alive = false
    }
  }, [config?.proxy.mode, config?.proxy.url, proxyMode])

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
        setImportProgress(message.payload as SourceImportProgress)
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
      if (typeof openError === 'object' && openError !== null && (openError as { code?: number }).code === ERR_CODE_SOURCE_WORKSPACE) {
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
      setLedgerError('请输入账本名称')
      return
    }
    setBusy(true)
    setLedgerError('')
    try {
      const ledgerId = await window.api.invoke('ledger_create', {
        name,
        description: ledgerDescription.trim(),
      })
      await window.api.invoke('category_initialize', { ledgerId })
      setLedgerName('')
      setLedgerDescription('')
      setLedgerDialogOpen(false)
      await refreshLedgers()
      setActiveLedgerId(ledgerId)
      notify('账本已创建')
    } catch (createError) {
      setLedgerError(errorMessage(createError))
    } finally {
      setBusy(false)
    }
  }, [ledgerDescription, ledgerName, refreshLedgers])

  const openLedgerDialog = useCallback((): void => {
    setLedgerMenuOpen(false)
    setLedgerName('')
    setLedgerDescription('')
    setLedgerError('')
    setLedgerDialogOpen(true)
  }, [])

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
    setProxyTesting(true)
    try {
      const result = await window.api.invoke('proxy_test', {
        mode: proxyMode,
        url: proxyUrl,
      })
      notify(result.message, result.ok ? 'success' : 'error')
    } catch (detectError) {
      notify(`代理连接失败：${errorMessage(detectError)}`, 'error')
    } finally {
      setProxyTesting(false)
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
    <AntdProvider appearance={config?.appearance}>
      <>
      {!workspace && !workspacePromptDismissed ? (
        <div className="app-workspace-overlay" data-testid="workspace-overlay">
          <div className="app-workspace-card">
            <h1>Transactions</h1>
            <p className="m0-muted">选择一个工作空间开始；所有数据都保存在本地。</p>
            <div className="m0-actions" style={{ justifyContent: 'center' }}>
              <Button
                variant="primary"
                testId="open-workspace"
                disabled={busy}
                onClick={() => void openWorkspace()}
              >
                选择工作空间
              </Button>
              <Button
                variant="text"
                testId="open-import"
                onClick={() => {
                  setWorkspacePromptDismissed(true)
                  setSettingsTab('data')
                  setView('settings')
                }}
              >
                导入数据
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="app-shell-body">
      <aside className="app-sidebar">
        <div className="app-left-bar">
          <div className="sidebar-ledger">
            <div className="ledger-anchor" ref={ledgerMenuRef}>
              <button
                type="button"
                className={`ledger-btn${ledgerMenuOpen ? ' is-open' : ''}`}
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
                    <AppMark />
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
                      <div className="ledger-menu-empty" data-testid="ledger-menu-empty">
                        暂无账本
                      </div>
                    ) : (
                      ledgers.map((ledger) => (
                        <div
                          key={ledger.id}
                          data-testid="ledger-menu-row"
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
                            <span className="ledger-dot" />
                            <span className="ledger-menu-name-text">{ledger.name}</span>
                          </button>
                          <Button
                            className="ledger-menu-delete"
                            variant="text-danger"
                            size="sm"
                            testId="ledger-delete"
                            aria-label={`删除账本 ${ledger.name}`}
                            icon={<Icon name="Trash" size={14} />}
                            onClick={() => {
                              setLedgerMenuOpen(false)
                              setDeleteTarget(ledger.id)
                            }}
                          />
                        </div>
                      ))
                    )}
                    <div className="ledger-menu-divider" />
                    <button
                      type="button"
                      className="ledger-menu-create"
                      data-testid="ledger-open-create"
                      role="menuitem"
                      onClick={openLedgerDialog}
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

            {accountingTab === 'records' ? (
              <RecordsPage ledgerId={activeLedgerId} ledgers={ledgers} />
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
                  <div className="st-tabbar" role="tablist" aria-label="设置分栏">
                    {(
                      [
                        ['general', '通用设置'],
                        ['features', '功能开关'],
                        ['diary', '日记配置'],
                        ['data', '数据导入'],
                        ['about', '关于软件'],
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        role="tab"
                        aria-selected={settingsTab === key}
                        data-testid={`settings-tab-${key}`}
                        className={`st-tab${settingsTab === key ? ' is-active' : ''}`}
                        onClick={() => setSettingsTab(key)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {settingsTab === 'general' ? (
                    <div className="st-list">
                      <SettingsRow title="工作空间" description={workspace ?? '尚未选择工作空间'} mono>
                        <Button
                          variant="secondary"
                          testId="open-workspace"
                          disabled={busy}
                          onClick={() => void openWorkspace()}
                        >
                          切换
                        </Button>
                      </SettingsRow>

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
                          <FileButton
                            testId="workspace-icon-input"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            onSelect={(file) => void changeWorkspaceIcon(file)}
                          />
                          <Button
                            variant="secondary"
                            testId="workspace-icon-clear"
                            onClick={() => void clearWorkspaceIcon()}
                          >
                            恢复默认
                          </Button>
                        </div>
                      </div>

                      <SettingsRow title="外观" description="界面配色，可跟随系统">
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
                      </SettingsRow>

                      <SettingsRow title="关闭行为" description="点击右上角关闭按钮时的行为">
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
                      </SettingsRow>

                      <div className="st-card">
                        <div className="st-card-info">
                          <span className="st-card-title">代理</span>
                          <span className="st-card-desc">
                            网络请求（行情、更新检查）走 HTTP 代理；检测会用当前设置请求 GitHub
                          </span>
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
                          {proxyMode === 'auto' ? (
                            <Input
                              className="st-proxy-resolved"
                              data-testid="proxy-resolved"
                              readOnly
                              value={proxyResolved}
                              placeholder="探测中…"
                              title="自动探测到的代理地址"
                            />
                          ) : null}
                          {proxyMode === 'manual' ? (
                            <Input
                              data-testid="proxy-url"
                              placeholder="http://127.0.0.1:7890"
                              value={proxyUrl}
                              disabled={!config}
                              onChange={(event) => setProxyUrl(event.target.value)}
                            />
                          ) : null}
                          {proxyMode === 'manual' ? (
                            <Button
                              variant="secondary"
                              testId="proxy-save"
                              disabled={!config}
                              onClick={() => void saveProxy()}
                            >
                              保存
                            </Button>
                          ) : null}
                          {proxyMode !== 'off' ? (
                            <Button
                              variant="secondary"
                              testId="proxy-detect"
                              loading={proxyTesting}
                              disabled={!config || proxyTesting}
                              onClick={() => void detectProxy()}
                            >
                              检测
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      <SettingsRow title="开发者工具" description="打开开发者工具，用于调试界面代码">
                        <Button
                          variant="secondary"
                          testId="devtools-open"
                          onClick={() => void window.api.invoke('devtools_toggle', { enabled: true })}
                        >
                          打开
                        </Button>
                      </SettingsRow>
                    </div>
                  ) : null}

                  {settingsTab === 'features' ? (
                    <div className="st-feature-pane">
                      <div className="st-feature-hint" data-testid="feature-hint">
                        {activeLedgerId
                          ? `只对当前账本「${activeLedgerName}」生效，切到别的账本可单独配置。`
                          : '当前没有账本：以下开关作为默认值，新账本沿用。'}
                      </div>
                      <div className="st-list">
                        {FEATURES.map(({ key, title, description }) => {
                          const checked = activeLedgerId
                            ? (effectiveFeatures?.[key] ?? true)
                            : (config?.features[key] ?? true)
                          return (
                            <div className="st-card" key={key} data-testid={`feature-row-${key}`}>
                              <div className="st-card-info">
                                <span className="st-card-title">{title}</span>
                                <span className="st-card-desc">{description}</span>
                              </div>
                              <div className="st-card-action">
                                <AntSwitch
                                  checked={checked}
                                  disabled={!config}
                                  data-testid={`feature-${key}`}
                                  aria-label={title}
                                  onChange={(next) => {
                                    if (activeLedgerId) void toggleLedgerFeature(key, next)
                                    else void toggleFeature(key, next)
                                  }}
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}

                  {settingsTab === 'diary' ? <DiaryTransfer ledgerId={activeLedgerId} /> : null}

                  {settingsTab === 'data' ? (
                    <div className="st-list">
                      <ImportWizard progress={importProgress} onImported={finishImport} />
                    </div>
                  ) : null}

                  {settingsTab === 'about' ? (
                    <div className="st-about">
                      <div className="st-about-main">
                        <div className="st-about-header">
                          <div className="st-app-logo">
                            <AppMark />
                          </div>
                          <h2 className="st-app-name">Transactions</h2>
                          <p className="st-app-version">版本 {version}</p>
                        </div>
                        <UpdatePanel snapshot={updateSnapshot} onSnapshot={setUpdateSnapshot} />
                        <div className="st-about-footer">
                          <a
                            className="st-about-link"
                            href="https://github.com/ddd-online/Transactions"
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Icon name="GitHub" size={14} />
                            <span className="st-about-link-text">GitHub</span>
                          </a>
                          <p className="st-about-copyright">
                            © {new Date().getFullYear()} Transactions. All rights reserved.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}
          </PageLayout>
        ) : null}

        <Modal
          open={ledgerDialogOpen}
          title="创建账本"
          width={400}
          centered
          destroyOnHidden
          footer={null}
          onCancel={() => setLedgerDialogOpen(false)}
        >
          <div className="tr-modal-form">
            <div className="tr-modal-field">
              <span className="tr-modal-label">名称</span>
              <Input
                data-testid="ledger-name"
                placeholder="请输入账本名称"
                value={ledgerName}
                disabled={busy || !workspace}
                onChange={(event) => setLedgerName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void createLedger()
                }}
              />
            </div>
            <div className="tr-modal-field">
              <span className="tr-modal-label">描述</span>
              <Input
                data-testid="ledger-description"
                placeholder="请输入账本描述"
                value={ledgerDescription}
                disabled={busy || !workspace}
                onChange={(event) => setLedgerDescription(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void createLedger()
                }}
              />
            </div>
            {ledgerError ? (
              <p className="m0-error" data-testid="ledger-error">
                {ledgerError}
              </p>
            ) : null}
            <div className="tr-modal-footer">
              <Button variant="secondary" onClick={() => setLedgerDialogOpen(false)}>
                取消
              </Button>
              <Button
                variant="primary"
                testId="ledger-create"
                disabled={busy || !workspace}
                onClick={() => void createLedger()}
              >
                创建
              </Button>
            </div>
          </div>
        </Modal>

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
      </>
    </AntdProvider>
  )
}






































