import { Empty } from 'antd'
import type { JSX } from 'react'

export interface EmptyStateProps {
  testId?: string
  title: string
  description?: string
}

/** 空态：AntD Empty 的语义与图形，保留项目标题/说明。 */
export function EmptyState({ testId, title, description }: EmptyStateProps): JSX.Element {
  return (
    <div className="tr-empty" data-testid={testId}>
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <div className="tr-empty__copy">
            <span className="tr-empty__title">{title}</span>
            {description ? <span className="tr-empty__description">{description}</span> : null}
          </div>
        }
      />
    </div>
  )
}
