/**
 * 股票下单写入：一次委托 = 一个事务。
 *
 * 委托创建
 * （`normalize_trade_fills` / `instrument_of` / `resolve_round_fee` / `trade_order_remark` /
 * `create_trade_order[_with_round_fee]` / `create_trade[_with_round_fee]` / `close_round`）
 * 与它依赖的 `cost_basis_of`、`log_operation`、`amount_detail`、`trade_operation_label`。
 *
 * ## 计费口径（一次委托多笔成交）
 *
 * 券商按**成交笔**收费，所以：
 * * **佣金**：整笔委托只收一次，按成交总额算，并**只在这里**用一次最低佣金；
 * * **印花税 / 过户费**：逐笔按成交额算、**逐笔**四舍五入到分，再相加。
 *
 * 佣金再按成交额比例分摊到各笔（末笔吸收取整余数），保证 Σ分摊 = 委托级合计 —— 资金记录用
 * 委托级合计、成交行用分摊值，两者不一致就是"钱对不上账"。算法全在 `shared/domain/fee`，
 * 这里只负责"按哪份费率、对哪些金额调用"。
 *
 * ## 本轮费用快照（`round_*` 四列）
 *
 * * **建仓**（本轮第一笔买入：当前没有持仓、也没有未挂接成交）⇒ 用请求带来的那份，没带就用
 *   账本系统配置；无论哪种都写进这一轮的**每一笔**成交行；
 * * **本轮已开始**（加仓 / 减仓 / 清仓）⇒ 一律用本轮建仓单上记的那份；请求里还带值就是调用方
 *   的错（400）；
 * * **老数据**（本轮建仓单上 4 列全 NULL）⇒ 退回账本系统配置，与升级前逐字一致。
 *
 * ## 派生值
 *
 * 持仓数量 / 总成本 / 已实现盈亏、资金记录的现金余额（现金链）、轮次挂接、操作记录都是派生值：
 *
 * * 减仓按**剩余总成本的比例**结转成本（四舍五入到分），避免整除截断造成已实现盈亏偏差；
 * * 资金记录只写一条（按委托），余额先留 0，插入后立刻按链序复算（不在这里自己算一次）；
 * * 清仓（且成交后持仓归零）才归档轮次与交易历史；减仓**哪怕减到 0 手也不归档**；
 * * 持仓已是 0 手时的清仓 = **只归档**：写一笔 0 手标记成交，不产生资金变化记录。
 *
 * ## 事务边界
 *
 * 校验（交易类型 / 明细 / 价格 / 手数 / 标签）在事务**之前**；建持仓、算费、更新持仓、写资金
 * 记录、复算现金链、写成交、记操作记录全在**同一个事务**里 —— 任何一步失败全部回滚。
 *
 * ## 没有随本切片移植的部分
 *
 * `order_key_of` / `round_meta_key` 属"编辑成交 / 删除委托 / 回放"那条写入路径（`rebuild_trades`
 * 用它们给委托与轮次分组），`day_after` 属数据订正（`repair_source_trade_fund_dates`）；
 * 三者都不在下单语义里，等对应切片落地时随那片一起移植。
 */

import { randomUUID } from 'node:crypto'

import {
  STOCK_EVENT_BUY,
  STOCK_EVENT_SELL,
  STOCK_OP_KIND_ORDER,
  STOCK_TAG_ANALYSIS,
  STOCK_TRADE_ADD,
  STOCK_TRADE_CLOSE,
  STOCK_TRADE_OPEN,
  STOCK_TRADE_REDUCE,
} from '../../shared/domain/consts'
import {
  type FeeBreakdown,
  type Instrument,
  allocateOrderFee,
  computeOrderFee,
  instrumentOf as feeInstrumentOf,
} from '../../shared/domain/fee'
import { centsToYuan, milliToYuan } from '../../shared/domain/money'
import type { RoundFee, StockFeeSetting, StockTrade } from '../../shared/domain/models'
import { amountOf, isBuy, isSell, nextRoundNo, sharesOf } from '../../shared/domain/stock'
import { nowSeconds } from '../../shared/domain/time'
import { AppError } from '../../shared/errors'
import type { StockFundRecord } from '../../shared/types/stock'
import type {
  CreateTradeOrderRequest,
  CreateTradeOrderWithRoundFeeRequest,
  CreateTradeRequest,
  CreateTradeWithRoundFeeRequest,
  StockTradeDto,
  StockTradeFill,
} from '../../shared/types/stock-trade'
import type { Db } from '../db/driver'
import { createFundRecord, createOperation } from '../db/dao/stock-fund'
import {
  type StockPosition,
  type StockTradeHistory,
  type StockTradeRound,
  attachUnattachedTrades,
  countTradeRounds,
  createPosition,
  createTrade as createTradeRow,
  createTradeHistory,
  createTradeRound,
  firstUnattachedTrade,
  getPosition,
  getTradeHistory,
  minUnattachedTradeTime,
  updatePosition,
  updateTradeHistoryName,
} from '../db/dao/stock-trade'
import { logError } from '../logging'
import {
  getOrCreateFeeSetting,
  getTradeTags,
  recalculateCashChain,
  unixToDate,
  validateFeeSetting,
} from './stock-account'
import { ensureStockHistoryBackfill } from './stock-history'

// ---------------------------------------------------------------- 小工具

/** 既有 DAO 以 404 表示"查无此行"。 */
function isNotFound(error: unknown): boolean {
  return error instanceof AppError && error.status === 404
}

/** `f64::round`：四舍五入、远离零。JS `Math.round` 对负数半值朝 +∞，不能直接用。 */
function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value)
}

/** 空费用（"只归档"那条路没有成交额，最低佣金不能凭空收一遍）。 */
function emptyFee(): FeeBreakdown {
  return { commission: 0, stampDuty: 0, transferFee: 0, total: 0 }
}

/** 只留费用算法要的四项（既有 `RoundFee::from(&StockFeeSetting)`）。 */
function roundFeeOfSetting(setting: StockFeeSetting): RoundFee {
  return {
    commissionRate: setting.commissionRate,
    minCommission: setting.minCommission,
    stampDutyRate: setting.stampDutyRate,
    transferFeeRate: setting.transferFeeRate,
  }
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

// ---------------------------------------------------------------- 委托创建

/** 过滤前端未填写的空明细行（价格与手数同时 <= 0）。 */
function normalizeTradeFills(fills: readonly StockTradeFill[]): StockTradeFill[] {
  return fills.filter((fill) => !(fill.priceMilli <= 0 && fill.lots <= 0))
}

/**
 * 品种判定（决定收哪些费）：老数据里可能存着不在支持范围的代码（例如北交所），
 * 这种记录按**深市股票**处理（卖出收印花税、不收过户费）—— 与引入品种之前的默认行为一致，
 * 不让一条历史记录把整轮重放 / 编辑打断。界面侧的下单校验会先挡住这类代码。
 */
function instrumentOf(stockCode: string): Instrument {
  return feeInstrumentOf(stockCode) ?? 'shenzhenStock'
}

/**
 * 减仓按剩余总成本的比例结转成本（四舍五入到分），避免整除截断造成已实现盈亏偏差。
 *
 * `shares == 0`（清仓时只归档那一笔 0 手标记成交）或没有持仓时直接 0：0/0 在浮点里是 NaN，
 * `NaN as i64` 恰好是 0 —— 别把正确性建在这个巧合上。
 */
function costBasisOf(totalCost: number, shares: number, quantity: number): number {
  if (shares <= 0 || quantity <= 0) return 0
  return roundHalfAwayFromZero((totalCost * shares) / quantity)
}

/**
 * 本轮的费用设置（建仓时定下、本轮之内不可改）。
 *
 * 三条规则见模块头注释。返回值是「喂算法的形态」与「要落库的快照」两份。
 */
function resolveRoundFee(
  db: Db,
  ledgerId: string,
  stockCode: string,
  buy: boolean,
  position: StockPosition,
  requested: RoundFee | undefined,
): { setting: StockFeeSetting; round: RoundFee } {
  const first = firstUnattachedTrade(db, ledgerId, stockCode)
  const isOpening = buy && position.quantity === 0 && first === null

  if (isOpening) {
    if (requested) {
      validateFeeSetting(requested)
      return { setting: settingOfRoundFee(requested), round: { ...requested } }
    }
    const ledger = getOrCreateFeeSetting(db, ledgerId)
    const round = roundFeeOfSetting(ledger)
    return { setting: settingOfRoundFee(round), round }
  }
  if (requested) {
    throw new AppError('本轮的费用设置在建仓时确定，不可更改', { status: 400 })
  }
  const ledger = getOrCreateFeeSetting(db, ledgerId)
  const round = first?.roundFee ?? roundFeeOfSetting(ledger)
  return { setting: settingOfRoundFee(round), round: { ...round } }
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

/** 委托类操作的固定文案（与界面上的交易类型标签同一套词）。 */
function tradeOperationLabel(tradeType: string): string {
  switch (tradeType) {
    case STOCK_TRADE_OPEN:
      return '建仓'
    case STOCK_TRADE_ADD:
      return '加仓'
    case STOCK_TRADE_REDUCE:
      return '减仓'
    case STOCK_TRADE_CLOSE:
      return '清仓'
    default:
      return '交易'
  }
}

/** 金额摘要（分 → `¥1234.56`，无千分位）。 */
function amountDetail(amount: number): string {
  return `¥${centsToYuan(amount)}`
}

/** 记一次可回滚的委托类操作（在调用方的事务里调用，与操作同生共死）。 */
function logOperation(
  db: Db,
  ledgerId: string,
  kind: string,
  action: string,
  detail: string,
  targetId: string,
): void {
  createOperation(db, {
    id: randomUUID(),
    ledgerId,
    kind,
    action,
    detail,
    targetId,
    createdAt: 0,
  })
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

/** 取持仓，不存在则建（数量 / 成本 / 已实现盈亏全 0）。 */
function getOrCreatePositionIn(
  db: Db,
  ledgerId: string,
  stockCode: string,
  stockName: string,
): StockPosition {
  try {
    return getPosition(db, ledgerId, stockCode)
  } catch (error) {
    if (!isNotFound(error)) throw error
    const position: StockPosition = {
      id: randomUUID(),
      ledgerId,
      stockCode,
      stockName,
      quantity: 0,
      totalCost: 0,
      realizedPnl: 0,
      review: '',
      tag: '',
      createdAt: 0,
      updatedAt: 0,
    }
    createPosition(db, position)
    return position
  }
}

// ---------------------------------------------------------------- 轮次归档

/** 轮次挂接：把该股当前轮（`round_id = ''`）的每日复盘挂到刚建的轮次上。 */
function attachUnattachedDayReviews(
  db: Db,
  ledgerId: string,
  stockCode: string,
  roundId: string,
): void {
  // 每日复盘的 DAO 尚未随本切片移植：按既有 DAO 的同一条 SQL 就地更新（列名 / 判定逐字一致）。
  db.prepare(
    'UPDATE stock_day_review SET round_id = ? ' +
      "WHERE ledger_id = ? AND stock_code = ? AND round_id = ''",
  ).run(roundId, ledgerId, stockCode)
}

/** 持仓行上那一列标签的**生效值**：空串（没设过）按默认标签「分析」。 */
function effectivePositionTag(raw: string): string {
  const tag = raw.trim()
  return tag === '' ? STOCK_TAG_ANALYSIS : tag
}

/**
 * 清仓收尾：确保历史集合存在（首次清仓创建，之后复用），
 * 创建本轮次并把该股从建仓到清仓的全部未归档交易挂接进来。
 *
 * `review` 为持仓期间先写的本轮复盘（可为空），归档后由持仓侧清空。
 */
function closeRound(
  db: Db,
  ledgerId: string,
  stockCode: string,
  stockName: string,
  closedAt: number,
  tag: string,
  review: string,
): string {
  // 既有存量数据：先归档历史上已完成但未挂接的轮次，避免与当前轮次混淆
  ensureStockHistoryBackfill(db, ledgerId, stockCode)

  let history: StockTradeHistory
  try {
    history = getTradeHistory(db, ledgerId, stockCode)
  } catch (error) {
    if (!isNotFound(error)) throw error
    history = {
      id: randomUUID(),
      ledgerId,
      stockCode,
      stockName,
      createdAt: 0,
      updatedAt: 0,
    }
    createTradeHistory(db, history)
  }
  if (history.stockName !== stockName) {
    updateTradeHistoryName(db, ledgerId, stockCode, stockName)
    history.stockName = stockName
  }

  const count = countTradeRounds(db, history.id)
  let openedAt = minUnattachedTradeTime(db, ledgerId, stockCode)
  if (openedAt === 0) openedAt = closedAt
  // 空标签 = 回到默认「分析」——**与持仓侧读它时同一个判据**，否则会出现
  // "持仓页写着分析、归档出来是别的标签"。
  const round: StockTradeRound = {
    id: randomUUID(),
    ledgerId,
    stockCode,
    historyId: history.id,
    roundNo: nextRoundNo(count, 0),
    openedAt,
    closedAt,
    tag: effectivePositionTag(tag),
    review: review.trim(),
    createdAt: 0,
  }
  createTradeRound(db, round)
  // 本轮交易此时尚未入库，下面写完成后由调用方把 roundId 带上
  attachUnattachedTrades(db, ledgerId, stockCode, round.id)
  // 持仓期间写的「每日复盘」同样归档到这一轮（此后只读）
  attachUnattachedDayReviews(db, ledgerId, stockCode, round.id)
  return round.id
}

// ---------------------------------------------------------------- 记录委托

/**
 * 记录一笔委托（不指定本轮费用设置：建仓时取账本系统配置）。
 *
 * 等价于既有 `create_trade_order`：它就是把 `round_fee = None` 转发给
 * {@link createTradeOrderWithRoundFee}。
 */
export function createTradeOrder(db: Db, request: CreateTradeOrderRequest): StockTradeDto[] {
  return createTradeOrderWithRoundFee(db, { ...request, roundFee: undefined })
}

/**
 * 记录一笔委托，可包含多笔成交明细，费用按委托成交总额计算一次后分摊到各笔。
 *
 * 买入（建仓/加仓）：现金减少 Σ成交金额+费用；卖出（减仓/清仓）：现金增加 Σ成交金额-费用，
 * 并按平均成本逐笔结转已实现盈亏；全部成交后持仓归零则归档本轮轮次。
 *
 * `roundFee` 只在**建仓**（本轮第一笔买入）时被接受：它就是本轮的费用设置，缺失时取账本系统
 * 配置；本轮已经开始的加仓 / 减仓 / 清仓必须沿用本轮建仓单上的那份（传进来就报错，见
 * {@link resolveRoundFee}）。
 */
export function createTradeOrderWithRoundFee(
  db: Db,
  request: CreateTradeOrderWithRoundFeeRequest,
): StockTradeDto[] {
  const { ledgerId, stockCode, stockName, tradeType } = request
  const fills = normalizeTradeFills(request.fills)
  const buy = isBuy(tradeType)
  const sell = isSell(tradeType)
  if (!buy && !sell) {
    throw new AppError('无效的交易类型', { status: 400 })
  }
  // 清仓允许多带成交明细：持仓已经是 0 手（减仓减到 0 之后这一轮还在）时，清仓只是
  // "把这一轮归档进交易历史"—— 不成交、不记资金变化，轮次行与标签/复盘照旧落库。
  const archiveOnly = fills.length === 0 && tradeType === STOCK_TRADE_CLOSE
  if (fills.length === 0 && !archiveOnly) {
    throw new AppError('成交明细不能为空', { status: 400 })
  }
  for (const fill of fills) {
    if (fill.priceMilli <= 0) {
      throw new AppError('成交价必须大于 0', { status: 400 })
    }
    if (fill.lots <= 0) {
      throw new AppError('手数必须大于 0', { status: 400 })
    }
  }
  if (request.tag !== '') {
    const tags = getTradeTags(db, ledgerId)
    if (!tags.includes(request.tag)) {
      throw new AppError('无效的交易标签', { status: 400 })
    }
  }
  const tradeTime = request.tradeTime <= 0 ? nowSeconds() : request.tradeTime

  // 品种决定收哪些费：股票（沪市才有过户费、卖出有印花税）还是场内基金（只有佣金）
  const instrument = instrumentOf(stockCode)
  const orderId = randomUUID()

  const trades: StockTrade[] = []
  const amounts: number[] = []
  let totalAmount = 0
  let totalLots = 0
  fills.forEach((fill, index) => {
    const shares = sharesOf(fill.lots)
    // 价格是厘、成交额是分：折这一次（唯一的口径在 `shared/domain/stock`）
    const amount = amountOf(fill.priceMilli, shares)
    totalAmount += amount
    totalLots += fill.lots
    amounts.push(amount)
    trades.push({
      id: randomUUID(),
      ledgerId,
      stockCode,
      stockName,
      tradeType,
      roundId: '',
      orderId,
      orderSeq: index + 1,
      price: fill.priceMilli,
      lots: fill.lots,
      shares,
      amount,
      fee: 0,
      commission: 0,
      stampDuty: 0,
      transferFee: 0,
      realizedPnl: null,
      tradeTime,
      roundFee: null,
      remark: request.remark,
      createdAt: 0,
    })
  })
  if (archiveOnly) {
    // 0 手标记成交：**必须留下这一行** —— 轮次挂接、资金链与回滚都由"重放"从成交行重建；
    // 没有它，之后任何一次改成交/删委托都会把这条已归档轮次判成"不再成立"而删掉（连带复盘）。
    // 它不进任何界面列表（读模型按 `shares > 0` 过滤）。
    trades.push({
      id: randomUUID(),
      ledgerId,
      stockCode,
      stockName,
      tradeType,
      roundId: '',
      orderId,
      orderSeq: 1,
      price: 0,
      lots: 0,
      shares: 0,
      amount: 0,
      fee: 0,
      commission: 0,
      stampDuty: 0,
      transferFee: 0,
      realizedPnl: null,
      tradeTime,
      roundFee: null,
      remark: request.remark,
      createdAt: 0,
    })
  }

  let realizedTotal = 0
  const recordDate = unixToDate(tradeTime)

  try {
    db.transaction(() => {
      const position = getOrCreatePositionIn(db, ledgerId, stockCode, stockName)
      position.stockName = stockName
      // 本轮标签：非清仓委托**只**把它带到本轮（落库到轮次要等清仓），但持仓期间也该看得见 ——
      // 写进持仓行，持仓页的标签下拉读的就是它。
      // 传空（老调用方 / 接口直接用）不动既有值，别把这一轮已经定下的标签抹掉。
      if (request.tag !== '') {
        position.tag = request.tag
      }

      // 本轮的费用设置：建仓时定下（请求里的，否则账本系统配置），本轮之内一律沿用
      const { setting: feeSetting, round: roundFee } = resolveRoundFee(
        db,
        ledgerId,
        stockCode,
        buy,
        position,
        request.roundFee,
      )
      // 委托级一次计收（最低佣金按委托，不按笔）；印花税与过户费**逐笔**取整再相加，
      // 再按成交额把委托级费用分摊到各笔明细（两份口径一致，见 `shared/domain/fee`）。
      let orderFee: FeeBreakdown
      let allocated: FeeBreakdown[]
      if (archiveOnly) {
        orderFee = emptyFee()
        allocated = [emptyFee()]
      } else {
        orderFee = computeOrderFee(amounts, instrument, feeSetting, buy)
        allocated = allocateOrderFee(orderFee, amounts, instrument, feeSetting, buy)
      }

      // 每一笔都写上本轮快照（本轮内自证口径；老数据留 NULL 表示"沿用系统配置"）
      for (const trade of trades) trade.roundFee = { ...roundFee }

      // 卖出先按委托总量校验，避免逐笔结算中途才发现超卖
      if (sell) {
        const soldShares = trades.reduce((sum, trade) => sum + trade.shares, 0)
        if (soldShares > position.quantity) {
          throw new AppError(`卖出数量超过持仓（当前 ${position.quantity} 股）`, { status: 400 })
        }
        // 清仓是"结束这一轮"的动作：手数必须等于剩余持仓（界面把它固定成全仓、不可改）。
        // 想部分卖出就用减仓 —— 减仓（哪怕减到 0 手）不归档。
        if (tradeType === STOCK_TRADE_CLOSE && !archiveOnly && soldShares !== position.quantity) {
          throw new AppError(`清仓必须全部卖出（当前 ${position.quantity} 股）`, { status: 400 })
        }
      }
      if (archiveOnly && position.quantity !== 0) {
        throw new AppError(`清仓请填写成交明细（当前 ${position.quantity} 股）`, { status: 400 })
      }

      trades.forEach((trade, index) => {
        const fee = allocated[index]
        trade.fee = fee.total
        trade.commission = fee.commission
        trade.stampDuty = fee.stampDuty
        trade.transferFee = fee.transferFee

        if (buy) {
          position.quantity += trade.shares
          position.totalCost += trade.amount + trade.fee
          return
        }

        if (trade.shares === 0) {
          // "只归档"那笔 0 手标记：不动持仓、不结转成本、已实现为 0
          trade.realizedPnl = 0
          return
        }

        // 按剩余总成本的比例结转（四舍五入到分），避免整除截断造成已实现盈亏偏差
        const costBasis = costBasisOf(position.totalCost, trade.shares, position.quantity)
        const realized = trade.amount - trade.fee - costBasis
        trade.realizedPnl = realized
        realizedTotal += realized

        position.quantity -= trade.shares
        position.totalCost -= costBasis
        position.realizedPnl += realized
        if (position.quantity === 0) {
          position.totalCost = 0
        }
      })

      // 清仓：把本轮「建仓 → 清仓」的全部交易归档到交易历史。
      // 减仓（哪怕减到 0 手）**不**归档 —— 那一轮继续挂在持仓上（0 手），
      // 之后买的算本轮加仓，直到用户点清仓（用户口径：清仓才归档）。
      if (tradeType === STOCK_TRADE_CLOSE && position.quantity === 0) {
        const roundId = closeRound(
          db,
          ledgerId,
          stockCode,
          stockName,
          tradeTime,
          request.tag,
          position.review,
        )
        for (const trade of trades) trade.roundId = roundId
        // 持仓期间先写的复盘与标签都已归档到本轮次，清空持仓上的草稿，避免下一轮继承
        position.review = ''
        position.tag = ''
      }

      updatePosition(db, position)

      let amountChange: number
      let eventType: string
      let eventText: string
      let netPnl: number | null
      if (buy) {
        amountChange = -(totalAmount + orderFee.total)
        eventType = STOCK_EVENT_BUY
        eventText = `买入 ${stockName} ${totalLots}手`
        netPnl = null
      } else {
        amountChange = totalAmount - orderFee.total
        eventType = STOCK_EVENT_SELL
        eventText = `卖出 ${stockName} ${totalLots}手`
        netPnl = realizedTotal
      }

      // 「只归档」的清仓没有资金变化：记一条 ¥0.00 的卖出会把资金变化列表弄脏、
      // 现金链也多一条空转记录。
      if (totalLots > 0) {
        const record: StockFundRecord = {
          id: randomUUID(),
          ledgerId,
          recordDate,
          eventType,
          eventText,
          amountChange,
          // 余额是派生值：插入时先留占位，紧接着按链序复算（**不**在这里自己算一次）
          cashBalance: 0,
          netPnl,
          remark: tradeOrderRemark(stockName, totalLots, totalAmount, trades.length),
          createdAt: 0,
        }
        createFundRecord(db, record)
        recalculateCashChain(db, ledgerId)
      }

      for (const trade of trades) createTradeRow(db, trade)

      logOperation(
        db,
        ledgerId,
        STOCK_OP_KIND_ORDER,
        tradeOperationLabel(tradeType),
        archiveOnly
          ? `${stockName} ${stockCode} · 归档本轮（0 手）`
          : `${stockName} ${stockCode} · ${totalLots} 手 · ${amountDetail(totalAmount)}`,
        orderId,
      )
    })
  } catch (error) {
    logError(`记录股票交易失败, ledger: ${ledgerId}, code: ${stockCode}, err: ${String(error)}`)
    if (error instanceof AppError) throw error
    throw new AppError('记录股票交易失败', { status: 500 })
  }

  return trades.map(tradeDto)
}

// ---------------------------------------------------------------- 单笔成交

/**
 * 记录单笔成交（等价于只含一笔明细的委托），保持原有调用方不变。
 */
export function createTrade(db: Db, request: CreateTradeRequest): StockTradeDto {
  const withFee: CreateTradeWithRoundFeeRequest = { ...request, roundFee: undefined }
  return createTradeWithRoundFee(db, withFee)
}

/**
 * 记录单笔成交，并指定本轮的费用设置（只有建仓会用到）。
 */
export function createTradeWithRoundFee(
  db: Db,
  request: CreateTradeWithRoundFeeRequest,
): StockTradeDto {
  const items = createTradeOrderWithRoundFee(db, {
    ledgerId: request.ledgerId,
    stockCode: request.stockCode,
    stockName: request.stockName,
    tradeType: request.tradeType,
    fills: [{ priceMilli: request.priceMilli, lots: request.lots }],
    tradeTime: request.tradeTime,
    remark: request.remark,
    tag: request.tag,
    roundFee: request.roundFee,
  })
  if (items.length === 0) {
    throw new AppError('成交明细不能为空', { status: 400 })
  }
  return items[0]
}
