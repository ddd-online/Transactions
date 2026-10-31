import { useRef, type JSX, type ReactNode, type RefObject } from 'react'

import { Button } from './button'

export interface FileButtonProps {
  testId: string
  accept: string
  label?: string
  title?: string
  icon?: ReactNode
  size?: 'sm' | 'md'
  disabled?: boolean
  /** 允许多选：事件页要一次选「同名照片 + 实况视频」 */
  multiple?: boolean
  inputRef?: RefObject<HTMLInputElement | null>
  onSelect?: (file: File | undefined) => void
  /** 多选时走它；`onSelect` 只在单选时生效 */
  onSelectMany?: (files: File[]) => void
}

/** 统一文件选择按钮：AntD Button 触发隐藏的原生 input。 */
export function FileButton({
  testId,
  accept,
  label = '选择图片',
  title,
  icon,
  size = 'md',
  disabled = false,
  multiple = false,
  inputRef,
  onSelect,
  onSelectMany,
}: FileButtonProps): JSX.Element {
  const localRef = useRef<HTMLInputElement>(null)
  const ref = inputRef ?? localRef
  return (
    <span className="st-file-picker">
      <Button
        variant="secondary"
        size={size}
        icon={icon}
        disabled={disabled}
        title={title}
        onClick={() => ref.current?.click()}
      >
        {label}
      </Button>
      <input
        ref={ref}
        className="sr-only"
        type="file"
        accept={accept}
        multiple={multiple}
        data-testid={testId}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          if (onSelectMany) onSelectMany(files)
          else onSelect?.(files[0])
        }}
      />
    </span>
  )
}
