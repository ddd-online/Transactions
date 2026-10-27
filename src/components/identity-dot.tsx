import type { JSX } from 'react'

import { identityColor } from '../../shared/domain/identity-color'

export interface IdentityDotProps {
  /** 稳定种子：账本 id、`ledgerId:type:name` 等 */
  seed: string
  size?: number
  className?: string
  /** 只有需要给读屏补充含义时才传；默认按装饰处理，旁边的名称已经表达身份 */
  label?: string
}

/** 6px 身份色点：颜色只是辅助，名称始终在它旁边。 */
export function IdentityDot({ seed, size = 6, className = '', label }: IdentityDotProps): JSX.Element {
  return (
    <span
      className={`identity-dot${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size, background: identityColor(seed) }}
      title={label}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
    />
  )
}
