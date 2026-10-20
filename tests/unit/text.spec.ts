import { describe, expect, it } from 'vitest'

import {
  lineEndCaret,
  parseAmountCents,
  parseRate,
  parseYearBound,
  parseYearMonthBound,
} from '../../shared/domain/text'

describe('text input parsing', () => {
  // 光标位：按**行末**算，且单位是 UTF-16 码元（代理对占 2），越界退到文末。
  it('lineEndCaret counts UTF-16 units and falls back to the end', () => {
    expect(lineEndCaret('', 0)).toBe(0)
    expect(lineEndCaret('买入理由：\n卖出理由：\n交易心得：\n', 0)).toBe(5)
    expect(lineEndCaret('买入理由：\n卖出理由：\n交易心得：\n', 1)).toBe(11)
    expect(lineEndCaret('abc\ndef', 1), '行末含中间那个换行符').toBe(7)
    expect(lineEndCaret('abc', 0)).toBe(3)
    expect(lineEndCaret('abc\ndef', 9), '行号越界 = 文末').toBe(7)
    expect(lineEndCaret('😀\nab', 0), '代理对占两个码元').toBe(2)
    expect(lineEndCaret('😀\nab', 5), '文末同样是 UTF-16 长度').toBe(5)
  })

  // 筛选用的年份 / 年月输入：空 = 不限，非法也当"不限"（不会把筛选拦下来）。
  it('year and month bounds treat blank and invalid as unbounded', () => {
    expect(parseYearBound('2026')).toBe(2026)
    expect(parseYearBound(' 2026 ')).toBe(2026)
    expect(parseYearBound('')).toBeNull()
    expect(parseYearBound('0'), '0 年不是有效边界').toBeNull()
    expect(parseYearBound('-3')).toBeNull()
    expect(parseYearBound('abc')).toBeNull()

    expect(parseYearMonthBound('2026-06')).toEqual([2026, 6])
    expect(parseYearMonthBound(' 2026-6 ')).toEqual([2026, 6])
    expect(parseYearMonthBound('2026'), '只填年份 = 按年').toEqual([2026, null])
    expect(parseYearMonthBound('')).toEqual([null, null])
    expect(parseYearMonthBound('2026-坏'), '月份非法时只丢月份这一半').toEqual([2026, null])
    expect(parseYearMonthBound('坏-06')).toEqual([null, 6])
  })

  it('amount text becomes cents', () => {
    expect(parseAmountCents('0')).toBe(0)
    expect(parseAmountCents('12')).toBe(1200)
    expect(parseAmountCents('12.3')).toBe(1230)
    expect(parseAmountCents('12.34')).toBe(1234)
    expect(parseAmountCents(' 12.34 '), '两侧空白忽略').toBe(1234)
    expect(parseAmountCents('0.05')).toBe(5)
  })

  // 空串与形状不对给的是两句**不同**的文案（调用方直接展示）。
  it('amount text rejects with the two documented messages', () => {
    expect(() => parseAmountCents('')).toThrow(new Error('请输入金额'))
    expect(() => parseAmountCents('   ')).toThrow(new Error('请输入金额'))
    for (const bad of ['-1', '1.', '.5', '1.234', '01', '1a', '1..2', 'abc', '1,000']) {
      expect(() => parseAmountCents(bad), `输入：${bad}`).toThrow(
        new Error('请输入不小于 0 的金额，最多两位小数'),
      )
    }
  })

  it('rate text needs a finite number', () => {
    expect(parseRate('0.0003')).toBe(0.0003)
    expect(parseRate(' 5 ')).toBe(5)
    expect(parseRate('0')).toBe(0)
    expect(parseRate('-1.5'), '符号本身不在这一层拦').toBe(-1.5)
    expect(parseRate('')).toBeNull()
    expect(parseRate('   ')).toBeNull()
    expect(parseRate('abc')).toBeNull()
    expect(parseRate('NaN')).toBeNull()
    expect(parseRate('inf')).toBeNull()
    expect(parseRate('-inf')).toBeNull()
    expect(parseRate('1e999'), '溢出成 Infinity 也算不合法').toBeNull()
  })
})
