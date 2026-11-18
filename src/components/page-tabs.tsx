/**
 * 子功能页签：同一顶级功能下的模式切换（记录 / 分析 / 标签 / 模板…）。
 *
 * 它取代了原来那条竖向图标条 —— 两条并排的竖栏都用 32px 图标键，只靠一条发丝线
 * 分开，视觉上会读成一条更宽的导航；页签把子功能的名字直接写出来，只有一条竖栏。
 *
 * 页签属于**页面**，不属于外壳：它排在页面顶部、工具栏之前，随页面切换。
 */
import { createContext, useContext, type JSX, type ReactNode } from 'react'

export interface PageTab {
  key: string
  label: string
  active?: boolean
  testId?: string
  onClick: () => void
}

export const PageTabsContext = createContext<PageTab[] | null>(null)

/** 记账的四个子功能共用同一组页签：由 App 提供，页面里的 `PageLayout` 取用。 */
export function PageTabsProvider({
  tabs,
  children,
}: {
  tabs: PageTab[]
  children: ReactNode
}): JSX.Element {
  return <PageTabsContext.Provider value={tabs}>{children}</PageTabsContext.Provider>
}

export function usePageTabs(): PageTab[] | null {
  return useContext(PageTabsContext)
}

/** 页签条本身：文字按钮，激活项主色 + 2px 下划线；窄窗折行，不横向滚动。 */
export function PageTabs({ tabs }: { tabs: PageTab[] }): JSX.Element {
  return (
    <nav className="page-tabs" aria-label="子功能">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={`page-tab${tab.active ? ' is-active' : ''}`}
          data-testid={tab.testId}
          aria-current={tab.active ? 'page' : undefined}
          onClick={tab.onClick}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
