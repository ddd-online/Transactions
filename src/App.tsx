import { lazy, Suspense, useCallback, useEffect, useState, type JSX } from 'react'

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
import { AppLedgerMenu } from './app-ledger-menu'
import { AppShell, viewFeature, type View } from './app-shell'
import { WorkspaceOverlay } from './app-workspace-overlay'
import { SettingsPage } from './pages/settings'
import { PageBoundary } from './components/page-boundary'
import { PageRailProvider } from './components/page-layout'
import { QuitScreen } from './components/quit-screen'
import { Icon } from './components/icon'
import { useQuitFlow } from './state/use-quit-flow'
import { useAppStartup } from './state/use-app-startup'
import { useWorkspaceSession } from './state/use-workspace-session'
import { useLedgerSession } from './state/use-ledger-session'

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

  // 当前视图被功能开关关掉时退回记账页（设置页永远可进）。
  useEffect(() => {
    const feature = viewFeature(view)
    if (feature && effectiveFeatures?.[feature] === false) setView('accounting')
  }, [effectiveFeatures, view])

  const controlWindow = useCallback(
    (action: 'minimize' | 'maximize' | 'close'): void => {
      void window.api.invoke('window_control', { action })
    },
    [],
  )

  return (
    <AntdProvider appearance={config?.appearance}>
      <>
        <WorkspaceOverlay
          open={blockingWorkspace}
          error={error}
          busy={busy}
          onPickWorkspace={openWorkspace}
          onOpenSettings={() => {
            // 还没有工作空间时也要能进设置：代理与检查更新是应用级的，
            // 不该被「先选工作空间」挡在外面。
            dismissPrompt()
            setView('settings')
          }}
        />

        <AppShell
          view={view}
          onViewChange={setView}
          features={effectiveFeatures}
          blockingWorkspace={blockingWorkspace}
          maximized={maximized}
          onWindowControl={controlWindow}
          ledgerMenu={
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
          }
          error={error}
          workspace={workspace}
          version={version}
        >
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
        </AppShell>
        {quitting ? <QuitScreen label={quitLabel} /> : null}
      </>
    </AntdProvider>
  )
}
