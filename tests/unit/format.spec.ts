import { describe, expect, it } from 'vitest'

import {
  amount,
  amountClass,
  compactYuan,
  hasQuote,
  isBuy,
  lotsOf,
  optionalRateText,
  optionalSignedPercent,
  pnlClass,
  pnlText,
  price,
  quoteText,
  rateText,
  ratioText,
  resultClass,
  resultLabel,
  roundFeeText,
  rowClass,
  scaledText,
  shortDate,
  signedAmount,
  signedPercent,
  signedPrice,
  signedYuan,
  tradeTypeLabel,
  transactionTypeLabel,
  transactionTypeText,
  truncate,
  typeClass,
} from '../../shared/domain/format'

describe('format', () => {
  it('amounts_are_two_decimals_from_cents', () => {
    expect(amount(0)).toBe('0.00')
    expect(amount(12_345)).toBe('123.45')
    expect(amount(-12_345)).toBe('-123.45')
    expect(amount(5)).toBe('0.05')
  })

  it('signed_amount_follows_the_transaction_type', () => {
    // 符号由**交易类型**决定（不是金额正负）：支出 `-`、收入 `+`、转账与未知不加。
    expect(signedAmount('expense', 12_345)).toBe('-123.45')
    expect(signedAmount('income', 12_345)).toBe('+123.45')
    expect(signedAmount('transfer', 12_345)).toBe('123.45')
    expect(signedAmount('unknown', 12_345)).toBe('123.45')
  })

  it('signed_yuan_follows_the_sign', () => {
    // 另一个符号口径：由**正负**决定，且负数取绝对值再加 `-`（不能出现 `--`）。
    expect(signedYuan(12_345)).toBe('+123.45')
    expect(signedYuan(-12_345)).toBe('-123.45')
    expect(signedYuan(0)).toBe('0.00')
    // 用 `i64::MIN` 验证 saturating_abs；JS 的 number 存不下 i64::MIN，
    // 改用安全整数下界验证同一条契约：不会出现 `--`。
    expect(signedYuan(Number.MIN_SAFE_INTEGER)).toBe('-90071992547409.91')
  })

  it('round_fee_text_reads_like_the_settings_page', () => {
    // 本轮费率的只读摘要：费率按万分之、最低佣金按元、印花 / 过户按百分比，且去掉多余的 0。
    expect(
      roundFeeText({
        commissionRate: 0.00005,
        minCommission: 0,
        stampDutyRate: 0.0,
        transferFeeRate: 0.0,
      }),
    ).toBe('佣金 万0.5 · 最低 ¥0.00 · 印花税 0% · 过户费 0%')
    expect(
      roundFeeText({
        commissionRate: 0.0002354,
        minCommission: 500,
        stampDutyRate: 0.0005,
        transferFeeRate: 0.00001,
      }),
    ).toBe('佣金 万2.354 · 最低 ¥5.00 · 印花税 0.05% · 过户费 0.001%')
    expect(roundFeeText(null)).toBe('沿用系统配置（本轮没有记录）')
  })

  it('transaction_type_copy_and_classes', () => {
    expect(transactionTypeLabel('income')).toBe('收入')
    expect(transactionTypeLabel('expense')).toBe('支出')
    expect(transactionTypeLabel('transfer')).toBe('转账')
    expect(transactionTypeLabel('weird')).toBe('')
    expect(transactionTypeText('weird')).toBe('weird')
    expect(amountClass('income')).toBe('price-income')
    expect(amountClass('weird')).toBe('')
    expect(rowClass('expense')).toBe('row-type-expense')
    expect(typeClass('transfer')).toBe('type-transfer')
  })

  it('pnl_colour_and_label_split_at_zero', () => {
    expect(pnlClass(1)).toBe('amount-income')
    expect(pnlClass(-1)).toBe('amount-expense')
    expect(pnlClass(0)).toBe('')
    expect(resultLabel(1)).toBe('盈利')
    expect(resultLabel(-1)).toBe('亏损')
    expect(resultLabel(0)).toBe('平')
    expect(resultClass(1)).toBe('result-win')
    expect(resultClass(-1)).toBe('result-loss')
    expect(resultClass(0)).toBe('result-even')
  })

  it('percents_are_two_decimals_and_never_nan', () => {
    // 百分比：两位小数；`NaN` / `∞` 一律回落 `0.00%`（不能让页面出现 `NaN%`）。
    expect(rateText(12.345)).toBe('12.35%')
    expect(rateText(0.0)).toBe('0.00%')
    expect(rateText(-3.0)).toBe('-3.00%')
    expect(rateText(Number.NaN)).toBe('0.00%')
    expect(rateText(Number.POSITIVE_INFINITY)).toBe('0.00%')
    expect(signedPercent(12.345)).toBe('+12.35%')
    expect(signedPercent(0.0)).toBe('+0.00%')
    expect(signedPercent(-12.345)).toBe('-12.35%')
    expect(signedPercent(Number.NaN)).toBe('0.00%')
    expect(optionalSignedPercent(null)).toBe('—')
    expect(optionalSignedPercent(1.5)).toBe('+1.50%')
    // 仓位不带正号：0.281 → "0.28%"、无分母 → "—"
    expect(optionalRateText(0.281)).toBe('0.28%')
    expect(optionalRateText(0.0)).toBe('0.00%')
    expect(optionalRateText(null)).toBe('—')
  })

  it('ratio_text_falls_back_to_infinity', () => {
    // 盈亏比：没有亏损样本（`null`）与"亏得没法算"（非有限）都是 `∞`。
    expect(ratioText(2.5)).toBe('2.50')
    expect(ratioText(0.0)).toBe('0.00')
    expect(ratioText(null)).toBe('∞')
    expect(ratioText(Number.POSITIVE_INFINITY)).toBe('∞')
    expect(ratioText(Number.NaN)).toBe('∞')
  })

  it('compact_yuan_switches_at_yi_and_wan', () => {
    // 紧凑金额的三档阈值（亿 / 万 / 元）与负数取绝对值。
    expect(compactYuan(0)).toBe('¥0')
    expect(compactYuan(99_999)).toBe('¥1000')
    expect(compactYuan(1_000_000)).toBe('¥1.0万')
    expect(compactYuan(12_345_600)).toBe('¥12.3万')
    expect(compactYuan(10_000_000_000)).toBe('¥1.0亿')
    expect(compactYuan(-10_000_000_000)).toBe('¥1.0亿')
    expect(pnlText(10_000_000_000)).toBe('盈 ¥1.0亿')
    expect(pnlText(-1_000_000)).toBe('亏 ¥1.0万')
    expect(pnlText(0)).toBe('平 ¥0')
  })

  it('quotes_need_a_positive_price', () => {
    expect(quoteText(123_450)).toBe('¥123.45')
    expect(quoteText(4_389)).toBe('¥4.389')
    expect(quoteText(0)).toBe('-')
    expect(quoteText(-1)).toBe('-')
    expect(quoteText(null)).toBe('-')
    expect(hasQuote(1)).toBe(true)
    expect(hasQuote(0)).toBe(false)
    expect(hasQuote(null)).toBe(false)
  })

  it('prices_keep_the_milli_digit_only_when_it_is_there', () => {
    // 价格（厘）与金额（分）是两套单位：价格能带第三位小数，金额永远是两位。
    expect(price(0)).toBe('0.00')
    expect(price(10_000)).toBe('10.00')
    expect(price(100_000)).toBe('100.00')
    expect(price(4_389)).toBe('4.389')
    expect(price(4_390)).toBe('4.39')
    // 与金额函数同名不同单位：`amount(4_389)` 是 43.89 元（分）—— 别互换
    expect(amount(4_389)).toBe('43.89')
  })

  it('signed_price_marks_direction', () => {
    expect(signedPrice(43)).toBe('+0.043')
    expect(signedPrice(-43)).toBe('-0.043')
    expect(signedPrice(0)).toBe('0.00')
    expect(signedPrice(100_000)).toBe('+100.00')
  })

  it('lots_floor_towards_negative_infinity', () => {
    expect(lotsOf(100)).toBe(1)
    expect(lotsOf(250)).toBe(2)
    expect(lotsOf(99)).toBe(0)
    expect(lotsOf(0)).toBe(0)
    expect(lotsOf(-50)).toBe(-1)
  })

  it('trade_type_copy_and_direction', () => {
    expect(tradeTypeLabel('open')).toBe('建仓')
    expect(tradeTypeLabel('add')).toBe('加仓')
    expect(tradeTypeLabel('reduce')).toBe('减仓')
    expect(tradeTypeLabel('close')).toBe('清仓')
    expect(tradeTypeLabel('weird')).toBe('weird')
    expect(isBuy('open')).toBe(true)
    expect(isBuy('add')).toBe(true)
    expect(isBuy('reduce')).toBe(false)
    expect(isBuy('close')).toBe(false)
  })

  it('scaled_text_rounds_then_trims', () => {
    // 缩放格式化：先乘 `scale`、四舍五入到 `digits` 位、去掉多余的 0。
    expect(scaledText(1234.0, 1.0, 2)).toBe('1234')
    expect(scaledText(1234.567, 1.0, 2)).toBe('1234.57')
    expect(scaledText(300.0, 0.01, 2)).toBe('3')
    expect(scaledText(1.0 / 3.0, 100.0, 2)).toBe('33.33')
    expect(scaledText(0.0, 100.0, 2)).toBe('0')
  })

  it('short_date_drops_the_year_and_leading_zeros', () => {
    expect(shortDate('2026-06-19')).toBe('6-19')
    expect(shortDate('2026-12-01')).toBe('12-1')
    expect(shortDate('2026-06')).toBe('2026-06')
    expect(shortDate('')).toBe('')
  })

  it('truncate_counts_characters_not_bytes', () => {
    // 截断按**字符**计数：中文一个字算一个（不是字节），末尾补省略号。
    expect(truncate('abcdef', 6)).toBe('abcdef')
    expect(truncate('abcdefg', 3)).toBe('abc…')
    expect(truncate('中文标题很长', 3)).toBe('中文标…')
    expect(truncate('', 0)).toBe('')
  })
})
