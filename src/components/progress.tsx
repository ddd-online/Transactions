import { Progress as AntProgress } from 'antd'
import type { JSX } from 'react'

export interface ProgressProps {
  done: number
  total: number
}

/** 进度条：保留 done/total 契约。 */
export function Progress({ done, total }: ProgressProps): JSX.Element | null {
  if (total <= 0) return null
  const percent = Math.round((Math.min(done, total) / total) * 100)
  return (
    <div className="tr-progress" data-testid="progress">
      <AntProgress percent={percent} size="small" showInfo={false} />
      <span className="tr-progress__text">
        {done}/{total}
      </span>
    </div>
  )
}
