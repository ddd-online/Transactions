import type { JSX } from 'react'

/**
 * 退出遮罩：把整个界面虚化，只留一条进度条。
 *
 * 它盖住的是**已经画好的应用**（侧栏、版心、自绘标题栏），不是一张空窗：
 * 用户点关闭后先看到「正在退出」，等主进程把窗口位置与工作空间落完盘再关窗，
 * 而不是窗口毫无交代地消失。退出流程很短，所以这一层不做动效，只做静态虚化。
 */
export interface QuitScreenProps {
  percent: number
  label: string
}

export function QuitScreen({ percent, label }: QuitScreenProps): JSX.Element {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)))
  return (
    <div
      className="ui-quit"
      data-testid="quit-screen"
      role="alertdialog"
      aria-modal="true"
      aria-label="正在退出"
      aria-busy="true"
    >
      <div className="ui-quit__card">
        <p className="ui-quit__title">正在退出</p>
        <div
          className="ui-quit__track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={clamped}
          data-testid="quit-progress"
        >
          <div className="ui-quit__fill" style={{ width: `${clamped}%` }} />
        </div>
        <p className="ui-quit__label" data-testid="quit-label">
          {label}
        </p>
      </div>
    </div>
  )
}
