import { describe, expect, it } from 'vitest'

import {
  STOCK_TRADE_ADD,
  STOCK_TRADE_REDUCE,
  type RoundFee,
  type StockFeeSetting,
  type StockTrade,
} from '../../shared/domain/models'
import { SHARES_PER_LOT } from '../../shared/domain/stock'
import {
  costBasisOf,
  roundFeeOfSetting,
  settingOfRoundFee,
  tradeDto,
  tradeInstrumentOf,
  tradeOrderRemark,
} from '../../shared/domain/trade-rules'

/** 本轮费用快照（建仓时定下的四项费率）。 */
const ROUND_FEE: RoundFee = {
  commissionRate: 0.0002354,
  minCommission: 500,
  stampDutyRate: 0.0005,
  transferFeeRate: 0.00001,
}

/** 账本系统费用设置：比快照多 `id` / `ledgerId` / 时间戳。 */
function feeSetting(overrides: Partial<StockFeeSetting> = {}): StockFeeSetting {
  return {
    id: 'fee-setting',
    ledgerId: 'ledger',
    ...ROUND_FEE,
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  }
}

/** `StockTrade::default()` 的 TS 版：每条用例只覆盖自己关心的字段。 */
function emptyTrade(): StockTrade {
  return {
    id: '',
    ledgerId: '',
    stockCode: '',
    stockName: '',
    tradeType: '',
    roundId: '',
    orderId: '',
    orderSeq: 0,
    price: 0,
    lots: 0,
    shares: 0,
    amount: 0,
    fee: 0,
    commission: 0,
    stampDuty: 0,
    transferFee: 0,
    realizedPnl: null,
    tradeTime: 0,
    roundFee: null,
    remark: '',
    createdAt: 0,
  }
}

describe('costBasisOf', () => {
  // 减仓按剩余总成本的比例结转：成本（分）× 本笔股数 ÷ 剩余股数，四舍五入到分
  const cases: Array<[number, number, number, number]> = [
    // 没有持仓（quantity 0）：0/0 在浮点里是 NaN，不能靠 "NaN as i64 = 0" 这个巧合
    [12_345, 100, 0, 0],
    // 0 手标记成交（清仓的"只归档"那一笔）：不结转任何成本
    [12_345, 0, 500, 0],
    [0, 0, 0, 0],
    // 一半对一半：比例正好是整数，不取整
    [10_000, 300, 1_000, 3_000],
    // 整除截断会少一分（33.67 → 34）：已实现盈亏跟着偏一分
    [101, 1, 3, 34],
    [100, 50, 300, 17],
    // 半值远离零（1.5 → 2），不是"银行家舍入"
    [3, 1, 2, 2],
    [-3, 1, 2, -2],
    // 不足一分时为 0，不产生负零以外的赊账
    [1, 3, 7, 0],
  ]

  it.each(cases)('结转 %i 分里的 %i/%i 股', (totalCost, shares, quantity, expected) => {
    expect(costBasisOf(totalCost, shares, quantity)).toBe(expected)
  })

  it('结转不会超过剩余总成本', () => {
    // 一次减仓的结转上限就是剩余成本本身（part ≤ whole）
    for (const quantity of [100, 300, 700]) {
      for (const shares of [1, 50, quantity]) {
        expect(costBasisOf(9_999, shares, quantity)).toBeLessThanOrEqual(9_999)
      }
    }
  })
})

describe('tradeInstrumentOf', () => {
  // 带兜底的品种判定：老数据里可能存着不在支持范围的代码（北交所 / 可转债 / 脏数据），
  // 一律按深市股票处理 —— 不让一条历史记录把整轮重放打断
  const cases: Array<[string, string]> = [
    ['600000', 'shanghaiStock'],
    ['688981', 'shanghaiStock'],
    ['000001', 'shenzhenStock'],
    ['300750', 'shenzhenStock'],
    ['510300', 'shanghaiFund'],
    ['159915', 'shenzhenFund'],
    // 北交所：不在支持范围 → 兜底
    ['430047', 'shenzhenStock'],
    ['830799', 'shenzhenStock'],
    // 可转债：不在支持范围 → 兜底
    ['110038', 'shenzhenStock'],
    ['128136', 'shenzhenStock'],
    // 长度不对 / 空串 → 兜底
    ['60000', 'shenzhenStock'],
    ['', 'shenzhenStock'],
  ]

  it.each(cases)('%s → %s', (stockCode, expected) => {
    expect(tradeInstrumentOf(stockCode)).toBe(expected)
  })
})

describe('roundFeeOfSetting', () => {
  it('只留费用算法的四项，丢掉 id / 账本 / 时间戳', () => {
    const round = roundFeeOfSetting(feeSetting())
    expect(round).toEqual(ROUND_FEE)
    expect(Object.keys(round).sort()).toEqual([
      'commissionRate',
      'minCommission',
      'stampDutyRate',
      'transferFeeRate',
    ])
  })
})

describe('settingOfRoundFee', () => {
  it('折成费用算法的形态：id / 账本留空、时间戳 0', () => {
    const setting = settingOfRoundFee(ROUND_FEE)
    expect(setting).toEqual({
      id: '',
      ledgerId: '',
      ...ROUND_FEE,
      createdAt: 0,
      updatedAt: 0,
    })
  })

  it('与 roundFeeOfSetting 互为逆运算（四项费率原样往返）', () => {
    const original = feeSetting({ commissionRate: 0.0011, minCommission: 123 })
    expect(settingOfRoundFee(roundFeeOfSetting(original))).toEqual({
      ...original,
      id: '',
      ledgerId: '',
      createdAt: 0,
      updatedAt: 0,
    })
  })
})

describe('tradeDto', () => {
  /** 一笔成交：卖出减仓，带本轮快照。 */
  function sellTrade(): StockTrade {
    return {
      id: 'trade-1',
      ledgerId: 'ledger',
      stockCode: '600000',
      stockName: '浦发银行',
      tradeType: STOCK_TRADE_REDUCE,
      roundId: 'round-1',
      orderId: 'order-1',
      orderSeq: 2,
      price: 4_389,
      lots: 3,
      shares: 300,
      amount: 131_670,
      fee: 113,
      commission: 100,
      stampDuty: 13,
      transferFee: 0,
      realizedPnl: -1_234,
      tradeTime: 1_700_000_000,
      roundFee: { ...ROUND_FEE },
      remark: '减仓',
      createdAt: 7,
    }
  }

  it('把成交映射成 wire 形状（字段与既有逐字一致）', () => {
    const trade = sellTrade()
    expect(tradeDto(trade)).toEqual({
      id: 'trade-1',
      ledgerId: 'ledger',
      stockCode: '600000',
      stockName: '浦发银行',
      tradeType: STOCK_TRADE_REDUCE,
      roundId: 'round-1',
      orderId: 'order-1',
      orderSeq: 2,
      price: 4_389,
      lots: 3,
      shares: 300,
      amount: 131_670,
      fee: 113,
      commission: 100,
      stampDuty: 13,
      transferFee: 0,
      realizedPnl: -1_234,
      tradeTime: 1_700_000_000,
      remark: '减仓',
      roundFee: ROUND_FEE,
    })
  })

  it('没有费用快照时**不输出** roundFee 这个键（老数据按账本系统配置）', () => {
    const dto = tradeDto({ ...sellTrade(), roundFee: null })
    // 不是 `roundFee: undefined`、更不是 `roundFee: null`：wire 上少一个键，
    // 老数据的列表形状才不会因为升级而变形
    expect('roundFee' in dto).toBe(false)
    expect(Object.keys(dto)).toHaveLength(19)
  })

  it('不把落库专用字段带出去', () => {
    const dto = tradeDto(sellTrade()) as unknown as Record<string, unknown>
    // createdAt 是 DAO 的列，wire 上没有它
    expect('createdAt' in dto).toBe(false)
  })

  it('持仓过程中的买入成交（realizedPnl 为 null）原样透传', () => {
    const trade: StockTrade = {
      ...emptyTrade(),
      id: 'trade-2',
      stockCode: '000001',
      tradeType: STOCK_TRADE_ADD,
      price: 1_000,
      lots: 1,
      shares: 100,
      amount: 10_000,
      realizedPnl: null,
    }
    const dto = tradeDto(trade)
    expect(dto.realizedPnl).toBeNull()
    expect('roundFee' in dto).toBe(false)
  })
})

describe('tradeOrderRemark', () => {
  it('单笔委托退化为「名称 N手 @ 均价」', () => {
    // 1 手 = 100 股；成交额 12_340 分 ÷ 100 股 = 123.40 分/股 → 1234 厘
    expect(tradeOrderRemark('贵州茅台', 1, 12_340, 1)).toBe('贵州茅台 1手 @ 1.234')
  })

  it('多笔成交在末尾标注笔数', () => {
    // 两笔各 1 手（1000 厘 / 1100 厘）→ 均价 1050 厘 = 1.05 元
    expect(tradeOrderRemark('宁德时代', 2, 21_000, 2)).toBe('宁德时代 2手 @ 1.05（2笔成交）')
  })

  it('均价从分反推回厘时四舍五入（远离零）', () => {
    // 100_001 分 ÷ 300 股 = 333.3367 分/股 → 3333.367 厘 → 3333 厘
    expect(tradeOrderRemark('某某', 3, 100_001, 1)).toBe('某某 3手 @ 3.333')
    // 35 分 ÷ 100 股 = 0.35 分/股 = 3.5 厘 → 半值向上 → 4 厘
    expect(tradeOrderRemark('某某', 1, 35, 1)).toBe('某某 1手 @ 0.004')
  })

  it('0 手（只归档那一笔）不除零，均价写 0', () => {
    expect(tradeOrderRemark('某某', 0, 0, 1)).toBe('某某 0手 @ 0.00')
  })

  it('笔数 0 与 1 一样不带笔数后缀', () => {
    expect(tradeOrderRemark('某某', 1, 12_340, 0)).toBe('某某 1手 @ 1.234')
  })

  it('手数按每手股数折算（均价与手数无关，只看股数）', () => {
    expect(SHARES_PER_LOT).toBe(100)
    // 2 手 = 200 股；24_680 分 ÷ 200 股 = 123.40 分/股
    expect(tradeOrderRemark('某某', 2, 24_680, 1)).toBe('某某 2手 @ 1.234')
  })
})
