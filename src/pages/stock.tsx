import { useState, type JSX } from 'react'

import { Icon, type IconName } from '../components/icon'
import { PageLayout } from '../components/page-layout'
import { StockAccountPanel } from './stock-account'
import { StockHistoryPanel } from './stock-history'
import { StockStatisticsPanel } from './stock-statistics'

export interface StockPageProps {
  ledgerId: string
  onLedgerChanged?: () => void
}

type StockTab = 'account' | 'positions' | 'history' | 'statistics' | 'settings'

const TABS: Array<[StockTab, string, IconName]> = [
  ['account', '账户', 'User'],
  ['positions', '持仓', 'LineChart'],
  ['history', '记录', 'ClockCircle'],
  ['statistics', '统计', 'BarChart'],
  ['settings', '设置', 'Setting'],
]

/** 股票域分页：账户/持仓、交易历史、统计。 */
export function StockPage({ ledgerId, onLedgerChanged }: StockPageProps): JSX.Element {
  const [tab, setTab] = useState<StockTab>('account')

  return (
    <PageLayout
      scrollable
      contentClassName="stock-page"
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
    }>
            {tab === 'account' || tab === 'positions' || tab === 'settings' ? (
              <StockAccountPanel section={tab} ledgerId={ledgerId} onLedgerChanged={onLedgerChanged} />
            ) : null}            {tab === 'history' ? <StockHistoryPanel ledgerId={ledgerId} /> : null}
            {tab === 'statistics' ? <StockStatisticsPanel ledgerId={ledgerId} /> : null}
    </PageLayout>
  )
}


