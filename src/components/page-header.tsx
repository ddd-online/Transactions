import type { JSX } from 'react'

export interface PageHeaderProps {
  title: string
  /** 阻塞层盖住整屏时，这条标题带对读屏也一起收起来（它仍留在画面里当窗标题）。 */
  ariaHidden?: boolean
}

/** 顶栏居中标题，右侧留给窗口控制。 */
export function PageHeader({ title, ariaHidden = false }: PageHeaderProps): JSX.Element {
  return (
    <header className="page-header" aria-hidden={ariaHidden || undefined}>
      <h1 className="page-title">Transactions-{title}</h1>
    </header>
  )
}
