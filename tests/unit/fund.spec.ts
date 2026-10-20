import { describe, expect, it } from 'vitest'

import { cashBefore, cashChain, withdrawLimitMessage, type CashChange } from '../../shared/domain/fund'

function change(recordDate: string, createdAt: number, id: string, amountChange: number): CashChange {
  return { recordDate, createdAt, id, amountChange }
}

describe('withdraw limit message', () => {
  it('mentions the available cash in yuan, verbatim', () => {
    expect(withdrawLimitMessage(123_456)).toBe('支取金额不能超过可用现金（1234.56 元）')
    expect(withdrawLimitMessage(500)).toBe('支取金额不能超过可用现金（5.00 元）')
    expect(withdrawLimitMessage(0)).toBe('支取金额不能超过可用现金（0.00 元）')
  })
})

describe('cashBefore', () => {
  it('prefers the latest balance and falls back to principal only when absent', () => {
    expect(cashBefore(12_345, 99_999)).toBe(12_345)
    expect(cashBefore(0, 99_999)).toBe(0)
    expect(cashBefore(-500, 99_999)).toBe(-500)
    expect(cashBefore(null, 99_999)).toBe(99_999)
    expect(cashBefore(null, 0)).toBe(0)
  })
})

describe('cashChain', () => {
  it('accumulates in date order', () => {
    const entries = [
      change('2026-08-01', 100, 'a', 10_000),
      change('2026-08-02', 200, 'b', -3_000),
      change('2026-08-03', 300, 'c', 500),
    ]
    expect(cashChain(1_000, entries)).toEqual([11_000, 8_000, 8_500])
  })

  it('counts a back-dated record in the chain', () => {
    const entries = [
      change('2026-08-24', 1_000, '1', 100_000),
      change('2026-07-24', 2_000, '2', -50_000),
    ]
    expect(cashChain(0, entries)).toEqual([50_000, -50_000])

    const three = [
      change('2026-08-24', 1_000, '1', 100_000),
      change('2026-07-24', 2_000, '2', -50_000),
      change('2026-08-25', 3_000, '3', 20_000),
    ]
    expect(cashChain(0, three)).toEqual([50_000, -50_000, 70_000])
    expect(cashChain(0, three)[2]).toBe(100_000 - 50_000 + 20_000)
  })

  it('orders same-day entries by createdAt then id', () => {
    const entries = [
      change('2026-08-03', 300, 'a', 1_000),
      change('2026-08-03', 100, 'z', 2_000),
      change('2026-08-03', 100, '7', 4_000),
    ]
    expect(cashChain(0, entries)).toEqual([7_000, 6_000, 4_000])
  })

  it('handles empty, single and negative balances', () => {
    expect(cashChain(12_345, [])).toEqual([])
    expect(cashChain(12_345, [change('2026-08-01', 1, 'a', -500)])).toEqual([11_845])

    const entries = [
      change('2026-07-01', 100, 'a', -1_000_000),
      change('2026-08-01', 200, 'b', 1_500_000),
    ]
    expect(cashChain(0, entries)).toEqual([-1_000_000, 500_000])
  })
})
