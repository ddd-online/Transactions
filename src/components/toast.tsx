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

function show(notice: Notice): void {
  if (!api) {
    queued.push(notice)
    return
  }
  api.open({
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
