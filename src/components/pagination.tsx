import { Pagination as AntPagination } from 'antd'
import type { JSX, ReactNode } from 'react'

export interface PaginationProps {
  page: number
  totalPages: number
  disabled?: boolean
  onChange: (page: number) => void
  testId?: string
  showSummary?: boolean
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
        itemRender={(_, type, originalElement: ReactNode) => {
          const props: Record<string, string> = {}
          if (type === 'prev') props['data-testid'] = `${testId}-prev`
          if (type === 'next') props['data-testid'] = `${testId}-next`
          return <span {...props}>{originalElement}</span>
        }}
      />
    </div>
  )
}
