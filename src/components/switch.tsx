import type { JSX } from 'react'

export interface SwitchProps {
  checked: boolean
  disabled?: boolean
  testId: string
  label: string
  onChange: (checked: boolean) => void
}

/** 旧版 ui-switch：原生 checkbox 保留语义，视觉用轨道 + 滑块。 */
export function Switch({
  checked,
  disabled = false,
  testId,
  label,
  onChange,
}: SwitchProps): JSX.Element {
  return (
    <label className="ui-switch-field m0-feature">
      <span className="ui-switch-wrap">
        <input
          type="checkbox"
          className="ui-switch-input"
          data-testid={testId}
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className={`ui-switch${checked ? ' is-checked' : ''}`} aria-hidden="true">
          <span className="ui-switch__handle" />
        </span>
      </span>
      <span className="ui-switch-field__label">{label}</span>
    </label>
  )
}
