/**
 * 股票下单写入（`electron/services/stock-trade-write.ts`）的行为测试。
 *
 * 委托与费用 / 本轮费用设置 /
 * 清仓归档那几组）：
 *
 * * `create_trade_single_fill_unchanged`
 * * `create_trade_order_charges_fee_once_per_order`
 * * `create_trade_order_persists_remark_on_every_fill`
 * * `a_round_fee_is_snapshotted_at_open_and_kept_for_the_round`
 * * `compat_trades_without_a_snapshot_follow_the_system_setting`
 * * `a_reduce_to_zero_does_not_archive_the_round`
 * * `a_zero_lot_close_archives_without_money_movement`
 * * `a_partial_close_is_rejected`
 * * `a_round_fee_is_rejected_once_the_round_has_started`
 * * `a_fund_round_fee_cannot_turn_on_stamp_duty`
 * * `withdraw_follows_total_assets_formula` 的现金链部分（这里只断言资金记录余额）
 *
 * 时间戳全部用固定常量（`T1`–`T4`），资金记录的 `createdAt` 是"同一秒也严格递增"的派生值
 * （DAO 的 `MAX(now, 已有最大 + 1)`），所以只断言顺序、不断言具体秒数。
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { closeWorkspace, openWorkspace, type OpenedWorkspace } from '../../electron/db'
import { listAllFundRecords, listOperations } from '../../electron/db/dao/stock-fund'
import {
  getPosition,
  getTrade,
  getTradeHistory,
  listAllTradesAsc,
  listTradeRoundsByStock,
  listTradesAsc,
  listTradesByOrder,
  updatePosition,
} from '../../electron/db/dao/stock-trade'
import { setPrincipal, saveFeeSettings, unixToDate } from '../../electron/services/stock-account'
import { getTradeHistoryDetail } from '../../electron/services/stock-history'
import {
  createTrade,
  createTradeOrder,
  createTradeOrderWithRoundFee,
  createTradeWithRoundFee,
} from '../../electron/services/stock-trade-write'
import {
  STOCK_EVENT_BUY,
  STOCK_EVENT_SELL,
  STOCK_OP_KIND_ORDER,
  STOCK_TRADE_ADD,
  STOCK_TRADE_CLOSE,
  STOCK_TRADE_OPEN,
  STOCK_TRADE_REDUCE,
} from '../../shared/domain/consts'
import { DEFAULT_STOCK_FEE_SETTING, type RoundFee } from '../../shared/domain/models'
import type { CreateTradeOrderRequest, CreateTradeRequest, StockTradeFill } from '../../shared/types/stock-trade'
import { AppError } from '../../shared/errors'

const LEDGER = 'ledger-order-write'
const CODE = '600000'
const NAME = '浦发银行'
const CODE_B = '000001'
const NAME_B = '平安银行'
/** 协和电子：兼容"一次委托两笔成交"的回归标的。 */
const ORDER_CODE = '605258'
const ORDER_NAME = '协和电子'
/** 沪深300ETF：场内基金，价格带厘位、免印花税与过户费。 */
const FUND_CODE = '510300'
const FUND_NAME = '沪深300ETF'

/** 固定时间戳（Unix 秒），保证断言确定。 */
const T1 = 1_700_000_000
const T2 = 1_700_000_100
const T3 = 1_700_000_200
const T4 = 1_700_000_300

/** 场内基金的一套参数（万0.5、免最低、免印花税与过户费）。 */
const ETF_ROUND_FEE: RoundFee = {
  commissionRate: 0.00005,
  minCommission: 0,
  stampDutyRate: 0,
  transferFeeRate: 0,
}

const directories: string[] = []

function workspaceDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'tr-stock-trade-write-test-'))
  directories.push(directory)
  return directory
}

function newWorkspace(): OpenedWorkspace {
  return openWorkspace(workspaceDirectory())
}

afterEach(() => {
  closeWorkspace()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

/** 断言会抛 `AppError`，并把它返回给调用方继续断言文案 / 状态码。 */
function appError(run: () => unknown): AppError {
  try {
    run()
  } catch (error) {
    expect(error).toBeInstanceOf(AppError)
    return error as AppError
  }
  throw new Error('应当抛错')
}

function fill(priceMilli: number, lots: number): StockTradeFill {
  return { priceMilli, lots }
}

/** 一笔委托的请求（默认：浦发银行建仓 1 手 @ 100.00 元）。 */
function orderRequest(overrides: Partial<CreateTradeOrderRequest> = {}): CreateTradeOrderRequest {
  return {
    ledgerId: LEDGER,
    stockCode: CODE,
    stockName: NAME,
    tradeType: STOCK_TRADE_OPEN,
    fills: [fill(100_000, 1)],
    tradeTime: T1,
    remark: '',
    tag: '',
    ...overrides,
  }
}

/** 单笔成交的请求（默认与 {@link orderRequest} 同一笔）。 */
function singleRequest(overrides: Partial<CreateTradeRequest> = {}): CreateTradeRequest {
  return {
    ledgerId: LEDGER,
    stockCode: CODE,
    stockName: NAME,
    tradeType: STOCK_TRADE_OPEN,
    priceMilli: 100_000,
    lots: 1,
    tradeTime: T1,
    remark: '',
    tag: '',
    ...overrides,
  }
}

describe('stock-trade-write: create order', () => {
  it('records a single fill with an order id, sequence 1 and the order-level fee', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 10_000_000)

    // 10.00 元 × 10 手（1000 股）= 10,000.00 元；佣金走最低 5.00，过户费 0.10
    const trade = createTrade(
      workspace.db,
      singleRequest({ priceMilli: 10_000, lots: 10, tradeTime: T1 }),
    )

    expect(trade.orderId).not.toBe('')
    expect(trade.orderSeq).toBe(1)
    expect(trade.roundId).toBe('')
    expect(trade.shares).toBe(1000)
    expect(trade.amount).toBe(1_000_000)
    expect([trade.fee, trade.commission, trade.transferFee, trade.stampDuty]).toEqual([
      510, 500, 10, 0,
    ])
    expect(trade.realizedPnl).toBeNull()
    expect(trade.roundFee).toEqual({ ...DEFAULT_STOCK_FEE_SETTING })
    expect(trade.tradeTime).toBe(T1)
    expect(trade.remark).toBe('')

    expect(getPosition(workspace.db, LEDGER, CODE)).toMatchObject({
      stockCode: CODE,
      stockName: NAME,
      quantity: 1000,
      totalCost: 1_000_510,
      realizedPnl: 0,
    })

    const records = listAllFundRecords(workspace.db, LEDGER)
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      recordDate: unixToDate(T1),
      eventType: STOCK_EVENT_BUY,
      eventText: '买入 浦发银行 10手',
      amountChange: -1_000_510,
      cashBalance: 8_999_490,
      netPnl: null,
      remark: '浦发银行 10手 @ 10.00',
    })

    const operations = listOperations(workspace.db, LEDGER, 10)
    expect(operations).toHaveLength(1)
    expect(operations[0]).toMatchObject({
      kind: STOCK_OP_KIND_ORDER,
      action: '建仓',
      detail: '浦发银行 600000 · 10 手 · ¥10000.00',
      targetId: trade.orderId,
    })
  })

  it('charges commission once per order and rounds stamp duty / transfer fee per fill', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 10_000_000)

    // 建仓 2 手 @ 38.06（协和电子）
    createTradeOrder(
      workspace.db,
      orderRequest({
        stockCode: ORDER_CODE,
        stockName: ORDER_NAME,
        fills: [fill(38_060, 2)],
        tradeTime: T1,
      }),
    )
    // 清仓一次委托两笔成交：36.67 × 100 股 + 36.61 × 100 股，卖出、沪市
    const items = createTradeOrder(
      workspace.db,
      orderRequest({
        stockCode: ORDER_CODE,
        stockName: ORDER_NAME,
        tradeType: STOCK_TRADE_CLOSE,
        fills: [fill(36_670, 1), fill(36_610, 1)],
        tradeTime: T2,
      }),
    )

    expect(items).toHaveLength(2)
    expect(items[0].orderId).toBe(items[1].orderId)
    expect([items[0].orderSeq, items[1].orderSeq]).toEqual([1, 2])
    expect([items[0].price, items[1].price]).toEqual([36_670, 36_610])
    expect(items.every((item) => item.remark === '')).toBe(true)

    const commission = items.reduce((sum, item) => sum + item.commission, 0)
    const stampDuty = items.reduce((sum, item) => sum + item.stampDuty, 0)
    const transferFee = items.reduce((sum, item) => sum + item.transferFee, 0)
    const fee = items.reduce((sum, item) => sum + item.fee, 0)

    // 佣金按委托总额 7328 元收一次 = 5.00；印花税 1.83+1.83；过户费 0.04+0.04（逐笔取整再相加）
    expect([commission, stampDuty, transferFee]).toEqual([500, 366, 8])
    expect(fee).toBe(874)
    // 按剩余总成本比例结转：两笔各一半成本 380,854
    expect(items.map((item) => item.realizedPnl)).toEqual([-14_591, -15_191])
    expect(items[0].roundId).not.toBe('')
    expect(items[1].roundId).toBe(items[0].roundId)

    const detail = getTradeHistoryDetail(workspace.db, LEDGER, ORDER_CODE)
    expect(detail.rounds).toHaveLength(1)
    expect(detail.rounds[0].tradeCount).toBe(3)
    expect(detail.totalPnl).toBe(-29_782)

    const records = listAllFundRecords(workspace.db, LEDGER)
    const sells = records.filter((record) => record.eventType === STOCK_EVENT_SELL)
    expect(sells).toHaveLength(1)
    expect(sells[0]).toMatchObject({
      amountChange: 731_926,
      cashBalance: 9_970_218,
      netPnl: -29_782,
      remark: '协和电子 2手 @ 36.64（2笔成交）',
    })
    expect(records[0]).toMatchObject({
      eventType: STOCK_EVENT_BUY,
      amountChange: -761_708,
      cashBalance: 9_238_292,
      remark: '协和电子 2手 @ 38.06',
    })
  })

  it('persists the order remark on every fill', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 10_000_000)

    const items = createTradeOrder(
      workspace.db,
      orderRequest({ fills: [fill(38_060, 1), fill(38_060, 1)], remark: '种子建仓' }),
    )
    const rows = listTradesByOrder(workspace.db, LEDGER, items[0].orderId)
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.remark)).toEqual(['种子建仓', '种子建仓'])

    // 空备注与列默认值 '' 等价
    const blank = createTradeOrder(
      workspace.db,
      orderRequest({ stockCode: CODE_B, stockName: NAME_B, tradeTime: T2 }),
    )
    expect(listTradesByOrder(workspace.db, LEDGER, blank[0].orderId)[0].remark).toBe('')
  })

  it('snapshots the round fee at open and keeps it for the whole round', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 10_000_000)

    // 建仓 1 手 @ 100.00（成交额 1,000,000 分），本轮万0.5 免最低
    const open = createTradeWithRoundFee(
      workspace.db,
      { ...singleRequest({ tradeTime: T1 }), roundFee: ETF_ROUND_FEE },
    )
    expect(open.commission).toBe(50)
    expect([open.stampDuty, open.transferFee]).toEqual([0, 0])
    expect(open.roundFee).toEqual(ETF_ROUND_FEE)

    // 系统配置改成万3 / 最低 5 元 —— 本轮已经开始了，不受影响
    saveFeeSettings(workspace.db, LEDGER, {
      commissionRate: 0.0003,
      minCommission: 500,
      stampDutyRate: 0.0005,
      transferFeeRate: 0.00001,
    })

    const add = createTrade(
      workspace.db,
      singleRequest({ tradeType: STOCK_TRADE_ADD, tradeTime: T2 }),
    )
    expect(add.commission).toBe(50)
    expect(add.roundFee).toEqual(ETF_ROUND_FEE)

    const close = createTrade(
      workspace.db,
      singleRequest({ tradeType: STOCK_TRADE_CLOSE, lots: 2, tradeTime: T3 }),
    )
    expect(close.roundFee).toEqual(ETF_ROUND_FEE)
    expect(close.fee).toBe(100)

    // 清仓之后重新建仓（新的一轮）⇒ 取**当前**系统配置（万3 / 最低 5 元）
    const secondRound = createTrade(
      workspace.db,
      singleRequest({ stockCode: CODE_B, stockName: NAME_B, tradeTime: T4 }),
    )
    expect(secondRound.commission).toBe(500)
    expect(secondRound.roundFee).toEqual({
      commissionRate: 0.0003,
      minCommission: 500,
      stampDutyRate: 0.0005,
      transferFeeRate: 0.00001,
    })
  })

  it('follows the system setting for compat trades whose snapshot is NULL', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 10_000_000)

    const open = createTrade(workspace.db, singleRequest())
    // 把本轮那笔的 4 列抹成 NULL：模拟"升级前写下的、没有快照的成交"
    workspace.db
      .prepare(
        'UPDATE stock_trade SET round_commission_rate = NULL, ' +
          'round_min_commission_cents = NULL, round_stamp_duty_rate = NULL, ' +
          'round_transfer_fee_rate = NULL WHERE ledger_id = ? AND stock_code = ?',
      )
      .run(LEDGER, CODE)
    expect(getTrade(workspace.db, open.id).roundFee).toBeNull()

    // 加仓：按当前系统配置（默认 万2.354 / 最低 5 元 ⇒ 这单走最低佣金）
    const add = createTrade(
      workspace.db,
      singleRequest({ tradeType: STOCK_TRADE_ADD, tradeTime: T2 }),
    )
    expect(add.commission).toBe(500)
    expect(add.roundFee).toEqual({ ...DEFAULT_STOCK_FEE_SETTING })
    expect(getTrade(workspace.db, add.id).roundFee).not.toBeNull()
  })

  it('reduces to zero without archiving the round, then closes it', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 10_000_000)

    createTrade(workspace.db, singleRequest({ lots: 2, tradeTime: T1 }))
    const reduce = createTrade(
      workspace.db,
      singleRequest({ tradeType: STOCK_TRADE_REDUCE, priceMilli: 110_000, lots: 2, tradeTime: T2 }),
    )
    expect(reduce.roundId).toBe('')
    expect(reduce.realizedPnl).toBe(197_840)

    expect(getPosition(workspace.db, LEDGER, CODE)).toMatchObject({
      quantity: 0,
      totalCost: 0,
      realizedPnl: 197_840,
    })
    expect(() => getTradeHistoryDetail(workspace.db, LEDGER, CODE)).toThrow(AppError)

    // 减到 0 手之后再买：仍是本轮的加仓（不是新的一轮）
    const add = createTrade(
      workspace.db,
      singleRequest({ tradeType: STOCK_TRADE_ADD, tradeTime: T3 }),
    )
    expect(add.roundId).toBe('')

    const close = createTrade(
      workspace.db,
      singleRequest({
        tradeType: STOCK_TRADE_CLOSE,
        priceMilli: 120_000,
        lots: 1,
        tradeTime: T4,
      }),
    )
    expect(close.roundId).not.toBe('')
    expect(close.realizedPnl).toBe(198_378)

    const detail = getTradeHistoryDetail(workspace.db, LEDGER, CODE)
    expect(detail.rounds).toHaveLength(1)
    expect(detail.rounds[0].tradeCount).toBe(4)
    expect(detail.rounds[0].openedAt).toBe(T1)
    expect(detail.rounds[0].closedAt).toBe(T4)

    const rows = listTradesAsc(workspace.db, LEDGER, CODE)
    expect(rows).toHaveLength(4)
    expect(rows.every((row) => row.roundId === close.roundId)).toBe(true)
  })

  it('archives a zero-lot close without any money movement', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 10_000_000)

    createTrade(workspace.db, singleRequest({ lots: 2, tag: '打板', tradeTime: T1 }))
    const position = getPosition(workspace.db, LEDGER, CODE)
    position.review = '  本轮复盘  '
    updatePosition(workspace.db, position)
    createTrade(
      workspace.db,
      singleRequest({ tradeType: STOCK_TRADE_REDUCE, priceMilli: 110_000, lots: 2, tradeTime: T2 }),
    )
    const recordsBefore = listAllFundRecords(workspace.db, LEDGER).length

    const closed = createTradeOrder(
      workspace.db,
      orderRequest({ tradeType: STOCK_TRADE_CLOSE, fills: [], tag: '打板', tradeTime: T3 }),
    )

    expect(closed).toHaveLength(1)
    expect([closed[0].lots, closed[0].shares, closed[0].amount, closed[0].fee]).toEqual([0, 0, 0, 0])
    expect(closed[0].realizedPnl).toBe(0)
    expect(closed[0].roundId).not.toBe('')
    // 0 手清仓不产生资金变化记录
    expect(listAllFundRecords(workspace.db, LEDGER)).toHaveLength(recordsBefore)

    const detail = getTradeHistoryDetail(workspace.db, LEDGER, CODE)
    expect(detail.rounds).toHaveLength(1)
    expect(detail.rounds[0].tradeCount).toBe(2)
    expect(detail.rounds[0].trades.every((trade) => trade.shares > 0)).toBe(true)
    expect(detail.rounds[0].tag).toBe('打板')
    expect(detail.rounds[0].review).toBe('本轮复盘')

    const markers = listTradesAsc(workspace.db, LEDGER, CODE).filter((row) => row.shares === 0)
    expect(markers).toHaveLength(1)
    expect(markers[0].roundId).toBe(detail.rounds[0].id)

    // 归档后持仓草稿清空，下一轮不继承
    expect(getPosition(workspace.db, LEDGER, CODE)).toMatchObject({
      quantity: 0,
      totalCost: 0,
      tag: '',
      review: '',
    })
  })

  it('rejects a partial close and an archive-only close while still holding', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 10_000_000)
    createTrade(workspace.db, singleRequest({ lots: 2, tradeTime: T1 }))

    const partial = appError(() =>
      createTrade(
        workspace.db,
        singleRequest({ tradeType: STOCK_TRADE_CLOSE, lots: 1, tradeTime: T2 }),
      ),
    )
    expect(partial.message).toBe('清仓必须全部卖出（当前 200 股）')
    expect(partial.status).toBe(400)

    const archiveOnly = appError(() =>
      createTradeOrder(
        workspace.db,
        orderRequest({ tradeType: STOCK_TRADE_CLOSE, fills: [], tradeTime: T2 }),
      ),
    )
    expect(archiveOnly.message).toBe('清仓请填写成交明细（当前 200 股）')
    expect(archiveOnly.status).toBe(400)

    // 失败的两次都没落库
    expect(listTradesAsc(workspace.db, LEDGER, CODE)).toHaveLength(1)
    expect(listAllFundRecords(workspace.db, LEDGER)).toHaveLength(1)
    expect(getPosition(workspace.db, LEDGER, CODE).quantity).toBe(200)
    expect(listTradeRoundsByStock(workspace.db, LEDGER, CODE)).toHaveLength(0)

    // 减仓减到 0 手仍然允许 —— 与清仓的区别就在这
    createTrade(
      workspace.db,
      singleRequest({ tradeType: STOCK_TRADE_REDUCE, priceMilli: 110_000, lots: 2, tradeTime: T3 }),
    )
    expect(getPosition(workspace.db, LEDGER, CODE).quantity).toBe(0)
  })

  it('rejects a round fee once the round has started and validates the opening one', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 10_000_000)
    createTrade(workspace.db, singleRequest())

    const immutable = appError(() =>
      createTradeWithRoundFee(workspace.db, {
        ...singleRequest({ tradeType: STOCK_TRADE_ADD, tradeTime: T2 }),
        roundFee: ETF_ROUND_FEE,
      }),
    )
    expect(immutable.message).toBe('本轮的费用设置在建仓时确定，不可更改')
    expect(immutable.status).toBe(400)
    expect(listTradesAsc(workspace.db, LEDGER, CODE)).toHaveLength(1)

    // 费率非法（佣金为 0）在建仓时也挡下来，且事务整体回滚（持仓行也不该留下）
    const invalid = appError(() =>
      createTradeWithRoundFee(workspace.db, {
        ...singleRequest({ stockCode: CODE_B, stockName: NAME_B, tradeTime: T2 }),
        roundFee: { ...ETF_ROUND_FEE, commissionRate: 0 },
      }),
    )
    expect(invalid.message).toBe('佣金费率必须大于 0，最低佣金与费率不能为负')
    expect(invalid.status).toBe(400)
    expect(() => getPosition(workspace.db, LEDGER, CODE_B)).toThrow(AppError)
  })

  it('rejects an invalid trade type, empty fills, bad price / lots and unknown tags', () => {
    const workspace = newWorkspace()

    const cases: Array<[string, () => unknown]> = [
      ['无效的交易类型', () => createTradeOrder(workspace.db, orderRequest({ tradeType: 'whatever' }))],
      ['成交明细不能为空', () => createTradeOrder(workspace.db, orderRequest({ fills: [] }))],
      [
        '成交明细不能为空',
        () => createTradeOrder(workspace.db, orderRequest({ fills: [fill(0, 0)] })),
      ],
      ['成交价必须大于 0', () => createTradeOrder(workspace.db, orderRequest({ fills: [fill(0, 1)] }))],
      [
        '手数必须大于 0',
        () => createTradeOrder(workspace.db, orderRequest({ fills: [fill(10_000, 0)] })),
      ],
      ['无效的交易标签', () => createTradeOrder(workspace.db, orderRequest({ tag: '不存在的标签' }))],
    ]

    for (const [message, run] of cases) {
      const error = appError(run)
      expect(error.message).toBe(message)
      expect(error.status).toBe(400)
    }

    // 校验全部发生在事务之前：没有持仓、没有成交、没有资金变动
    expect(listAllTradesAsc(workspace.db, LEDGER)).toHaveLength(0)
    expect(listAllFundRecords(workspace.db, LEDGER)).toHaveLength(0)
    expect(() => getPosition(workspace.db, LEDGER, CODE)).toThrow(AppError)
  })

  it('rejects selling more than the position without writing anything', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 10_000_000)
    createTrade(workspace.db, singleRequest({ lots: 2, tradeTime: T1 }))

    const error = appError(() =>
      createTrade(
        workspace.db,
        singleRequest({ tradeType: STOCK_TRADE_REDUCE, priceMilli: 110_000, lots: 3, tradeTime: T2 }),
      ),
    )
    expect(error.message).toBe('卖出数量超过持仓（当前 200 股）')
    expect(error.status).toBe(400)

    expect(listTradesAsc(workspace.db, LEDGER, CODE)).toHaveLength(1)
    expect(listAllFundRecords(workspace.db, LEDGER)).toHaveLength(1)
    expect(getPosition(workspace.db, LEDGER, CODE)).toMatchObject({
      quantity: 200,
      totalCost: 2_000_520,
      realizedPnl: 0,
    })
  })

  it('carries cost basis proportionally (rounded to cents) into realized pnl', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 10_000_000)

    // 3 手 @ 100.00：成交额 3,000,000 + 佣金 706 + 过户费 30
    createTrade(workspace.db, singleRequest({ lots: 3, tradeTime: T1 }))

    // 卖 1 手：结转 1/3 成本 = round(3,000,736 × 100 / 300) = 1,000,245
    const first = createTrade(
      workspace.db,
      singleRequest({ tradeType: STOCK_TRADE_REDUCE, priceMilli: 110_000, lots: 1, tradeTime: T2 }),
    )
    expect(first.realizedPnl).toBe(98_694)
    expect(getPosition(workspace.db, LEDGER, CODE)).toMatchObject({
      quantity: 200,
      totalCost: 2_000_491,
      realizedPnl: 98_694,
    })

    // 卖光剩 2 手：结转剩余全部成本
    const second = createTrade(
      workspace.db,
      singleRequest({ tradeType: STOCK_TRADE_REDUCE, priceMilli: 90_000, lots: 2, tradeTime: T3 }),
    )
    expect(second.realizedPnl).toBe(-201_909)
    expect(getPosition(workspace.db, LEDGER, CODE)).toMatchObject({
      quantity: 0,
      totalCost: 0,
      realizedPnl: -103_215,
    })
  })

  it('charges an in-market fund commission only, even with stamp duty in its round fee', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 10_000_000)

    const open = createTradeWithRoundFee(workspace.db, {
      ...singleRequest({
        stockCode: FUND_CODE,
        stockName: FUND_NAME,
        priceMilli: 4_389,
        lots: 3,
        tradeTime: T1,
      }),
      roundFee: { ...ETF_ROUND_FEE, stampDutyRate: 0.0005, transferFeeRate: 0.00001 },
    })
    // 4.389 元 × 300 份 → 131,670 分；万0.5 → 6.58 → 7 分
    expect(open.price).toBe(4_389)
    expect(open.amount).toBe(131_670)
    expect([open.commission, open.stampDuty, open.transferFee, open.fee]).toEqual([7, 0, 0, 7])

    const close = createTrade(
      workspace.db,
      singleRequest({
        stockCode: FUND_CODE,
        stockName: FUND_NAME,
        tradeType: STOCK_TRADE_CLOSE,
        priceMilli: 4_400,
        lots: 3,
        tradeTime: T2,
      }),
    )
    expect(close.amount).toBe(132_000)
    expect([close.commission, close.stampDuty, close.transferFee, close.fee]).toEqual([7, 0, 0, 7])
  })

  it('recalculates the cash chain and keeps same-second timestamps strictly increasing', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 10_000_000)

    const first = createTrade(workspace.db, singleRequest({ tradeTime: T1 }))
    // 同一秒的第二笔：现金链的余额必须按链序累加，资金记录 / 操作记录的录入时间必须递增
    const second = createTrade(
      workspace.db,
      singleRequest({ tradeType: STOCK_TRADE_ADD, tradeTime: T1 }),
    )
    expect(first.orderId).not.toBe(second.orderId)

    const records = listAllFundRecords(workspace.db, LEDGER)
    expect(records).toHaveLength(2)
    expect(records.map((record) => record.cashBalance)).toEqual([8_999_490, 7_998_980])
    expect(records.map((record) => record.recordDate)).toEqual([unixToDate(T1), unixToDate(T1)])
    expect(records[1].createdAt).toBeGreaterThan(records[0].createdAt)

    const operations = listOperations(workspace.db, LEDGER, 10)
    expect(operations.map((operation) => operation.action)).toEqual(['加仓', '建仓'])
    expect(operations[1].createdAt).toBeLessThan(operations[0].createdAt)
    expect(operations.map((operation) => operation.targetId).sort()).toEqual(
      [first.orderId, second.orderId].sort(),
    )
  })

  it('archives the round and creates the trade history on close', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 10_000_000)

    createTrade(workspace.db, singleRequest({ tag: '打板', tradeTime: T1 }))
    const position = getPosition(workspace.db, LEDGER, CODE)
    position.review = '  本轮复盘  '
    updatePosition(workspace.db, position)

    const close = createTrade(
      workspace.db,
      singleRequest({
        tradeType: STOCK_TRADE_CLOSE,
        priceMilli: 110_000,
        tag: '打板',
        tradeTime: T2,
      }),
    )
    expect(close.realizedPnl).toBe(98_429)
    expect(close.roundId).not.toBe('')

    const history = getTradeHistory(workspace.db, LEDGER, CODE)
    expect(history.stockName).toBe(NAME)
    const rounds = listTradeRoundsByStock(workspace.db, LEDGER, CODE)
    expect(rounds).toHaveLength(1)
    expect(rounds[0]).toMatchObject({
      roundNo: 1,
      openedAt: T1,
      closedAt: T2,
      tag: '打板',
      review: '本轮复盘',
      historyId: history.id,
    })
    expect(close.roundId).toBe(rounds[0].id)

    // 持仓侧的草稿已清空，下一轮不继承
    expect(getPosition(workspace.db, LEDGER, CODE)).toMatchObject({
      quantity: 0,
      totalCost: 0,
      review: '',
      tag: '',
    })

    // 第二轮：改名后清仓，历史集合跟着改名，轮次号从 2 起
    createTrade(
      workspace.db,
      singleRequest({ stockName: '浦发银行改名', tradeTime: T3 }),
    )
    createTrade(
      workspace.db,
      singleRequest({
        stockName: '浦发银行改名',
        tradeType: STOCK_TRADE_CLOSE,
        priceMilli: 105_000,
        tradeTime: T4,
      }),
    )
    expect(getTradeHistory(workspace.db, LEDGER, CODE).stockName).toBe('浦发银行改名')
    const detail = getTradeHistoryDetail(workspace.db, LEDGER, CODE)
    expect(detail.rounds.map((round) => round.roundNo)).toEqual([1, 2])
    expect(detail.rounds[1].tag).toBe('分析')
    expect(detail.rounds[1].pnl).toBe(48_454)
  })

  it('moves the current round day reviews into the archived round', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 10_000_000)
    createTrade(workspace.db, singleRequest({ tradeTime: T1 }))

    workspace.db
      .prepare(
        'INSERT INTO stock_day_review ' +
          '(id, ledger_id, stock_code, round_id, review_date, review, created_at, updated_at) ' +
          "VALUES (?, ?, ?, '', ?, ?, ?, ?)",
      )
      .run('dr-1', LEDGER, CODE, '2023-11-14', '每日复盘正文', T1, T1)

    createTrade(
      workspace.db,
      singleRequest({ tradeType: STOCK_TRADE_CLOSE, priceMilli: 110_000, tradeTime: T2 }),
    )

    const rounds = listTradeRoundsByStock(workspace.db, LEDGER, CODE)
    expect(rounds).toHaveLength(1)
    const row = workspace.db
      .prepare('SELECT round_id FROM stock_day_review WHERE id = ?')
      .get('dr-1') as { round_id: string }
    expect(row.round_id).toBe(rounds[0].id)
  })

  it('exposes the single-fill wrappers and the order-level entry point', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 10_000_000)

    const single = createTradeWithRoundFee(workspace.db, {
      ...singleRequest({ tradeTime: T1 }),
      roundFee: ETF_ROUND_FEE,
    })
    expect(single.commission).toBe(50)
    expect(single.orderSeq).toBe(1)
    expect(single.roundFee).toEqual(ETF_ROUND_FEE)

    const items = createTradeOrderWithRoundFee(workspace.db, {
      ...orderRequest({
        stockCode: '601318',
        stockName: '中国平安',
        fills: [fill(100_000, 1), fill(100_000, 1)],
        tradeTime: T2,
      }),
      roundFee: ETF_ROUND_FEE,
    })
    expect(items).toHaveLength(2)
    expect(items.map((item) => item.orderSeq)).toEqual([1, 2])
    expect(items[0].orderId).toBe(items[1].orderId)
    // 委托级佣金只收一次（2 手 20,000 元 × 万0.5 = 1.00 元），再按成交额分摊
    expect(items.reduce((sum, item) => sum + item.commission, 0)).toBe(100)

    const plain = createTradeOrder(
      workspace.db,
      orderRequest({ stockCode: '600519', stockName: '贵州茅台', tradeTime: T3 }),
    )
    expect(plain).toHaveLength(1)
    expect(plain[0].roundFee).toEqual({ ...DEFAULT_STOCK_FEE_SETTING })
  })
})
