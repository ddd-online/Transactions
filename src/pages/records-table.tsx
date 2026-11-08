/**
 * 记录页的表格区：列定义、行渲染、分页、空态与错误态，外加页脚那一条统计行。
 *
 * 数据、分页状态与写操作都在记录页；这里只接收当前页的行、统计数字与回调。
 * 行右侧的三枚动作由 {@link RecordRowActions} 渲染，同步请求的发起仍在页面。
 */

import { Select, Table, type TableProps } from 'antd'
import { useRef, type HTMLAttributes, type JSX } from 'react'

import { signedAmount, transactionTypeText } from '../../shared/domain/format'
import { centsToYuan } from '../../shared/domain/money'
import { formatTimestamp } from '../../shared/domain/time'
import type { Ledger } from '../../shared/domain/models'
import type { TransactionRecordDto } from '../../shared/types/transaction'

import { Button } from '../components/button'
import { Icon } from '../components/icon'
import { Pagination } from '../components/pagination'
import { ScrollArea } from '../components/scroll-area'
import { RecordRowActions } from './records-row-actions'

export interface RecordsStatisticsProps {
  /** `tr_query` 回的三种交易类型合计（分） */
  statistics: Record<string, number>
}

/** 页脚统计行：收入 / 支出 / 转账。 */
export function RecordsStatistics({ statistics }: RecordsStatisticsProps): JSX.Element {
  return (
    <div className="statistics-footer">
      <div className="statistics-footer-item">
        <span className="statistics-footer-item-label">收入</span>
        <span className="statistics-footer-item-value income" data-testid="tr-stat-income">
          {centsToYuan(statistics.income ?? 0)}
        </span>
      </div>
      <div className="statistics-footer-divider" />
      <div className="statistics-footer-item">
        <span className="statistics-footer-item-label">支出</span>
        <span className="statistics-footer-item-value expense" data-testid="tr-stat-expense">
          {centsToYuan(statistics.expense ?? 0)}
        </span>
      </div>
      <div className="statistics-footer-divider" />
      <div className="statistics-footer-item">
        <span className="statistics-footer-item-label">转账</span>
        <span className="statistics-footer-item-value transfer" data-testid="tr-stat-transfer">
          {centsToYuan(statistics.transfer ?? 0)}
        </span>
      </div>
    </div>
  )
}

export interface RecordsTableProps {
  ledgerId: string
  rows: TransactionRecordDto[]
  total: number
  loading: boolean
  error: string
  page: number
  pageSize: number
  /** 正在同步的记录 id；行内动作据此进入进行中态 */
  syncingId: string
  /** 可同步的目标账本（不含当前账本） */
  otherLedgers: Ledger[]
  onPageChange: (page: number) => void
  /** 换每页条数：页面同时把页码回第一页 */
  onPageSizeChange: (pageSize: number) => void
  onEdit: (record: TransactionRecordDto) => void
  onSync: (record: TransactionRecordDto, targetLedgerId: string) => void
  onRemove: (id: string) => void
  onLastMonth: () => void
  onThisYear: () => void
  onCreate: () => void
}

export function RecordsTable({
  ledgerId,
  rows,
  total,
  loading,
  error,
  page,
  pageSize,
  syncingId,
  otherLedgers,
  onPageChange,
  onPageSizeChange,
  onEdit,
  onSync,
  onRemove,
  onLastMonth,
  onThisYear,
  onCreate,
}: RecordsTableProps): JSX.Element {
  const contentRef = useRef<HTMLDivElement>(null)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const columns: TableProps<TransactionRecordDto>['columns'] = [
    {
      title: '日期',
      dataIndex: 'transactionAt',
      width: 100,
      align: 'center',
      render: (value: number) => (
        <span className="tr-cell-date" title={formatTimestamp(value, 'YYYY-MM-DD HH:mm:ss')}>
          {formatTimestamp(value, 'MM-DD')}
        </span>
      ),
    },
    {
      title: '类型',
      dataIndex: 'transactionType',
      width: 100,
      align: 'center',
      render: (value: string) => (
        <span className={`tr-cell-type type-${value}`}>{transactionTypeText(value)}</span>
      ),
    },
    {
      title: '分类',
      dataIndex: 'category',
      width: 100,
      align: 'center',
      render: (value: string) => <span className="tr-cell-category">{value}</span>,
    },
    {
      title: '标签',
      dataIndex: 'tags',
      width: 180,
      align: 'center',
      render: (value: string[]) =>
        value.length > 0 ? (
          <span className="tr-cell-tags">
            {value.map((tag) => (
              <span key={tag} className="ui-tag tag-item">
                {tag}
              </span>
            ))}
          </span>
        ) : (
          '-'
        ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      ellipsis: true,
      render: (value: string) => (
        <span className="tr-cell-description" title={value}>
          {value || '-'}
        </span>
      ),
    },
    {
      title: '金额',
      dataIndex: 'price',
      align: 'right',
      width: 110,
      render: (value: number, row) => (
        <span className={`tr-cell-price price-${row.transactionType}`}>
          {signedAmount(row.transactionType, value)}
        </span>
      ),
    },
    {
      title: '标记',
      width: 100,
      align: 'center',
      render: (_, row) => (
        <span className="tr-cell-marks">
          {row.outlier ? <span className="ui-tag ui-tag--outlier">离群值</span> : null}
          {row.keyEventDate ? (
            <span className="tr-cell-mark" title={`已关联至 ${row.keyEventDate}`}>
              <Icon name="Star" size={14} />
            </span>
          ) : null}
        </span>
      ),
    },
    {
      title: '操作',
      width: 130,
      align: 'center',
      render: (_, row) => (
        <RecordRowActions
          record={row}
          syncing={syncingId === row.transactionId}
          otherLedgers={otherLedgers}
          onEdit={onEdit}
          onSync={onSync}
          onRemove={onRemove}
        />
      ),
    },
  ]

  return (
    <div className="tr-body">
      {error ? (
        <p role="alert" className="m0-error tr-error" data-testid="tr-error">
          {error}
        </p>
      ) : null}

      <div className="tr-content" ref={contentRef}>
        <ScrollArea className="tr-scroll" axis="both" notifyResize>
          {rows.length === 0 ? (
            <div className="tr-empty" data-testid="tr-empty">
              <span className="tr-empty-icon">
                <Icon name="Transaction" size={56} />
              </span>
              <h2>{ledgerId ? (loading ? '加载中…' : '今天还没有记录') : '请先创建/选择账本'}</h2>
              {ledgerId ? <p className="m0-muted">换个时间范围，或直接记一笔。</p> : null}
              <div className="m0-actions">
                <Button variant="secondary" onClick={onLastMonth}>
                  上月
                </Button>
                <Button variant="secondary" onClick={onThisYear}>
                  今年
                </Button>
                <Button variant="primary" onClick={onCreate}>
                  记一笔
                </Button>
              </div>
            </div>
          ) : (
            <Table<TransactionRecordDto>
              className="tr-table"
              rowKey="transactionId"
              columns={columns}
              dataSource={rows}
              pagination={false}
              size="small"
              sticky={{
                getContainer: () =>
                  contentRef.current?.querySelector<HTMLElement>(
                    '[data-overlayscrollbars-viewport]',
                  ) ??
                  contentRef.current ??
                  window,
              }}
              rowClassName={(row) => `row-type-${row.transactionType}`}
              onRow={() => ({ 'data-testid': 'tr-row' }) as HTMLAttributes<HTMLElement>}
            />
          )}
        </ScrollArea>
      </div>

      <div className="tr-footer">
        <span className="tr-footer-total" data-testid="tr-total">
          共 {total} 条
        </span>
        <div className="tr-footer-controls">
          <Pagination
            page={page}
            totalPages={totalPages}
            disabled={loading}
            showSummary={false}
            onChange={onPageChange}
          />
          <Select
            data-testid="tr-page-size"
            aria-label="每页条数"
            value={pageSize}
            style={{ width: 110 }}
            onChange={onPageSizeChange}
            options={[
              { value: 15, label: '15 条/页' },
              { value: 30, label: '30 条/页' },
              { value: 50, label: '50 条/页' },
            ]}
          />
        </div>
      </div>
    </div>
  )
}
