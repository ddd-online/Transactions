import type { JSX, ReactNode } from 'react'

import { StockCode } from './stock-code'

export interface StockMasterRowProps {
  stockName: string
  stockCode: string
  /** 当前选中的那一只：卡片底色常亮 */
  active: boolean
  /** 卡片本身的 testid（点击整块 = 选中） */
  testId: string
  /** 代码复制按钮的 testid */
  codeTestId: string
  onSelect: () => void
  /** 卡片正文：现价 / 盈亏这类几行，排版由各自的页面给 */
  children: ReactNode
}

/**
 * 左侧列表里的一只股票：整块卡片是「选中它」，右上角的代码点一下复制。
 *
 * 卡片自身是按钮（键盘可选中），复制按钮是它的**兄弟**、浮在上面 ——
 * 按钮套按钮是无效 HTML，键盘 Tab 的顺序也会乱。
 */
export function StockMasterRow({
  stockName,
  stockCode,
  active,
  testId,
  codeTestId,
  onSelect,
  children,
}: StockMasterRowProps): JSX.Element {
  return (
    <div className={`stock-master__row${active ? ' is-active' : ''}`} data-testid={testId}>
      <button
        type="button"
        className="stock-master__row-hit"
        aria-label={`${stockName} ${stockCode}`}
        onClick={onSelect}
      />
      <div className="stock-master__headline">
        <strong>{stockName}</strong>
        <StockCode code={stockCode} className="stock-muted stock-mono" testId={codeTestId} />
      </div>
      {children}
    </div>
  )
}
