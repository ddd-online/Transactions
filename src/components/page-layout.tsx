import { type JSX, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { usePageFooterSlot } from './page-footer'
import { PageTabs, usePageTabs, type PageTab } from './page-tabs'
import { ScrollArea } from './scroll-area'

export interface PageLayoutProps {
  /** 子功能页签；不传就用 `PageTabsProvider` 提供的（记账的四个子功能共用一组）。 */
  tabs?: PageTab[]
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

/** 功能页统一骨架：子功能页签 / 工具栏 / 内容；页面底栏投进外壳底栏。 */
export function PageLayout({
  tabs,
  toolbar,
  footer,
  scrollable = false,
  contentClassName,
  children,
}: PageLayoutProps): JSX.Element {
  const contextTabs = usePageTabs()
  const tabItems = tabs ?? contextTabs
  const footerSlot = usePageFooterSlot()
  return (
    <section className="page">
      {tabItems && tabItems.length > 0 ? <PageTabs tabs={tabItems} /> : null}
      <div className="page-region">
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
