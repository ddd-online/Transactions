import { useRef, type JSX, type ReactNode, type RefObject } from 'react'

import { Button } from './button'

export interface FileButtonProps {
  testId: string
  accept: string
  label?: string
  icon?: ReactNode
  size?: 'sm' | 'md'
  inputRef?: RefObject<HTMLInputElement | null>
  onSelect: (file: File | undefined) => void
}

/** 统一文件选择按钮：AntD Button 触发隐藏的原生 input。 */
export function FileButton({
  testId,
  accept,
  label = '选择图片',
  icon,
  size = 'md',
  inputRef,
  onSelect,
}: FileButtonProps): JSX.Element {
  const localRef = useRef<HTMLInputElement>(null)
  const ref = inputRef ?? localRef
  return (
    <span className="st-file-picker">
      <Button variant="secondary" size={size} icon={icon} onClick={() => ref.current?.click()}>
        {label}
      </Button>
      <input
        ref={ref}
        className="sr-only"
        type="file"
        accept={accept}
        data-testid={testId}
        onChange={(event) => onSelect(event.target.files?.[0])}
      />
    </span>
  )
}
