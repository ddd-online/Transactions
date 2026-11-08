import type { StockPositionDto } from '../../shared/types/stock-position'
import { stockMoney } from './stock-format'

/** 一轮的费率，单位是小数（万 2.354 = 0.0002354）；最低佣金是整数分。 */
export interface StockFeeRates {
  commissionRate: number
  minCommission: number
  stampDutyRate: number
  transferFeeRate: number
}

/** 费用表单的四个输入框：字符串，按用户敲的原样存着，提交时再换算。 */
export interface TradeFeeForm {
  commission: string
  min: string
  stamp: string
  transfer: string
}

export const EMPTY_TRADE_FEE: TradeFeeForm = {
  commission: '',
  min: '',
  stamp: '',
  transfer: '',
}

/** 本轮实际生效的费率：本轮覆盖账本，缺的字段各自回落。 */
function effectiveFeeRates(
  position: StockPositionDto | undefined,
  ledgerFee: StockFeeRates | null,
): Partial<StockFeeRates> {
  const round = position?.roundFee
  return {
    commissionRate: round?.commissionRate ?? ledgerFee?.commissionRate,
    minCommission: round?.minCommission ?? ledgerFee?.minCommission,
    stampDutyRate: round?.stampDutyRate ?? ledgerFee?.stampDutyRate,
    transferFeeRate: round?.transferFeeRate ?? ledgerFee?.transferFeeRate,
  }
}

/** 本轮费率的一句话：有没有单独一套、以及四个费率各是多少。 */
export function feeText(position: StockPositionDto, fee: StockFeeRates | null): string {
  const {
    commissionRate: commission,
    minCommission: minimum,
    stampDutyRate: stamp,
    transferFeeRate: transfer,
  } = effectiveFeeRates(position, fee)
  if (commission === undefined) return '本轮费率沿用账本默认'
  return [
    `佣金 万${(commission * 10000).toFixed(3)}`,
    `最低 ${minimum === undefined ? '—' : stockMoney(minimum)}`,
    `印花税 ${stamp === undefined ? '—' : `${(stamp * 100).toFixed(2)}%`}`,
    `过户费 ${transfer === undefined ? '—' : `${(transfer * 100).toFixed(3)}%`}`,
  ].join(' · ')
}

/** 费率 → 表单：万分数、百分比都按界面上的单位展开。 */
export function feeFormOf(rates: StockFeeRates | null | undefined): TradeFeeForm {
  if (!rates) return EMPTY_TRADE_FEE
  return {
    commission: String(Number((rates.commissionRate * 10000).toFixed(4))),
    min: (rates.minCommission / 100).toFixed(2),
    stamp: String(Number((rates.stampDutyRate * 100).toFixed(4))),
    transfer: String(Number((rates.transferFeeRate * 100).toFixed(4))),
  }
}

/** 表单 → 费率：与 `feeFormOf` 相反的换算，最低佣金回到整数分。 */
export function feeRatesOf(form: TradeFeeForm): StockFeeRates {
  return {
    commissionRate: Number(form.commission) / 10000,
    minCommission: Math.round(Number(form.min) * 100),
    stampDutyRate: Number(form.stamp) / 100,
    transferFeeRate: Number(form.transfer) / 100,
  }
}

/**
 * 打开成交弹窗时费用表单的起头：建仓用账本费率；加仓 / 减仓 / 清仓用这一轮的费率
 * （老数据没有本轮费率时回落到账本）。
 */
export function feeFormForTrade(
  type: string,
  position: StockPositionDto | undefined,
  fee: StockFeeRates | null,
): TradeFeeForm {
  if (type === 'open') return feeFormOf(fee)
  const rates = effectiveFeeRates(position, fee)
  return feeFormOf({
    commissionRate: rates.commissionRate ?? 0,
    minCommission: rates.minCommission ?? 0,
    stampDutyRate: rates.stampDutyRate ?? 0,
    transferFeeRate: rates.transferFeeRate ?? 0,
  })
}
