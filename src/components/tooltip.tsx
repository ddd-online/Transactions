import type { JSX, ReactNode } from 'react'

export interface TooltipProps {
  text: string
  children: ReactNode
}

/** 旧版 ui-tooltip：纯 CSS 气泡，包裹任意元素。 */
export function Tooltip({ text, children }: TooltipProps): JSX.Element {
  return (
    <span className="ui-tooltip" data-tooltip={text}>
      {children}
    </span>
  )
}
