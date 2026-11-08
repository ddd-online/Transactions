import { useEffect, useRef, type JSX } from 'react'

import { Button } from './components/button'

export interface WorkspaceOverlayProps {
  /** 还没有工作空间、用户也还没选择「应用设置」时盖住外壳。 */
  open: boolean
  error: string
  busy: boolean
  onPickWorkspace: () => Promise<void>
  onOpenSettings: () => void
}

/**
 * 首屏（还没有工作空间）的阻塞层：背后那副外壳仍然渲染，但由外壳对指针、键盘、
 * 读屏都关掉，焦点落在这一层上 —— 否则 Tab 两下就走进看不见的账本菜单与导航里。
 *
 * 纯展示模块：开哪个工作空间、进设置都由 props 回调决定。
 */
export function WorkspaceOverlay({
  open,
  error,
  busy,
  onPickWorkspace,
  onOpenSettings,
}: WorkspaceOverlayProps): JSX.Element | null {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (open) ref.current?.focus()
  }, [open])

  if (!open) return null
  return (
    <div
      className="app-workspace-overlay"
      data-testid="workspace-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="选择工作空间"
      tabIndex={-1}
      ref={ref}
    >
      <div className="app-workspace-card">
        <h1>Transactions</h1>
        <p className="m0-muted">选择一个工作空间开始；所有数据都保存在本地。</p>
        {/* 打开失败的那句话必须落在这张卡上：背后的页面被遮罩盖住，
            写在外壳里的错误谁也看不见（旧版工作空间就是这么「点了没反应」的）。 */}
        {error ? (
          <p role="alert" className="m0-error" data-testid="workspace-error">
            {error}
          </p>
        ) : null}
        <div className="m0-actions" style={{ justifyContent: 'center' }}>
          <Button
            variant="primary"
            testId="open-workspace"
            disabled={busy}
            onClick={() => void onPickWorkspace()}
          >
            选择工作空间
          </Button>
          <Button variant="text" testId="open-app-settings" onClick={onOpenSettings}>
            应用设置
          </Button>
        </div>
      </div>
    </div>
  )
}
