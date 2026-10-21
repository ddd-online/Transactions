import { Switch as AntSwitch } from 'antd'
import type { JSX } from 'react'

export interface SwitchProps {
  checked: boolean
  disabled?: boolean
  testId: string
  label: string
  onChange: (checked: boolean) => void
}

/** 开关：AntD Switch，label 与 testid 保持在按钮上。 */
export function Switch({
  checked,
  disabled = false,
  testId,
  label,
  onChange,
}: SwitchProps): JSX.Element {
  return (
    <label className="tr-switch-field">
      <AntSwitch
        checked={checked}
        disabled={disabled}
        data-testid={testId}
        onChange={onChange}
        aria-label={label}
      />
      <span className="tr-switch-field__label">{label}</span>
    </label>
  )
}
