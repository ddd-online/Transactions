import type { JSX } from 'react'

import { kellyPercent } from '../../shared/domain/kelly'
import { centsToYuan } from '../../shared/domain/money'
import type { StatisticsStrategy } from '../../shared/domain/statistics'
import type { StockStatisticsPointDto } from '../../shared/types/stock-statistics'
import { EmptyState } from '../components/empty-state'
import { Icon } from '../components/icon'
import { Tooltip } from '../components/tooltip'
import { stockPercent, stockPnlClass } from './stock-format'

export interface StockStatisticsSummaryProps {
  ledgerId: string
  /**
   * 当前口径的最后一个点：逐笔累计 = 所选范围内的全部结算，分组统计 = 最近一组。
   * 与曲线选择的最后一格是同一份数 —— 卡片是那条曲线的读数，不是另一套账。
   */
  latest: StockStatisticsPointDto | undefined
  strategy: StatisticsStrategy
}

function StatLabel({ text, hint }: { text: string; hint?: string }): JSX.Element {
  return (
    <span className="stock-stat-label">
      {text}
      {hint ? (
        <Tooltip text={hint} focusTrigger>
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

/** 凯利值的文案：两位小数（与胜率同一档精度），负零不要写成 `-0.00%`。 */
function kellyText(value: number | null): string {
  if (value === null) return '—'
  const rounded = Math.round(value * 100) / 100
  return stockPercent(rounded === 0 ? 0 : rounded)
}

/** 凯利值的读法：正数是能下注的比例，负数是「没有正期望」。 */
function kellyCaption(value: number | null): string {
  if (value === null) return '样本不足'
  return value > 0 ? '建议仓位' : '没有正期望'
}

/** 已实现盈亏那一格的范围说明：分组口径下这个数是**最近一组**的，不是全量累计。 */
function scopeText(strategy: StatisticsStrategy, span: number): string {
  // 口径本身在工具栏的下拉里写着，这里只说这个数覆盖了哪些结算 —— 重复一遍口径
  // 既长又会在四列宽的卡片里挤出格子。
  return strategy === 'grouped' ? `最近一组 ${span} 笔` : `共 ${span} 笔`
}

/**
 * 统计页顶部：已实现盈亏（双宽，右侧并排凯利值）与平均盈亏、胜率等六张指标卡；
 * 没有已结算轮次时走空态。
 *
 * 七个数都读**同一个统计点**（{@link StockStatisticsSummaryProps.latest}），所以范围筛选
 * 与逐笔 / 分组两种口径一起把它们换掉：分组口径下就是最近一组，凯利值也跟着这一组走。
 */
export function StockStatisticsSummary({
  ledgerId,
  latest,
  strategy,
}: StockStatisticsSummaryProps): JSX.Element {
  const kelly = latest ? kellyPercent(latest) : null

  return (
    <section
      className={`stock-statistics-section${latest ? '' : ' stock-statistics-section--empty'}`}
    >
      <h2 className="stock-section__title">结算统计</h2>
      {latest ? (
        <div className="stock-stat-grid" data-testid="stock-statistics-summary">
          <div className="stock-stat-cell stock-stat-cell--wide stock-stat-hero">
            <div className="stock-stat-hero__pnl">
              <StatLabel text={strategy === 'grouped' ? '分组盈亏' : '已实现盈亏'} />
              <strong className={stockPnlClass(latest.totalPnl)} data-testid="stock-statistics-pnl">
                {money(latest.totalPnl)}
              </strong>
              <small data-testid="stock-statistics-scope">{scopeText(strategy, latest.span)}</small>
            </div>
            <div className="stock-stat-hero__kelly">
              <StatLabel text="凯利值" hint="按胜率与盈亏比算出的下注比例" />
              <strong data-testid="stock-statistics-kelly">{kellyText(kelly)}</strong>
              {/* 半凯利跟着注释走：实盘通常只押满凯利的一半，它是**取整前**那个值的一半，
                  不是把显示出来的 22.73% 再除二（那样会多一次取整）。 */}
              <small data-testid="stock-statistics-kelly-note">
                {kellyCaption(kelly)}
                {kelly === null ? null : (
                  <>
                    {'\u00A0· '}
                    <span className="stock-stat-hero__half">{`半凯利 ${kellyText(kelly / 2)}`}</span>
                  </>
                )}
              </small>
            </div>
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
          </div>
          <div className="stock-stat-cell">
            <StatLabel text="期望值" hint="每开一笔，长期平均赚多少" />
            <strong className={stockPnlClass(latest.expectancy)}>
              {money(latest.expectancy)}
            </strong>
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
