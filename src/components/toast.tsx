import { useEffect, useState, type JSX } from 'react'

type NoticeType = 'success' | 'error' | 'warning' | 'info'

interface Notice {
  id: number
  message: string
  type: NoticeType
}

let listener: ((notice: Notice) => void) | null = null
let nextId = 1

/** 显示一条底部提示。 */
export function notify(message: string, type: NoticeType = 'success'): void {
  listener?.({ id: nextId++, message, type })
}

/** 全局提示宿主，挂在 App 根部。 */
export function ToastHost(): JSX.Element {
  const [items, setItems] = useState<Notice[]>([])

  useEffect(() => {
    listener = (notice) => {
      setItems((current) => [...current, notice])
      setTimeout(() => {
        setItems((current) => current.filter((item) => item.id !== notice.id))
      }, 3000)
    }
    return () => {
      listener = null
    }
  }, [])

  return (
    <div className="notice-stack-message" aria-live="polite">
      {items.map((item) => (
        <div
          key={item.id}
          className={`notice-message notice--${item.type}`}
          data-testid="toast"
          role="status"
        >
          {item.message}
        </div>
      ))}
    </div>
  )
}
