import { useCallback, useEffect, useState, type JSX } from 'react'

import { Pagination, Table } from 'antd'
import type { HTMLAttributes } from 'react'

import { pagerItemRender } from '../components/pagination'

import type { StockAccountSummary, StockFundRecordPage } from '../../shared/types/stock'
import type { StockOverviewDto } from '../../shared/types/stock-position'
import { EmptyState } from '../components/empty-state'
import { ScrollArea } from '../components/scroll-area'
import {
  stockErrorMessage,
  stockMoney,
  stockPercent,
  stockPnlClass,
} from './stock-format'

export interface StockAccountPanelProps {
  ledgerId: string
  refreshToken: number
}

/** 资金变化记录每页条数：与记账页、股票统计明细一致，都是 15。 */
const PAGE_SIZE = 15

export function StockAccountPanel({
  ledgerId,
  refreshToken,
}: StockAccountPanelProps): JSX.Element {
  const [summary, setSummary] = useState<StockAccountSummary | null>(null)
  const [overview, setOverview] = useState<StockOverviewDto | null>(null)
  const [funds, setFunds] = useState<StockFundRecordPage | null>(null)
  const [fundPage, setFundPage] = useState(1)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    if (!ledgerId) {
      setSummary(null)
      setOverview(null)
      setFunds(null)
      setLoaded(true)
      return
    }
    try {
      const [account, overviewData, recordPage] = await Promise.all([
        window.api.invoke('stock_account_summary', { ledger_id: ledgerId }),
        window.api.invoke('stock_overview', { ledger_id: ledgerId }),
        window.api.invoke('stock_fund_records', {
          ledger_id: ledgerId,
          page: fundPage,
          pageSize: PAGE_SIZE,
        }),
      ])
      setSummary(account)
      setOverview(overviewData)
      setFunds(recordPage)
      setError('')
    } catch (loadError) {
      setError(stockErrorMessage(loadError))
    } finally {
      setLoaded(true)
    }
  }, [fundPage, ledgerId])

  useEffect(() => {
    void load()
  }, [load, refreshToken])

  const metrics: Array<[string, string, string | undefined, number?]> = [
    ['本金', stockMoney(summary?.principal ?? 0), 'stock-principal'],
    ['持仓市值', stockMoney(overview?.positionMarketValue ?? 0), undefined],
    [
      '浮动盈亏',
      stockMoney(overview?.unrealizedPnl ?? 0),
      undefined,
      overview?.unrealizedPnl ?? 0,
    ],
    [
      '已实现盈亏',
      stockMoney(overview?.realizedPnl ?? 0),
      undefined,
      overview?.realizedPnl ?? 0,
    ],
    ['累计支取', stockMoney(summary?.withdrawnTotal ?? 0), 'stock-withdrawn'],
    ['利息归本', stockMoney(summary?.interestTotal ?? 0), undefined],
    ['可用现金', stockMoney(summary?.availableCash ?? 0), 'stock-cash'],
    [
      '仓位',
      overview?.positionRatio == null ? '—' : stockPercent(overview.positionRatio),
      undefined,
    ],
  ]

  return (
    <div className="stock-account-view">
      {error ? (
        <p className="m0-error stock-inline-error" data-testid="stock-error">
          {error}
        </p>
      ) : null}

      <section className="stock-hero stock-hero--flat">
        <span className="stock-label">总资产</span>
        {loaded ? (
          <strong data-testid="stock-total-assets">
            {stockMoney(overview?.totalAssets ?? 0)}
          </strong>
        ) : (
          <span className="stock-skeleton stock-skeleton--hero" aria-hidden="true" />
        )}
      </section>

      <div className="stock-metrics">
        {metrics.map(([label, value, testId, pnl]) => (
          <div className="stock-metric" key={label}>
            <span className="stock-label">{label}</span>
            <strong
              className={pnl === undefined ? undefined : stockPnlClass(pnl)}
              data-testid={testId}
            >
              {loaded ? value : <span className="stock-skeleton stock-skeleton--metric" />}
            </strong>
          </div>
        ))}
      </div>

      <section className="stock-section stock-section--fill">
        <h3 className="stock-section__title">资金变化记录</h3>
        <ScrollArea className="stock-fund-scroll">
          {!loaded ? (
            <div className="stock-table-skeleton" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          ) : funds && funds.items.length > 0 ? (
            <>
              <Table
                className="tr-table stock-fund-table"
                rowKey="id"
                pagination={false}
                size="middle"
                dataSource={funds.items}
                onRow={() => ({ 'data-testid': 'fund-row' }) as HTMLAttributes<HTMLElement>}
                columns={[
                  { title: '日期', dataIndex: 'recordDate', align: 'center', width: '12%' },
                  { title: '事件', dataIndex: 'eventText', width: '14%' },
                  {
                    title: '金额变化',
                    dataIndex: 'amountChange',
                    align: 'right',
                    width: '16%',
                    render: (value: number) => (
                      <span className={stockPnlClass(value)}>
                        {value >= 0 ? '+' : '-'}
                        {Math.abs(value / 100).toFixed(2)}
                      </span>
                    ),
                  },
                  {
                    title: '现金余额',
                    dataIndex: 'cashBalance',
                    align: 'right',
                    width: '16%',
                    render: (value: number) => stockMoney(value),
                  },
                  {
                    title: '备注',
                    dataIndex: 'remark',
                    align: 'center',
                    ellipsis: true,
                    width: '42%',
                  },
                ]}
              />
              <div className="stock-table-foot" data-testid="stock-fund-foot">
                <span className="stock-muted">共 {funds.total} 条</span>
                <Pagination
                  size="small"
                  current={fundPage}
                  total={funds.total}
                  pageSize={PAGE_SIZE}
                  showSizeChanger={false}
                  showLessItems
                  onChange={setFundPage}
                  itemRender={pagerItemRender('stock-fund')}
                />
              </div>
            </>
          ) : error ? null : (
            <EmptyState
              testId="fund-empty"
              title={ledgerId ? '还没有资金记录' : '请先创建/选择账本'}
              description={ledgerId ? '追加本金或交易后，资金变化会显示在这里。' : undefined}
            />
          )}
        </ScrollArea>
      </section>
    </div>
  )
}
