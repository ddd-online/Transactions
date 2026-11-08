import { describe, expect, it } from 'vitest'

import type { StockStatisticsPointDto } from '../../shared/types/stock-statistics'
import {
  axisText,
  metricLabel,
  metricValue,
  tooltipText,
} from '../../src/pages/stock-statistics-chart'

/** 一笔结算点：金额单位分、胜率/回撤百分数、盈亏比是倍数。 */
function point(overrides: Partial<StockStatisticsPointDto> = {}): StockStatisticsPointDto {
  return {
    sequence: 3,
    span: 3,
    openedAt: 0,
    closedAt: 0,
    roundId: 'round',
    stockCode: '600000',
    stockName: '浦发银行',
    stockRoundNo: 1,
    tag: '',
    pnl: 0,
    pnlRate: 0,
    tradeCount: 2,
    totalPnl: 123_456,
    winCount: 2,
    lossCount: 1,
    tieCount: 0,
    winRate: 66.67,
    avgWin: 75_000,
    avgLoss: 80_000,
    pnlRatio: 0.9375,
    expectancy: 23_333,
    maxDrawdown: 80_000,
    maxDrawdownPct: 0.79,
    ...overrides,
  }
}

describe('metricValue', () => {
  it('converts money from cents to yuan', () => {
    expect(metricValue(point(), 'total_pnl')).toBe(1234.56)
    expect(metricValue(point(), 'avg_win')).toBe(750)
    expect(metricValue(point(), 'expectancy')).toBe(233.33)
  })

  it('plots the loss side above zero', () => {
    // 平均亏损在数据里是正数（亏损额），曲线要画在 0 轴下方。
    expect(metricValue(point(), 'avg_loss')).toBe(-800)
  })

  it('keeps percent and ratio in their own units', () => {
    expect(metricValue(point(), 'win_rate')).toBe(66.67)
    expect(metricValue(point(), 'max_drawdown')).toBe(0.79)
    expect(metricValue(point(), 'pnl_ratio')).toBe(0.9375)
  })

  it('falls back to zero without a ratio sample', () => {
    expect(metricValue(point({ pnlRatio: null }), 'pnl_ratio')).toBe(0)
  })
})

describe('axisText', () => {
  it('shows money as a whole-yuan axis tick', () => {
    expect(axisText(1234.56, 'total_pnl')).toBe('1235')
    expect(axisText(-1234.56, 'total_pnl')).toBe('-1235')
  })

  it('shows percentages with metric-specific precision', () => {
    expect(axisText(66.67, 'win_rate')).toBe('67%')
    expect(axisText(0.79, 'max_drawdown')).toBe('0.79%')
    expect(axisText(2.5, 'max_drawdown')).toBe('2.5%')
    expect(axisText(1, 'max_drawdown')).toBe('1%')
  })

  it('shows ratios without decimals', () => {
    expect(axisText(0.9375, 'pnl_ratio')).toBe('1')
    expect(axisText(12.4, 'pnl_ratio')).toBe('12')
  })

  it('never prints a negative zero', () => {
    // (-0.4).toFixed(0) === '-0'：轴上出现「-0」会被读成坏值
    expect(axisText(-0.4, 'total_pnl')).toBe('0')
    expect(axisText(-0.4, 'pnl_ratio')).toBe('0')
    expect(axisText(-0.4, 'win_rate')).toBe('0%')
    expect(axisText(-0.004, 'max_drawdown')).toBe('0%')
    // 真的负值照旧带符号
    expect(axisText(-0.6, 'total_pnl')).toBe('-1')
  })
})

describe('tooltipText', () => {
  it('signs money amounts and keeps two decimals', () => {
    expect(tooltipText(1234.5, 'total_pnl')).toBe('¥1234.50')
    expect(tooltipText(-35.5, 'total_pnl')).toBe('-¥35.50')
    expect(tooltipText(0, 'expectancy')).toBe('¥0.00')
  })

  it('shows percentages and ratios with two decimals', () => {
    expect(tooltipText(66.666, 'win_rate')).toBe('66.67%')
    expect(tooltipText(0.9375, 'pnl_ratio')).toBe('0.94')
  })
})

describe('metricLabel', () => {
  it('renames the cumulative metric under the grouped strategy', () => {
    expect(metricLabel('total_pnl', false)).toBe('累计盈亏')
    expect(metricLabel('total_pnl', true)).toBe('分组盈亏')
  })

  it('keeps every other metric name identical', () => {
    for (const grouped of [false, true]) {
      expect(metricLabel('win_rate', grouped)).toBe('胜率')
      expect(metricLabel('avg_win', grouped)).toBe('平均盈利')
      expect(metricLabel('avg_loss', grouped)).toBe('平均亏损')
      expect(metricLabel('pnl_ratio', grouped)).toBe('盈亏比')
      expect(metricLabel('expectancy', grouped)).toBe('期望值')
      expect(metricLabel('max_drawdown', grouped)).toBe('最大回撤')
    }
  })
})
