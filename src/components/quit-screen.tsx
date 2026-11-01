import { useEffect, useRef, type JSX } from 'react'

/**
 * 退出遮罩：把整个界面虚化，中间一条**不确定进度**的斜纹横条在流动。
 *
 * 这里没有百分比：退出真正要干的活只有两件（补写窗口位置、关工作空间），
 * 而且通常是毫秒级的。硬报一个数字只是在装精确。斜纹条只表达"还在忙"，
 * 下面的步骤文字才是有效信息（正在保存窗口状态 / 正在关闭工作空间）。
 *
 * 它盖住的是**已经画好的应用**（侧栏、版心、自绘标题栏），不是一张空窗：
 * 用户点关闭后先看到交代，等主进程收尾完了再关窗。
 */
export interface QuitScreenProps {
  label: string
}

export function QuitScreen({ label }: QuitScreenProps): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null)

  // 遮罩盖住了整个应用，焦点不能留在被盖住的控件上：把焦点收进这一层。
  // 这一层里没有可操作的东西，所以它只接住焦点，不画焦点环。
  useEffect(() => {
    ref.current?.focus()
  }, [])

  return (
    <div
      ref={ref}
      className="ui-quit"
      data-testid="quit-screen"
      role="alertdialog"
      aria-modal="true"
      aria-label="正在退出"
      tabIndex={-1}
    >
      <div className="ui-quit__card">
        <p className="ui-quit__title">正在退出</p>
        {/* 纯视觉的斜纹条：读屏只需要那句步骤文字，别让它念一个假的百分比。 */}
        <div className="ui-quit__bar" data-testid="quit-bar" aria-hidden="true" />
        <p className="ui-quit__label" data-testid="quit-label">
          {label}
        </p>
      </div>
    </div>
  )
}
