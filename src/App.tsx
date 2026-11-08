import { lazy, Suspense, useEffect, useRef, useState, type JSX } from 'react'

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
import { Button } from './components/button'
import { PageHeader } from './components/page-header'
import { AppLedgerMenu } from './app-ledger-menu'
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState<View>('accounting')
  const [accountingTab, setAccountingTab] = useState<
    'records' | 'charts' | 'tags' | 'templates'
  >('records')
  const { quitting, quitLabel } = useQuitFlow()
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
            <AppLedgerMenu
              ledgers={ledgers}
              activeLedgerId={activeLedgerId}
              activeLedgerName={activeLedgerName}
              workspaceIconUrl={workspaceIconUrl}
              workspace={workspace}
              busy={busy}
              onSelect={setActiveLedgerId}
              onCreate={createLedger}
              onDelete={deleteLedger}
            />
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






































