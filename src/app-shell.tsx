import { useState, type JSX, type ReactNode } from 'react'

import type { UpdateSnapshot } from '../shared/domain/update'
import type { FeatureFlags } from '../shared/types/config'
import { AppFooter } from './components/app-footer'
import { Icon, type IconName } from './components/icon'
import { IconButton } from './components/icon-button'
import { PageFooterSlotContext } from './components/page-footer'
import type { ThemeMode } from './theme/theme-mode'
import { NAV_VIEWS, viewLabel, type View } from './app-view'

const NAV_ICON: Record<View, IconName> = {
  accounting: 'Transaction',
  stock: 'Sliders',
  todo: 'CheckCircle',
  events: 'Star',
  diary: 'Read',
  settings: 'Setting',
}

export interface AppShellProps {
  view: View
  onViewChange: (view: View) => void
  /** 打开设置浮层（应用设置是工具窗，不是导航里的一页）。 */
  onOpenSettings: () => void
  /** 底栏「?」菜单里查到新版本时，落到设置 · 关于软件下载 / 安装。 */
  onOpenAbout: () => void
  /** 全局更新快照与写回：设置页与底栏读的是同一份。 */
  updateSnapshot: UpdateSnapshot | null
  onUpdateSnapshot: (snapshot: UpdateSnapshot) => void
  /** 全局默认 + 当前账本的覆盖；null = 配置还没读到，导航先全显示。 */
  features: FeatureFlags | null
  /** 首屏阻塞层盖住整屏：外壳对指针、键盘、读屏都关掉。 */
  blockingWorkspace: boolean
  maximized: boolean
  onWindowControl: (action: 'minimize' | 'maximize' | 'close') => void
  /** 当前生效的外观：太阳 / 月亮键据此换图标。 */
  themeMode: ThemeMode
  onToggleTheme: () => void
  /** 标题栏左上角的应用菜单（由 app-menu 提供）。 */
  menu: ReactNode
  /** 当前账本名：侧栏不再常驻头像与名字，读屏仍要读得出现在记在哪一本上。 */
  ledgerName: string
  error: string
  workspace: string
  version: string
  children: ReactNode
}

/**
 * 外壳骨架：横贯窗口的标题栏 + 中栏（左侧图标条 + 内容区）+ 常驻底栏，
 * 以及给测试/读屏的状态文本。
 *
 * 标题栏是窗口自己的（自绘无边框窗口）：左边是应用菜单入口，中间是页面名，
 * 右边是窗口三键。中栏从标题栏下面开始，底栏再横贯整宽 —— 三条灰带把纸白版心框住。
 * 页面自己的底栏（收支合计、股票汇总）由 `PageLayout` portal 进底栏右侧。
 *
 * 外壳本身不碰 `window.api`：窗口控制、导航切换都由 props 回调决定；
 * 底栏的检查更新由 `FooterHelp` 自己走 IPC。
 */
export function AppShell({
  view,
  onViewChange,
  onOpenSettings,
  onOpenAbout,
  updateSnapshot,
  onUpdateSnapshot,
  features,
  blockingWorkspace,
  maximized,
  onWindowControl,
  themeMode,
  onToggleTheme,
  menu,
  ledgerName,
  error,
  workspace,
  version,
  children,
}: AppShellProps): JSX.Element {
  const [footerSlot, setFooterSlot] = useState<HTMLDivElement | null>(null)

  return (
    <>
      <div className="app-shell">
        <header className="app-titlebar">
          <div className="app-titlebar__start" inert={blockingWorkspace || undefined}>
            {menu}
          </div>
          <h1
            className="app-titlebar__title"
            data-testid="app-title"
            aria-hidden={blockingWorkspace || undefined}
          >
            {viewLabel(view)}
          </h1>
          <div className="app-titlebar__end">
            <IconButton
              icon={themeMode === 'dark' ? 'Moon' : 'Sun'}
              label="外观模式"
              ariaLabel={
                themeMode === 'dark' ? '外观模式：深色，点击切换浅色' : '外观模式：浅色，点击切换深色'
              }
              testId="theme-toggle"
              inert={blockingWorkspace || undefined}
              onClick={onToggleTheme}
            />
            <div className="window-controls">
              <button
                type="button"
                className="window-btn"
                data-testid="window-minimize"
                title="最小化"
                onClick={() => onWindowControl('minimize')}
              >
                <Icon name="WindowMinimize" size={16} />
              </button>
              <button
                type="button"
                className="window-btn"
                data-testid="window-maximize"
                title={maximized ? '还原' : '最大化'}
                onClick={() => onWindowControl('maximize')}
              >
                <Icon name={maximized ? 'WindowRestore' : 'WindowMaximize'} size={14} />
              </button>
              <button
                type="button"
                className="window-btn window-btn--close"
                data-testid="window-close"
                title="关闭"
                onClick={() => onWindowControl('close')}
              >
                <Icon name="Close" size={16} />
              </button>
            </div>
          </div>
        </header>

        <PageFooterSlotContext.Provider value={footerSlot}>
          <div className="app-shell-body">
            <aside className="app-sidebar" inert={blockingWorkspace || undefined}>
              <div className="app-left-bar">
                <nav className="sidebar-nav" aria-label="主导航">
                  {NAV_VIEWS.filter(({ feature }) => features?.[feature] !== false).map(
                    ({ view: key, label }) => (
                      <IconButton
                        key={key}
                        icon={NAV_ICON[key]}
                        label={label}
                        active={view === key}
                        testId={`nav-${key}`}
                        onClick={() => onViewChange(key)}
                      />
                    ),
                  )}
                </nav>

                <div className="sidebar-spacer" />
                <div className="sidebar-bottom">
                  <IconButton
                    icon="Setting"
                    label="应用设置"
                    active={view === 'settings'}
                    testId="nav-settings"
                    onClick={onOpenSettings}
                  />
                </div>
              </div>
            </aside>

            <main className="app-content">
              <div className="app-router-view" inert={blockingWorkspace || undefined}>
                {error ? (
                  <p role="alert" className="m0-error" data-testid="error">
                    {error}
                  </p>
                ) : null}

                {children}
              </div>
            </main>
          </div>
        </PageFooterSlotContext.Provider>

        <AppFooter
          onSlotChange={setFooterSlot}
          onOpenAbout={onOpenAbout}
          updateSnapshot={updateSnapshot}
          onUpdateSnapshot={onUpdateSnapshot}
          inert={blockingWorkspace || undefined}
        />
      </div>
      <span className="sr-only" data-testid="ledger-state">
        {ledgerName ? `当前账本：${ledgerName}` : '未选择账本'}
      </span>
      <span className="sr-only" data-testid="workspace-state">
        {workspace ? `已打开：${workspace}` : '未打开工作空间'}
      </span>
      <span className="sr-only" data-testid="app-info">
        版本 {version}
      </span>
    </>
  )
}
