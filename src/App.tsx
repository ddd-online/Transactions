import { lazy, Suspense, useCallback, useEffect, useRef, useState, type JSX } from 'react'

import type { FeatureFlags } from '../shared/types/config'
/* 页面按需加载：一次只挂一页，但此前八页（外加 G2、react-markdown）全被打进同一个
 * 6.5MB 的 chunk，开哪个页面都要先把所有页面的代码解析一遍。拆开之后入口只剩外壳与
 * antd，图表页与日记页各自带着自己的那份（详见 DESIGN.md「Performance」）。 */
const RecordsPage = lazy(async () => ({ default: (await import('./pages/records')).RecordsPage }))
const ChartsPage = lazy(async () => ({ default: (await import('./pages/charts')).ChartsPage }))
const CategoryTagPage = lazy(async () => ({
  default: (await import('./pages/category-tag')).CategoryTagPage,
}))
const TemplatePage = lazy(async () => ({ default: (await import('./pages/templates')).TemplatePage }))
const StockPage = lazy(async () => ({ default: (await import('./pages/stock')).StockPage }))
const EventsPage = lazy(async () => ({ default: (await import('./pages/events')).EventsPage }))
const DiaryPage = lazy(async () => ({ default: (await import('./pages/diary')).DiaryPage }))
const TodoPage = lazy(async () => ({ default: (await import('./pages/todo')).TodoPage }))
import { AntdProvider } from './components/antd-provider'
import { Input, Modal } from 'antd'
import { AppMark } from './components/app-mark'
import { Button } from './components/button'
import { IdentityDot } from './components/identity-dot'
import { ConfirmDialog } from './components/confirm-dialog'
import { Tooltip } from './components/tooltip'
import { PageHeader } from './components/page-header'
import { SettingsPage } from './pages/settings'
import { PageBoundary } from './components/page-boundary'
import { PageRailProvider } from './components/page-layout'
import { QuitScreen } from './components/quit-screen'
import { Icon, type IconName } from './components/icon'
import { useQuitFlow } from './state/use-quit-flow'
import { useAppStartup } from './state/use-app-startup'
import { useWorkspaceSession } from './state/use-workspace-session'
import { useLedgerSession } from './state/use-ledger-session'

type View = 'accounting' | 'stock' | 'events' | 'diary' | 'todo' | 'settings'

const NAV: Array<[View, string, keyof FeatureFlags]> = [
  ['accounting', '记账', 'accounting'],
  ['stock', '股票', 'stock'],
  ['todo', '待办', 'todo'],
  ['events', '事件', 'keyEvent'],
  ['diary', '日记', 'diary'],
]

export function App(): JSX.Element {
  const [ledgerName, setLedgerName] = useState('')
  const [ledgerDescription, setLedgerDescription] = useState('')
  const [ledgerDialogOpen, setLedgerDialogOpen] = useState(false)
  const [ledgerError, setLedgerError] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState<View>('accounting')
  const [ledgerMenuOpen, setLedgerMenuOpen] = useState(false)
  const [accountingTab, setAccountingTab] = useState<
    'records' | 'charts' | 'tags' | 'templates'
  >('records')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const { quitting, quitLabel } = useQuitFlow()
  const ledgerMenuRef = useRef<HTMLDivElement>(null)
  const { version, config, setConfig, updateSnapshot, setUpdateSnapshot, maximized } = useAppStartup({
    onError: setError,
  })
  const {
    workspace,
    workspaceIconUrl,
    setWorkspaceIconUrl,
    blockingWorkspace,
    openWorkspace,
    openWorkspaceAt,
    dismissPrompt,
  } = useWorkspaceSession({
    config,
    setBusy,
    onConfigChanged: setConfig,
    onError: setError,
  })
  const {
    ledgers,
    activeLedgerId,
    setActiveLedgerId,
    activeLedgerName,
    effectiveFeatures,
    refreshLedgers,
    createLedger,
    deleteLedger,
  } = useLedgerSession({
    workspace,
    config,
    setBusy,
    onError: setError,
  })

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

  const submitLedger = useCallback(async (): Promise<void> => {
    const name = ledgerName.trim()
    if (!name) {
      setLedgerError('请输入账本名称')
      return
    }
    setLedgerError('')
    const failure = await createLedger(name, ledgerDescription.trim(), () => {
      setLedgerName('')
      setLedgerDescription('')
      setLedgerDialogOpen(false)
    })
    if (failure) setLedgerError(failure)
  }, [createLedger, ledgerDescription, ledgerName])

  const openLedgerDialog = useCallback((): void => {
    setLedgerMenuOpen(false)
    setLedgerName('')
    setLedgerDescription('')
    setLedgerError('')
    setLedgerDialogOpen(true)
  }, [])

  useEffect(() => {
    if (view === 'settings') return
    const entry = NAV.find(([key]) => key === view)
    if (entry && effectiveFeatures?.[entry[2]] === false) setView('accounting')
  }, [effectiveFeatures, view])

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

  // 首屏（还没有工作空间）的阻塞层：背后那副外壳仍然渲染，但对指针、键盘、读屏都关掉，
  // 焦点落在这一层上 —— 否则 Tab 两下就走进看不见的账本菜单与导航里。
  const workspacePickerRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (blockingWorkspace) workspacePickerRef.current?.focus()
  }, [blockingWorkspace])

  return (
    <AntdProvider appearance={config?.appearance}>
      <>
      {blockingWorkspace ? (
        <div
          className="app-workspace-overlay"
          data-testid="workspace-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="选择工作空间"
          tabIndex={-1}
          ref={workspacePickerRef}
        >
          <div className="app-workspace-card">
            <h1>Transactions</h1>
            <p className="m0-muted">选择一个工作空间开始；所有数据都保存在本地。</p>
            {/* 打开失败的那句话必须落在这张卡上：背后的页面被遮罩盖住，
                写在外壳里的错误谁也看不见（旧版工作空间就是这么「点了没反应」的）。 */}
            {error ? (
              <p role="alert" className="m0-error" data-testid="workspace-error">
                {error}
              </p>
            ) : null}
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
                testId="open-app-settings"
                onClick={() => {
                  // 还没有工作空间时也要能进设置：代理与检查更新是应用级的，
                  // 不该被「先选工作空间」挡在外面。
                  dismissPrompt()
                  setView('settings')
                }}
              >
                应用设置
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="app-shell-body is-sidebar-collapsed">
      <aside className="app-sidebar" inert={blockingWorkspace || undefined}>
        <div className="app-left-bar is-collapsed">
          <div className="sidebar-ledger">
            <div className="ledger-anchor" ref={ledgerMenuRef}>
              <button
                type="button"
                className={`ledger-btn workspace-btn${ledgerMenuOpen ? ' is-open' : ''}`}
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
                          <Tooltip text={ledger.description.trim() || '暂无描述'}>
                            <button
                              type="button"
                              className="ledger-menu-name"
                              role="menuitem"
                              onClick={() => {
                                setActiveLedgerId(ledger.id)
                                setLedgerMenuOpen(false)
                              }}
                            >
                              <IdentityDot seed={ledger.id} size={6} />
                              <span className="ledger-menu-name-text">{ledger.name}</span>
                            </button>
                          </Tooltip>
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
        <PageHeader title={pageTitle} ariaHidden={blockingWorkspace} />
        <div className="app-top-bar">
          <div className="window-controls">
            <button
              type="button"
              className="window-btn"
              data-testid="window-minimize"
              title="最小化"
              onClick={() => void window.api.invoke('window_control', { action: 'minimize' })}
            >
              <Icon name="WindowMinimize" size={16} />
            </button>
            <button
              type="button"
              className="window-btn"
              data-testid="window-maximize"
              title={maximized ? '还原' : '最大化'}
              onClick={() => void window.api.invoke('window_control', { action: 'maximize' })}
            >
              <Icon name={maximized ? 'WindowRestore' : 'WindowMaximize'} size={14} />
            </button>
            <button
              type="button"
              className="window-btn window-btn--close"
              data-testid="window-close"
              title="关闭"
              onClick={() => void window.api.invoke('window_control', { action: 'close' })}
            >
              <Icon name="Close" size={16} />
            </button>
          </div>
        </div>
        <div className="app-router-view" inert={blockingWorkspace || undefined}>
        {error ? (
          <p role="alert" className="m0-error" data-testid="error">
            {error}
          </p>
        ) : null}

        {view === 'accounting' ? (
          <PageRailProvider
            rail={
                <div className="page-rail-nav">
                  {(
                    [
                      ['records', '记录', 'Edit'],
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

            {/* 兜底是 null：按需加载的等待只有几毫秒（本机 app:// 读盘），中间插一块
                骨架反而会闪一下。Suspense 放在 PageRailProvider **里面** —— 在外面的话
                每次切页都会把侧轨的展开状态与工具栏宿主一起重挂。
                `key` 跟着子功能走：某一页挂了之后切走再回来，边界自己重置一次。 */}
            <PageBoundary key={`accounting-${accountingTab}`}>
              <Suspense fallback={null}>
                {accountingTab === 'records' ? (
                  <RecordsPage ledgerId={activeLedgerId} ledgers={ledgers} />
                ) : null}
                {accountingTab === 'charts' ? <ChartsPage ledgerId={activeLedgerId} /> : null}
                {accountingTab === 'tags' ? <CategoryTagPage ledgerId={activeLedgerId} /> : null}
                {accountingTab === 'templates' ? <TemplatePage ledgerId={activeLedgerId} /> : null}
              </Suspense>
            </PageBoundary>
          </PageRailProvider>
        ) : null}

        <PageBoundary key={`view-${view}`}>
          <Suspense fallback={null}>
            {view === 'stock' ? (
              <StockPage ledgerId={activeLedgerId} onLedgerChanged={() => void refreshLedgers()} />
            ) : null}

            {view === 'events' ? <EventsPage ledgerId={activeLedgerId} /> : null}

            {view === 'diary' ? <DiaryPage ledgerId={activeLedgerId} /> : null}

            {view === 'todo' ? <TodoPage ledgerId={activeLedgerId} /> : null}
          </Suspense>
        </PageBoundary>

        {view === 'settings' ? (
          <SettingsPage
            workspace={workspace}
            activeLedgerId={activeLedgerId}
            config={config}
            effectiveFeatures={effectiveFeatures}
            version={version}
            workspaceIconUrl={workspaceIconUrl}
            updateSnapshot={updateSnapshot}
            onUpdateSnapshot={setUpdateSnapshot}
            onPickWorkspace={openWorkspace}
            onOpenWorkspace={openWorkspaceAt}
            onConfigChanged={setConfig}
            onWorkspaceIconChanged={setWorkspaceIconUrl}
          />
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
                  if (event.key === 'Enter') void submitLedger()
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
                  if (event.key === 'Enter') void submitLedger()
                }}
              />
            </div>
            {ledgerError ? (
              <p role="alert" className="m0-error" data-testid="ledger-error">
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
                onClick={() => void submitLedger()}
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
      {quitting ? <QuitScreen label={quitLabel} /> : null}
      </>
    </AntdProvider>
  )
}






































