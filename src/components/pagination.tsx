import { Pagination as AntPagination, type SelectProps } from 'antd'
import { cloneElement, isValidElement, type JSX, type ReactElement, type ReactNode } from 'react'

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
  /** 整行的 testid */
  testId?: string
  /** 翻页控件自己的 testid 前缀（上一页 / 下一页是 `<前缀>-prev` / `-next`）；省略时跟整行一致 */
  pagerTestId?: string
  /** 「共 N 条」自己的 testid；省略时不挂 */
  totalTestId?: string
  disabled?: boolean
}

/**
 * 分页项的渲染：给上一页 / 下一页补中文可读名。
 *
 * AntD 把箭头图标自己的英文名（`aria-label="left"` / `"right"`）当成了按钮的可读名，
 * 读屏会念 "left"，所以这里克隆按钮补上 `aria-label`；`title` 顺带给出鼠标提示。
 */
function pagerItemRender(
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

/**
 * 全站唯一的分页行：左边「共 N 条」，右边页码与「每页条数」。
 *
 * 记账记录、资金变化记录、统计明细、待办历史共用这一颗 —— 以前记账页自己拼了一行
 * （还带一个描边下拉），表格页另有一行；同一个动作长了两张脸。样式只在
 * `styles/pagination.css` 里定义一次。
 *
 * 换每页条数由调用方回第一页：停在原来的页码上只会看到空白或错位。
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
  totalTestId,
  disabled = false,
}: TablePagerProps): JSX.Element {
  return (
    <div className="tr-pager" data-testid={testId}>
      <span className="tr-pager__total" data-testid={totalTestId}>
        共 {total} {unit}
      </span>
      <AntPagination
        size="small"
        current={page}
        total={total}
        pageSize={pageSize}
        pageSizeOptions={pageSizeOptions}
        showSizeChanger={
          pageSizeOptions !== undefined
            ? ({ 'aria-label': '每页条数' } as SelectProps)
            : false
        }
        showLessItems
        disabled={disabled}
        onChange={onChange}
        itemRender={pagerItemRender(pagerTestId ?? testId)}
      />
    </div>
  )
}
