import { lazy, Suspense, useCallback, useEffect, useState, type JSX } from 'react'

import { errorMessage } from '../shared/errors'

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
import { AppMenu } from './app-menu'
import { AppShell } from './app-shell'
import { resolveView, defaultView, type View } from './app-view'
import { WorkspaceOverlay } from './app-workspace-overlay'
import { SettingsPage, type SettingsTab } from './pages/settings'
import { PageBoundary } from './components/page-boundary'
import { PageRailProvider } from './components/page-layout'
import { QuitScreen } from './components/quit-screen'
import { Icon } from './components/icon'
import { notify } from './components/toast'
import { useQuitFlow } from './state/use-quit-flow'
import { useAppStartup } from './state/use-app-startup'
import { useWorkspaceSession } from './state/use-workspace-session'
import { useLedgerSession } from './state/use-ledger-session'
import { useThemeMode } from './theme/theme-mode'

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

  // 实际渲染哪一页：当前页被功能开关关掉时落到第一个还开着的功能（设置页永远可进）。
  // 派生而不是在 effect 里改 state —— 配置到达时第一帧就是对的那页，不会先闪一下记账页。
  const currentView = resolveView(view, effectiveFeatures)

  // 设置是浮在当前页上的一块工具窗（不是又一页）：`settingsOpen` 只管浮层，
  // 背后的页面照常挂着、只是被遮罩压暗。功能全关时没有任何页可回，设置就变成
  // 唯一的内容（`currentView === 'settings'`），此时关不掉。
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general')
  const [settingsOpen, setSettingsOpen] = useState(false)
  /** 关掉设置就把当前页重挂一次：设置里的导入 / 恢复改的也是这一页的数据，
   *  以前靠「设置是一页、离开就卸载」拿到刷新，浮层不卸载页面，得自己补这一下。 */
  const [pageEpoch, setPageEpoch] = useState(0)

  const openSettings = useCallback((tab: SettingsTab): void => {
    setSettingsTab(tab)
    setSettingsOpen(true)
  }, [])

  /** 没有任何功能页可回时（功能全关），设置不能关 —— 关了只剩一片空白。 */
  const canCloseSettings = defaultView(effectiveFeatures) !== 'settings'

  const closeSettings = useCallback((): void => {
    if (!canCloseSettings) return
    setSettingsOpen(false)
    if (view === 'settings') setView(defaultView(effectiveFeatures))
    setPageEpoch((epoch) => epoch + 1)
  }, [canCloseSettings, effectiveFeatures, view])

  const settingsVisible = settingsOpen || currentView === 'settings'

  // state 跟着派生结果追上：否则开关关掉时 state 还停在旧页，等开关再打开就会把用户
  // 从设置页拽回去。渲染只看 currentView，这一步只是让两边不打架。
  useEffect(() => {
    if (currentView !== view) setView(currentView)
  }, [currentView, view])

  const controlWindow = useCallback(
    (action: 'minimize' | 'maximize' | 'close'): void => {
      void window.api.invoke('window_control', { action })
    },
    [],
  )

  /** 标题栏菜单里的主题切换：与设置页那条分段是同一个写入、同一份配置。 */
  const changeAppearance = useCallback(
    async (appearance: string): Promise<void> => {
      try {
        await window.api.invoke('config_set_appearance', { appearance })
        if (config) setConfig({ ...config, appearance })
      } catch (appearanceError) {
        notify(errorMessage(appearanceError), 'error')
      }
    },
    [config, setConfig],
  )

  const openDevtools = useCallback((): void => {
    void window.api.invoke('devtools_toggle', { enabled: true })
  }, [])

  /** 标题栏的太阳 / 月亮键：按当前**生效**的外观一按就翻面，写回显式 light / dark。 */
  const themeMode = useThemeMode()
  const toggleTheme = useCallback((): void => {
    void changeAppearance(themeMode === 'dark' ? 'light' : 'dark')
  }, [changeAppearance, themeMode])

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
            openSettings('general')
          }}
        />

        <AppShell
          view={currentView}
          onViewChange={setView}
          onOpenSettings={() => openSettings('general')}
          features={effectiveFeatures}
          blockingWorkspace={blockingWorkspace}
          maximized={maximized}
          onWindowControl={controlWindow}
          themeMode={themeMode}
          onToggleTheme={toggleTheme}
          menu={
            <AppMenu
              ledgers={ledgers}
              activeLedgerId={activeLedgerId}
              activeLedgerName={activeLedgerName}
              workspace={workspace}
              busy={busy}
              onSelect={setActiveLedgerId}
              onCreate={createLedger}
              onDelete={deleteLedger}
              onOpenSettings={() => openSettings('general')}
              onOpenDevtools={openDevtools}
            />
          }
          ledgerName={activeLedgerName}
          error={error}
          workspace={workspace}
          version={version}
        >
          {currentView === 'accounting' ? (
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
              <PageBoundary key={`accounting-${accountingTab}-${pageEpoch}`}>
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

          {currentView === 'settings' ? null : (
            <PageBoundary key={`view-${currentView}-${pageEpoch}`}>
              <Suspense fallback={null}>
                {currentView === 'stock' ? (
                  <StockPage ledgerId={activeLedgerId} onLedgerChanged={() => void refreshLedgers()} />
                ) : null}

                {currentView === 'events' ? <EventsPage ledgerId={activeLedgerId} /> : null}

                {currentView === 'diary' ? <DiaryPage ledgerId={activeLedgerId} /> : null}

                {currentView === 'todo' ? <TodoPage ledgerId={activeLedgerId} /> : null}
              </Suspense>
            </PageBoundary>
          )}
        </AppShell>

        {settingsVisible ? (
          <SettingsPage
            workspace={workspace}
            activeLedgerId={activeLedgerId}
            config={config}
            effectiveFeatures={effectiveFeatures}
            version={version}
            workspaceIconUrl={workspaceIconUrl}
            updateSnapshot={updateSnapshot}
            tab={settingsTab}
            onTabChange={setSettingsTab}
            canClose={canCloseSettings}
            onClose={closeSettings}
            onUpdateSnapshot={setUpdateSnapshot}
            onPickWorkspace={openWorkspace}
            onOpenWorkspace={openWorkspaceAt}
            onConfigChanged={setConfig}
            onWorkspaceIconChanged={setWorkspaceIconUrl}
          />
        ) : null}
        {quitting ? <QuitScreen label={quitLabel} /> : null}
      </>
    </AntdProvider>
  )
}
