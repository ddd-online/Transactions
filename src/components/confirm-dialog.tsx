import type { JSX } from 'react'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmText?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** 旧版 `ui-modal` 风格的确认框；用于删除/重置等不可撤销操作。 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = '确定',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): JSX.Element | null {
  if (!open) return null
  return (
    <div
      className="ui-modal__mask"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div className="ui-modal__content ui-modal__content--sm" role="dialog" aria-modal="true">
        <header className="ui-modal__header">
          <h2 className="ui-modal__title">{title}</h2>
        </header>
        <div className="ui-modal__body">{message}</div>
        <footer className="ui-modal__footer">
          <button type="button" className="ui-btn ui-btn--secondary" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            data-testid="confirm-dialog-confirm"
            className={`ui-btn ${danger ? 'ui-btn--primary-danger' : 'ui-btn--primary'}`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </footer>
      </div>
    </div>
  )
}
