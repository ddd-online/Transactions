import { DatePicker as AntDatePicker } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import type { FocusEvent, JSX, KeyboardEvent, ReactNode } from 'react'

import { useState } from 'react'

import { Icon } from './icon'

export interface DatePickerProps {
  value: string
  onChange: (value: string) => void
  testId?: string
  disabled?: boolean
  showToggle?: boolean
  allowClear?: boolean
  className?: string
  /** 读屏用的控件名（输入框里只有一个日期，没有可见的 label 时必填）。 */
  ariaLabel?: string
}

/** 日期输入：对外仍是 YYYY-MM-DD 字符串，内部使用 AntD DatePicker。 */
export function DatePicker({
  value,
  onChange,
  testId,
  disabled = false,
  showToggle = true,
  allowClear = false,
  className = '',
  ariaLabel,
}: DatePickerProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const current = value ? dayjs(value) : null
  return (
    <div className={`tr-date-picker${className ? ` ${className}` : ''}`}>
      <AntDatePicker
        value={current?.isValid() ? current : null}
        open={open}
        onOpenChange={(next) => {
          if (!next) setOpen(false)
        }}
        disabled={disabled}
        allowClear={allowClear}
        format="YYYY-MM-DD"
        inputReadOnly={false}
        suffixIcon={
          showToggle ? (
            <span
              className="tr-date-picker__toggle"
              data-testid={testId ? `${testId}-toggle` : undefined}
              onClick={(event) => {
                event.stopPropagation()
                setOpen(true)
              }}
            >
              <Icon name="Calendar" size={16} />
            </span>
          ) : null
        }
        getPopupContainer={(trigger) => trigger.parentElement ?? document.body}
        onChange={(next: Dayjs | null) => {
          setOpen(false)
          onChange(next ? next.format('YYYY-MM-DD') : '')
        }}
        panelRender={(panel) => (
          <div role="dialog" aria-label="选择日期">
            {panel as ReactNode}
          </div>
        )}
        cellRender={(date, info) => {
          if (info.type !== 'date' || !dayjs.isDayjs(date)) return info.originNode
          return (
            <span data-testid={`date-picker-day-${date.format('YYYY-MM-DD')}`}>
              {info.originNode}
            </span>
          )
        }}
        inputRender={(props) => {
          const commit = (raw: string): void => {
            if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
              const parsed = dayjs(raw)
              if (parsed.isValid()) {
                setOpen(false)
                onChange(parsed.format('YYYY-MM-DD'))
              }
            }
          }
          return (
            <input
              {...props}
              data-testid={testId}
              aria-label={ariaLabel}
              onBlur={(event: FocusEvent<HTMLInputElement>) => {
                props.onBlur?.(event)
                commit(event.target.value)
              }}
              onInput={(event) => {
                commit(event.currentTarget.value)
                if (/^\d{4}-\d{2}-\d{2}$/.test(event.currentTarget.value)) {
                  event.currentTarget.blur()
                }
              }}
              onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                props.onKeyDown?.(event)
                if (event.key === 'Enter') commit(event.currentTarget.value)
              }}
            />
          )
        }}
      />
    </div>
  )
}
