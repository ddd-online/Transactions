import { Tooltip as AntTooltip } from 'antd'
import type { JSX, ReactNode } from 'react'

export interface TooltipProps {
  text: string
  children: ReactNode
}

/** 气泡提示：保留 text/children 契约。 */
export function Tooltip({ text, children }: TooltipProps): JSX.Element {
  return (
    <AntTooltip title={text} mouseEnterDelay={0.25}>
      <span className="tr-tooltip-trigger">{children}</span>
    </AntTooltip>
  )
}
