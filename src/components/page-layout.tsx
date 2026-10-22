import { createContext, useContext, type JSX, type ReactNode } from 'react'

const PageRailContext = createContext<ReactNode>(null)

export function PageRailProvider({ rail, children }: { rail: ReactNode; children: ReactNode }): JSX.Element {
  return <PageRailContext.Provider value={rail}>{children}</PageRailContext.Provider>
}

export function usePageRail(): ReactNode {
  return useContext(PageRailContext)
}

export interface PageLayoutProps {
  /** 左侧子功能图标条的内容；不传则不渲染图标条。 */
  rail?: ReactNode
  /** 顶部工具栏；渲染成 `.page-toolbar`，不传则不留空行。 */
  toolbar?: ReactNode
  /** 底部工具栏；渲染成 `.page-footer-bar`。 */
  footer?: ReactNode
  /** 底栏的附加类名（例如 `page-footer-bar--end` 让内容贴右）。 */
  footerClassName?: string
  contentClassName?: string
  children: ReactNode
}

/** 功能页统一骨架：侧栏之外的子功能栏 / 工具栏 / 内容 / 底栏。 */
export function PageLayout({
  rail,
  toolbar,
  footer,
  footerClassName,
  contentClassName,
  children,
}: PageLayoutProps): JSX.Element {
  const contextRail = usePageRail()
  const railContent = rail ?? contextRail
  return (
    <section className="page">
      <div className="page-region">
        {railContent ? <aside className="page-rail">{railContent}</aside> : null}
        <div className="page-main">
          {toolbar ? <div className="page-toolbar">{toolbar}</div> : null}
          <div className={`page-content${contentClassName ? ` ${contentClassName}` : ''}`}>{children}</div>
          {footer ? (
            <div className={`page-footer-bar${footerClassName ? ` ${footerClassName}` : ''}`}>
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
