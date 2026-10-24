import { useCallback, useEffect, useState, type JSX } from 'react'

import { Table } from 'antd'
import type { HTMLAttributes } from 'react'

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
  page: number
  onTotalChange?: (total: number) => void
}

export const STOCK_FUND_PAGE_SIZE = 10

export function StockAccountPanel({
  ledgerId,
  refreshToken,
  page,
  onTotalChange,
}: StockAccountPanelProps): JSX.Element {
  const [summary, setSummary] = useState<StockAccountSummary | null>(null)
  const [overview, setOverview] = useState<StockOverviewDto | null>(null)
  const [funds, setFunds] = useState<StockFundRecordPage | null>(null)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    if (!ledgerId) {
      setSummary(null)
      setOverview(null)
      setFunds(null)
      onTotalChange?.(0)
      setLoaded(true)
      return
    }
    try {
      const [account, overviewData, recordPage] = await Promise.all([
        window.api.invoke('stock_account_summary', { ledger_id: ledgerId }),
        window.api.invoke('stock_overview', { ledger_id: ledgerId }),
        window.api.invoke('stock_fund_records', {
          ledger_id: ledgerId,
          page,
          pageSize: STOCK_FUND_PAGE_SIZE,
        }),
      ])
      setSummary(account)
      setOverview(overviewData)
      setFunds(recordPage)
      setError('')
      onTotalChange?.(recordPage.total)
    } catch (loadError) {
      setError(stockErrorMessage(loadError))
    } finally {
      setLoaded(true)
    }
  }, [ledgerId, onTotalChange, page])

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
    <ScrollArea className="stock-account-scroll">
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

        <section className="stock-section">
          <h3 className="stock-section__title">资金变化记录</h3>
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
                    align: 'right',
                    ellipsis: true,
                    width: '42%',
                  },
                ]}
              />
            </>
          ) : error ? null : (
            <EmptyState
              testId="fund-empty"
              title={ledgerId ? '还没有资金记录' : '请先创建/选择账本'}
              description={ledgerId ? '追加本金或交易后，资金变化会显示在这里。' : undefined}
            />
          )}
        </section>
      </div>
    </ScrollArea>
  )
}
