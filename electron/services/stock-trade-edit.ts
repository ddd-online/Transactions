/**
 * 股票成交编辑 / 委托删除 / 整体重放 / 回滚 —— 一个意图 = 一个事务。
 *
 * 成交编辑 / 委托删除 / 重放
 * 与「回滚」段：
 *
 * * `update_trade_fill` / `update_trade_fill_tx`：改一笔成交，按当前费用重算**所属委托**的
 *   全部费用后分摊，再整体重放；
 * * `delete_trade_order` / `delete_trade_order_tx`：删掉整笔委托的成交后整体重放；
 * * `preview_trade_change` / `preview_rollback`：在事务里**真的执行改动**、比对前后差异，
 *   最后用哨兵错误强制回滚 —— **绝不落库**；
 * * `rebuild_trades` / `flush_replay_order`：按 `(trade_time, created_at, order_seq, id)` 的
 *   规范顺序重建成交的派生数据（持仓、轮次、历史集合、买卖资金记录、现金链）；
 * * `rollback_latest`：弹掉最新一条操作记录并撤销它（委托类复用"删委托"，资金类删那条
 *   资金记录，追加本金还要把本金改回去）。
 *
 * ## 事务边界
 *
 * 校验（空 ID / 价格 / 手数）在事务**之前**；改动 + 重放 + 现金链复算全在**同一个事务**里。
 * 预演与真写走的是同一段事务代码（预演只是最后抛哨兵回滚），所以"预演看到的影响"就是
 * "真做之后的影响"。
 *
 * ## 重放为什么是幂等的
 *
 * * 轮次行按「股票 + 轮次序号」**复用原 ID**（标签 / 复盘原样保留），重放结束后才删除不再
 *   成立的轮次（连带它的每日复盘）；
 * * 买卖资金记录的 `created_at` 在重放里被拉成严格递增（`max(原值, 上一条 + 1)`），
 *   链序确定，连续两次重放结果完全一致（不同秒的原值保持不变）；
 * * 成交本身的 ID 不重建：重放只回写 `round_id` / `realized_pnl` 与持仓，
 *   所以"重放 vs 增量写入"的派生值必须一致。
 *
 * ## 操作记录不参与重放
 *
 * 操作记录（`stock_operation`）是**追加式**的正向操作日志，不是由成交推导出来的派生数据；
 * 既有重放从不碰它（只有回滚会弹掉栈顶那一条），这里保持一致。删委托 / 改成交本身也不记
 * 操作记录（既有同样不记）。
 *
 * ## 没有随本切片移植的部分
 *
 * `repair_source_trade_fund_dates`（数据按本地时区订正资金记录日期）与它的 `day_after` /
 * `has_source_trade_fund_date` 属独立的数据维护路径，不在编辑 / 删除 / 回滚语义里。
 *
 * ## 与既有的唯一结构差异
 *
 * `stock-trade-write.ts` 里的若干小工具（`instrument_of` / `cost_basis_of` /
 * `trade_order_remark` / `RoundFee ↔ StockFeeSetting`）在既有是同一模块的私有函数；本切片
 * 不改动那个文件，所以这里按**逐字相同**的口径各留一份。两处一旦分叉，下单与重放算出来的
 * 费用 / 备注就会对不上 —— 新增口径请同时改两边（或把它们收进 `shared/domain`）。
 */

import { randomUUID } from 'node:crypto'

import {
  STOCK_EVENT_ADD_PRINCIPAL,
  STOCK_EVENT_BUY,
  STOCK_EVENT_SELL,
  STOCK_OP_KIND_FUND,
  STOCK_OP_KIND_ORDER,
  STOCK_TAG_ANALYSIS,
  STOCK_TRADE_CLOSE,
} from '../../shared/domain/consts'
import {
  type Instrument,
  allocateOrderFee,
  computeOrderFee,
  instrumentOf as feeInstrumentOf,
} from '../../shared/domain/fee'
import { milliToYuan } from '../../shared/domain/money'
import type { RoundFee, StockFeeSetting, StockTrade } from '../../shared/domain/models'
import { amountOf, isBuy, sharesOf } from '../../shared/domain/stock'
import { AppError } from '../../shared/errors'
import type { StockFundRecord } from '../../shared/types/stock'
import type { StockTradeDto } from '../../shared/types/stock-history'
import type {
  DeleteTradeOrderRequest,
  PreviewTradeChangeRequest,
  StockOperationRollbackDto,
  StockOperationRollbackPreviewDto,
  StockTradeImpactDto,
  StockTradeImpactRoundDto,
  UpdateTradeFillRequest,
} from '../../shared/types/stock-trade-edit'
import type { Db } from '../db/driver'
import {
  createFundRecord,
  deleteFundRecord,
  deleteOperation,
  deleteTradeFundRecords,
  getFundRecord,
  latestOperation,
  listAllFundRecords,
  queryLatestFundRecord,
} from '../db/dao/stock-fund'
import {
  type StockPosition,
  type StockTradeHistory,
  type StockTradeRound,
  createPosition,
  createTradeHistory,
  createTradeRound,
  deleteTradeHistoriesByLedger,
  deleteTradeRound,
  deleteTradesByIds,
  getPosition,
  getTrade,
  listAllTradesAsc,
  listPositions,
  listTradeHistories,
  listTradeRounds,
  listTradesByOrder,
  updatePosition,
  updateTrade,
  updateTradeRoundDerived,
  updateTradesRoundId,
  updateTradeSettlement,
} from '../db/dao/stock-trade'
import { updateAccountPrincipal } from '../db/dao/stock-settings'
import { logError } from '../logging'
import {
  getOrCreateAccount,
  getOrCreateFeeSetting,
  recalculateCashChain,
  unixToDate,
} from './stock-account'

// ---------------------------------------------------------------- 预演哨兵

/**
 * 预演专用哨兵文案：事务内执行改动后强制回滚，**不对外暴露**（与既有
 * `ERR_PREVIEW_ROLLBACK` 同一个字符串）。
 */
const PREVIEW_ROLLBACK = 'trade impact preview rollback'

/** 既有 `is_not_found`：404 = 目标不存在（回滚时据此区分"跳过"与真错误）。 */
function isNotFound(error: unknown): boolean {
  return error instanceof AppError && error.status === 404
}

/** 预演哨兵（不是 `AppError`：它不该被当成业务失败暴露给调用方）。 */
function previewSentinel(): Error {
  return new Error(PREVIEW_ROLLBACK)
}

function isPreviewSentinel(error: unknown): boolean {
  return error instanceof Error && error.message === PREVIEW_ROLLBACK
}

// ---------------------------------------------------------------- 小工具（与下单切片同一口径）

/** 成交所属委托 ID；存量数据未标记委托时以自身为独立委托（既有 `order_key_of`）。 */
function orderKeyOf(trade: StockTrade): string {
  return trade.orderId === '' ? trade.id : trade.orderId
}

/** 轮次索引键：股票 + 轮次序号（既有 `round_meta_key`）。 */
function roundMetaKey(stockCode: string, roundNo: number): string {
  return `${stockCode}#${roundNo}`
}

/** `f64::round`：四舍五入、远离零。JS `Math.round` 对负数半值朝 +∞，不能直接用。 */
function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value)
}

/**
 * 减仓按剩余总成本的比例结转成本（四舍五入到分），避免整除截断造成已实现盈亏偏差。
 *
 * `shares == 0`（清仓时只归档那一笔 0 手标记成交）或没有持仓时直接 0。
 */
function costBasisOf(totalCost: number, shares: number, quantity: number): number {
  if (shares <= 0 || quantity <= 0) return 0
  return roundHalfAwayFromZero((totalCost * shares) / quantity)
}

/**
 * 品种判定（决定收哪些费）：老数据里可能存着不在支持范围的代码（例如北交所），
 * 这种记录按**深市股票**处理 —— 与引入品种之前的默认行为一致，不让一条历史记录把
 * 整轮重放 / 编辑打断（既有 `instrument_of`）。
 */
function instrumentOf(stockCode: string): Instrument {
  return feeInstrumentOf(stockCode) ?? 'shenzhenStock'
}

/** 折成费用算法要的形态（既有 `RoundFee::to_setting`；`id` / `ledgerId` 留空）。 */
function settingOfRoundFee(round: RoundFee): StockFeeSetting {
  return {
    id: '',
    ledgerId: '',
    commissionRate: round.commissionRate,
    minCommission: round.minCommission,
    stampDutyRate: round.stampDutyRate,
    transferFeeRate: round.transferFeeRate,
    createdAt: 0,
    updatedAt: 0,
  }
}

/** 生成资金记录备注：均价 + 笔数（单笔委托退化为「名称 N手 @ 价格」）。 */
function tradeOrderRemark(
  stockName: string,
  totalLots: number,
  totalAmount: number,
  count: number,
): string {
  const shares = sharesOf(totalLots)
  // 均价从**分**回到**厘**：`totalAmount / shares` 是分/股，价格口径是厘/股
  const avgPriceMilli = shares > 0 ? roundHalfAwayFromZero((totalAmount * 10) / shares) : 0
  if (count <= 1) {
    return `${stockName} ${totalLots}手 @ ${milliToYuan(avgPriceMilli)}`
  }
  return `${stockName} ${totalLots}手 @ ${milliToYuan(avgPriceMilli)}（${count}笔成交）`
}

/** 成交 → wire 形状（`roundFee` 省略 = 老数据，按账本系统配置）。 */
function tradeDto(trade: StockTrade): StockTradeDto {
  const dto: StockTradeDto = {
    id: trade.id,
    ledgerId: trade.ledgerId,
    stockCode: trade.stockCode,
    stockName: trade.stockName,
    tradeType: trade.tradeType,
    roundId: trade.roundId,
    orderId: trade.orderId,
    orderSeq: trade.orderSeq,
    price: trade.price,
    lots: trade.lots,
    shares: trade.shares,
    amount: trade.amount,
    fee: trade.fee,
    commission: trade.commission,
    stampDuty: trade.stampDuty,
    transferFee: trade.transferFee,
    realizedPnl: trade.realizedPnl,
    tradeTime: trade.tradeTime,
    remark: trade.remark,
  }
  if (trade.roundFee) dto.roundFee = trade.roundFee
  return dto
}

// ---------------------------------------------------------------- 每日复盘（DAO 尚未移植）

/**
 * 每个轮次的每日复盘条数（`round_id` 非空）：影响预演据此说明"这一轮会丢几篇"。
 *
 * 每日复盘的 DAO 尚未随本切片移植：按既有 DAO 的同一条 SQL（表 / 列 / 分组口径逐字一致）就地读。
 * 值一律 `?`，只拼接常量。
 */
function countDayReviewsByRounds(db: Db, ledgerId: string): Array<[string, number]> {
  const rows = db
    .prepare(
      'SELECT round_id, COUNT(*) AS count FROM stock_day_review ' +
        "WHERE ledger_id = ? AND round_id <> '' GROUP BY round_id",
    )
    .all(ledgerId) as unknown as Array<{ round_id: string; count: number }>
  return rows.map((row) => [row.round_id, row.count])
}

/** 轮次不再成立（重放删掉了它）时，该轮的每日复盘一起删掉 —— 与轮次复盘同命。 */
function deleteDayReviewsByRound(db: Db, roundId: string): void {
  db.prepare('DELETE FROM stock_day_review WHERE round_id = ?').run(roundId)
}

// ---------------------------------------------------------------- 轮次索引 / 影响预演

/**
 * 读取当前轮次索引（用于比对编辑 / 删除后哪些轮次会失效），既有 `round_meta_index`。
 *
 * 键 = `股票#轮次序号`；股票名取自交易历史集合（没有历史集合时为空串）。
 */
function roundMetaIndex(
  db: Db,
  ledgerId: string,
): Map<string, StockTradeImpactRoundDto> {
  const rounds = listTradeRounds(db, ledgerId)
  const histories = listTradeHistories(db, ledgerId)
  const stockNames = new Map<string, string>()
  for (const history of histories) {
    stockNames.set(history.stockCode, history.stockName)
  }
  // 每轮的每日复盘条数：轮次不再成立时它们也会一起删，影响预演要说得出这件事。
  const dayCounts = new Map<string, number>(countDayReviewsByRounds(db, ledgerId))

  const index = new Map<string, StockTradeImpactRoundDto>()
  for (const round of rounds) {
    index.set(roundMetaKey(round.stockCode, round.roundNo), {
      roundId: round.id,
      stockCode: round.stockCode,
      stockName: stockNames.get(round.stockCode) ?? '',
      roundNo: round.roundNo,
      tag: round.tag,
      hasReview: round.review.trim() !== '',
      dayReviewCount: dayCounts.get(round.id) ?? 0,
    })
  }
  return index
}

/** 失效轮次的排序：股票代码 → 轮次序号（既有 `sort_by`）。 */
function sortImpactRounds(rounds: StockTradeImpactRoundDto[]): void {
  rounds.sort((left, right) => {
    if (left.stockCode !== right.stockCode) return left.stockCode < right.stockCode ? -1 : 1
    return left.roundNo - right.roundNo
  })
}

// ---------------------------------------------------------------- 成交编辑 / 委托删除

/**
 * 事务内编辑一笔成交并重放，返回该成交所属股票代码（既有 `update_trade_fill_tx`）。
 *
 * 用**这一笔自己的本轮快照**重算（本轮内费率不可改）；老数据（NULL）退回账本系统配置 ——
 * 与它当初被算出来时的口径一致。费用按**委托**重算一次再分摊到各笔，然后整体重放。
 */
function updateTradeFillTx(
  db: Db,
  ledgerId: string,
  tradeId: string,
  priceMilli: number,
  lots: number,
  tradeTime: number,
): string {
  let trade: StockTrade
  try {
    trade = getTrade(db, tradeId)
  } catch (error) {
    if (isNotFound(error)) throw new AppError('交易记录不存在', { status: 404 })
    throw error
  }
  if (trade.ledgerId !== ledgerId) {
    throw new AppError('交易记录不存在', { status: 404 })
  }

  const orderId = orderKeyOf(trade)
  let orderTrades = listTradesByOrder(db, ledgerId, orderId)
  if (orderTrades.length === 0) {
    // 既有未回填委托的历史数据：该成交本身就是一笔独立委托
    orderTrades = [{ ...trade, orderId, orderSeq: 1 }]
  }

  // 用**这一笔自己的本轮快照**重算（本轮内费率不可改）；老数据（NULL）退回账本系统配置
  const feeSetting = trade.roundFee
    ? settingOfRoundFee(trade.roundFee)
    : getOrCreateFeeSetting(db, ledgerId)
  const instrument = instrumentOf(trade.stockCode)
  const buy = isBuy(trade.tradeType)

  const amounts: number[] = []
  for (const item of orderTrades) {
    if (item.id === tradeId) {
      item.price = priceMilli
      item.lots = lots
      item.shares = sharesOf(lots)
    }
    if (tradeTime > 0) item.tradeTime = tradeTime
    item.amount = amountOf(item.price, item.shares)
    amounts.push(item.amount)
  }

  // 委托级一次计收（最低佣金按委托）；印花税与过户费逐笔取整再相加
  const allocated = allocateOrderFee(
    computeOrderFee(amounts, instrument, feeSetting, buy),
    amounts,
    instrument,
    feeSetting,
    buy,
  )
  orderTrades.forEach((item, index) => {
    item.fee = allocated[index].total
    item.commission = allocated[index].commission
    item.stampDuty = allocated[index].stampDuty
    item.transferFee = allocated[index].transferFee
    updateTrade(db, item)
  })

  rebuildTrades(db, ledgerId)
  return trade.stockCode
}

/**
 * 事务内删除整笔委托并重放，返回被删委托所属股票代码（既有 `delete_trade_order_tx`）。
 */
function deleteTradeOrderTx(db: Db, ledgerId: string, orderId: string): string {
  if (orderId === '') {
    throw new AppError('order_id is required', { status: 400 })
  }
  let trades = listTradesByOrder(db, ledgerId, orderId)
  if (trades.length === 0) {
    // 既有未回填委托的历史数据：把 orderId 当作单笔交易 ID
    let trade: StockTrade
    try {
      trade = getTrade(db, orderId)
    } catch (error) {
      if (isNotFound(error)) throw new AppError('交易记录不存在', { status: 404 })
      throw error
    }
    if (trade.ledgerId !== ledgerId) {
      throw new AppError('交易记录不存在', { status: 404 })
    }
    trades = [trade]
  }

  const stockCode = trades[0].stockCode
  const ids = trades.map((trade) => trade.id)
  deleteTradesByIds(db, ids)
  rebuildTrades(db, ledgerId)
  return stockCode
}

// ---------------------------------------------------------------- 整体重放

/** 重放过程中累积的一笔委托（既有 `ReplayOrder`）。 */
interface ReplayOrder {
  key: string
  stockCode: string
  stockName: string
  isBuy: boolean
  /** 是不是**清仓**委托：只有它把本轮收尾归档（减仓减到 0 手也不归档）。 */
  isClose: boolean
  amount: number
  fee: number
  lots: number
  netPnl: number
  firstTime: number
  lastTime: number
  createdAt: number
  indexes: number[]
}

/** 重放过程中的可变状态（既有 `rebuild_trades` 里的那几个 map + `last_record_created_at`）。 */
interface ReplayState {
  positions: Map<string, StockPosition>
  histories: Map<string, StockTradeHistory>
  roundCounts: Map<string, number>
  cycleOpenedAt: Map<string, number>
  cycleIndexes: Map<string, number[]>
  roundMeta: Map<string, StockTradeRound>
  usedRounds: Set<string>
  lastRecordCreatedAt: number
}

/**
 * 按交易流重放，重建持仓、买卖资金记录、轮次与已实现盈亏等派生数据。
 *
 * 费用沿用各笔已存的值（被编辑的委托已在调用前重算），因此重放不会改写历史费用；
 * 轮次标签 / 复盘按「股票 + 轮次序号」继承，持仓复盘草稿按股票继承。
 * 每日复盘挂在轮次 id 上：轮次行复用则原样保留；轮次不再成立的，随轮次一起删。
 * 重放**不挂接**未挂接的每日复盘：`round_id = ''` 的行只属于"当前还没归档的那一轮"，
 * 而重放里被结束的轮次在当初清仓时就已经挂接过了 —— 在这里再挂一次会把持仓期的复盘
 * 错挂到历史轮次上。
 *
 * **私有**：重放是写入路径的内部步骤（下单 / 改成交 / 删委托 / 回滚各调一次），不是对外
 * interface —— 它收 `Db`，一旦公开就等于让调用方替这里操心事务边界与调用顺序。
 */
function rebuildTrades(db: Db, ledgerId: string): void {
  const trades = listAllTradesAsc(db, ledgerId).sort((left, right) => {
    if (left.tradeTime !== right.tradeTime) return left.tradeTime - right.tradeTime
    if (left.createdAt !== right.createdAt) return left.createdAt - right.createdAt
    const buyOrder = Number(isBuy(right.tradeType)) - Number(isBuy(left.tradeType))
    if (buyOrder !== 0) return buyOrder
    return left.id.localeCompare(right.id)
  })

  const existingRounds = listTradeRounds(db, ledgerId)
  const roundMeta = new Map<string, StockTradeRound>()
  for (const round of existingRounds) {
    roundMeta.set(roundMetaKey(round.stockCode, round.roundNo), round)
  }
  const existingPositions = listPositions(db, ledgerId)

  // 清空派生数据：买卖资金记录、历史集合与轮次；本金 / 追加 / 支取记录保留
  deleteTradeFundRecords(db, ledgerId)
  deleteTradeHistoriesByLedger(db, ledgerId)

  const positions = new Map<string, StockPosition>()
  for (const position of existingPositions) {
    positions.set(position.stockCode, {
      ...position,
      quantity: 0,
      totalCost: 0,
      realizedPnl: 0,
    })
  }

  const state: ReplayState = {
    positions,
    histories: new Map(),
    roundCounts: new Map(),
    cycleOpenedAt: new Map(),
    cycleIndexes: new Map(),
    roundMeta,
    // 轮次行按「股票 + 轮次序号」复用，保留原 ID、标签与复盘；重放结束后删除不再成立的轮次
    usedRounds: new Set(),
    // 把当前保留记录（本金 / 追加 / 支取）的最大时间戳作为重放起点，让重放记录排在其后。
    // （`createFundRecord` 已在 DAO 层保证新记录时间戳严格递增，这里仅用于重放路径。）
    lastRecordCreatedAt: listAllFundRecords(db, ledgerId).reduce(
      (max, record) => Math.max(max, record.createdAt),
      0,
    ),
  }

  let current: ReplayOrder | null = null

  for (let index = 0; index < trades.length; index += 1) {
    // 委托键：与当前委托不同则先冲刷上一笔委托，再以**本笔自己的键**开新委托
    const key = orderKeyOf(trades[index])
    const needsFlush = current === null || current.key !== key
    if (needsFlush) {
      flushReplayOrder(db, ledgerId, current, trades, state)
      const trade = trades[index]
      current = {
        key,
        stockCode: trade.stockCode,
        stockName: trade.stockName,
        isBuy: isBuy(trade.tradeType),
        isClose: trade.tradeType === STOCK_TRADE_CLOSE,
        amount: 0,
        fee: 0,
        lots: 0,
        netPnl: 0,
        firstTime: trade.tradeTime,
        lastTime: 0,
        createdAt: trade.createdAt,
        indexes: [],
      }
    }

    {
      const trade = trades[index]
      const order = current
      if (!order) throw new AppError('重放前未建立当前委托', { status: 500 })
      if (trade.stockName !== '') order.stockName = trade.stockName
      order.amount += trade.amount
      order.fee += trade.fee
      order.lots += trade.lots
      order.lastTime = trade.tradeTime
      order.indexes.push(index)

      if (!state.positions.has(trade.stockCode)) {
        const position: StockPosition = {
          id: randomUUID(),
          ledgerId,
          stockCode: trade.stockCode,
          stockName: trade.stockName,
          quantity: 0,
          totalCost: 0,
          realizedPnl: 0,
          review: '',
          tag: '',
          createdAt: 0,
          updatedAt: 0,
        }
        createPosition(db, position)
        state.positions.set(trade.stockCode, position)
      }
    }

    const isBuyTrade = isBuy(trades[index].tradeType)
    const stockCode = trades[index].stockCode
    const shares = trades[index].shares
    const amount = trades[index].amount
    const fee = trades[index].fee
    const tradeTime = trades[index].tradeTime
    const orderStockName = current?.stockName ?? ''

    trades[index].roundId = ''
    trades[index].realizedPnl = null

    const position = state.positions.get(stockCode)
    if (!position) throw new AppError('重放前已确保持仓存在', { status: 500 })
    if (orderStockName !== '') position.stockName = orderStockName

    if (isBuyTrade) {
      // 新一轮的起点 = **本轮还没开始**（`cycleIndexes` 里没有这只票），不是"持仓为 0"：
      // 减仓减到 0 手之后这一轮还在（要等清仓才归档），再买属于本轮加仓 ——
      // 按持仓为 0 判会把前半段成交漏在轮次之外。
      if (!state.cycleIndexes.has(stockCode)) {
        state.cycleOpenedAt.set(stockCode, tradeTime)
        state.cycleIndexes.set(stockCode, [])
      }
      position.quantity += shares
      position.totalCost += amount + fee
      state.cycleIndexes.get(stockCode)?.push(index)
      continue
    }

    if ((state.cycleOpenedAt.get(stockCode) ?? 0) === 0) {
      state.cycleOpenedAt.set(stockCode, tradeTime)
    }
    if (shares > position.quantity) {
      throw new AppError(`卖出数量超过持仓（当前 ${position.quantity} 股）`, { status: 400 })
    }
    const costBasis = costBasisOf(position.totalCost, shares, position.quantity)
    const realized = amount - fee - costBasis
    trades[index].realizedPnl = realized
    if (current) current.netPnl += realized
    state.cycleIndexes.get(stockCode)?.push(index)
    position.quantity -= shares
    position.totalCost -= costBasis
    position.realizedPnl += realized
    if (position.quantity === 0) {
      position.totalCost = 0
    }
  }

  flushReplayOrder(db, ledgerId, current, trades, state)

  // 重放后不再成立的轮次随编辑 / 删除失效（其复盘内容一并丢失）
  for (const round of existingRounds) {
    if (state.usedRounds.has(round.id)) continue
    deleteTradeRound(db, round.id)
    // 该轮的每日复盘与轮次同命：轮次没了，它们也没有可读的归属
    deleteDayReviewsByRound(db, round.id)
  }

  for (const position of state.positions.values()) {
    if (!state.cycleIndexes.has(position.stockCode)) {
      // 本轮已经归档（重放结束时没有在建轮次）⇒ 持仓上的复盘草稿已归到轮次，不再保留；
      // 减仓减到 0 手不算归档，草稿继续留在持仓上（下次加仓还在同一轮里）。
      position.review = ''
    }
    updatePosition(db, position)
  }

  recalculateCashChain(db, ledgerId)
}

/**
 * 结束当前委托的重放：写一条资金记录，必要时归档轮次，并回写各笔成交的派生字段。
 *
 * 抽成独立函数是因为一棵同时读写 `trades` 与多个 map 的循环体更难读（既有同一拆分，
 * 那里是借用检查器的原因，这里是可读性）。
 */
function flushReplayOrder(
  db: Db,
  ledgerId: string,
  order: ReplayOrder | null,
  trades: readonly StockTrade[],
  state: ReplayState,
): void {
  if (!order) return

  let amountChange: number
  let eventType: string
  let eventText: string
  let netPnl: number | null
  if (order.isBuy) {
    amountChange = -(order.amount + order.fee)
    eventType = STOCK_EVENT_BUY
    eventText = `买入 ${order.stockName} ${order.lots}手`
    netPnl = null
  } else {
    amountChange = order.amount - order.fee
    eventType = STOCK_EVENT_SELL
    eventText = `卖出 ${order.stockName} ${order.lots}手`
    netPnl = order.netPnl
  }

  // 0 手委托（"只归档本轮"那种清仓）不产生资金变化：记一条 ¥0.00 的卖出会把资金变化列表
  // 弄脏，现金链也会多一条空转的记录。写入路径同一条规则。
  if (order.lots > 0) {
    const record: StockFundRecord = {
      id: randomUUID(),
      ledgerId,
      recordDate: unixToDate(order.lastTime),
      eventType,
      eventText,
      amountChange,
      cashBalance: 0,
      netPnl,
      remark: tradeOrderRemark(
        order.stockName,
        order.lots,
        order.amount,
        order.indexes.length,
      ),
      createdAt: order.createdAt,
    }
    // 录入顺序 = `created_at ASC, id ASC`。created_at 是秒级的，同一秒录入的多条记录靠随机
    // UUID 决胜负，顺序不确定；这里在重放时把时间戳拉成严格递增，使重放结果与资金链重算
    // 完全确定（不同秒的原值保持不变）。
    record.createdAt = Math.max(record.createdAt, state.lastRecordCreatedAt + 1)
    state.lastRecordCreatedAt = record.createdAt
    createFundRecord(db, record)
  }

  // 清仓委托把本轮「建仓 → 清仓」归档；减仓（哪怕减到 0 手）不归档
  let roundId = ''
  const position = state.positions.get(order.stockCode)
  const closed = position ? order.isClose && position.quantity === 0 : false

  if (closed) {
    let history = state.histories.get(order.stockCode)
    if (!history) {
      history = {
        id: randomUUID(),
        ledgerId,
        stockCode: order.stockCode,
        stockName: order.stockName,
        createdAt: 0,
        updatedAt: 0,
      }
      createTradeHistory(db, history)
      state.histories.set(order.stockCode, history)
    }
    const roundNo = (state.roundCounts.get(order.stockCode) ?? 0) + 1
    let openedAt = state.cycleOpenedAt.get(order.stockCode) ?? 0
    if (openedAt === 0) openedAt = order.firstTime
    const metaKey = roundMetaKey(order.stockCode, roundNo)
    const existing = state.roundMeta.get(metaKey)
    if (existing) {
      // 复用同一轮次行：ID 稳定，标签与复盘原样保留
      updateTradeRoundDerived(db, existing.id, history.id, openedAt, order.lastTime)
      roundId = existing.id
    } else {
      const round: StockTradeRound = {
        id: randomUUID(),
        ledgerId,
        stockCode: order.stockCode,
        historyId: history.id,
        roundNo,
        openedAt,
        closedAt: order.lastTime,
        tag: STOCK_TAG_ANALYSIS,
        review: '',
        createdAt: 0,
      }
      createTradeRound(db, round)
      roundId = round.id
      // 新轮次加入索引，避免同一股票出现两轮同号时重复创建
      state.roundMeta.set(metaKey, round)
    }
    state.usedRounds.add(roundId)
    // 本轮「建仓 → 清仓」的全部成交（可能跨多个委托）一起挂接轮次
    const ids = (state.cycleIndexes.get(order.stockCode) ?? []).map(
      (index) => trades[index].id,
    )
    updateTradesRoundId(db, roundId, ids)
    state.roundCounts.set(order.stockCode, roundNo)
    state.cycleOpenedAt.delete(order.stockCode)
    state.cycleIndexes.delete(order.stockCode)
  }

  for (const index of order.indexes) {
    updateTradeSettlement(
      db,
      trades[index].id,
      roundId,
      trades[index].realizedPnl,
    )
  }
}

// ---------------------------------------------------------------- 对外写入入口

/**
 * 编辑一笔成交（成交价 / 手数 / 委托时间）：
 * 按当前费用设置重算所属委托的全部费用后分摊，再重放持仓、资金记录与轮次。
 *
 * 既有 `update_trade_fill`：校验在事务前，失败整体回滚。
 */
export function updateTradeFill(db: Db, request: UpdateTradeFillRequest): StockTradeDto {
  const { ledgerId, tradeId, priceMilli, lots, tradeTime } = request
  if (tradeId === '') {
    throw new AppError('trade_id is required', { status: 400 })
  }
  if (priceMilli <= 0) {
    throw new AppError('成交价必须大于 0', { status: 400 })
  }
  if (lots <= 0) {
    throw new AppError('手数必须大于 0', { status: 400 })
  }

  let updated: StockTrade
  try {
    updated = db.transaction(() => {
      updateTradeFillTx(db, ledgerId, tradeId, priceMilli, lots, tradeTime)
      return getTrade(db, tradeId)
    })
  } catch (error) {
    logError(
      `编辑股票成交失败, ledger: ${ledgerId}, trade: ${tradeId}, err: ${String(error)}`,
    )
    if (error instanceof AppError) throw error
    throw new AppError('编辑股票成交失败', { status: 500 })
  }
  return tradeDto(updated)
}

/**
 * 删除整笔委托（含全部成交明细），并重放重建持仓、资金记录与轮次。
 *
 * 既有 `delete_trade_order`：校验在事务前，失败整体回滚。
 */
export function deleteTradeOrder(db: Db, request: DeleteTradeOrderRequest): void {
  const { ledgerId, orderId } = request
  if (orderId === '') {
    throw new AppError('order_id is required', { status: 400 })
  }
  try {
    db.transaction(() => {
      deleteTradeOrderTx(db, ledgerId, orderId)
    })
  } catch (error) {
    logError(
      `删除股票委托失败, ledger: ${ledgerId}, order: ${orderId}, err: ${String(error)}`,
    )
    if (error instanceof AppError) throw error
    throw new AppError('删除股票委托失败', { status: 500 })
  }
}

/**
 * 预演编辑 / 删除的影响：同一事务内执行改动并重放后强制回滚，
 * 返回变动后的持仓、可用现金，以及会因此失效（复盘丢失）的轮次。
 *
 * 既有 `preview_trade_change`：`update_trade` / `delete_order` 复用同一入口。
 */
export function previewTradeChange(
  db: Db,
  request: PreviewTradeChangeRequest,
): StockTradeImpactDto {
  const { ledgerId, action, tradeId, orderId, priceMilli, lots, tradeTime } = request
  let impact: StockTradeImpactDto | null = null

  try {
    db.transaction(() => {
      const before = roundMetaIndex(db, ledgerId)

      let stockCode: string
      switch (action) {
        case 'update_trade':
          stockCode = updateTradeFillTx(db, ledgerId, tradeId, priceMilli, lots, tradeTime)
          break
        case 'delete_order':
          stockCode = deleteTradeOrderTx(db, ledgerId, orderId)
          break
        default:
          throw new AppError('无效的预演动作', { status: 400 })
      }

      const after = roundMetaIndex(db, ledgerId)

      const preview: StockTradeImpactDto = {
        stockCode,
        stockName: '',
        positionAfter: 0,
        cashAfter: 0,
        removedRounds: [],
      }
      try {
        const position = getPosition(db, ledgerId, stockCode)
        preview.positionAfter = position.quantity
        preview.stockName = position.stockName
      } catch (error) {
        if (!isNotFound(error)) throw error
      }
      const latest = queryLatestFundRecord(db, ledgerId)
      if (latest) preview.cashAfter = latest.cashBalance

      for (const [key, meta] of before) {
        if (after.has(key)) continue
        preview.removedRounds.push(meta)
      }
      sortImpactRounds(preview.removedRounds)
      if (preview.stockName === '') {
        const round = preview.removedRounds.find((item) => item.stockCode === stockCode)
        if (round) preview.stockName = round.stockName
      }
      impact = preview
      // 哨兵错误：强制回滚，预演绝不落库
      throw previewSentinel()
    })
  } catch (error) {
    if (!isPreviewSentinel(error)) throw error
  }

  if (!impact) throw new AppError('预演失败', { status: 400 })
  return impact
}

/**
 * 回滚预演：要撤销的是哪一次操作、会不会让某些轮次失效（复盘随之丢失）。
 *
 * 与 {@link previewTradeChange} 同一手法：委托类操作在事务里**真的执行撤销**、比对前后的
 * 轮次索引，最后返回哨兵错误强制回滚 —— **预演绝不落库**。
 * 资金类操作没有轮次影响，只回填操作名与摘要。
 */
export function previewRollback(
  db: Db,
  ledgerId: string,
): StockOperationRollbackPreviewDto {
  let preview: StockOperationRollbackPreviewDto | null = null

  try {
    db.transaction(() => {
      const operation = latestOperation(db, ledgerId)
      if (!operation) {
        throw new AppError('没有可回滚的操作', { status: 400 })
      }
      const previewForCall: StockOperationRollbackPreviewDto = {
        action: operation.action,
        detail: operation.detail,
        removedRounds: [],
      }
      if (operation.kind === STOCK_OP_KIND_ORDER) {
        const before = roundMetaIndex(db, ledgerId)
        // 目标可能已经被别的改动删掉了（例如手动删除整笔委托）：那不是错误，
        // 实际回滚会走"跳过"路径，预演里也就没有失效轮次
        let deleted = true
        try {
          deleteTradeOrderTx(db, ledgerId, operation.targetId)
        } catch {
          deleted = false
        }
        if (deleted) {
          const after = roundMetaIndex(db, ledgerId)
          for (const [key, meta] of before) {
            if (!after.has(key)) previewForCall.removedRounds.push(meta)
          }
          sortImpactRounds(previewForCall.removedRounds)
        }
      }
      preview = previewForCall
      // 哨兵错误：强制回滚，预演绝不落库
      throw previewSentinel()
    })
  } catch (error) {
    if (!isPreviewSentinel(error)) throw error
  }

  if (!preview) throw new AppError('没有可回滚的操作', { status: 400 })
  return preview
}

/**
 * 回滚最新一次操作（撤销成功后把它从记录里弹掉）。
 *
 * 撤销就是两个"逆操作"，不引入快照：
 * * **委托类** → {@link deleteTradeOrderTx}：删掉该委托的全部成交后重放持仓 / 轮次 / 资金记录；
 * * **资金类** → 删掉那条资金记录；「追加本金」还要把 `principal` 减回去，最后重算现金链。
 *
 * **目标已不存在**不算失败：把记录弹掉并返回 `skipped = true`。否则一条指向空气的记录会永远
 * 卡在栈顶，之后每一次回滚都失败。
 *
 * 回滚本身**不产生新记录**：它是弹栈，不是新的正向操作（否则"回滚"就成了可回滚的操作）。
 */
export function rollbackLatest(db: Db, ledgerId: string): StockOperationRollbackDto {
  let outcome: StockOperationRollbackDto | null = null

  try {
    db.transaction(() => {
      const operation = latestOperation(db, ledgerId)
      if (!operation) {
        throw new AppError('没有可回滚的操作', { status: 400 })
      }

      let skipped = false
      switch (operation.kind) {
        case STOCK_OP_KIND_ORDER:
          try {
            deleteTradeOrderTx(db, ledgerId, operation.targetId)
          } catch (error) {
            if (isNotFound(error)) {
              skipped = true
            } else {
              throw error
            }
          }
          break
        case STOCK_OP_KIND_FUND: {
          const record = getFundRecord(db, operation.targetId)
          if (!record) {
            skipped = true
          } else {
            // 追加本金动过本金口径，撤销时要改回去（额度就是这条记录的 amount_change）
            if (record.eventType === STOCK_EVENT_ADD_PRINCIPAL) {
              const account = getOrCreateAccount(db, ledgerId)
              // `max(0)` 是防御式的：追加本金只会把本金抬高，理论上取不到负值
              const restored = Math.max(0, account.principal - record.amountChange)
              updateAccountPrincipal(db, ledgerId, restored)
            }
            deleteFundRecord(db, operation.targetId)
            recalculateCashChain(db, ledgerId)
          }
          break
        }
        // 未知 kind（理论上不会出现）：只弹记录，不做任何撤销
        default:
          skipped = true
          break
      }

      deleteOperation(db, operation.id)
      outcome = { action: operation.action, skipped }
    })
  } catch (error) {
    logError(`回滚股票操作失败, ledger: ${ledgerId}, err: ${String(error)}`)
    if (error instanceof AppError) throw error
    throw new AppError('回滚股票操作失败', { status: 500 })
  }

  if (!outcome) throw new AppError('回滚后未取到结果', { status: 500 })
  return outcome
}

