import type { JSX, ReactNode } from 'react'

export interface SettingsRowProps {
  title: string
  description?: ReactNode
  mono?: boolean
  children?: ReactNode
}

/** 设置页统一行：标题/说明在左，控件在右。 */
export function SettingsRow({ title, description, mono = false, children }: SettingsRowProps): JSX.Element {
  return (
    <div className="st-card">
      <div className="st-card-info">
        <span className="st-card-title">{title}</span>
        {description ? (
          <span className={`st-card-desc${mono ? ' st-card-desc--mono' : ''}`}>{description}</span>
        ) : null}
      </div>
      {children ? <div className="st-card-action">{children}</div> : null}
    </div>
  )
}
