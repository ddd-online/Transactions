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

export interface TablePagerProps {
  /** 一共多少条 / 笔（「共 N 条」） */
  total: number
  page: number
  pageSize: number
  /** 每页条数可选项；不传就没有条数选择器（每页条数固定） */
  pageSizeOptions?: number[]
  onChange: (page: number, pageSize: number) => void
  /** 「共 N 条」的量词：条目用「条」、笔数用「笔」 */
  unit?: string
  /** 整行（总数 + 翻页）的 testid */
  testId?: string
  /** 翻页控件自己的 testid 前缀（上一页 / 下一页是 `<前缀>-prev` / `-next`）；省略时跟整行一致 */
  pagerTestId?: string
}

/**
 * 表格底部的分页行：左边「共 N 条」，右边翻页与每页条数 —— 就是资金变化记录那一版。
 *
 * 统计明细与待办历史沿用同一行：三张表各写一遍时，改一次「每页条数」的交互就得改三处，
 * 而它们本来就该长成一样。
 */
export function TablePager({
  total,
  page,
  pageSize,
  pageSizeOptions,
  onChange,
  unit = '条',
  testId,
  pagerTestId,
}: TablePagerProps): JSX.Element {
  return (
    <div className="tr-table-foot" data-testid={testId}>
      <span className="tr-table-foot__total">
        共 {total} {unit}
      </span>
      <AntPagination
        size="small"
        current={page}
        total={total}
        pageSize={pageSize}
        pageSizeOptions={pageSizeOptions}
        showSizeChanger={pageSizeOptions !== undefined}
        showLessItems
        onChange={onChange}
        itemRender={pagerItemRender(pagerTestId ?? testId)}
      />
    </div>
  )
}
