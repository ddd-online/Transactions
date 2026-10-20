import { useState, type JSX } from 'react'

import { StockAccountPanel } from './stock-account'
import { StockHistoryPanel } from './stock-history'
import { StockStatisticsPanel } from './stock-statistics'

export interface StockPageProps {
  ledgerId: string
}

type StockTab = 'account' | 'history' | 'statistics'

const TABS: Array<[StockTab, string]> = [
  ['account', '账户与持仓'],
  ['history', '交易历史'],
  ['statistics', '统计'],
]

/** 股票域分页：账户/持仓、交易历史、统计。 */
export function StockPage({ ledgerId }: StockPageProps): JSX.Element {
  const [tab, setTab] = useState<StockTab>('account')

  return (
    <>
      <div className="m0-actions m0-stock-tabs">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            data-testid={`stock-tab-${key}`}
            className={tab === key ? 'm0-primary' : 'm0-link'}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'account' ? <StockAccountPanel ledgerId={ledgerId} /> : null}
      {tab === 'history' ? <StockHistoryPanel ledgerId={ledgerId} /> : null}
      {tab === 'statistics' ? <StockStatisticsPanel ledgerId={ledgerId} /> : null}
    </>
  )
}
