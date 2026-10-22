import { useEffect, useRef, useState, type JSX, type ReactNode } from 'react'
import {
  OverlayScrollbarsComponent,
  type OverlayScrollbarsComponentRef,
} from 'overlayscrollbars-react'

export interface ScrollAreaProps {
  children: ReactNode
  className?: string
  /** `y` 只做纵向；`both` 允许横向（宽表格 / 长代码）。 */
  axis?: 'y' | 'both'
  /** 初始化完成后触发一次 window resize，供 AntD Table 的 sticky 重新计算容器。 */
  notifyResize?: boolean
}

/**
 * 项目统一的悬浮滚动区。
 *
 * 使用 OverlayScrollbars 接管滚动条绘制：滚动条覆盖在内容上，不占布局宽度；
 * 默认滚动时出现、离开后自动淡出。需要原生滚动语义的地方（键盘、触控板、
 * `scrollTop` / `scrollIntoView`）仍然走浏览器原生滚动，不改变滚动行为。
 */
export function ScrollArea({
  children,
  className,
  axis = 'y',
  notifyResize = false,
}: ScrollAreaProps): JSX.Element {
  const componentRef = useRef<OverlayScrollbarsComponentRef<'div'>>(null)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (!initialized) return
    const instance = componentRef.current?.osInstance()
    if (!instance) return
    const content = instance.elements().content
    let frame = 0
    const refresh = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        instance.update(true)
        if (notifyResize) window.dispatchEvent(new Event('resize'))
      })
    }
    // 表格/列表是异步填充的：内容高度变化后 OverlayScrollbars 不会总是自己重新判定
    // “是否可滚动”，这里用 ResizeObserver 强制 update，避免滚动条停留在 unusable 态。
    const observer = new ResizeObserver(refresh)
    observer.observe(content)
    refresh()
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [initialized, notifyResize])

  return (
    <OverlayScrollbarsComponent
      ref={componentRef}
      className={`scroll-area${className ? ` ${className}` : ''}`}
      options={{
        overflow: { x: axis === 'both' ? 'scroll' : 'hidden', y: 'scroll' },
        scrollbars: {
          theme: 'os-theme-transactions',
          autoHide: 'leave',
          autoHideDelay: 900,
          clickScroll: true,
        },
      }}
      events={{
        initialized: () => {
          setInitialized(true)
          if (notifyResize) window.dispatchEvent(new Event('resize'))
        },
      }}
    >
      {children}
    </OverlayScrollbarsComponent>
  )
}
