import { useEffect, useState } from 'react'

import { APP_QUIT_PROGRESS, APP_QUIT_STARTED } from '../../shared/events'

export interface QuitFlow {
  /** 主进程已进入退出流程：外壳据此盖上一张虚化遮罩。 */
  quitting: boolean
  /** 遮罩上的当前步骤文字（由主进程的 app:quit-progress 推进）。 */
  quitLabel: string
}

const INITIAL_LABEL = '正在保存窗口状态'

/**
 * 退出流程在渲染层的一半：亮遮罩、跟着主进程报步骤，并在遮罩画到屏幕上之后回执
 * `app_quit_ready` —— 主进程收到回执才去关库、关窗。
 *
 * 回执要等一帧：遮罩没画出来就回执，用户看到的是「点了关闭 → 窗口直接消失」，
 * 没有任何交代。隐藏窗口里 rAF 不跑，所以另有一个 200ms 的定时器兜底；
 * 主进程自己也有超时，不会一直等。
 */
export function useQuitFlow(): QuitFlow {
  const [quitting, setQuitting] = useState(false)
  const [quitLabel, setQuitLabel] = useState(INITIAL_LABEL)

  useEffect(() => {
    window.api.onEvent((message) => {
      if (message.event === APP_QUIT_STARTED) {
        // 与主进程第一步同名：遮罩出现到第一次报进度之间只隔几十毫秒，
        // 换一句不同的字只会闪一下。
        setQuitLabel(INITIAL_LABEL)
        setQuitting(true)
      }
      if (message.event === APP_QUIT_PROGRESS) {
        const step = message.payload as { label?: unknown } | null
        if (step && typeof step.label === 'string') setQuitLabel(step.label)
      }
    })
  }, [])

  useEffect(() => {
    if (!quitting) return undefined
    let settled = false
    const ready = (): void => {
      if (settled) return
      settled = true
      void window.api.invoke('app_quit_ready', {}).catch(() => undefined)
    }
    const frame = window.requestAnimationFrame(() => window.requestAnimationFrame(ready))
    const timer = window.setTimeout(ready, 200)
    return () => {
      settled = true
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [quitting])

  return { quitting, quitLabel }
}
