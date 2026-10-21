/**
 * 股票交易费用与费用分摊。
 *
 * 覆盖范围：取整到分 / 佣金（含最低佣金）/ 买入与卖出费用 / 委托级费用 /
 * 按成交额把委托费用分摊到各笔明细。
 *
 * 本模块是"两侧同一份算法"的落点：服务层与界面层都调用这里，
 * 从而在结构上杜绝前后端各写一份、需要人工保持同步的问题。
 *
 * 取整口径：`Math.round` 对正数就是"四舍五入"；费用金额恒为正，
 * 因此正数上的取整结果不存在歧义。负数的半值走 `roundHalfAwayFromZero`，
 * 与 `f64::round`（远离零）一致。
 *
 * ## 收哪些费由**品种**决定（[`Instrument`]）
 *
 * | 品种 | 佣金（双向） | 印花税（仅卖出） | 过户费（双向） |
 * |---|---|---|---|
 * | 沪市股票（60 / 68） | ✅ | ✅ | ✅ |
 * | 深市股票（00 / 30） | ✅ | ✅ | ❌ |
 * | 沪 / 深**场内基金**（ETF / LOF / 封闭式基金 / REITs） | ✅ | ❌ | ❌ |
 *
 * 场内基金只有佣金（最低佣金照收）—— 免印花税、免过户费是交易所/中国结算的规则，
 * 与"哪个市场"无关，所以品种是**一个**判据，不是两个独立的 bool。
 *
 * ## 一次委托多笔成交时的计费口径（**按笔取整再相加**）
 *
 * 券商是按**成交笔**收费的，所以每笔成交的费用各自四舍五入到分，再相加：
 *
 * * **佣金**：整笔委托只收一次，按委托总额算，并只在这里用一次最低佣金。
 * * **印花税 / 过户费**：逐笔按成交额算、**逐笔**四舍五入，再求和。
 *
 * 第二条例外于"先求和再取整"，是有意的：那两种费在每笔成交上都会真的收一次，
 * 每笔各自进整到分。用 `¥36.61×100` + `¥36.67×100` 两笔举反例（卖出、沪市）：
 *
 * | 费目 | 逐笔取整再相加（本实现） | 先求和再取整（错的） |
 * |---|---|---|
 * | 印花税 0.05% | `1.83 + 1.83 = 3.66` | `3.664 → 3.66` |
 * | 过户费 0.001% | `0.04 + 0.04 = 0.08` | `0.07328 → 0.07` |
 *
 * 过户费那行两种口径差一分（0.08 vs 0.07），界面上的"预计到手"也就差一分。
 * 回归见 `per_fill_rounding_matches_the_documented_example`。
 */

import type { StockFeeSetting } from './models'

/**
 * 交易品种：由六位代码判定 —— 它同时决定**收哪些费**与行情接口的市场前缀。
 *
 * 场内基金（ETF / LOF / 封闭式基金 / 公募 REITs）与股票的差别只有一处：
 * **不收印花税、不收过户费**，只有佣金（最低佣金照收，买卖双向各一次）。
 * 代码段：沪市基金 `5[0-8]xxxx`、深市基金 `1[5-8]xxxx`；可转债（沪 11xxxx、深 12xxxx）不在支持范围。
 */
export type Instrument = 'shanghaiStock' | 'shenzhenStock' | 'shanghaiFund' | 'shenzhenFund'

/** 行情接口的市场前缀：沪市 `sh`，深市 `sz`。 */
export type MarketPrefix = 'sh' | 'sz'

/**
 * 由六位代码判定品种；不支持的代码返回 `null`。
 *
 * 这是"代码是否合法"的**唯一判据**（`isValidStockCode` 就是它），也是费用与行情的分岔点。
 */
export function instrumentOf(stockCode: string): Instrument | null {
  if (stockCode.length !== 6 || !/^[0-9]{6}$/.test(stockCode)) return null
  switch (stockCode.slice(0, 2)) {
    case '60':
    case '68':
      return 'shanghaiStock'
    case '00':
    case '30':
      return 'shenzhenStock'
    case '50':
    case '51':
    case '52':
    case '53':
    case '54':
    case '55':
    case '56':
    case '57':
    case '58':
      return 'shanghaiFund'
    case '15':
    case '16':
    case '17':
    case '18':
      return 'shenzhenFund'
    default:
      return null
  }
}

function isInstrument(value: string): value is Instrument {
  switch (value) {
    case 'shanghaiStock':
    case 'shenzhenStock':
    case 'shanghaiFund':
    case 'shenzhenFund':
      return true
    default:
      return false
  }
}

/** 是不是场内基金（免印花税、免过户费）。 */
export function isFund(instrument: Instrument): boolean {
  return instrument === 'shanghaiFund' || instrument === 'shenzhenFund'
}

/** 是不是沪市（过户费的唯一判据；场内基金即使在上海也不收）。 */
export function isShanghai(instrument: Instrument): boolean {
  return instrument === 'shanghaiStock' || instrument === 'shanghaiFund'
}

/** 品种名（界面文案用）。 */
export function instrumentLabel(instrument: Instrument): string {
  return isFund(instrument) ? '场内基金' : '股票'
}

/** 行情接口的市场前缀：沪市 `sh`，深市 `sz`。 */
function marketPrefixOf(instrument: Instrument): MarketPrefix {
  return isShanghai(instrument) ? 'sh' : 'sz'
}

/**
 * 行情接口使用的市场前缀：沪市 `sh`，深市 `sz`。
 *
 * 传品种时直接按品种取；传六位代码时非法代码回落到 `sz`（调用方多半会先校验）。
 */
export function marketPrefix(value: Instrument): MarketPrefix
export function marketPrefix(value: string): MarketPrefix
export function marketPrefix(value: Instrument | string): MarketPrefix {
  if (isInstrument(value)) return marketPrefixOf(value)
  const instrument = instrumentOf(value)
  return instrument === null ? 'sz' : marketPrefixOf(instrument)
}

/** 一笔交易的费用明细（单位：分）。 */
export interface FeeBreakdown {
  /** 佣金 */
  commission: number
  /** 印花税（买入恒为 0；场内基金恒为 0） */
  stampDuty: number
  /** 过户费（仅沪市**股票**收取，双向；场内基金与深市股票恒为 0） */
  transferFee: number
  /** 合计 */
  total: number
}

/** 合计 = 佣金 + 印花税 + 过户费。 */
export function feeTotal(commission: number, stampDuty: number, transferFee: number): number {
  return commission + stampDuty + transferFee
}

/** 把 `total` 重算成三项之和（构造时用它兜住"合计与明细不一致"）。 */
export function withTotal(fee: Omit<FeeBreakdown, 'total'>): FeeBreakdown {
  return {
    ...fee,
    total: feeTotal(fee.commission, fee.stampDuty, fee.transferFee),
  }
}

/** `f64::round`：四舍五入、远离零。费用恒为正，这里只是守住负半值的口径。 */
function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value)
}

/** 按费率计算费用并四舍五入到分。 */
export function roundToCents(amount: number, rate: number): number {
  return roundHalfAwayFromZero(amount * rate)
}

/** 佣金 = max(金额×费率, 最低佣金)。 */
export function computeCommission(amount: number, setting: StockFeeSetting): number {
  return Math.max(roundToCents(amount, setting.commissionRate), setting.minCommission)
}

/** 过户费（仅沪市**股票**收取，买入与卖出双向；场内基金不收）。 */
function transferFee(amount: number, instrument: Instrument, setting: StockFeeSetting): number {
  return instrument === 'shanghaiStock' ? roundToCents(amount, setting.transferFeeRate) : 0
}

/** 印花税（仅卖出收取；**场内基金一律免**）。 */
function stampDuty(
  amount: number,
  instrument: Instrument,
  setting: StockFeeSetting,
  isBuy: boolean,
): number {
  return isBuy || isFund(instrument) ? 0 : roundToCents(amount, setting.stampDutyRate)
}

/**
 * 一笔成交的费用（**逐笔取整**）：佣金只按费率算，**不套最低佣金**。
 *
 * 最低佣金是**委托级**的门槛（一次委托只收一次），套在单笔成交上会让多笔委托
 * 被收成 N 份最低佣金。委托级佣金见 `computeOrderFee`。
 */
function computeFillFee(
  amount: number,
  instrument: Instrument,
  setting: StockFeeSetting,
  isBuy: boolean,
): FeeBreakdown {
  return withTotal({
    commission: roundToCents(amount, setting.commissionRate),
    stampDuty: stampDuty(amount, instrument, setting, isBuy),
    transferFee: transferFee(amount, instrument, setting),
  })
}

/**
 * 委托级费用：佣金按**委托总额**收一次（含最低佣金），印花税与过户费**逐笔**算好再相加。
 *
 * `fills` 是各笔成交的成交额（`价格 × 股数`，单位分）；委托总额由它们求和得出，
 * 不单独传 —— 两份金额一旦不一致，佣金按哪个算就会变成隐藏分歧。
 */
export function computeOrderFee(
  fills: readonly number[],
  instrument: Instrument,
  setting: StockFeeSetting,
  isBuy: boolean,
): FeeBreakdown {
  const perFill = computeFillFees(fills, instrument, setting, isBuy)
  const totalAmount = fills.reduce((sum, amount) => sum + amount, 0)

  return withTotal({
    // 佣金：按委托总额、只收一次；最低佣金也只在这里生效
    commission: computeCommission(totalAmount, setting),
    // 这两项是"逐笔取整后求和"，不是"求和后取整"（见模块头的对照表）
    stampDuty: perFill.reduce((sum, fee) => sum + fee.stampDuty, 0),
    transferFee: perFill.reduce((sum, fee) => sum + fee.transferFee, 0),
  })
}

/**
 * 把委托费用拆到各笔成交（**就是逐笔各算各的**，与 `computeOrderFee` 同一口径）。
 *
 * 这样落在每笔成交上的费用，求和后与委托级合计**一模一样**：
 * `computeOrderFee` 的印花税/过户费本来就是各笔之和，佣金则按成交额比例分摊
 * （末笔吸收取整余数，保证 Σ分摊 = 委托佣金）。
 *
 * ⚠ 调用方要传**用同一份 `fills` 算出来的** `fee`，否则两份口径会对不上 ——
 * 资金记录用 `fee.total`、每笔成交用分摊值，两者不一致就是"钱对不上账"。
 */
export function allocateOrderFee(
  fee: FeeBreakdown,
  amounts: readonly number[],
  instrument: Instrument,
  setting: StockFeeSetting,
  isBuy: boolean,
): FeeBreakdown[] {
  if (amounts.length === 0) return []

  // 佣金改为按成交额比例分摊委托级那一笔（最低佣金只在委托级生效过）
  const commissions = allocateByAmount(fee.commission, amounts)
  return computeFillFees(amounts, instrument, setting, isBuy).map((fill, index) =>
    withTotal({
      commission: commissions[index],
      stampDuty: fill.stampDuty,
      transferFee: fill.transferFee,
    }),
  )
}

/**
 * 多笔成交的**逐笔**费用（各笔自己四舍五入，不套最低佣金）。
 *
 * 给"按笔展示费用明细"这类用途；委托级合计用 `computeOrderFee`。
 */
export function computeFillFees(
  fills: readonly number[],
  instrument: Instrument,
  setting: StockFeeSetting,
  isBuy: boolean,
): FeeBreakdown[] {
  return fills.map((amount) => computeFillFee(amount, instrument, setting, isBuy))
}

/** 按权重比例拆分一个金额，末项吸收取整余数。 */
export function allocateByAmount(total: number, weights: readonly number[]): number[] {
  const result = new Array<number>(weights.length).fill(0)
  if (weights.length === 0) return result

  const sum = weights.reduce((allocated, weight) => allocated + weight, 0)
  if (sum <= 0) {
    // 权重不可用时全额落到末项
    result[weights.length - 1] = total
    return result
  }

  let allocated = 0
  for (let index = 0; index < weights.length - 1; index += 1) {
    const value = roundHalfAwayFromZero((total * weights[index]) / sum)
    result[index] = value
    allocated += value
  }
  result[weights.length - 1] = total - allocated
  return result
}

/**
 * A 股六位代码校验（股票：沪 60/68、深 00/30；场内基金：沪 5[0-8]、深 1[5-8]）。
 *
 * 行情抓取、股票名查询与下单校验共用**这一个**判据（`instrumentOf`）——
 * 多一处"我也判断一下代码"，就多一处"ETF 在界面能填、在行情那儿被拒"的分叉。
 */
export function isValidStockCode(stockCode: string): boolean {
  return instrumentOf(stockCode) !== null
}
