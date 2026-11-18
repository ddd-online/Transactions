import type { JSX, Ref } from 'react'

import { Icon, type IconName } from './icon'

export interface IconButtonProps {
  icon: IconName
  /** 悬停提示，也是默认的读屏名。 */
  label: string
  /** 读屏名要说得比提示多时单独给（外观键要说当前是浅色还是深色）。 */
  ariaLabel?: string
  /** 当前所在的页 / 子功能：抬起成纸白方块，图标换主色。 */
  active?: boolean
  /** 菜单触发器展开时同样抬起，并给读屏 `aria-expanded`。 */
  expanded?: boolean
  /** 点开后弹出的是菜单（给读屏 `aria-haspopup`）。 */
  hasPopup?: 'menu'
  buttonRef?: Ref<HTMLButtonElement>
  testId?: string
  inert?: boolean
  onClick?: () => void
}

/**
 * 图标键：标题栏的外观模式键、主导航、子功能图标条、底栏的「?」共用这一颗按钮。
 *
 * 尺寸与三态只有一处来源，就是 `app-shell.css` 的 `.icon-btn`
 * （32 × 32、图标 16、radius-md）。这几处曾经各写一份 class，
 * 于是长成了 40 / 40 / 32 三种大小。
 */
export function IconButton({
  icon,
  label,
  ariaLabel,
  active = false,
  expanded,
  hasPopup,
  buttonRef,
  testId,
  inert,
  onClick,
}: IconButtonProps): JSX.Element {
  return (
    <button
      type="button"
      ref={buttonRef}
      className={`icon-btn${active || expanded ? ' is-active' : ''}`}
      data-testid={testId}
      title={label}
      aria-label={ariaLabel ?? label}
      aria-expanded={expanded}
      aria-haspopup={hasPopup}
      inert={inert}
      onClick={onClick}
    >
      <Icon name={icon} size={16} />
    </button>
  )
}
