import { Modal } from 'antd'
import type { JSX } from 'react'

import { Button } from './button'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmText?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** 统一确认框；用于删除/重置等不可撤销操作。 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = '确定',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): JSX.Element {
  return (
    <Modal
      open={open}
      title={title}
      centered
      zIndex={3000}
      destroyOnHidden
      onCancel={onCancel}
      footer={[
        <Button key="cancel" variant="secondary" size="sm" onClick={onCancel}>
          取消
        </Button>,
        <Button
          key="confirm"
          variant={danger ? 'danger' : 'primary'}
          size="sm"
          testId="confirm-dialog-confirm"
          onClick={onConfirm}
        >
          {confirmText}
        </Button>,
      ]}
    >
      <p className="tr-confirm-message">{message}</p>
    </Modal>
  )
}
