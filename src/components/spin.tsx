import type { JSX } from 'react'

export interface SpinProps {
  size?: 'sm' | 'lg'
}

/** 旧版 ui-spin 加载指示器。 */
export function Spin({ size = 'sm' }: SpinProps): JSX.Element {
  return (
    <span
      className={`ui-spin${size === 'lg' ? ' ui-spin--lg' : ' ui-spin--sm'}`}
      role="status"
      aria-label="加载中"
    />
  )
}
