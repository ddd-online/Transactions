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
}

/** 旧版 ui-segmented 分段控件。 */
export function Segmented({
  value,
  options,
  onChange,
  testId,
  block = false,
}: SegmentedProps): JSX.Element {
  return (
    <div className={`ui-segmented${block ? ' ui-segmented--block' : ''}`} role="group" data-testid={testId}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`ui-segmented__item${option.value === value ? ' is-active' : ''}`}
          data-testid={testId ? `${testId}-${option.value}` : undefined}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
