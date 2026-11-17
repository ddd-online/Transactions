import type { JSX, ReactNode } from 'react'

import type { FeatureFlags } from '../shared/types/config'
import { Icon, type IconName } from './components/icon'
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
 * 外壳骨架：横贯窗口的标题栏 + 左侧图标条 + 内容区，以及给测试/读屏的状态文本。
 *
 * 标题栏是窗口自己的（自绘无边框窗口）：左边是应用菜单入口，中间是页面名，
 * 右边是窗口三键。侧栏从标题栏下面才开始，二者拼成一副灰色外壳包住纸白版心。
 *
 * 纯展示模块：窗口控制、导航切换都由 props 回调决定，自己不碰 `window.api`。
 */
export function AppShell({
  view,
  onViewChange,
  onOpenSettings,
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
            <button
              type="button"
              className="titlebar-theme"
              data-testid="theme-toggle"
              title="外观模式"
              inert={blockingWorkspace || undefined}
              aria-label={
                themeMode === 'dark' ? '外观模式：深色，点击切换浅色' : '外观模式：浅色，点击切换深色'
              }
              onClick={onToggleTheme}
            >
              <Icon name={themeMode === 'dark' ? 'Moon' : 'Sun'} size={16} />
            </button>
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

        <div className="app-shell-body">
          <aside className="app-sidebar" inert={blockingWorkspace || undefined}>
            <div className="app-left-bar">
              <nav className="sidebar-nav" aria-label="主导航">
                {NAV_VIEWS.filter(({ feature }) => features?.[feature] !== false).map(
                  ({ view: key, label }) => (
                    <button
                      key={key}
                      type="button"
                      data-testid={`nav-${key}`}
                      className={`nav-btn${view === key ? ' active' : ''}`}
                      title={label}
                      aria-label={label}
                      onClick={() => onViewChange(key)}
                    >
                      <span className="nav-btn-icon">
                        <Icon name={NAV_ICON[key]} size={18} />
                      </span>
                    </button>
                  ),
                )}
              </nav>

              <div className="sidebar-spacer" />
              <div className="sidebar-bottom">
                <button
                  type="button"
                  data-testid="nav-settings"
                  className={`nav-btn${view === 'settings' ? ' active' : ''}`}
                  title="应用设置"
                  aria-label="应用设置"
                  onClick={onOpenSettings}
                >
                  <span className="nav-btn-icon">
                    <Icon name="Setting" size={18} />
                  </span>
                </button>
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
