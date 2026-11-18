import { createContext, useContext, type JSX, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { usePageFooterSlot } from './page-footer'
import { ScrollArea } from './scroll-area'

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
  /**
   * 页面底栏的内容（记录页的收支合计、股票记录的汇总…）。
   * 它不再画在页面主列里，而是投进外壳的常驻底栏右侧；不传就空着。
   */
  footer?: ReactNode
  /** 页面内容由统一的悬浮滚动条接管（适合内容整体滚动的页面）。 */
  scrollable?: boolean
  contentClassName?: string
  children: ReactNode
}

/** 功能页统一骨架：侧栏之外的子功能栏 / 工具栏 / 内容；页面底栏投进外壳底栏。 */
export function PageLayout({
  rail,
  toolbar,
  footer,
  scrollable = false,
  contentClassName,
  children,
}: PageLayoutProps): JSX.Element {
  const contextRail = usePageRail()
  const railContent = rail ?? contextRail
  const footerSlot = usePageFooterSlot()
  return (
    <section className="page">
      <div className="page-region">
        {railContent ? <aside className="page-rail">{railContent}</aside> : null}
        <div className="page-main">
          {toolbar ? <div className="page-toolbar">{toolbar}</div> : null}
          <div
            className={`page-content${scrollable ? ' page-content--scroll' : ''}${
              contentClassName ? ` ${contentClassName}` : ''
            }`}
          >
            {scrollable ? (
              <ScrollArea className="page-scroll" notifyResize>
                {children}
              </ScrollArea>
            ) : (
              children
            )}
          </div>
        </div>
      </div>
      {footer && footerSlot ? createPortal(footer, footerSlot) : null}
    </section>
  )
}
