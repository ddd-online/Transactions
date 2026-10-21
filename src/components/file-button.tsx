import type { JSX, RefObject } from 'react'

export interface FileButtonProps {
  testId: string
  accept: string
  label?: string
  inputRef?: RefObject<HTMLInputElement | null>
  onSelect: (file: File | undefined) => void
}

/** 统一文件选择按钮：外观与 ui-btn 一致，原生 input 只做隐藏载体。 */
export function FileButton({
  testId,
  accept,
  label = '选择图片',
  inputRef,
  onSelect,
}: FileButtonProps): JSX.Element {
  return (
    <label className="ui-btn ui-btn--secondary st-file-picker">
      {label}
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept={accept}
        data-testid={testId}
        onChange={(event) => onSelect(event.target.files?.[0])}
      />
    </label>
  )
}
