import type { JSX } from 'react'

import { centsToYuan } from '../../shared/domain/money'
import type { StockStatisticsPointDto } from '../../shared/types/stock-statistics'
import { EmptyState } from '../components/empty-state'
import { Icon } from '../components/icon'
import { Tooltip } from '../components/tooltip'
import { stockPercent, stockPnlClass } from './stock-format'

export interface StockStatisticsSummaryProps {
  ledgerId: string
  /** 顶部合计始终读全量逐笔点的最后一个，不跟着分组口径变成最后一组 */
  latest: StockStatisticsPointDto | undefined
}

function StatLabel({ text, hint }: { text: string; hint?: string }): JSX.Element {
  return (
    <span className="stock-stat-label">
      {text}
      {hint ? (
        <Tooltip text={hint}>
          <span
            className="stock-stat-hint"
            tabIndex={0}
            aria-label={`${text}：${hint}`}
          >
            <Icon name="InfoCircle" size={12} />
          </span>
        </Tooltip>
      ) : null}
    </span>
  )
}

function money(cents: number): string {
  return `¥${centsToYuan(cents)}`
}

/** 统计页顶部：已实现盈亏与胜率等七张指标卡，没有已结算轮次时走空态。 */
export function StockStatisticsSummary({
  ledgerId,
  latest,
}: StockStatisticsSummaryProps): JSX.Element {
  return (
    <section
      className={`stock-statistics-section${latest ? '' : ' stock-statistics-section--empty'}`}
    >
      <h2 className="stock-section__title">结算统计</h2>
      {latest ? (
        <div className="stock-stat-grid" data-testid="stock-statistics-summary">
          <div className="stock-stat-cell stock-stat-cell--wide">
            <StatLabel text="已实现盈亏" />
            <strong className={stockPnlClass(latest.totalPnl)}>
              {money(latest.totalPnl)}
            </strong>
          </div>
          <div className="stock-stat-cell">
            <StatLabel text="平均盈利" hint="赢的时候能赢多少" />
            <strong className="is-up">{money(latest.avgWin)}</strong>
            <small>{latest.winCount} 笔盈利</small>
          </div>
          <div className="stock-stat-cell">
            <StatLabel text="平均亏损" hint="输的时候会输多少" />
            <strong className="is-down">{money(latest.avgLoss)}</strong>
            <small>{latest.lossCount} 笔亏损</small>
          </div>
          <div className="stock-stat-cell">
            <StatLabel text="胜率" hint="我赢的次数够不够多" />
            <strong>{stockPercent(latest.winRate)}</strong>
            <small>
              {latest.winCount} 胜 · {latest.lossCount} 负
              {latest.tieCount > 0 ? ` · ${latest.tieCount} 平` : ''}
            </small>
          </div>
          <div className="stock-stat-cell">
            <StatLabel text="盈亏比" hint="赢一次的收获等于几次的代价" />
            <strong>{latest.pnlRatio === null ? '—' : latest.pnlRatio.toFixed(2)}</strong>
            <small>盈利均值 ÷ 亏损均值</small>
          </div>
          <div className="stock-stat-cell">
            <StatLabel text="期望值" hint="每开一笔，长期平均赚多少" />
            <strong className={stockPnlClass(latest.expectancy)}>
              {money(latest.expectancy)}
            </strong>
            <small>每笔均值</small>
          </div>
          <div className="stock-stat-cell">
            <StatLabel text="最大回撤" hint="最坏的时候我要忍多少" />
            <strong>{stockPercent(latest.maxDrawdownPct)}</strong>
            <small>从高点回落 {money(latest.maxDrawdown)}</small>
          </div>
        </div>
      ) : (
        <EmptyState
          testId="stock-statistics-empty"
          title={ledgerId ? '还没有已结算的轮次' : '请先创建/选择账本'}
        />
      )}
    </section>
  )
}
