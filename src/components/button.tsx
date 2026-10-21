import { Button as AntButton, type ButtonProps as AntButtonProps } from 'antd'
import type { JSX, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'text' | 'danger' | 'danger-outline' | 'text-danger'

export interface ButtonProps {
  children?: ReactNode
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  testId?: string
  disabled?: boolean
  loading?: boolean
  block?: boolean
  htmlType?: 'button' | 'submit' | 'reset'
  icon?: ReactNode
  title?: string
  'aria-label'?: string
  className?: string
  onClick?: AntButtonProps['onClick']
}

/** AntD Button 的项目变体：颜色/高度由主题与 `tr-btn` 统一。 */
export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  testId,
  className,
  ...rest
}: ButtonProps): JSX.Element {
  const danger = variant === 'danger' || variant === 'danger-outline' || variant === 'text-danger'
  const type = variant === 'primary' || variant === 'danger' ? 'primary' : variant === 'text' || variant === 'text-danger' ? 'text' : 'default'
  return (
    <AntButton
      {...rest}
      type={type}
      danger={danger}
      size={size === 'sm' ? 'small' : 'middle'}
      className={`tr-btn${className ? ` ${className}` : ''}`}
      data-testid={testId}
    >
      {children}
    </AntButton>
  )
}
