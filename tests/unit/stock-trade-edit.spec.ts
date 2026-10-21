/**
 * 股票成交编辑 / 委托删除 / 整体重放 / 回滚（`electron/services/stock-trade-edit.ts`）的行为测试。
 *
 * 成交编辑 / 删除 / 重放：
 *
 * * 编辑 / 删除 / 重放：
 *   `create_order_after_rebuild_reads_fresh_state`、`phase3_reduce_sequence_matches_expected_lots`、
 *   `editing_third_round_open_keeps_its_close_trade`、
 *   `preview_delete_order_keeps_state_intact_for_later_replay`、
 *   `a_reduce_to_zero_does_not_archive_the_round`（重放部分）、
 *   `a_zero_lot_close_archives_without_money_movement`（重放部分）、
 *   `editing_a_fill_recalculates_with_its_own_round_fee`、`update_trade_fill_recalculates_order`、
 *   `delete_trade_order_restores_position`、`preview_trade_change_rolls_back`、
 *   `preview_trade_change_rejects_unknown_action`、`rebuild_is_idempotent`、
 *   `rebuild_keeps_round_tag_and_review`、`backdated_trade_is_counted_in_the_cash_chain`；
 * * 回滚：`rollback_undoes_add_principal_and_pops_the_log`、
 *   `rollback_undoes_withdraw_and_interest_without_touching_principal`、
 *   `rollback_undoes_a_trade_order`、`rollback_pops_one_operation_at_a_time`、
 *   `rollback_without_operations_is_a_bad_request`、`rollback_skips_when_the_target_is_already_gone`、
 *   `rollback_preview_lists_lost_rounds_and_never_writes`、
 *   `rollback_of_close_removes_the_round_and_its_review`；
 * * 每日复盘与重放：`day_reviews_follow_the_round_through_replay`、
 *   `replay_never_steals_the_open_rounds_day_reviews`。
 *
 * 另加两条本切片自己的确定性测试：
 * * `replay_matches_incremental_derived_state_and_is_deterministic`：增量写入 vs 重放的派生值
 *   逐项相等，且连续两次重放的**全部**字段（含资金记录 `createdAt`）相等；
 * * `create_then_edit_then_delete_stays_consistent`：建仓 → 改价 → 删委托的整条链路，
 *   以及删掉目标之后回滚走 `skipped` 路径。
 *
 * 时间戳全部用固定常量（`T1`–`T4` 或既有原值），保证断言确定；资金记录的 `createdAt`
 * 是派生值（DAO 的 `MAX(now, 已有最大 + 1)`），只在明确要验"重放确定性"的地方比对。
 *
 * 每日复盘的 DAO 尚未随本切片移植（与既有一样在服务里就地读写），测试也按源表结构
 * 用参数化 SQL 造数 / 读回。
 */

import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { closeWorkspace, openWorkspace, type OpenedWorkspace } from '../../electron/db'
import {
  countFundRecords,
  listAllFundRecords,
} from '../../electron/db/dao/stock-fund'
import {
  getPosition,
  getTrade,
  listAllTradesAsc,
  listPositions as listPositionRows,
  listTradeHistories,
  listTradeRounds,
  listTradeRoundsByStock,
  listTradesAsc,
  listTradesByRound,
  updateTradeRoundReview,
  updateTradeRoundTag,
  deleteTradeHistoriesByLedger,
  deleteTradeRound,
} from '../../electron/db/dao/stock-trade'
import {
  addInterest,
  addPrincipal,
  addPrincipalAtDate,
  getAccountSummary,
  listOperations,
  saveFeeSettings,
  setPrincipal,
  unixToDate,
  withdraw,
} from '../../electron/services/stock-account'
import { getTradeHistoryDetail } from '../../electron/services/stock-history'
import {
  deleteTradeOrder,
  previewRollback,
  previewTradeChange,
  rollbackLatest,
  updateTradeFill,
} from '../../electron/services/stock-trade-edit'
import { createTrade, createTradeOrder, createTradeWithRoundFee } from '../../electron/services/stock-trade-write'
import {
  STOCK_EVENT_ADD_PRINCIPAL,
  STOCK_EVENT_BUY,
  STOCK_EVENT_SELL,
  STOCK_TRADE_ADD,
  STOCK_TRADE_CLOSE,
  STOCK_TRADE_OPEN,
  STOCK_TRADE_REDUCE,
} from '../../shared/domain/consts'
import type { RoundFee } from '../../shared/domain/models'
import { nowSeconds } from '../../shared/domain/time'
import type { CreateTradeOrderRequest, CreateTradeRequest, StockTradeFill } from '../../shared/types/stock-trade'
import { AppError } from '../../shared/errors'
import type { Db } from '../../electron/db/driver'

const LEDGER = 'ledger-trade-edit'
const CODE = '600000'
const NAME = '浦发银行'
const CODE_B = '000001'
const NAME_B = '平安银行'
/** 协和电子：既有"一次委托两笔成交"的回归标的。 */
const ORDER_CODE = '605258'
const ORDER_NAME = '协和电子'

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
  const directory = mkdtempSync(join(tmpdir(), 'tr-stock-trade-edit-test-'))
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

/** 建仓后立即清仓，产生一条已归档轮次。 */
function closeRoundHelper(
  db: Db,
  code: string,
  name: string,
  openMilli: number,
  closeMilli: number,
): void {
  createTrade(db, {
    ...singleRequest({ stockCode: code, stockName: name, priceMilli: openMilli, lots: 10 }),
  })
  createTrade(db, {
    ...singleRequest({
      stockCode: code,
      stockName: name,
      tradeType: STOCK_TRADE_CLOSE,
      priceMilli: closeMilli,
      lots: 10,
      tradeTime: T2,
    }),
  })
}

/** 既有 `create_xiehe_order`：协和电子建仓 2 手 + 清仓两笔，返回**清仓**委托的成交。 */
function createXieheOrder(workspace: OpenedWorkspace) {
  setPrincipal(workspace.db, LEDGER, 10_000_000)
  createTradeOrder(workspace.db, {
    ...orderRequest({ stockCode: ORDER_CODE, stockName: ORDER_NAME, fills: [fill(38_060, 2)] }),
  })
  return createTradeOrder(workspace.db, {
    ...orderRequest({
      stockCode: ORDER_CODE,
      stockName: ORDER_NAME,
      tradeType: STOCK_TRADE_CLOSE,
      fills: [fill(36_670, 1), fill(36_610, 1)],
      tradeTime: T2,
    }),
  })
}

/** 某类资金记录（测试数据里每类只有一条）。 */
function fundRecordOf(workspace: OpenedWorkspace, eventType: string) {
  const record = listAllFundRecords(workspace.db, LEDGER).find(
    (item) => item.eventType === eventType,
  )
  if (!record) throw new Error(`未找到 ${eventType} 资金记录`)
  return record
}

/** 某股持仓：行不存在时视为 (0, 0)（既有 `position_of`）。 */
function positionOf(workspace: OpenedWorkspace, code: string): [number, number] {
  try {
    const position = getPosition(workspace.db, LEDGER, code)
    return [position.quantity, position.totalCost]
  } catch (error) {
    if (error instanceof AppError && error.status === 404) return [0, 0]
    throw error
  }
}

/**
 * 股票侧「库内容指纹」：各表行数 + 轮次的标签/复盘 + 本金。
 *
 * 用来断言「预演绝不落库」——只比对行数不够（改写复盘也看得见），所以把轮次元数据也带上。
 */
function stockFingerprint(db: Db): string {
  const tables = [
    'stock_account',
    'stock_position',
    'stock_trade',
    'stock_trade_round',
    'stock_trade_history',
    'stock_fund_record',
    'stock_operation',
  ]
  let out = ''
  for (const table of tables) {
    const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as unknown as {
      count: number
    }
    out += `${table}=${row.count};`
  }
  const rounds = db
    .prepare('SELECT id, round_no, tag, review FROM stock_trade_round ORDER BY id')
    .all() as unknown as Array<{ id: string; round_no: number; tag: string; review: string }>
  out += rounds
    .map((row) => `${row.id}:${row.round_no}:${row.tag}:${row.review}`)
    .join('|')
  const principal = db
    .prepare('SELECT COALESCE(SUM(principal_cents), 0) AS total FROM stock_account')
    .get() as unknown as { total: number }
  out += `;principal=${principal.total}`
  return out
}

/** 插入一条每日复盘（`roundId = ''` 表示"当前还没归档的那一轮"）。 */
function insertDayReview(
  db: Db,
  stockCode: string,
  roundId: string,
  date: string,
  review: string,
  at: number,
): void {
  db.prepare(
    'INSERT INTO stock_day_review ' +
      '(id, ledger_id, stock_code, round_id, review_date, review, created_at, updated_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(randomUUID(), LEDGER, stockCode, roundId, date, review, at, at)
}

/** 某股每日复盘的原始行（按日期倒序；含当前轮 `round_id = ''` 的行）。 */
function dayReviewRows(
  db: Db,
  stockCode: string,
): Array<{ round_id: string; review_date: string; review: string }> {
  return db
    .prepare(
      'SELECT round_id, review_date, review FROM stock_day_review ' +
        'WHERE ledger_id = ? AND stock_code = ? ORDER BY review_date DESC',
    )
    .all(LEDGER, stockCode) as unknown as Array<{
    round_id: string
    review_date: string
    review: string
  }>
}

/** 造一个**还在持仓**的轮次，返回本轮建仓日（本地日期）。 */
function seedOpenPosition(
  workspace: OpenedWorkspace,
  code: string,
  name: string,
  lots: number,
): string {
  const openedAt = nowSeconds() - 2 * 86_400
  createTrade(workspace.db, {
    ...singleRequest({
      stockCode: code,
      stockName: name,
      priceMilli: 10_000,
      lots,
      tradeTime: openedAt,
    }),
  })
  return unixToDate(openedAt)
}

/** 一次重放的不变量快照（ID 只保留成交与轮次的：它们必须稳定）。 */
interface DerivedSnapshot {
  position: {
    stockName: string
    quantity: number
    totalCost: number
    realizedPnl: number
    review: string
    tag: string
  }
  trades: Array<Record<string, unknown>>
  rounds: Array<Record<string, unknown>>
  funds: Array<Record<string, unknown>>
  histories: Array<Record<string, unknown>>
}

function derivedSnapshot(db: Db, includeFundCreatedAt: boolean): DerivedSnapshot {
  const position = getPosition(db, LEDGER, CODE)
  const trades = listAllTradesAsc(db, LEDGER).map((trade) => ({
    id: trade.id,
    orderId: trade.orderId,
    orderSeq: trade.orderSeq,
    tradeType: trade.tradeType,
    price: trade.price,
    lots: trade.lots,
    shares: trade.shares,
    amount: trade.amount,
    fee: trade.fee,
    commission: trade.commission,
    stampDuty: trade.stampDuty,
    transferFee: trade.transferFee,
    realizedPnl: trade.realizedPnl,
    roundId: trade.roundId,
    tradeTime: trade.tradeTime,
    remark: trade.remark,
  }))
  const rounds = listTradeRounds(db, LEDGER).map((round) => ({
    id: round.id,
    stockCode: round.stockCode,
    roundNo: round.roundNo,
    openedAt: round.openedAt,
    closedAt: round.closedAt,
    tag: round.tag,
    review: round.review,
  }))
  const funds = listAllFundRecords(db, LEDGER).map((record) => ({
    recordDate: record.recordDate,
    eventType: record.eventType,
    eventText: record.eventText,
    amountChange: record.amountChange,
    cashBalance: record.cashBalance,
    netPnl: record.netPnl,
    remark: record.remark,
    ...(includeFundCreatedAt ? { createdAt: record.createdAt } : {}),
  }))
  const histories = listTradeHistories(db, LEDGER).map((history) => ({
    stockCode: history.stockCode,
    stockName: history.stockName,
  }))
  return {
    position: {
      stockName: position.stockName,
      quantity: position.quantity,
      totalCost: position.totalCost,
      realizedPnl: position.realizedPnl,
      review: position.review,
      tag: position.tag,
    },
    trades,
    rounds,
    funds,
    histories,
  }
}

describe('stock-trade-edit: edit / delete / replay', () => {
  it('reads fresh state for the next order after a replay', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 100_000_000)

    // 建仓 2 手（一笔委托、两笔成交）
    const opens = createTradeOrder(workspace.db, {
      ...orderRequest({ fills: [fill(38_060, 1), fill(38_060, 1)] }),
    })
    expect(opens).toHaveLength(2)

    // 触发一次重放：编辑第二笔成交的成交价
    updateTradeFill(workspace.db, {
      ledgerId: LEDGER,
      tradeId: opens[1].id,
      priceMilli: 38_100,
      lots: 1,
      tradeTime: T1,
    })

    // 重放之后再减仓 1 手：预检必须看到"还有 200 股"
    createTradeOrder(workspace.db, {
      ...orderRequest({
        tradeType: STOCK_TRADE_REDUCE,
        fills: [fill(39_000, 1)],
        tradeTime: T2,
      }),
    })

    expect(getPosition(workspace.db, LEDGER, CODE).quantity).toBe(100)
    const trades = listAllTradesAsc(workspace.db, LEDGER)
    expect(trades).toHaveLength(3)
    const reduce = trades.find((trade) => trade.tradeType === STOCK_TRADE_REDUCE)
    expect(reduce).toBeDefined()
    expect(reduce?.lots).toBe(1)
    expect(reduce?.shares).toBe(100)
  })

  it('rebuilds the phase-3 reduce sequence without corrupting lots', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 100_000_000)

    // ---- 阶段 1：600519 建仓 2 笔 + 加仓 + 清仓（归档第 1 轮）----
    const opens = createTradeOrder(workspace.db, {
      ...orderRequest({
        fills: [fill(1_700_000, 1), fill(1_701_500, 1)],
        tradeTime: 1_767_657_600,
        remark: '种子建仓',
      }),
    })
    createTradeOrder(workspace.db, {
      ...orderRequest({
        tradeType: STOCK_TRADE_ADD,
        fills: [fill(1_695_000, 1)],
        tradeTime: 1_768_867_200,
        remark: '种子加仓',
      }),
    })
    createTradeOrder(workspace.db, {
      ...orderRequest({
        tradeType: STOCK_TRADE_CLOSE,
        fills: [fill(1_750_000, 3)],
        tradeTime: 1_773_100_800,
        remark: '种子清仓',
        tag: '打板',
      }),
    })

    // ---- 阶段 2a：编辑建仓第 2 笔成交价（触发第一次 rebuild）----
    updateTradeFill(workspace.db, {
      ledgerId: LEDGER,
      tradeId: opens[1].id,
      priceMilli: 1_702_000,
      lots: 1,
      tradeTime: 1_767_657_600,
    })

    // ---- 阶段 2b：再建仓 1 手 → 删除该委托（触发第二次 rebuild）----
    const reopen = createTradeOrder(workspace.db, {
      ...orderRequest({
        fills: [fill(1_680_000, 1)],
        tradeTime: 1_775_779_200,
        remark: '二次建仓',
      }),
    })
    deleteTradeOrder(workspace.db, { ledgerId: LEDGER, orderId: reopen[0].orderId })
    expect(getPosition(workspace.db, LEDGER, CODE).quantity).toBe(0)

    // ---- 阶段 3：000001 建仓 3 手 → 两次减仓 → 加仓 → 清仓 2 手 ----
    const opening = (tradeType: string, priceMilli: number, lots: number, tradeTime: number, remark: string) =>
      createTradeOrder(workspace.db, {
        ...orderRequest({
          stockCode: CODE_B,
          stockName: NAME_B,
          tradeType,
          fills: [fill(priceMilli, lots)],
          tradeTime,
          remark,
        }),
      })
    opening(STOCK_TRADE_OPEN, 1_120_000, 3, 1_779_408_000, '减仓建仓')
    opening(STOCK_TRADE_REDUCE, 1_150_000, 1, 1_779_494_400, '减仓甲')
    opening(STOCK_TRADE_REDUCE, 1_080_000, 1, 1_779_580_800, '减仓乙')
    opening(STOCK_TRADE_ADD, 1_200_000, 1, 1_779_667_200, '减仓后加仓')
    opening(STOCK_TRADE_CLOSE, 1_180_000, 2, 1_779_753_600, '减仓后清仓')

    const tradesB = listTradesAsc(workspace.db, LEDGER, CODE_B)
    expect(
      tradesB.map((trade) => [trade.tradeType, trade.lots, trade.shares]),
    ).toEqual([
      [STOCK_TRADE_OPEN, 3, 300],
      [STOCK_TRADE_REDUCE, 1, 100],
      [STOCK_TRADE_REDUCE, 1, 100],
      [STOCK_TRADE_ADD, 1, 100],
      [STOCK_TRADE_CLOSE, 2, 200],
    ])
    expect(getPosition(workspace.db, LEDGER, CODE_B).quantity).toBe(0)

    // 两次减仓的已实现盈亏必须按「剩余总成本比例」结转（不是整笔）
    const reduces = tradesB.filter((trade) => trade.tradeType === STOCK_TRADE_REDUCE)
    expect(reduces).toHaveLength(2)
    expect(reduces.every((trade) => (trade.realizedPnl ?? 0) !== 0)).toBe(true)

    // 阶段 1 的 600519 成交必须完好（4 笔），不能被阶段 3 的重放吃掉
    expect(listTradesAsc(workspace.db, LEDGER, CODE)).toHaveLength(4)
  })

  it('keeps a later round close trade when editing an archived round open', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 100_000_000)

    // 阶段 1：600519 建仓 2 笔 + 加仓 + 清仓
    createTradeOrder(workspace.db, {
      ...orderRequest({ fills: [fill(1_700_000, 1), fill(1_701_500, 1)], tradeTime: 1_767_657_600 }),
    })
    createTradeOrder(workspace.db, {
      ...orderRequest({
        tradeType: STOCK_TRADE_ADD,
        fills: [fill(1_695_000, 1)],
        tradeTime: 1_768_867_200,
      }),
    })
    createTradeOrder(workspace.db, {
      ...orderRequest({
        tradeType: STOCK_TRADE_CLOSE,
        fills: [fill(1_750_000, 3)],
        tradeTime: 1_773_100_800,
        tag: '打板',
      }),
    })

    // 阶段 2：编辑建仓第 2 笔（重放）+ 二次建仓后删除（重放）
    const secondOpen = listTradesAsc(workspace.db, LEDGER, CODE).find(
      (trade) => trade.tradeTime === 1_767_657_600 && trade.orderSeq === 2,
    )
    expect(secondOpen).toBeDefined()
    updateTradeFill(workspace.db, {
      ledgerId: LEDGER,
      tradeId: secondOpen!.id,
      priceMilli: 1_702_000,
      lots: 1,
      tradeTime: 1_767_657_600,
    })
    const reopen = createTradeOrder(workspace.db, {
      ...orderRequest({ fills: [fill(1_680_000, 1)], tradeTime: 1_775_779_200 }),
    })
    deleteTradeOrder(workspace.db, { ledgerId: LEDGER, orderId: reopen[0].orderId })

    // 阶段 3-1：第二轮 建仓3 → 减仓1 → 减仓1 → 加仓1 → 清仓2
    createTradeOrder(workspace.db, {
      ...orderRequest({ fills: [fill(1_980_000, 3)], tradeTime: 1_778_198_400 }),
    })
    for (const [price, at, remark] of [
      [199_000, 1_778_284_800, '第二轮减仓甲'],
      [197_500, 1_778_371_200, '第二轮减仓乙'],
    ] as Array<[number, number, string]>) {
      createTradeOrder(workspace.db, {
        ...orderRequest({
          tradeType: STOCK_TRADE_REDUCE,
          fills: [fill(price, 1)],
          tradeTime: at,
          remark,
        }),
      })
    }
    createTradeOrder(workspace.db, {
      ...orderRequest({ tradeType: STOCK_TRADE_ADD, fills: [fill(2_010_000, 1)], tradeTime: 1_778_457_600 }),
    })
    createTradeOrder(workspace.db, {
      ...orderRequest({
        tradeType: STOCK_TRADE_CLOSE,
        fills: [fill(2_000_000, 2)],
        tradeTime: 1_778_544_000,
        tag: '追涨',
      }),
    })

    // 阶段 3-2：第三轮 建仓1 → 清仓1
    const r3 = createTradeOrder(workspace.db, {
      ...orderRequest({ fills: [fill(1_900_000, 1)], tradeTime: 1_778_716_800 }),
    })
    createTradeOrder(workspace.db, {
      ...orderRequest({
        tradeType: STOCK_TRADE_CLOSE,
        fills: [fill(1_950_000, 1)],
        tradeTime: 1_778_803_200,
      }),
    })

    // 与 seed 一致的收尾：第二轮复盘 + 第三轮标签 / 复盘
    const detail = getTradeHistoryDetail(workspace.db, LEDGER, CODE)
    const round2 = detail.rounds.find((round) => round.roundNo === 2)
    const round3 = detail.rounds.find((round) => round.roundNo === 3)
    expect(round2).toBeDefined()
    expect(round3).toBeDefined()
    updateTradeRoundReview(workspace.db, round2!.id, '阶段三：第二轮复盘（编辑后必须保留）')
    updateTradeRoundTag(workspace.db, round3!.id, '蓄力')
    updateTradeRoundReview(workspace.db, round3!.id, '阶段三：第三轮复盘')

    // 阶段 3-5：**另一只股票** 000001 建仓 1 手 → 清仓 1 手
    createTradeOrder(workspace.db, {
      ...orderRequest({
        stockCode: CODE_B,
        stockName: NAME_B,
        fills: [fill(1_120_000, 1)],
        tradeTime: 1_778_976_000,
      }),
    })
    createTradeOrder(workspace.db, {
      ...orderRequest({
        stockCode: CODE_B,
        stockName: NAME_B,
        tradeType: STOCK_TRADE_CLOSE,
        fills: [fill(1_180_000, 1)],
        tradeTime: 1_779_062_400,
        tag: '尾盘',
      }),
    })

    // 阶段 3-7：先编辑 000001 的建仓价（触发一次包含 12 笔成交的重放）
    const fourthOpen = listTradesAsc(workspace.db, LEDGER, CODE_B).find(
      (trade) => trade.tradeTime === 1_778_976_000,
    )
    expect(fourthOpen).toBeDefined()
    updateTradeFill(workspace.db, {
      ledgerId: LEDGER,
      tradeId: fourthOpen!.id,
      priceMilli: 1_130_000,
      lots: 1,
      tradeTime: 1_778_976_000,
    })

    expect(listTradesAsc(workspace.db, LEDGER, CODE)).toHaveLength(11)

    // 阶段 3-4：编辑第三轮建仓 1 手 → 3 手（触发重放）
    updateTradeFill(workspace.db, {
      ledgerId: LEDGER,
      tradeId: r3[0].id,
      priceMilli: 1_900_000,
      lots: 3,
      tradeTime: 1_778_716_800,
    })

    const after = listTradesAsc(workspace.db, LEDGER, CODE)
    expect(after).toHaveLength(11)
    expect(after.some((trade) => trade.tradeTime === 1_778_803_200)).toBe(true)
    // 第二轮没被这次编辑波及：轮次与复盘都在
    const afterDetail = getTradeHistoryDetail(workspace.db, LEDGER, CODE)
    const round2After = afterDetail.rounds.find((round) => round.roundNo === 2)
    expect(round2After).toBeDefined()
    expect(round2After?.review).toBe('阶段三：第二轮复盘（编辑后必须保留）')
  })

  it('keeps the database intact after a preview and still replays later', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 100_000_000)

    const opens = createTradeOrder(workspace.db, {
      ...orderRequest({ fills: [fill(38_060, 1), fill(38_060, 1)], tradeTime: T1 }),
    })
    const closes = createTradeOrder(workspace.db, {
      ...orderRequest({
        tradeType: STOCK_TRADE_CLOSE,
        fills: [fill(39_000, 2)],
        tradeTime: T2,
      }),
    })
    expect(listAllTradesAsc(workspace.db, LEDGER)).toHaveLength(3)

    // ① 非法预演：删建仓委托 → 只剩卖出，预演自己就该以 400 拒绝
    const invalid = appError(() =>
      previewTradeChange(workspace.db, {
        ledgerId: LEDGER,
        action: 'delete_order',
        tradeId: '',
        orderId: opens[0].orderId,
        priceMilli: 0,
        lots: 0,
        tradeTime: 0,
      }),
    )
    expect(invalid.status).toBe(400)
    expect(invalid.message).toBe('卖出数量超过持仓（当前 0 股）')
    expect(listAllTradesAsc(workspace.db, LEDGER)).toHaveLength(3)

    // ② 合法预演：删清仓委托 → 删完仍是"持有 2 手"
    const impact = previewTradeChange(workspace.db, {
      ledgerId: LEDGER,
      action: 'delete_order',
      tradeId: '',
      orderId: closes[0].orderId,
      priceMilli: 0,
      lots: 0,
      tradeTime: 0,
    })
    expect(impact.positionAfter).toBe(200)

    // 预演必须零副作用
    expect(listAllTradesAsc(workspace.db, LEDGER)).toHaveLength(3)
    expect(getPosition(workspace.db, LEDGER, CODE).quantity).toBe(0)

    // ③ 之后再触发一次重放：必须成功，不能报超卖
    const target = listAllTradesAsc(workspace.db, LEDGER).find(
      (trade) => trade.tradeType === STOCK_TRADE_OPEN,
    )
    expect(target).toBeDefined()
    updateTradeFill(workspace.db, {
      ledgerId: LEDGER,
      tradeId: target!.id,
      priceMilli: target!.price + 10,
      lots: target!.lots,
      tradeTime: target!.tradeTime,
    })

    const finalTrades = listAllTradesAsc(workspace.db, LEDGER)
    expect(finalTrades).toHaveLength(3)
    expect(finalTrades.filter((trade) => trade.tradeType === STOCK_TRADE_OPEN)).toHaveLength(2)
  })

  it('keeps a reduce-to-zero round open through a replay', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 10_000_000)

    createTrade(workspace.db, singleRequest({ lots: 2, tradeTime: T1 }))
    createTrade(
      workspace.db,
      singleRequest({ tradeType: STOCK_TRADE_REDUCE, priceMilli: 110_000, lots: 2, tradeTime: T2 }),
    )
    // 减到 0 手：持仓行仍在（0 手），没有交易历史
    expect(getPosition(workspace.db, LEDGER, CODE).quantity).toBe(0)
    expect(listTradeRoundsByStock(workspace.db, LEDGER, CODE)).toHaveLength(0)
    expect(() => getTradeHistoryDetail(workspace.db, LEDGER, CODE)).toThrow(AppError)

    // 再买 1 手 ⇒ 仍是本轮加仓；清仓 1 手 ⇒ 四笔归同一轮
    createTrade(workspace.db, singleRequest({ tradeType: STOCK_TRADE_ADD, tradeTime: T3 }))
    createTrade(
      workspace.db,
      singleRequest({ tradeType: STOCK_TRADE_CLOSE, priceMilli: 120_000, lots: 1, tradeTime: T4 }),
    )
    const detail = getTradeHistoryDetail(workspace.db, LEDGER, CODE)
    expect(detail.rounds).toHaveLength(1)
    expect(detail.rounds[0].tradeCount).toBe(4)
    expect(detail.rounds[0].openedAt).toBe(T1)

    // 改一笔成交触发重放：新一轮的起点不能是"持仓为 0"
    updateTradeFill(workspace.db, {
      ledgerId: LEDGER,
      tradeId: detail.rounds[0].trades[0].id,
      priceMilli: 105_000,
      lots: 2,
      tradeTime: T1,
    })
    const replayed = getTradeHistoryDetail(workspace.db, LEDGER, CODE)
    expect(replayed.rounds).toHaveLength(1)
    expect(replayed.rounds[0].tradeCount).toBe(4)
    expect(replayed.rounds[0].openedAt).toBe(T1)
  })

  it('keeps the zero-lot archive marker across a replay', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 10_000_000)

    createTrade(workspace.db, singleRequest({ lots: 2, tradeTime: T1 }))
    createTrade(
      workspace.db,
      singleRequest({ tradeType: STOCK_TRADE_REDUCE, priceMilli: 110_000, lots: 2, tradeTime: T2 }),
    )
    const recordsBefore = countFundRecords(workspace.db, LEDGER)
    createTradeOrder(workspace.db, {
      ...orderRequest({ tradeType: STOCK_TRADE_CLOSE, fills: [], tradeTime: T3 }),
    })
    expect(countFundRecords(workspace.db, LEDGER)).toBe(recordsBefore)

    const detail = getTradeHistoryDetail(workspace.db, LEDGER, CODE)
    expect(detail.rounds).toHaveLength(1)
    expect(detail.rounds[0].tradeCount).toBe(2)

    // 重放从成交行重建轮次：0 手标记那一笔必须让轮次重新成立
    updateTradeFill(workspace.db, {
      ledgerId: LEDGER,
      tradeId: detail.rounds[0].trades[0].id,
      priceMilli: 102_000,
      lots: 2,
      tradeTime: T1,
    })
    const replayed = getTradeHistoryDetail(workspace.db, LEDGER, CODE)
    expect(replayed.rounds).toHaveLength(1)
    expect(replayed.rounds[0].tradeCount).toBe(2)
    const markers = listTradesByRound(workspace.db, replayed.rounds[0].id).filter(
      (trade) => trade.shares === 0,
    )
    expect(markers).toHaveLength(1)
  })

  it('reconstructs an archived round from the trade flow when the round row is gone', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 10_000_000)

    // 造一轮归档，然后把「轮次 + 历史集合」删掉：模拟升级前没有回填的存量数据
    createTrade(workspace.db, singleRequest({ lots: 2, tag: '打板', tradeTime: T1 }))
    const close = createTrade(
      workspace.db,
      singleRequest({ tradeType: STOCK_TRADE_CLOSE, priceMilli: 110_000, lots: 2, tradeTime: T2 }),
    )
    expect(close.roundId).not.toBe('')
    for (const round of listTradeRounds(workspace.db, LEDGER)) {
      deleteTradeRound(workspace.db, round.id)
    }
    deleteTradeHistoriesByLedger(workspace.db, LEDGER)
    expect(listTradeRoundsByStock(workspace.db, LEDGER, CODE)).toHaveLength(0)

    // 重放从成交流重建：轮次 / 历史集合都按「股票 + 轮次序号」重新落库
    updateTradeFill(workspace.db, {
      ledgerId: LEDGER,
      tradeId: close.id,
      priceMilli: close.price,
      lots: close.lots,
      tradeTime: close.tradeTime,
    })

    const detail = getTradeHistoryDetail(workspace.db, LEDGER, CODE)
    expect(detail.rounds).toHaveLength(1)
    expect(detail.rounds[0].roundNo).toBe(1)
    expect(detail.rounds[0].tag).toBe('分析')
    expect(detail.rounds[0].tradeCount).toBe(2)
    expect(detail.rounds[0].openedAt).toBe(T1)
    expect(detail.rounds[0].closedAt).toBe(T2)
    // 重建出来的轮次挂接了整轮（建仓 + 清仓）的成交
    expect(
      listTradesAsc(workspace.db, LEDGER, CODE).every(
        (trade) => trade.roundId === detail.rounds[0].id,
      ),
    ).toBe(true)
  })

  it('treats an order-less source trade as its own order', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 10_000_000)
    const trade = createTrade(workspace.db, singleRequest({ tradeTime: T1 }))
    // 模拟未回填委托的存量数据：order_id = ''
    workspace.db.prepare("UPDATE stock_trade SET order_id = '' WHERE id = ?").run(trade.id)

    const updated = updateTradeFill(workspace.db, {
      ledgerId: LEDGER,
      tradeId: trade.id,
      priceMilli: 110_000,
      lots: 2,
      tradeTime: T1,
    })
    // 该成交本身就是一笔独立委托：编辑时把它补齐成 order_id = trade.id、序号 1
    expect(updated.orderId).toBe(trade.id)
    expect(updated.orderSeq).toBe(1)
    expect(getPosition(workspace.db, LEDGER, CODE).quantity).toBe(200)

    // 删除时把 orderId 当作单笔成交 ID（同一既有口径）
    deleteTradeOrder(workspace.db, { ledgerId: LEDGER, orderId: trade.id })
    expect(listTradesAsc(workspace.db, LEDGER, CODE)).toHaveLength(0)
    expect(positionOf(workspace, CODE)).toEqual([0, 0])
  })

  it('recalculates an edited fill with its own round fee snapshot', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 10_000_000)

    const open = createTradeWithRoundFee(workspace.db, {
      ...singleRequest({ tradeTime: T1 }),
      roundFee: ETF_ROUND_FEE,
    })
    expect(open.commission).toBe(50)

    // 系统配置改成万3 / 最低 5 元之后改手数：仍按本轮的万0.5 重算
    saveFeeSettings(workspace.db, LEDGER, {
      commissionRate: 0.0003,
      minCommission: 500,
      stampDutyRate: 0.0005,
      transferFeeRate: 0.00001,
    })
    const updated = updateTradeFill(workspace.db, {
      ledgerId: LEDGER,
      tradeId: open.id,
      priceMilli: 100_000,
      lots: 2,
      tradeTime: T1,
    })
    expect(updated.amount).toBe(2_000_000)
    expect(updated.commission).toBe(100)
    expect(updated.roundFee).toEqual(ETF_ROUND_FEE)
  })

  it('recalculates the whole order when one fill is edited', () => {
    const workspace = newWorkspace()
    const items = createXieheOrder(workspace)

    // 把第二笔成交价从 36.61 改为 36.91（卖出金额增加 30 元）
    const updated = updateTradeFill(workspace.db, {
      ledgerId: LEDGER,
      tradeId: items[1].id,
      priceMilli: 36_910,
      lots: 1,
      tradeTime: T2,
    })
    expect(updated.price).toBe(36_910)

    const trades = listTradesAsc(workspace.db, LEDGER, ORDER_CODE)
    let amount = 0
    let realized = 0
    for (const trade of trades) {
      if (trade.tradeType !== STOCK_TRADE_CLOSE) continue
      amount += trade.amount
      realized += trade.realizedPnl ?? 0
    }
    expect(amount).toBe(732_800 + 3_000)
    // 盈亏 = 原 -29,782 + 多卖 30,000 分 − 印花税多收 2 分
    expect(realized).toBe(-29_782 + 3_000 - 2)
  })

  it('edits a close fill when open and close share the same second', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 10_000_000)
    createTradeOrder(workspace.db, {
      ...orderRequest({
        stockCode: ORDER_CODE,
        stockName: ORDER_NAME,
        fills: [fill(100_000, 1)],
        tradeTime: T2,
      }),
    })
    const closeTrades = createTradeOrder(workspace.db, {
      ...orderRequest({
        stockCode: ORDER_CODE,
        stockName: ORDER_NAME,
        tradeType: STOCK_TRADE_CLOSE,
        fills: [fill(110_000, 1)],
        tradeTime: T2,
      }),
    })

    const updated = updateTradeFill(workspace.db, {
      ledgerId: LEDGER,
      tradeId: closeTrades[0].id,
      priceMilli: 120_000,
      lots: 1,
      tradeTime: T2,
    })
    expect(updated.price).toBe(120_000)
  })

  it('restores the position after deleting an order', () => {
    const workspace = newWorkspace()
    const items = createXieheOrder(workspace)

    deleteTradeOrder(workspace.db, { ledgerId: LEDGER, orderId: items[0].orderId })

    expect(positionOf(workspace, ORDER_CODE)).toEqual([200, 761_708])
    const trades = listTradesAsc(workspace.db, LEDGER, ORDER_CODE)
    expect(trades.every((trade) => trade.tradeType !== STOCK_TRADE_CLOSE)).toBe(true)
    const records = listAllFundRecords(workspace.db, LEDGER)
    expect(records.every((record) => record.eventType !== STOCK_EVENT_SELL)).toBe(true)
  })

  it('rolls back the impact preview and reports removed rounds', () => {
    const workspace = newWorkspace()
    const items = createXieheOrder(workspace)

    const impact = previewTradeChange(workspace.db, {
      ledgerId: LEDGER,
      action: 'delete_order',
      tradeId: '',
      orderId: items[0].orderId,
      priceMilli: 0,
      lots: 0,
      tradeTime: 0,
    })
    expect(impact.positionAfter).toBe(200)
    expect(impact.removedRounds).toHaveLength(1)
    expect(impact.removedRounds[0].roundNo).toBe(1)

    // 预演必须回滚：持仓与交易保持原样
    expect(listPositionRows(workspace.db, LEDGER).filter((row) => row.quantity > 0)).toHaveLength(0)
    expect(listTradesAsc(workspace.db, LEDGER, ORDER_CODE)).toHaveLength(3)
  })

  it('previews an edit without writing', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 10_000_000)
    const trade = createTrade(workspace.db, singleRequest({ lots: 2, tradeTime: T1 }))
    const before = getPosition(workspace.db, LEDGER, CODE)
    const recordsBefore = listAllFundRecords(workspace.db, LEDGER)

    const impact = previewTradeChange(workspace.db, {
      ledgerId: LEDGER,
      action: 'update_trade',
      tradeId: trade.id,
      orderId: '',
      priceMilli: 110_000,
      lots: 3,
      tradeTime: T1,
    })
    expect(impact.stockCode).toBe(CODE)
    expect(impact.stockName).toBe(NAME)
    expect(impact.positionAfter).toBe(300)
    // 110.00 元 × 300 股 = 33,000 元；佣金 7.77 + 过户费 0.33 = 8.10 元
    expect(impact.cashAfter).toBe(10_000_000 - 3_300_810)

    // 预演绝不能落库：成交、持仓、资金记录都是原样
    expect(getTrade(workspace.db, trade.id).price).toBe(100_000)
    expect(getPosition(workspace.db, LEDGER, CODE)).toMatchObject({
      quantity: before.quantity,
      totalCost: before.totalCost,
    })
    const recordsAfter = listAllFundRecords(workspace.db, LEDGER)
    expect(recordsAfter).toHaveLength(recordsBefore.length)
    expect(recordsAfter[0].amountChange).toBe(recordsBefore[0].amountChange)
  })

  it('rejects an unknown preview action with a 400', () => {
    const workspace = newWorkspace()
    const error = appError(() =>
      previewTradeChange(workspace.db, {
        ledgerId: LEDGER,
        action: 'noop',
        tradeId: '',
        orderId: '',
        priceMilli: 0,
        lots: 0,
        tradeTime: 0,
      }),
    )
    expect(error.message).toBe('无效的预演动作')
    expect(error.status).toBe(400)
  })

  it('validates ids, price and lots before touching the database', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 10_000_000)
    createTrade(workspace.db, singleRequest({ tradeTime: T1 }))

    const cases: Array<[string, number, () => unknown]> = [
      [
        'trade_id is required',
        400,
        () =>
          updateTradeFill(workspace.db, {
            ledgerId: LEDGER,
            tradeId: '',
            priceMilli: 100_000,
            lots: 1,
            tradeTime: 0,
          }),
      ],
      [
        '成交价必须大于 0',
        400,
        () =>
          updateTradeFill(workspace.db, {
            ledgerId: LEDGER,
            tradeId: 'whatever',
            priceMilli: 0,
            lots: 1,
            tradeTime: 0,
          }),
      ],
      [
        '手数必须大于 0',
        400,
        () =>
          updateTradeFill(workspace.db, {
            ledgerId: LEDGER,
            tradeId: 'whatever',
            priceMilli: 100_000,
            lots: 0,
            tradeTime: 0,
          }),
      ],
      ['order_id is required', 400, () => deleteTradeOrder(workspace.db, { ledgerId: LEDGER, orderId: '' })],
      [
        '交易记录不存在',
        404,
        () =>
          updateTradeFill(workspace.db, {
            ledgerId: LEDGER,
            tradeId: 'missing-trade',
            priceMilli: 100_000,
            lots: 1,
            tradeTime: 0,
          }),
      ],
      [
        '交易记录不存在',
        404,
        () => deleteTradeOrder(workspace.db, { ledgerId: LEDGER, orderId: 'missing-order' }),
      ],
    ]

    for (const [message, status, run] of cases) {
      const error = appError(run)
      expect(error.message).toBe(message)
      expect(error.status).toBe(status)
    }

    // 失败的编辑 / 删除都没有留下任何痕迹
    expect(listTradesAsc(workspace.db, LEDGER, CODE)).toHaveLength(1)
    expect(countFundRecords(workspace.db, LEDGER)).toBe(1)
    expect(getPosition(workspace.db, LEDGER, CODE).quantity).toBe(100)
  })

  it('is idempotent across consecutive replays', () => {
    const workspace = newWorkspace()
    const items = createXieheOrder(workspace)

    updateTradeFill(workspace.db, {
      ledgerId: LEDGER,
      tradeId: items[0].id,
      priceMilli: items[0].price,
      lots: items[0].lots,
      tradeTime: items[0].tradeTime,
    })
    const first = listTradesAsc(workspace.db, LEDGER, ORDER_CODE)
    const firstDetail = getTradeHistoryDetail(workspace.db, LEDGER, ORDER_CODE)

    updateTradeFill(workspace.db, {
      ledgerId: LEDGER,
      tradeId: items[0].id,
      priceMilli: items[0].price,
      lots: items[0].lots,
      tradeTime: items[0].tradeTime,
    })
    const second = listTradesAsc(workspace.db, LEDGER, ORDER_CODE)
    const secondDetail = getTradeHistoryDetail(workspace.db, LEDGER, ORDER_CODE)

    expect(first).toHaveLength(second.length)
    first.forEach((left, index) => {
      expect(left.id).toBe(second[index].id)
      expect(left.fee).toBe(second[index].fee)
      expect(left.roundId).toBe(second[index].roundId)
    })
    expect(firstDetail.totalPnl).toBe(secondDetail.totalPnl)
    expect(firstDetail.rounds).toHaveLength(secondDetail.rounds.length)
    expect(firstDetail.rounds[0].id).toBe(secondDetail.rounds[0].id)
    expect(firstDetail.totalPnl).toBe(-29_782)
  })

  it('keeps a round tag and review through a replay', () => {
    const workspace = newWorkspace()
    const items = createXieheOrder(workspace)

    const detail = getTradeHistoryDetail(workspace.db, LEDGER, ORDER_CODE)
    const roundId = detail.rounds[0].id
    updateTradeRoundTag(workspace.db, roundId, '打板')
    updateTradeRoundReview(workspace.db, roundId, '本次拆单卖出')

    updateTradeFill(workspace.db, {
      ledgerId: LEDGER,
      tradeId: items[1].id,
      priceMilli: 36_610,
      lots: 1,
      tradeTime: T2,
    })
    const after = getTradeHistoryDetail(workspace.db, LEDGER, ORDER_CODE)
    expect(after.rounds).toHaveLength(1)
    expect(after.rounds[0].id).toBe(roundId)
    expect(after.rounds[0].tag).toBe('打板')
    expect(after.rounds[0].review).toBe('本次拆单卖出')
  })

  it('counts a backdated trade in the cash chain before and after a replay', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 10_000_000)
    // 先按「今天」追加 5 万元，再补录一笔 2023 年的历史交易
    addPrincipalAtDate(workspace.db, LEDGER, 5_000_000, '2026-09-18')
    const trade = createTrade(
      workspace.db,
      singleRequest({ priceMilli: 10_000, lots: 10, tradeTime: T1 }),
    )

    const balanceOf = (eventType: string): number =>
      fundRecordOf(workspace, eventType).cashBalance
    const available = (): number => getAccountSummary(workspace.db, LEDGER).availableCash

    // 买入 10 手 @10.00 = 1,000,000 + 佣金 500 + 过户费 10 = 1,000,510
    expect(balanceOf(STOCK_EVENT_BUY)).toBe(10_000_000 - 1_000_510)
    expect(balanceOf(STOCK_EVENT_ADD_PRINCIPAL)).toBe(15_000_000 - 1_000_510)
    expect(available()).toBe(15_000_000 - 1_000_510)

    // 编辑成交（改为 11.00）后重放：整条链跟着走
    updateTradeFill(workspace.db, {
      ledgerId: LEDGER,
      tradeId: trade.id,
      priceMilli: 11_000,
      lots: 10,
      tradeTime: T1,
    })
    // 1,100,000 + 佣金 500 + 过户费 11 = 1,100,511
    expect(balanceOf(STOCK_EVENT_BUY)).toBe(10_000_000 - 1_100_511)
    expect(balanceOf(STOCK_EVENT_ADD_PRINCIPAL)).toBe(15_000_000 - 1_100_511)
    expect(available()).toBe(15_000_000 - 1_100_511)
  })

  it('matches the incremental state after a replay and is deterministic', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 10_000_000)

    // 建仓（一笔委托两笔成交）→ 加仓 → 减仓 → 清仓
    const open = createTradeOrder(workspace.db, {
      ...orderRequest({ fills: [fill(100_000, 1), fill(100_000, 1)], tag: '打板' }),
    })
    createTradeOrder(workspace.db, {
      ...orderRequest({ tradeType: STOCK_TRADE_ADD, fills: [fill(105_000, 1)], tradeTime: T2 }),
    })
    createTradeOrder(workspace.db, {
      ...orderRequest({
        tradeType: STOCK_TRADE_REDUCE,
        fills: [fill(120_000, 1)],
        tradeTime: T3,
      }),
    })
    createTradeOrder(workspace.db, {
      ...orderRequest({
        tradeType: STOCK_TRADE_CLOSE,
        fills: [fill(130_000, 2)],
        tradeTime: T4,
      }),
    })

    const incremental = derivedSnapshot(workspace.db, false)
    expect(incremental.trades).toHaveLength(5)
    expect(incremental.rounds).toHaveLength(1)
    expect(incremental.funds).toHaveLength(4)

    // 用一次无改动的编辑触发重放
    updateTradeFill(workspace.db, {
      ledgerId: LEDGER,
      tradeId: open[0].id,
      priceMilli: open[0].price,
      lots: open[0].lots,
      tradeTime: open[0].tradeTime,
    })
    const replayOne = derivedSnapshot(workspace.db, false)
    expect(replayOne).toEqual(incremental)

    // 第二次重放必须连资金记录的录入时间都一样（确定性）
    const replayOneDated = derivedSnapshot(workspace.db, true)
    updateTradeFill(workspace.db, {
      ledgerId: LEDGER,
      tradeId: open[0].id,
      priceMilli: open[0].price,
      lots: open[0].lots,
      tradeTime: open[0].tradeTime,
    })
    const replayTwoDated = derivedSnapshot(workspace.db, true)
    expect(replayTwoDated).toEqual(replayOneDated)

    // 现金链末条 = 本金 + Σ 非追加本金的变动
    const records = listAllFundRecords(workspace.db, LEDGER)
    const total = records.reduce(
      (sum, record) =>
        record.eventType === STOCK_EVENT_ADD_PRINCIPAL ? sum : sum + record.amountChange,
      10_000_000,
    )
    expect(records[records.length - 1].cashBalance).toBe(total)
  })

  it('stays consistent through create → edit → delete, and rollback skips the deleted target', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 10_000_000)

    const [trade] = createTradeOrder(workspace.db, {
      ...orderRequest({ fills: [fill(100_000, 1)], tradeTime: T1 }),
    })
    updateTradeFill(workspace.db, {
      ledgerId: LEDGER,
      tradeId: trade.id,
      priceMilli: 101_000,
      lots: 1,
      tradeTime: T1,
    })
    expect(positionOf(workspace, CODE)).toEqual([100, 1_010_510])
    expect(fundRecordOf(workspace, STOCK_EVENT_BUY).amountChange).toBe(-1_010_510)

    deleteTradeOrder(workspace.db, { ledgerId: LEDGER, orderId: trade.orderId })

    expect(listTradesAsc(workspace.db, LEDGER, CODE)).toHaveLength(0)
    expect(positionOf(workspace, CODE)).toEqual([0, 0])
    expect(listTradeRoundsByStock(workspace.db, LEDGER, CODE)).toHaveLength(0)
    expect(listTradeHistories(workspace.db, LEDGER)).toHaveLength(0)
    expect(countFundRecords(workspace.db, LEDGER)).toBe(0)
    // 删委托不是一次被记录的操作：记录仍在（指向空气），回滚时走"跳过"
    expect(listOperations(workspace.db, LEDGER)).toHaveLength(1)

    const result = rollbackLatest(workspace.db, LEDGER)
    expect(result.action).toBe('建仓')
    expect(result.skipped).toBe(true)
    expect(listOperations(workspace.db, LEDGER)).toHaveLength(0)
  })
})

describe('stock-trade-edit: rollback', () => {
  it('undoes an added principal and pops the log', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 1_000_000)
    const before = getAccountSummary(workspace.db, LEDGER)

    addPrincipal(workspace.db, LEDGER, 50_000)
    const after = getAccountSummary(workspace.db, LEDGER)
    expect(after.principal).toBe(before.principal + 50_000)
    expect(after.availableCash).toBe(before.availableCash + 50_000)
    expect(countFundRecords(workspace.db, LEDGER)).toBe(1)

    const operations = listOperations(workspace.db, LEDGER)
    expect(operations).toHaveLength(1)
    expect(operations[0].action).toBe('追加本金')
    expect(operations[0].detail).toBe('¥500.00')
    expect(operations[0].createdAt).toBeGreaterThan(0)
    expect(operations[0].id).not.toBe('')

    const result = rollbackLatest(workspace.db, LEDGER)
    expect(result.action).toBe('追加本金')
    expect(result.skipped).toBe(false)

    const restored = getAccountSummary(workspace.db, LEDGER)
    expect(restored.principal).toBe(before.principal)
    expect(restored.availableCash).toBe(before.availableCash)
    expect(countFundRecords(workspace.db, LEDGER)).toBe(0)
    expect(listOperations(workspace.db, LEDGER)).toHaveLength(0)
  })

  it('previews a fund rollback without writing or popping the log', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 1_000_000)
    addPrincipal(workspace.db, LEDGER, 50_000)
    const before = getAccountSummary(workspace.db, LEDGER)

    const preview = previewRollback(workspace.db, LEDGER)
    expect(preview.action).toBe('追加本金')
    expect(preview.detail).toBe('¥500.00')
    expect(preview.removedRounds).toEqual([])

    // 资金类操作没有轮次影响，但预演同样不能改本金 / 删记录 / 弹栈
    expect(getAccountSummary(workspace.db, LEDGER).principal).toBe(before.principal)
    expect(countFundRecords(workspace.db, LEDGER)).toBe(1)
    expect(listOperations(workspace.db, LEDGER)).toHaveLength(1)
  })

  it('undoes a withdraw and an interest without touching the principal', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 1_000_000)
    const principal = getAccountSummary(workspace.db, LEDGER).principal

    addInterest(workspace.db, LEDGER, 12_345)
    const afterInterest = getAccountSummary(workspace.db, LEDGER)
    expect(afterInterest.principal).toBe(principal)
    expect(listOperations(workspace.db, LEDGER)[0].action).toBe('利息归本')

    rollbackLatest(workspace.db, LEDGER)
    const restoredInterest = getAccountSummary(workspace.db, LEDGER)
    expect(restoredInterest.availableCash).toBe(afterInterest.availableCash - 12_345)
    expect(restoredInterest.principal).toBe(principal)
    expect(countFundRecords(workspace.db, LEDGER)).toBe(0)

    withdraw(workspace.db, LEDGER, 5_000)
    const afterWithdraw = getAccountSummary(workspace.db, LEDGER)
    expect(listOperations(workspace.db, LEDGER)[0].action).toBe('支取')

    rollbackLatest(workspace.db, LEDGER)
    const restoredWithdraw = getAccountSummary(workspace.db, LEDGER)
    expect(restoredWithdraw.availableCash).toBe(afterWithdraw.availableCash + 5_000)
    expect(restoredWithdraw.principal).toBe(principal)
    expect(countFundRecords(workspace.db, LEDGER)).toBe(0)
  })

  it('undoes a trade order', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 10_000_000)
    createTrade(workspace.db, singleRequest({ lots: 3, tradeTime: T1 }))
    expect(positionOf(workspace, CODE)[0]).toBe(300)
    expect(countFundRecords(workspace.db, LEDGER)).toBe(1)

    const operations = listOperations(workspace.db, LEDGER)
    expect(operations).toHaveLength(1)
    expect(operations[0].action).toBe('建仓')
    expect(operations[0].detail).toBe('浦发银行 600000 · 3 手 · ¥30000.00')

    const result = rollbackLatest(workspace.db, LEDGER)
    expect(result.action).toBe('建仓')
    expect(result.skipped).toBe(false)

    expect(positionOf(workspace, CODE)).toEqual([0, 0])
    expect(countFundRecords(workspace.db, LEDGER)).toBe(0)
    expect(listTradesAsc(workspace.db, LEDGER, CODE)).toHaveLength(0)
    expect(listOperations(workspace.db, LEDGER)).toHaveLength(0)
  })

  it('pops one operation at a time', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 10_000_000)
    createTrade(workspace.db, singleRequest({ lots: 3, tradeTime: T1 }))
    createTrade(
      workspace.db,
      singleRequest({ tradeType: STOCK_TRADE_REDUCE, priceMilli: 120_000, lots: 1, tradeTime: T2 }),
    )
    expect(positionOf(workspace, CODE)[0]).toBe(200)

    const operations = listOperations(workspace.db, LEDGER)
    expect(operations).toHaveLength(2)
    expect(operations[0].action).toBe('减仓')
    expect(operations[1].action).toBe('建仓')

    // 第一次回滚撤销「减仓」：持仓回到 300，记录只剩「建仓」
    const first = rollbackLatest(workspace.db, LEDGER)
    expect(first.action).toBe('减仓')
    expect(positionOf(workspace, CODE)[0]).toBe(300)
    const left = listOperations(workspace.db, LEDGER)
    expect(left).toHaveLength(1)
    expect(left[0].action).toBe('建仓')

    // 第二次回滚撤销「建仓」：持仓归零，记录清空
    const second = rollbackLatest(workspace.db, LEDGER)
    expect(second.action).toBe('建仓')
    expect(positionOf(workspace, CODE)).toEqual([0, 0])
    expect(listOperations(workspace.db, LEDGER)).toHaveLength(0)
  })

  it('is a bad request when there is nothing to roll back', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 1_000_000)

    const rollbackError = appError(() => rollbackLatest(workspace.db, LEDGER))
    expect(rollbackError.status).toBe(400)
    expect(rollbackError.message).toBe('没有可回滚的操作')

    const previewError = appError(() => previewRollback(workspace.db, LEDGER))
    expect(previewError.status).toBe(400)
    expect(previewError.message).toBe('没有可回滚的操作')
  })

  it('skips when the target is already gone', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 10_000_000)
    createTrade(workspace.db, singleRequest({ lots: 3, tradeTime: T1 }))

    // 用「删除整笔委托」把目标拿掉：这不是一次被记录的操作，记录因此指向空气
    const orderId = listTradesAsc(workspace.db, LEDGER, CODE)[0].orderId
    deleteTradeOrder(workspace.db, { ledgerId: LEDGER, orderId })

    const result = rollbackLatest(workspace.db, LEDGER)
    expect(result.action).toBe('建仓')
    expect(result.skipped).toBe(true)
    // 记录要弹掉，否则一条死记录会把栈顶卡住
    expect(listOperations(workspace.db, LEDGER)).toHaveLength(0)
  })

  it('lists lost rounds in the rollback preview and never writes', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 10_000_000)
    closeRoundHelper(workspace.db, CODE, NAME, 100_000, 120_000)
    const detail = getTradeHistoryDetail(workspace.db, LEDGER, CODE)
    updateTradeRoundReview(workspace.db, detail.rounds[0].id, '本轮复盘原文')

    const operationsBefore = listOperations(workspace.db, LEDGER)
    expect(operationsBefore).toHaveLength(2)
    const fingerprint = stockFingerprint(workspace.db)

    const preview = previewRollback(workspace.db, LEDGER)
    expect(preview.action).toBe('清仓')
    expect(preview.removedRounds).toHaveLength(1)
    expect(preview.removedRounds[0].roundNo).toBe(1)
    expect(preview.removedRounds[0].hasReview).toBe(true)

    // 预演绝不落库：行数、轮次标签/复盘、本金一个都没动，记录也没被弹掉
    expect(stockFingerprint(workspace.db)).toBe(fingerprint)
    expect(listOperations(workspace.db, LEDGER)).toHaveLength(operationsBefore.length)
  })

  it('removes the round and its review when rolling back a close', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 10_000_000)
    closeRoundHelper(workspace.db, CODE, NAME, 100_000, 120_000)
    const detail = getTradeHistoryDetail(workspace.db, LEDGER, CODE)
    updateTradeRoundReview(workspace.db, detail.rounds[0].id, '本轮复盘原文')

    const result = rollbackLatest(workspace.db, LEDGER)
    expect(result.action).toBe('清仓')
    expect(result.skipped).toBe(false)

    // 清仓被撤销后该轮次不再成立：轮次行随之消失（正是确认框要说明的"复盘会丢"）
    expect(listTradeRoundsByStock(workspace.db, LEDGER, CODE)).toHaveLength(0)
    expect(getPosition(workspace.db, LEDGER, CODE).quantity).toBe(1000)
    expect(listOperations(workspace.db, LEDGER)[0].action).toBe('建仓')
  })
})

describe('stock-trade-edit: day reviews follow the round through replay', () => {
  it('keeps day reviews on the same round after an edit', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 10_000_000)
    const openedOn = seedOpenPosition(workspace, CODE, NAME, 10)
    insertDayReview(workspace.db, CODE, '', openedOn, '盘前计划', T1)
    createTrade(
      workspace.db,
      singleRequest({
        tradeType: STOCK_TRADE_CLOSE,
        priceMilli: 12_000,
        lots: 10,
        tradeTime: nowSeconds(),
      }),
    )

    const detail = getTradeHistoryDetail(workspace.db, LEDGER, CODE)
    const roundId = detail.rounds[0].id
    expect(detail.rounds[0].dayReviews).toHaveLength(1)

    // 改清仓成交价 → 重放复用同一轮次，每日复盘原样保留
    const closeTrade = detail.rounds[0].trades.find(
      (trade) => trade.tradeType === STOCK_TRADE_CLOSE,
    )
    expect(closeTrade).toBeDefined()
    updateTradeFill(workspace.db, {
      ledgerId: LEDGER,
      tradeId: closeTrade!.id,
      priceMilli: 12_500,
      lots: 10,
      tradeTime: closeTrade!.tradeTime,
    })
    const replayed = getTradeHistoryDetail(workspace.db, LEDGER, CODE)
    expect(replayed.rounds[0].id).toBe(roundId)
    expect(replayed.rounds[0].dayReviews).toHaveLength(1)
    expect(replayed.rounds[0].dayReviews[0].review).toBe('盘前计划')

    // 删除清仓委托 → 该轮不再成立：每日复盘与轮次一起消失；预演先说清楚
    const preview = previewTradeChange(workspace.db, {
      ledgerId: LEDGER,
      action: 'delete_order',
      tradeId: '',
      orderId: closeTrade!.orderId,
      priceMilli: 0,
      lots: 0,
      tradeTime: 0,
    })
    expect(preview.removedRounds).toHaveLength(1)
    expect(preview.removedRounds[0].dayReviewCount).toBe(1)

    deleteTradeOrder(workspace.db, { ledgerId: LEDGER, orderId: closeTrade!.orderId })
    expect(() => getTradeHistoryDetail(workspace.db, LEDGER, CODE)).toThrow(AppError)
    expect(dayReviewRows(workspace.db, CODE)).toHaveLength(0)
  })

  it('never steals the open round day reviews during a replay', () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 10_000_000)

    // 第一轮：建仓 → 写每日复盘 → 清仓（此时挂到第一轮）
    const firstOpenedOn = seedOpenPosition(workspace, CODE, NAME, 10)
    insertDayReview(workspace.db, CODE, '', firstOpenedOn, '第一轮的复盘', T1)
    createTrade(
      workspace.db,
      singleRequest({
        tradeType: STOCK_TRADE_CLOSE,
        priceMilli: 12_000,
        lots: 10,
        tradeTime: nowSeconds() - 86_400,
      }),
    )
    const detail = getTradeHistoryDetail(workspace.db, LEDGER, CODE)
    expect(detail.rounds[0].dayReviews).toHaveLength(1)

    // 第二轮（当前持仓）：写今天的每日复盘
    createTrade(
      workspace.db,
      singleRequest({
        priceMilli: 13_000,
        lots: 10,
        tradeTime: nowSeconds(),
      }),
    )
    insertDayReview(workspace.db, CODE, '', unixToDate(nowSeconds()), '第二轮今天', nowSeconds())

    // 改第一轮清仓成交价 → 重放（会重建轮次与资金记录）
    const closeTrade = detail.rounds[0].trades.find(
      (trade) => trade.tradeType === STOCK_TRADE_CLOSE,
    )
    expect(closeTrade).toBeDefined()
    updateTradeFill(workspace.db, {
      ledgerId: LEDGER,
      tradeId: closeTrade!.id,
      priceMilli: 12_500,
      lots: 10,
      tradeTime: closeTrade!.tradeTime,
    })

    // 第一轮还是只有自己那一篇；当前轮的今天那篇仍属于当前轮
    const replayed = getTradeHistoryDetail(workspace.db, LEDGER, CODE)
    expect(replayed.rounds).toHaveLength(1)
    expect(replayed.rounds[0].dayReviews).toHaveLength(1)
    expect(replayed.rounds[0].dayReviews[0].review).toBe('第一轮的复盘')

    const currentRows = dayReviewRows(workspace.db, CODE).filter((row) => row.round_id === '')
    expect(currentRows).toHaveLength(1)
    expect(currentRows[0].review).toBe('第二轮今天')
  })
})

