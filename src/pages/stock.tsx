import { useState, type JSX } from 'react'

import { Input, Modal } from 'antd'

import { yuanToCents } from '../../shared/domain/money'
import type { StockTradeHistorySummaryDto } from '../../shared/types/stock-history'
import { Button } from '../components/button'
import { Icon, type IconName } from '../components/icon'
import { PageLayout } from '../components/page-layout'
import { notify } from '../components/toast'
import { StockAccountPanel } from './stock-account'
import { stockMoney, stockPercent, stockPnlClass } from './stock-format'
import { StockHistoryPanel } from './stock-history'
import { StockPositionsPanel } from './stock-positions'
import { StockSettingsPanel } from './stock-settings'
import { StockStatisticsPanel } from './stock-statistics'

export interface StockPageProps {
  ledgerId: string
  onLedgerChanged?: () => void
}

type StockTab = 'account' | 'positions' | 'history' | 'statistics' | 'settings'
type AmountAction = 'principal' | 'withdraw' | 'interest'

const TABS: Array<[StockTab, string, IconName]> = [
  ['account', '账户', 'User'],
  ['positions', '持仓', 'LineChart'],
  ['history', '记录', 'ClockCircle'],
  ['statistics', '统计', 'BarChart'],
  ['settings', '设置', 'Setting'],
]

const ACCOUNT_ACTIONS = {
  principal: { title: '追加本金', command: 'stock_principal_add', ok: '追加' },
  withdraw: { title: '支取', command: 'stock_withdraw', ok: '支取' },
  interest: { title: '利息归本', command: 'stock_interest_add', ok: '归本' },
} as const

/** 股票域分页：账户/持仓、交易历史、统计。 */
export function StockPage({ ledgerId, onLedgerChanged }: StockPageProps): JSX.Element {
  const [tab, setTab] = useState<StockTab>('account')
  const [accountAction, setAccountAction] = useState<AmountAction | null>(null)
  const [accountAmount, setAccountAmount] = useState('')
  const [accountBusy, setAccountBusy] = useState(false)
  const [accountError, setAccountError] = useState('')
  const [accountRefresh, setAccountRefresh] = useState(0)
  const [historySummary, setHistorySummary] = useState<StockTradeHistorySummaryDto | null>(null)

  const closeAccountAction = (): void => {
    setAccountAction(null)
    setAccountAmount('')
    setAccountError('')
  }

  const openAccountAction = (next: AmountAction): void => {
    setAccountAction(next)
    setAccountAmount('')
    setAccountError('')
  }

  const submitAccountAction = async (): Promise<void> => {
    if (!accountAction) return
    const parsedAmount = Number(accountAmount)
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setAccountError('请输入大于 0 的金额')
      return
    }
    setAccountBusy(true)
    setAccountError('')
    try {
      await window.api.invoke(ACCOUNT_ACTIONS[accountAction].command, {
        ledger_id: ledgerId,
        amount: yuanToCents(accountAmount),
        date: '',
      })
      notify(`${ACCOUNT_ACTIONS[accountAction].title}已记录`)
      closeAccountAction()
      setAccountRefresh((current) => current + 1)
    } catch (actionError) {
      setAccountError(
        typeof actionError === 'object' && actionError !== null && 'msg' in actionError
          ? String((actionError as { msg: unknown }).msg)
          : actionError instanceof Error
            ? actionError.message
            : String(actionError),
      )
    } finally {
      setAccountBusy(false)
    }
  }

  return (
    <PageLayout
      contentClassName="stock-page"
      footerClassName="page-footer-bar--end"
      footer={
        tab === 'history' ? (
          <div className="statistics-footer stock-history-footer" data-testid="stock-history-summary">
            <div className="statistics-footer-item">
              <span className="statistics-footer-item-label">已实现盈亏</span>
              <span
                className={`statistics-footer-item-value ${stockPnlClass(historySummary?.totalPnl ?? 0)}`}
              >
                {stockMoney(historySummary?.totalPnl ?? 0)}
              </span>
            </div>
            <div className="statistics-footer-divider" />
            <div className="statistics-footer-item">
              <span className="statistics-footer-item-label">累计盈亏率</span>
              <span
                className={`statistics-footer-item-value ${stockPnlClass(historySummary?.totalPnlRate ?? 0)}`}
              >
                {stockPercent(historySummary?.totalPnlRate ?? 0)}
              </span>
            </div>
            <div className="statistics-footer-divider" />
            <div className="statistics-footer-item">
              <span className="statistics-footer-item-label">胜负轮次</span>
              <span className="statistics-footer-item-value">
                {historySummary
                  ? `${historySummary.winCount} 胜 · ${historySummary.lossCount} 负`
                  : '—'}
              </span>
            </div>
            <div className="statistics-footer-divider" />
            <div className="statistics-footer-item">
              <span className="statistics-footer-item-label">总轮次</span>
              <span className="statistics-footer-item-value">
                {historySummary ? `${historySummary.roundCount} 轮` : '—'}
              </span>
            </div>
          </div>
        ) : undefined
      }
      toolbar={
        tab === 'account' ? (
          <div className="stock-toolbar-actions">
            <Button
              variant="secondary"
              testId="stock-open-withdraw"
              onClick={() => openAccountAction('withdraw')}
            >
              支取
            </Button>
            <Button
              variant="secondary"
              testId="stock-open-interest"
              onClick={() => openAccountAction('interest')}
            >
              利息归本
            </Button>
            <Button
              variant="primary"
              testId="stock-open-principal"
              onClick={() => openAccountAction('principal')}
            >
              追加本金
            </Button>
          </div>
        ) : undefined
      }
      rail={
        <div className="page-rail-nav">
          {TABS.map(([key, label, icon]) => (
            <button
              key={key}
              type="button"
              data-testid={`stock-tab-${key}`}
              className={`page-rail-btn${tab === key ? ' is-active' : ''}`}
              title={label}
              aria-label={label}
              onClick={() => setTab(key)}
            >
              <span className="page-rail-btn-icon">
                <Icon name={icon} size={18} />
              </span>
            </button>
          ))}
        </div>
      }
    >
      {tab === 'account' ? (
        <StockAccountPanel ledgerId={ledgerId} refreshToken={accountRefresh} />
      ) : null}
      {tab === 'positions' ? <StockPositionsPanel ledgerId={ledgerId} /> : null}
      {tab === 'history' ? (
        <StockHistoryPanel ledgerId={ledgerId} onSummaryChange={setHistorySummary} />
      ) : null}
      {tab === 'statistics' ? <StockStatisticsPanel ledgerId={ledgerId} /> : null}
      {tab === 'settings' ? (
        <StockSettingsPanel ledgerId={ledgerId} onLedgerChanged={onLedgerChanged} />
      ) : null}

      <Modal
        open={accountAction !== null}
        title={accountAction ? ACCOUNT_ACTIONS[accountAction].title : ''}
        width={420}
        centered
        destroyOnHidden
        footer={null}
        onCancel={closeAccountAction}
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
            prefix="¥"
            placeholder="0.00"
            value={accountAmount}
            onChange={(event) => setAccountAmount(event.target.value)}
            onPressEnter={() => void submitAccountAction()}
          />
          {accountError ? (
            <p className="stock-modal-error" data-testid="stock-error">
              {accountError}
            </p>
          ) : null}
          <div className="stock-modal-actions">
            <Button variant="secondary" onClick={closeAccountAction}>
              取消
            </Button>
            <Button
              variant="primary"
              testId="stock-amount-confirm"
              loading={accountBusy}
              onClick={() => void submitAccountAction()}
            >
              {accountAction ? ACCOUNT_ACTIONS[accountAction].ok : '确定'}
            </Button>
          </div>
        </div>
      </Modal>
    </PageLayout>
  )
}
