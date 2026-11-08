import { type JSX, type RefObject } from 'react'

import { rateText } from '../../shared/domain/format'
import { centsToYuan } from '../../shared/domain/money'
import type { PieSlice } from '../../shared/domain/pie'
import type { ChartLineData } from '../../shared/types/transaction'

import { Icon } from '../components/icon'

export interface ChartPieSummaryProps {
  slices: PieSlice[]
  colors: string[]
  total: number
  filteredTotal: number
}

/** 饼图右侧的分组合计：图例与金额列读同一份折叠结果。 */
export function ChartPieSummary({
  slices,
  colors,
  total,
  filteredTotal,
}: ChartPieSummaryProps): JSX.Element {
  return (
    <aside className="da-chart__sums da-chart__sums--pie" data-testid="chart-pie-sums">
      <div className="da-chart__sums-head">
        <h3 className="da-chart__sums-title">分组合计</h3>
        <span className="da-chart__sums-total">{centsToYuan(total)}</span>
      </div>
      {/* 这一列就是饼图的图例：点 + 名称 + 金额 + 占比，与扇区同一份折叠结果。
          没有收起态 —— 收起之后没人分得清哪一片是哪一组。 */}
      <div className="da-chart__pie-list">
        {slices.map((slice, index) => (
          <div className="da-chart__pie-row" key={slice.key} data-testid="chart-pie-sum">
            <span className="da-list__dot" style={{ background: colors[index] }} />
            <span className="da-chart__pie-name" title={slice.label}>
              {slice.label}
            </span>
            <span className="da-chart__pie-value">{centsToYuan(slice.amount)}</span>
            <span className="da-chart__pie-share">
              {rateText(total > 0 ? (slice.amount / total) * 100 : 0)}
            </span>
          </div>
        ))}
      </div>
      {total > filteredTotal ? <p className="da-chart__pie-note">多标签的记录会重复计入</p> : null}
    </aside>
  )
}

export interface ChartLineSummaryProps {
  lines: ChartLineData[]
  colors: string[]
  /** 收起状态存在配置 JSON 里，由页面读写并回传 */
  collapsed: boolean
  onToggleCollapsed: (collapsed: boolean) => void
  /** 收起 / 展开后原按钮会卸载，页面把焦点交给新出现的那个 */
  collapseToggleRef: RefObject<HTMLButtonElement | null>
  expandToggleRef: RefObject<HTMLButtonElement | null>
}

/** 曲线合计条：展开是每条曲线的合计，收起成一条竖排把手。 */
export function ChartLineSummary({
  lines,
  colors,
  collapsed,
  onToggleCollapsed,
  collapseToggleRef,
  expandToggleRef,
}: ChartLineSummaryProps): JSX.Element {
  if (collapsed) {
    return (
      <aside id="chart-sums-region" className="da-chart__sums da-chart__sums--collapsed">
        <button
          type="button"
          className="da-chart__sums-rail"
          ref={expandToggleRef}
          data-testid="chart-sums-expand"
          aria-label="展开曲线合计"
          aria-expanded={false}
          aria-controls="chart-sums-region"
          title="展开曲线合计"
          onClick={() => onToggleCollapsed(false)}
        >
          <Icon name="ChevronLeft" size={14} className="da-chart__sums-chevron" />
          <span className="da-chart__sums-rail-title">曲线合计</span>
        </button>
      </aside>
    )
  }
  return (
    <aside id="chart-sums-region" className="da-chart__sums" data-testid="chart-sums">
      <div className="da-chart__sums-head">
        <h3 className="da-chart__sums-title">曲线合计</h3>
        <button
          type="button"
          className="tr-icon-btn"
          ref={collapseToggleRef}
          data-testid="chart-sums-collapse"
          aria-label="收起曲线合计"
          aria-expanded
          aria-controls="chart-sums-region"
          title="收起曲线合计"
          onClick={() => onToggleCollapsed(true)}
        >
          <Icon name="ChevronRight" size={14} className="da-chart__sums-chevron" />
        </button>
      </div>
      {lines.map((line, index) => {
        const total = line.data.reduce((sum, point) => sum + point.amount, 0)
        return (
          <div className="da-chart__sum-row" key={line.label}>
            <span
              className="da-list__dot"
              style={{ background: colors[index % colors.length] }}
            />
            <span className="da-chart__sum-label">{line.label}</span>
            <span className="da-chart__sum-value">{centsToYuan(total)}</span>
          </div>
        )
      })}
    </aside>
  )
}
