import type { JSX, ReactNode } from 'react'

import type { FeatureFlags } from '../shared/types/config'
import { Icon, type IconName } from './components/icon'
import { PageHeader } from './components/page-header'
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
  /** 全局默认 + 当前账本的覆盖；null = 配置还没读到，导航先全显示。 */
  features: FeatureFlags | null
  /** 首屏阻塞层盖住整屏：外壳对指针、键盘、读屏都关掉。 */
  blockingWorkspace: boolean
  maximized: boolean
  onWindowControl: (action: 'minimize' | 'maximize' | 'close') => void
  /** 左侧栏顶部的账本切换（由 app-ledger-menu 提供）。 */
  ledgerMenu: ReactNode
  error: string
  workspace: string
  version: string
  children: ReactNode
}

/**
 * 外壳骨架：左侧图标条 + 导航 + 顶部窗口控制 + 内容区，以及两个给测试/读屏的状态文本。
 *
 * 纯展示模块：窗口控制、导航切换都由 props 回调决定，自己不碰 `window.api`。
 */
export function AppShell({
  view,
  onViewChange,
  features,
  blockingWorkspace,
  maximized,
  onWindowControl,
  ledgerMenu,
  error,
  workspace,
  version,
  children,
}: AppShellProps): JSX.Element {
  return (
    <>
      <div className="app-shell-body is-sidebar-collapsed">
        <aside className="app-sidebar" inert={blockingWorkspace || undefined}>
          <div className="app-left-bar is-collapsed">
            <div className="sidebar-ledger">{ledgerMenu}</div>

            <nav className="sidebar-nav" aria-label="主导航">
              {NAV_VIEWS.filter(({ feature }) => features?.[feature] !== false).map(
                ({ view: key, label }) => (
                  <button
                    key={key}
                    type="button"
                    data-testid={`nav-${key}`}
                    className={`nav-btn${view === key ? ' active' : ''}`}
                    aria-label={label}
                    onClick={() => onViewChange(key)}
                  >
                    <span className="nav-btn-icon">
                      <Icon name={NAV_ICON[key]} size={18} />
                    </span>
                    <span className="nav-btn-text">{label}</span>
                  </button>
                ),
              )}
            </nav>

            <div className="sidebar-spacer" />
            <div className="sidebar-bottom">
              <button
                type="button"
                data-testid="nav-settings"
                className={`nav-btn nav-btn-secondary${view === 'settings' ? ' active' : ''}`}
                aria-label="应用设置"
                onClick={() => onViewChange('settings')}
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
          <PageHeader title={viewLabel(view)} ariaHidden={blockingWorkspace} />
          <div className="app-top-bar">
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
      <span className="sr-only" data-testid="workspace-state">
        {workspace ? `已打开：${workspace}` : '未打开工作空间'}
      </span>
      <span className="sr-only" data-testid="app-info">
        版本 {version}
      </span>
    </>
  )
}
