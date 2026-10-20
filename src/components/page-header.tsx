import type { JSX } from 'react'

export interface PageHeaderProps {
  title: string
}

/** 旧版 page-header：48/56px 顶栏内居中标题，右侧留给窗口控制。 */
export function PageHeader({ title }: PageHeaderProps): JSX.Element {
  return (
    <div className="page-header">
      <h1>{title}</h1>
    </div>
  )
}
