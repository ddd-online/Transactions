import type { JSX } from 'react'

export interface EmptyStateProps {
  title: string
  description?: string
  testId?: string
}

/** 旧版 `ui-empty` 空态：居中标题 + 可选说明。 */
export function EmptyState({ title, description, testId }: EmptyStateProps): JSX.Element {
  return (
    <div className="ui-empty" data-testid={testId}>
      <p className="ui-empty__title">{title}</p>
      {description ? <p className="ui-empty__description">{description}</p> : null}
    </div>
  )
}
