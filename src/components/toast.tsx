import { App as AntApp } from 'antd'
import { useEffect, useRef, type JSX } from 'react'

type NoticeType = 'success' | 'error' | 'warning' | 'info'

interface Notice {
  message: string
  type: NoticeType
}

interface MessageApi {
  open: (config: {
    content: JSX.Element
    type: NoticeType
    duration: number
    key?: string
  }) => void
}

let api: MessageApi | null = null
const queued: Notice[] = []

/**
 * 全站只有**一条**提示。
 *
 * 同一个 key 再打开就是就地替换内容（成功 / 失败只换图标与文案），而不是往下再排一条 ——
 * DESIGN 的规矩是「新的把旧的顶上去，不排成一列」。连续两次动作（比如连点两次「立即备份」）
 * 曾经会叠成两条，用户读不出哪条是刚才那次的结果。
 */
const NOTICE_KEY = 'tr-notice'

function show(notice: Notice): void {
  if (!api) {
    queued.push(notice)
    return
  }
  api.open({
    key: NOTICE_KEY,
    type: notice.type,
    duration: 3,
    content: (
      <span data-testid="toast" role="status">
        {notice.message}
      </span>
    ),
  })
}

/** 显示一条底部提示。 */
export function notify(message: string, type: NoticeType = 'success'): void {
  show({ message, type })
}

/** 把 AntD message 实例接到模块级 notify；必须挂在 AntD App 内。 */
export function ToastHost(): JSX.Element | null {
  const { message } = AntApp.useApp()
  const messageRef = useRef(message)
  messageRef.current = message

  useEffect(() => {
    api = {
      open: (config) => messageRef.current.open(config),
    }
    for (const notice of queued.splice(0)) show(notice)
    return () => {
      api = null
    }
  }, [])

  return null
}
