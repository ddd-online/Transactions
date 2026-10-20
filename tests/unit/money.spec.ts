import { describe, expect, it } from 'vitest'

import {
  MoneyError,
  centsToYuan,
  milliToPriceYuan,
  milliToYuan,
  priceYuanToMilli,
  yuanToCents,
} from '../../shared/domain/money'

describe('centsToYuan', () => {
  it('formats two decimals without grouping', () => {
    expect(centsToYuan(0)).toBe('0.00')
    expect(centsToYuan(5)).toBe('0.05')
    expect(centsToYuan(12345)).toBe('123.45')
    expect(centsToYuan(-5)).toBe('-0.05')
    expect(centsToYuan(-12345)).toBe('-123.45')
    expect(centsToYuan(100_000_000)).toBe('1000000.00')
  })
})

describe('yuanToCents', () => {
  it('handles signs and abbreviated inputs', () => {
    expect(yuanToCents('123.45')).toBe(12345)
    expect(yuanToCents(' 123 ')).toBe(12300)
    expect(yuanToCents('-0.05')).toBe(-5)
    expect(yuanToCents('.5')).toBe(50)
    expect(yuanToCents('0.5')).toBe(50)
    expect(yuanToCents('1.')).toBe(100)
    expect(yuanToCents('1')).toBe(100)
    expect(yuanToCents('')).toBe(0)
    expect(yuanToCents('   ')).toBe(0)
  })

  it('rounds the third decimal to a cent', () => {
    expect(yuanToCents('0.004')).toBe(0)
    expect(yuanToCents('0.005')).toBe(1)
    expect(yuanToCents('0.014')).toBe(1)
    expect(yuanToCents('0.015')).toBe(2)
    expect(yuanToCents('0.999')).toBe(100)
    expect(yuanToCents('0.0049')).toBe(0)
    expect(yuanToCents('0.0051')).toBe(1)
  })

  it('rejects non-numeric and overflow inputs', () => {
    for (const raw of ['abc', '1.2.3', '1a', '--1']) {
      expect(() => yuanToCents(raw), raw).toThrow(MoneyError)
    }
    expect(() => yuanToCents('99999999999999999999')).toThrow(MoneyError)
    try {
      yuanToCents('abc')
    } catch (error) {
      expect((error as MoneyError).kind).toBe('invalid')
      expect((error as Error).message).toBe('无效的金额格式')
    }
  })
})

describe('prices in milli', () => {
  it('rounds yuan floats to milli', () => {
    expect(priceYuanToMilli(10.0)).toBe(10_000)
    expect(priceYuanToMilli(38.06)).toBe(38_060)
    expect(priceYuanToMilli(0.0)).toBe(0)
    expect(priceYuanToMilli(4.389)).toBe(4_389)
    expect(priceYuanToMilli(1.537)).toBe(1_537)
    expect(priceYuanToMilli(0.528)).toBe(528)
    expect(priceYuanToMilli(4.3894)).toBe(4_389)
    expect(priceYuanToMilli(4.3896)).toBe(4_390)
    expect(priceYuanToMilli(-12.345)).toBe(-12_345)
  })

  it('keeps the sub-cent digit only when present', () => {
    expect(milliToYuan(0)).toBe('0.00')
    expect(milliToYuan(10_000)).toBe('10.00')
    expect(milliToYuan(10_050)).toBe('10.05')
    expect(milliToYuan(100_000)).toBe('100.00')
    expect(milliToYuan(4_389)).toBe('4.389')
    expect(milliToYuan(1_537)).toBe('1.537')
    expect(milliToYuan(528)).toBe('0.528')
    expect(milliToYuan(-4_389)).toBe('-4.389')
    expect(milliToYuan(-10_000)).toBe('-10.00')
  })

  it('roundtrips milli to yuan price', () => {
    for (const milli of [-12_345, -1, 0, 528, 4_389, 100_000]) {
      expect(priceYuanToMilli(milliToPriceYuan(milli))).toBe(milli)
    }
  })
})

describe('roundtrip', () => {
  it('is lossless for two-decimal values', () => {
    for (const cents of [-99_999, -1, 0, 1, 7, 100, 12_345, 987_654]) {
      expect(yuanToCents(centsToYuan(cents))).toBe(cents)
    }
  })
})
