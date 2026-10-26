import { randomUUID } from 'node:crypto'

import { STOCK_TRADE_ADD, STOCK_TRADE_CLOSE, STOCK_TRADE_OPEN, STOCK_TRADE_REDUCE } from '../../shared/domain/consts'
import { centsToYuan, milliToYuan } from '../../shared/domain/money'
import { currentRoundTrades } from '../../shared/domain/stock'
import type { StockTrade } from '../../shared/domain/models'
import type { StockLedgerDto } from '../../shared/types/stock-ledger'
import { AppError } from '../../shared/errors'
import type { Db } from '../db/driver'
import {
  attachOpenStockLedger,
  getOpenStockLedger,
  getStockLedgerByRound,
  insertStockLedger,
  type StockLedgerRow,
  updateStockLedger,
} from '../db/dao/stock-ledger'
import { getTradeRound, listTradesAsc, listTradesByRound } from '../db/dao/stock-trade'

function nowUnix(): number {
  return Math.floor(Date.now() / 1000)
}

function cny(cents: number): string {
  return `¥${centsToYuan(cents)}`
}

function averagePrice(trades: readonly StockTrade[], side: 'buy' | 'sell'): string {
  let amount = 0
  let shares = 0
  for (const trade of trades) {
    if (side === 'buy' && (trade.tradeType === STOCK_TRADE_OPEN || trade.tradeType === STOCK_TRADE_ADD)) {
      amount += trade.amount
      shares += trade.shares
    }
    if (side === 'sell' && (trade.tradeType === STOCK_TRADE_REDUCE || trade.tradeType === STOCK_TRADE_CLOSE)) {
      amount += trade.amount
      shares += trade.shares
    }
  }
  if (shares <= 0) return ''
  return milliToYuan(Math.round((amount / shares) * 10))
}

interface LedgerNumbers {
  buyPrice: string
  buyCost: string
  sellPrice: string
  sellNet: string
  netPnl: string
}

/** 由一轮成交推导台账里的只读数字（分 / 厘口径与股票页一致）。 */
function numbersOf(trades: readonly StockTrade[], closed: boolean): LedgerNumbers {
  let buyCost = 0
  let sellNet = 0
  for (const trade of trades) {
    if (trade.tradeType === STOCK_TRADE_OPEN || trade.tradeType === STOCK_TRADE_ADD) {
      buyCost += trade.amount + trade.fee
    } else if (trade.tradeType === STOCK_TRADE_REDUCE || trade.tradeType === STOCK_TRADE_CLOSE) {
      sellNet += trade.amount - trade.fee
    }
  }
  if (!closed) {
    return {
      buyPrice: averagePrice(trades, 'buy'),
      buyCost: trades.some((trade) => trade.tradeType === STOCK_TRADE_OPEN || trade.tradeType === STOCK_TRADE_ADD)
        ? cny(buyCost)
        : '',
      sellPrice: '',
      sellNet: '',
      netPnl: '',
    }
  }
  return {
    buyPrice: averagePrice(trades, 'buy'),
    buyCost: cny(buyCost),
    sellPrice: averagePrice(trades, 'sell'),
    sellNet: cny(sellNet),
    netPnl: cny(sellNet - buyCost),
  }
}

function emptyDto(closed: boolean, roundId: string | null, numbers: LedgerNumbers): StockLedgerDto {
  return {
    exists: false,
    roundId,
    closed,
    whyBuy: '',
    stopLoss: '',
    takeProfit: '',
    followedSystem: '',
    summary: '',
    ...numbers,
  }
}

function toDto(row: StockLedgerRow, closed: boolean, numbers: LedgerNumbers): StockLedgerDto {
  return {
    exists: true,
    roundId: row.roundId,
    closed,
    whyBuy: row.whyBuy,
    stopLoss: row.stopLoss,
    takeProfit: row.takeProfit,
    followedSystem: row.followedSystem,
    summary: row.summary,
    ...numbers,
  }
}

function trimmedFields(input: LedgerFields): LedgerFields {
  const fields = {
    whyBuy: input.whyBuy.trim(),
    stopLoss: input.stopLoss.trim(),
    takeProfit: input.takeProfit.trim(),
    followedSystem: input.followedSystem.trim(),
    summary: input.summary.trim(),
  }
  const total = Object.values(fields).reduce((sum, value) => sum + value.length, 0)
  if (total === 0) throw new AppError('台账至少填写一项', { status: 400 })
  for (const [key, value] of Object.entries(fields)) {
    if (value.length > 2000) throw new AppError(`${key} 最多 2000 字`, { status: 400 })
  }
  return fields
}

export interface LedgerFields {
  whyBuy: string
  stopLoss: string
  takeProfit: string
  followedSystem: string
  summary: string
}

function roundTrades(db: Db, ledgerId: string, roundId: string): StockTrade[] {
  const round = getTradeRound(db, roundId)
  if (round.ledgerId !== ledgerId) throw new AppError('交易轮次不存在', { status: 404 })
  return listTradesByRound(db, roundId)
}

/** 持仓页/记录页读取台账；没有保存过时返回带自动数字的空壳。 */
export function getStockLedger(
  db: Db,
  ledgerId: string,
  input: { stockCode?: string | null; roundId?: string | null },
): StockLedgerDto {
  if (input.roundId) {
    const trades = roundTrades(db, ledgerId, input.roundId)
    const numbers = numbersOf(trades, true)
    const row = getStockLedgerByRound(db, ledgerId, input.roundId)
    return row ? toDto(row, true, numbers) : emptyDto(true, input.roundId, numbers)
  }
  const stockCode = input.stockCode ?? ''
  if (!stockCode) throw new AppError('stock_code or round_id is required', { status: 400 })
  const trades = listTradesAsc(db, ledgerId, stockCode)
  const current = currentRoundTrades(trades)
  const numbers = numbersOf(current, false)
  const row = getOpenStockLedger(db, ledgerId, stockCode)
  return row ? toDto(row, false, numbers) : emptyDto(false, null, numbers)
}

/** 保存台账：持仓期写 round_id 为空的行，记录页写该轮的行。 */
export function saveStockLedger(
  db: Db,
  ledgerId: string,
  input: {
    stockCode?: string | null
    roundId?: string | null
    fields: LedgerFields
  },
): StockLedgerDto {
  const fields = trimmedFields(input.fields)
  const now = nowUnix()
  if (input.roundId) {
    const round = getTradeRound(db, input.roundId)
    if (round.ledgerId !== ledgerId) throw new AppError('交易轮次不存在', { status: 404 })
    const existing = getStockLedgerByRound(db, ledgerId, input.roundId)
    const row: StockLedgerRow = {
      id: existing?.id ?? randomUUID(),
      ledgerId,
      stockCode: round.stockCode,
      roundId: input.roundId,
      ...fields,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    if (existing) updateStockLedger(db, row)
    else insertStockLedger(db, row)
    return toDto(row, true, numbersOf(listTradesByRound(db, input.roundId), true))
  }

  const stockCode = input.stockCode ?? ''
  if (!stockCode) throw new AppError('stock_code or round_id is required', { status: 400 })
  const current = currentRoundTrades(listTradesAsc(db, ledgerId, stockCode))
  if (current.length === 0) {
    throw new AppError('该股票没有进行中的轮次', { status: 400 })
  }
  const existing = getOpenStockLedger(db, ledgerId, stockCode)
  const row: StockLedgerRow = {
    id: existing?.id ?? randomUUID(),
    ledgerId,
    stockCode,
    roundId: null,
    ...fields,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  if (existing) updateStockLedger(db, row)
  else insertStockLedger(db, row)
  return toDto(row, false, numbersOf(current, false))
}

/** 清仓时把持仓期台账挂到新轮次（由 stock-trade-write 在归档事务里调用）。 */
export function attachStockLedger(
  db: Db,
  ledgerId: string,
  stockCode: string,
  roundId: string,
  at: number,
): void {
  attachOpenStockLedger(db, ledgerId, stockCode, roundId, at)
}
