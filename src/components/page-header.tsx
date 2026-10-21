import type { JSX } from 'react'

export interface PageHeaderProps {
  title: string
}

/** 旧版 page-header：48/56px 顶栏内居中标题，右侧留给窗口控制。 */
export function PageHeader({ title }: PageHeaderProps): JSX.Element {
  return (
    <header className="page-header">
      <h1 className="page-title">Transactions-{title}</h1>
    </header>
  )
}

