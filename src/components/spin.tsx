import { Spin as AntSpin } from 'antd'
import type { JSX } from 'react'

export interface SpinProps {
  size?: 'sm' | 'lg'
}

/** 加载指示器。 */
export function Spin({ size = 'sm' }: SpinProps): JSX.Element {
  return <AntSpin size={size === 'lg' ? 'large' : 'small'} />
}
