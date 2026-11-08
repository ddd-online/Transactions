import { describe, expect, it } from 'vitest'

import type { StockPositionDto } from '../../shared/types/stock-position'
import {
  EMPTY_TRADE_FEE,
  feeFormOf,
  feeRatesOf,
  feeText,
  type StockFeeRates,
} from '../../src/pages/stock-positions-fee'

const LEDGER_FEE: StockFeeRates = {
  commissionRate: 0.0002354,
  minCommission: 500,
  stampDutyRate: 0.0005,
  transferFeeRate: 0.00001,
}

function position(overrides: Partial<StockPositionDto> = {}): StockPositionDto {
  return {
    id: 'position-1',
    ledgerId: 'ledger-1',
    stockCode: '600519',
    stockName: '贵州茅台',
    quantity: 100,
    totalCost: 100_000,
    roundCashFlow: 0,
    realizedPnl: 0,
    review: '',
    tag: '分析',
    roundOpenedDate: '2026-01-05',
    dayReviews: [],
    ...overrides,
  }
}

describe('stock positions fee form', () => {
  it('spreads ledger rates onto the form in the units shown on screen', () => {
    expect(feeFormOf(LEDGER_FEE)).toEqual({
      commission: '2.354',
      min: '5.00',
      stamp: '0.05',
      transfer: '0.001',
    })
  })

  it('round-trips the form back to the same rates with an integer-cent minimum', () => {
    const form = feeFormOf(LEDGER_FEE)
    expect(feeRatesOf(form)).toEqual(LEDGER_FEE)
    expect(feeRatesOf(form).minCommission).toBe(500)
  })

  it('falls back to the empty form when no rate is known', () => {
    expect(feeFormOf(null)).toBe(EMPTY_TRADE_FEE)
    expect(feeFormOf(undefined)).toBe(EMPTY_TRADE_FEE)
    expect(EMPTY_TRADE_FEE).toEqual({ commission: '', min: '', stamp: '', transfer: '' })
  })

  it('describes the round fee when the position carries one', () => {
    const roundFee = {
      commissionRate: 0.0003,
      minCommission: 1000,
      stampDutyRate: 0.001,
      transferFeeRate: 0.00002,
    }
    expect(feeText(position({ roundFee }), LEDGER_FEE)).toBe(
      '佣金 万3.000 · 最低 ¥10.00 · 印花税 0.10% · 过户费 0.002%',
    )
  })

  it('describes the ledger fee when the position has no round fee', () => {
    expect(feeText(position(), LEDGER_FEE)).toBe(
      '佣金 万2.354 · 最低 ¥5.00 · 印花税 0.05% · 过户费 0.001%',
    )
  })

  it('says the ledger default applies when neither side has a rate', () => {
    expect(feeText(position(), null)).toBe('本轮费率沿用账本默认')
  })
})
