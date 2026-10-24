import { Pagination as AntPagination } from 'antd'
import { cloneElement, isValidElement, type JSX, type ReactElement, type ReactNode } from 'react'

export interface PaginationProps {
  page: number
  totalPages: number
  disabled?: boolean
  onChange: (page: number) => void
  testId?: string
  showSummary?: boolean
}

/**
 * 分页项的渲染：给上一页 / 下一页补中文可读名。
 *
 * AntD 把箭头图标自己的英文名（`aria-label="left"` / `"right"`）当成了按钮的可读名，
 * 读屏会念 "left"，所以这里克隆按钮补上 `aria-label`；`title` 顺带给出鼠标提示。
 * 独立导出是因为有的页面直接用了 AntD 的 Pagination（股票·账户那条），
 * 它们的焦点环与可读名必须和共用分页条一致。
 */
export function pagerItemRender(
  testId?: string,
): (_: number, type: string, originalElement: ReactNode) => ReactNode {
  return (_, type, originalElement) => {
    if (type !== 'prev' && type !== 'next') return <span>{originalElement}</span>
    const label = type === 'prev' ? '上一页' : '下一页'
    const element = isValidElement(originalElement)
      ? cloneElement(originalElement as ReactElement<{ 'aria-label'?: string }>, {
          'aria-label': label,
        })
      : originalElement
    return (
      <span data-testid={testId ? `${testId}-${type}` : undefined} title={label}>
        {element}
      </span>
    )
  }
}

/** 分页条：AntD Pagination，保留现有 testid 语义。 */
export function Pagination({
  page,
  totalPages,
  disabled = false,
  onChange,
  testId = 'tr',
  showSummary = true,
}: PaginationProps): JSX.Element {
  return (
    <div className="tr-pagination">
      {showSummary ? (
        <span className="tr-pagination__summary" data-testid={`${testId}-page`}>
          {page} / {totalPages}
        </span>
      ) : null}
      <AntPagination
        size="small"
        current={page}
        total={Math.max(1, totalPages)}
        pageSize={1}
        showSizeChanger={false}
        showLessItems
        disabled={disabled}
        onChange={onChange}
        itemRender={pagerItemRender(testId)}
      />
    </div>
  )
}
