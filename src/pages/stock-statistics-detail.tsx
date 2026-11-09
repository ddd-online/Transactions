import type { HTMLAttributes, JSX } from 'react'

import { Table } from 'antd'

import { detailRowsNewestFirst } from '../../shared/domain/stock-stats'
import type { StockStatisticsPointDto } from '../../shared/types/stock-statistics'
import { EmptyState } from '../components/empty-state'
import { TablePager } from '../components/pagination'
import { stockDate, stockMoney, stockPercent, stockPnlClass } from './stock-format'

/** 明细表每页条数（与记账明细的默认 15 条保持一致）。 */
const DETAIL_PAGE_SIZE = 15

export interface StockStatisticsDetailProps {
  ledgerId: string
  /** 逐笔累计统计点（明细恒为逐笔结算，分组点只给曲线用） */
  points: StockStatisticsPointDto[]
  /** 页码由页面持有：在「统计 / 明细」之间切换时停在同一页 */
  page: number
  onPageChange: (page: number) => void
  /** 点股票时回传要跳转的轮次 */
  onOpenRound?: (target: { code: string; roundId: string }) => void
}

/** 统计页「明细」：逐笔结算的新→旧清单、排序与分页。 */
export function StockStatisticsDetail({
  ledgerId,
  points,
  page,
  onPageChange,
  onOpenRound,
}: StockStatisticsDetailProps): JSX.Element {
  // 「明细」是逐笔结算的清单：口径恒为逐笔累计（分组点是给曲线用的，一行一格不是结算）。
  const detailPoints = detailRowsNewestFirst(points)
  const detailPageCount = Math.max(1, Math.ceil(detailPoints.length / DETAIL_PAGE_SIZE))
  const detailPageNo = Math.min(page, detailPageCount)
  const detailPageRows = detailPoints.slice(
    (detailPageNo - 1) * DETAIL_PAGE_SIZE,
    detailPageNo * DETAIL_PAGE_SIZE,
  )

  return (
    <section
      className={`stock-statistics-section${detailPoints.length === 0 ? ' stock-statistics-section--empty' : ''}`}
    >
      {detailPoints.length === 0 ? (
        <EmptyState
          testId="stock-statistics-empty"
          title={ledgerId ? '还没有已结算的轮次' : '请先创建/选择账本'}
        />
      ) : (
        <>
          <Table
            className="tr-table stock-statistics-table"
            rowKey={(row) => `${row.sequence}-${row.stockCode}`}
            pagination={false}
            size="middle"
            tableLayout="fixed"
            dataSource={detailPageRows}
            onRow={() => ({ 'data-testid': 'stock-statistics-point' }) as HTMLAttributes<HTMLElement>}
            columns={[
              {
                title: '建仓',
                dataIndex: 'openedAt',
                align: 'center',
                width: '7%',
                className: 'stock-stats-date',
                render: (value: number) => stockDate(value),
              },
              {
                title: '清仓',
                dataIndex: 'closedAt',
                align: 'center',
                width: '7%',
                className: 'stock-stats-date',
                render: (value: number) => stockDate(value),
              },
              {
                title: '股票',
                align: 'right',
                width: '12%',
                render: (_, row) => {
                  const label = `${row.stockName} ${row.stockCode}`
                  if (!row.roundId || !onOpenRound) return label
                  return (
                    <button
                      type="button"
                      className="stock-stats-stock"
                      data-testid="statistics-detail-stock"
                      title="查看这一轮交易"
                      onClick={() => onOpenRound({ code: row.stockCode, roundId: row.roundId })}
                    >
                      {label}
                    </button>
                  )
                },
              },
              {
                title: '标签',
                dataIndex: 'tag',
                align: 'center',
                width: '5%',
                render: (value: string) =>
                  value ? <span className="ui-tag">{value}</span> : '—',
              },
              {
                title: '盈亏',
                dataIndex: 'pnl',
                align: 'right',
                width: '8%',
                render: (value: number) => (
                  <span className={stockPnlClass(value)}>{stockMoney(value)}</span>
                ),
              },
              {
                title: '累计',
                dataIndex: 'totalPnl',
                align: 'right',
                width: '8%',
                render: (value: number) => stockMoney(value),
              },
              {
                title: '胜负',
                align: 'right',
                width: '8%',
                render: (_, row) =>
                  `${row.winCount} 胜 ${row.lossCount} 负${
                    row.tieCount > 0 ? ` ${row.tieCount} 平` : ''
                  }`,
              },
              {
                title: '胜率',
                dataIndex: 'winRate',
                align: 'right',
                width: '6%',
                render: (value: number) => stockPercent(value),
              },
              {
                title: '平均盈利',
                dataIndex: 'avgWin',
                align: 'right',
                width: '8%',
                render: (value: number) =>
                  value > 0 ? <span className="is-up">{stockMoney(value)}</span> : '—',
              },
              {
                title: '平均亏损',
                dataIndex: 'avgLoss',
                align: 'right',
                width: '8%',
                render: (value: number) =>
                  value > 0 ? <span className="is-down">-¥{(value / 100).toFixed(2)}</span> : '—',
              },
              {
                title: '盈亏比',
                dataIndex: 'pnlRatio',
                align: 'right',
                width: '6%',
                render: (value: number | null) => (value === null ? '—' : value.toFixed(2)),
              },
              {
                title: '期望值',
                dataIndex: 'expectancy',
                align: 'right',
                width: '7%',
                render: (value: number) => (
                  <span className={stockPnlClass(value)}>{stockMoney(value)}</span>
                ),
              },
              {
                title: '回撤',
                dataIndex: 'maxDrawdownPct',
                align: 'right',
                width: '10%',
                render: (value: number, row) => (
                  <span className="stock-stats-drawdown is-down">
                    <span>{stockPercent(value)}</span>
                    <span>{stockMoney(row.maxDrawdown)}</span>
                  </span>
                ),
              },
            ]}
          />
          <TablePager
            total={detailPoints.length}
            unit="笔"
            page={detailPageNo}
            pageSize={DETAIL_PAGE_SIZE}
            onChange={(next) => onPageChange(next)}
            testId="stock-statistics-detail-foot"
            pagerTestId="stock-statistics-detail"
          />
        </>
      )}
    </section>
  )
}
