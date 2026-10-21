import type { JSX, ReactNode } from 'react'

export interface TooltipProps {
  text: string
  children: ReactNode
}

/** 纯 CSS 气泡提示，包裹任意元素。 */
export function Tooltip({ text, children }: TooltipProps): JSX.Element {
  return (
    <span className="ui-tooltip" data-tooltip={text}>
      {children}
    </span>
  )
}
