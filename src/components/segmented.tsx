import { Segmented as AntSegmented } from 'antd'
import type { JSX } from 'react'

export interface SegmentedOption {
  value: string
  label: string
}

export interface SegmentedProps {
  value: string
  options: SegmentedOption[]
  onChange: (value: string) => void
  testId?: string
  block?: boolean
  disabled?: boolean
  /** 这一组的分段叫什么：给读屏一个组名，旁边那枚可见标签只是视觉文字。 */
  ariaLabel?: string
}

/** 分段控件：AntD Segmented，保留 testId 与 block。 */
export function Segmented({
  value,
  options,
  onChange,
  testId,
  block = false,
  disabled = false,
  ariaLabel,
}: SegmentedProps): JSX.Element {
  return (
    <div
      className={`tr-segmented${block ? ' tr-segmented--block' : ''}`}
      data-testid={testId}
      role="group"
      aria-label={ariaLabel}
    >
      <AntSegmented
        block={block}
        disabled={disabled}
        value={value}
        onChange={(next) => onChange(String(next))}
        options={options.map((option) => ({
          value: option.value,
          label: (
            <span
              data-testid={testId ? `${testId}-${option.value}` : undefined}
              aria-pressed={option.value === value}
            >
              {option.label}
            </span>
          ),
        }))}
      />
    </div>
  )
}
