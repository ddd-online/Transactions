import { Tooltip as AntTooltip } from 'antd'
import type { JSX, ReactNode } from 'react'

export interface TooltipProps {
  text: string
  children: ReactNode
  /**
   * 触发器同时也响应**键盘焦点**。读屏与键盘用户看不到悬停，气泡得跟着焦点来；
   * 默认只跟悬停（按钮这类自带可读名的触发器不靠气泡说话）。
   */
  focusTrigger?: boolean
}

/** 气泡提示：保留 text/children 契约。 */
export function Tooltip({ text, children, focusTrigger = false }: TooltipProps): JSX.Element {
  return (
    <AntTooltip
      title={text}
      mouseEnterDelay={0.25}
      trigger={focusTrigger ? ['hover', 'focus'] : ['hover']}
    >
      <span className="tr-tooltip-trigger">{children}</span>
    </AntTooltip>
  )
}
