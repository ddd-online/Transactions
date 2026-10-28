import type { JSX } from 'react'

import { identityTone } from '../../shared/domain/identity-color'

export interface BoardLabelProps {
  board: string
  /** 天梯行里用 `stock-ladder-chip-board`，板块汇总里另给一个 */
  testId?: string
}

/**
 * 板块名：**身份色文字**（与账本同一组 8 个自然色，按名字哈希）。
 *
 * 天梯行和工具栏下的板块汇总共用这一个组件 —— 同一个板块在两处必须同色，
 * 所以颜色只能从这一处出，别在别的地方再拼一次 class。
 */
export function BoardLabel({ board, testId }: BoardLabelProps): JSX.Element {
  return (
    <span
      className={`stock-ladder__board stock-ladder__board--${identityTone(board)}`}
      data-testid={testId}
    >
      {board}
    </span>
  )
}
