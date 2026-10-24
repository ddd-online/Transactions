import { useCallback, useEffect, useState, type JSX } from 'react'

import { Input, Modal, Pagination, Table } from 'antd'
import type { HTMLAttributes } from 'react'

import type { StockFundRecordPage } from '../../shared/types/stock'
import type { StockOverviewDto } from '../../shared/types/stock-position'
import type { StockAccountSummary } from '../../shared/types/stock'
import { yuanToCents } from '../../shared/domain/money'
import { Button } from '../components/button'
import { EmptyState } from '../components/empty-state'
import { ScrollArea } from '../components/scroll-area'
import { notify } from '../components/toast'
import {
  stockErrorMessage,
  stockMoney,
  stockPnlClass,
  stockPercent,
} from './stock-format'

export interface StockAccountPanelProps {
  ledgerId: string
}

type AmountAction = 'principal' | 'withdraw' | 'interest'

const ACTION = {
  principal: { title: '追加本金', command: 'stock_principal_add' as const, ok: '追加' },
  withdraw: { title: '支取', command: 'stock_withdraw' as const, ok: '支取' },
  interest: { title: '利息归本', command: 'stock_interest_add' as const, ok: '归本' },
} as const

const PAGE_SIZE = 10

export function StockAccountPanel({ ledgerId }: StockAccountPanelProps): JSX.Element {
  const [summary, setSummary] = useState<StockAccountSummary | null>(null)
  const [overview, setOverview] = useState<StockOverviewDto | null>(null)
  const [funds, setFunds] = useState<StockFundRecordPage | null>(null)
  const [fundPage, setFundPage] = useState(1)
  const [action, setAction] = useState<AmountAction | null>(null)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (): Promise<void> => {
    if (!ledgerId) {
      setSummary(null)
      setOverview(null)
      setFunds(null)
      return
    }
    try {
      const [account, overviewData, page] = await Promise.all([
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
      setFunds(page)
      setError('')
    } catch (loadError) {
      setError(stockErrorMessage(loadError))
    }
  }, [fundPage, ledgerId])

  useEffect(() => {
    void load()
  }, [load])

  const openAction = (next: AmountAction): void => {
    setAction(next)
    setAmount('')
    setError('')
  }

  const submitAction = useCallback(async (): Promise<void> => {
    if (!action) return
    setBusy(true)
    setError('')
    try {
      await window.api.invoke(ACTION[action].command, {
        ledger_id: ledgerId,
        amount: yuanToCents(amount),
        date: '',
      })
      setAction(null)
      setAmount('')
      notify(`${ACTION[action].title}已记录`)
      await load()
    } catch (actionError) {
      setError(stockErrorMessage(actionError))
    } finally {
      setBusy(false)
    }
  }, [action, amount, ledgerId, load])

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
      <div className="stock-topbar">
        <div className="stock-topbar__actions">
          <Button variant="secondary" size="sm" testId="stock-open-withdraw" onClick={() => openAction('withdraw')}>
            支取
          </Button>
          <Button variant="secondary" size="sm" testId="stock-open-interest" onClick={() => openAction('interest')}>
            利息归本
          </Button>
          <Button variant="primary" size="sm" testId="stock-open-principal" onClick={() => openAction('principal')}>
            追加本金
          </Button>
        </div>
      </div>

      {error && !action ? (
        <p className="m0-error stock-inline-error" data-testid="stock-error">
          {error}
        </p>
      ) : null}

      <section className="stock-hero stock-hero--flat">
        <span className="stock-label">总资产</span>
        <strong data-testid="stock-total-assets">{stockMoney(overview?.totalAssets ?? 0)}</strong>
      </section>

      <div className="stock-metrics">
        {metrics.map(([label, value, testId, pnl]) => (
          <div className="stock-metric" key={label}>
            <span className="stock-label">{label}</span>
            <strong
              className={pnl === undefined ? undefined : stockPnlClass(pnl)}
              data-testid={testId}
            >
              {value}
            </strong>
          </div>
        ))}
      </div>

      <section className="stock-section">
        <h3 className="stock-section__title">资金变化记录</h3>
        {funds && funds.items.length > 0 ? (
          <>
            <Table
              className="tr-table stock-fund-table"
              rowKey="id"
              pagination={false}
              size="middle"
              dataSource={funds.items}
              onRow={() => ({ 'data-testid': 'fund-row' }) as HTMLAttributes<HTMLElement>}
              columns={[
                { title: '日期', dataIndex: 'recordDate', width: 120 },
                { title: '事件', dataIndex: 'eventText', width: 140 },
                {
                  title: '金额变化',
                  dataIndex: 'amountChange',
                  align: 'right',
                  width: 140,
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
                  width: 140,
                  render: (value: number) => stockMoney(value),
                },
                { title: '备注', dataIndex: 'remark', ellipsis: true },
              ]}
            />
            <div className="stock-table-foot">
              <span className="stock-muted">共 {funds.total} 条</span>
              <Pagination
                size="small"
                current={fundPage}
                total={funds.total}
                pageSize={PAGE_SIZE}
                showSizeChanger={false}
                showLessItems
                onChange={setFundPage}
              />
            </div>
          </>
        ) : (
          <EmptyState
            testId="fund-empty"
            title={ledgerId ? '还没有资金记录' : '请先创建/选择账本'}
            description={ledgerId ? '追加本金或交易后，资金变化会显示在这里。' : undefined}
          />
        )}
      </section>

      <Modal
        open={action !== null}
        title={action ? ACTION[action].title : ''}
        width={420}
        centered
        destroyOnHidden
        footer={null}
        onCancel={() => setAction(null)}
      >
        <div className="stock-modal-form">
          <label className="stock-label" htmlFor="stock-amount-input">
            金额（元）
          </label>
          <Input
            id="stock-amount-input"
            data-testid="stock-amount"
            autoFocus
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            onPressEnter={() => void submitAction()}
          />
          {error ? (
            <p className="stock-modal-error" data-testid="stock-error">
              {error}
            </p>
          ) : null}
          <div className="stock-modal-actions">
            <Button variant="secondary" onClick={() => setAction(null)}>
              取消
            </Button>
            <Button
              variant="primary"
              testId="stock-amount-confirm"
              loading={busy}
              onClick={() => void submitAction()}
            >
              {action ? ACTION[action].ok : '确定'}
            </Button>
          </div>
        </div>
      </Modal>
      </div>
    </ScrollArea>
  )
}
