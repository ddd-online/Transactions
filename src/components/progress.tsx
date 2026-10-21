import type { JSX } from 'react'

export interface ProgressProps {
  done: number
  total: number
}

/** 进度条：轨道 + 百分比。 */
export function Progress({ done, total }: ProgressProps): JSX.Element | null {
  if (total <= 0) return null
  const percent = Math.round((Math.min(done, total) / total) * 100)
  return (
    <div className="ui-progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <div className="ui-progress__track">
        <div className="ui-progress__bar" style={{ width: `${percent}%` }} />
      </div>
      <span className="ui-progress__text">
        {done}/{total}
      </span>
    </div>
  )
}
