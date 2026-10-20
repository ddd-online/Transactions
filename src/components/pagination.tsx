import type { JSX } from 'react'

export interface PaginationProps {
  page: number
  totalPages: number
  disabled?: boolean
  onChange: (page: number) => void
  testId?: string
}

/** 旧版分页条：上一页 / 页码 / 下一页，两端保留 testid。 */
export function Pagination({
  page,
  totalPages,
  disabled = false,
  onChange,
  testId = 'tr',
}: PaginationProps): JSX.Element {
  const start = Math.max(1, Math.min(page - 2, Math.max(1, totalPages - 4)))
  const end = Math.min(totalPages, start + 4)
  const numbers: number[] = []
  for (let index = start; index <= end; index += 1) numbers.push(index)

  return (
    <div className="ui-pagination">
      <button
        type="button"
        className="ui-btn ui-btn--text"
        data-testid={`${testId}-prev`}
        disabled={disabled || page <= 1}
        onClick={() => onChange(Math.max(1, page - 1))}
      >
        上一页
      </button>
      <span className="ui-pagination__summary" data-testid={`${testId}-page`}>
        {page} / {totalPages}
      </span>
      {numbers.map((number) => (
        <button
          key={number}
          type="button"
          className={`ui-btn ${number === page ? 'ui-btn--primary' : 'ui-btn--text'}`}
          data-testid={`${testId}-page-${number}`}
          onClick={() => onChange(number)}
        >
          {number}
        </button>
      ))}
      <button
        type="button"
        className="ui-btn ui-btn--text"
        data-testid={`${testId}-next`}
        disabled={disabled || page >= totalPages}
        onClick={() => onChange(Math.min(totalPages, page + 1))}
      >
        下一页
      </button>
    </div>
  )
}
