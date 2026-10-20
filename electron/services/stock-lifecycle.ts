import { randomUUID } from 'node:crypto'

import { AppError } from '../../shared/errors'
import { currentRoundTrades } from '../../shared/domain/stock'
import { todayYmd } from '../../shared/domain/time'
import type { Db } from '../db/driver'
import { createLedger } from '../db/dao/ledger'
import { createFeeSetting, getFeeSetting } from '../db/dao/stock-settings'
import { listPositions, listTradesAsc } from '../db/dao/stock-trade'

/** 重置时清空的全部股票表（含配置与操作记录）。 */
const STOCK_TABLES = [
  'stock_fund_record',
  'stock_fee_setting',
  'stock_trade_tag_setting',
  'stock_review_setting',
  'stock_trade',
  'stock_trade_round',
  'stock_trade_history',
  'stock_day_review',
  'stock_position',
  'stock_operation',
  'stock_account',
] as const

/** 归档时改挂到新账本的数据表（配置表留在原账本）。 */
const STOCK_DATA_TABLES = [
  'stock_fund_record',
  'stock_trade',
  'stock_trade_round',
  'stock_trade_history',
  'stock_day_review',
  'stock_position',
  'stock_account',
] as const

/** 清空某账本的全部股票数据（单事务）。 */
export function resetStockData(db: Db, ledgerId: string): void {
  db.transaction(() => {
    for (const table of STOCK_TABLES) {
      db.prepare(`DELETE FROM ${table} WHERE ledger_id = ?`).run(ledgerId)
    }
  })
}

/**
 * 归档：把股票数据迁进一个当场新建的账本。
 *
 * 前提是没有未清仓的轮次（持仓 > 0 或还有未归档的成交）。费用设置复制一份到新账本，
 * 原账本保留配置；操作记录清空（目标行已搬走）。
 */
export function archiveStockData(db: Db, ledgerId: string, ledgerName: string): string {
  let newLedgerId = ''
  db.transaction(() => {
    const open: string[] = []
    for (const position of listPositions(db, ledgerId)) {
      const hasOpenRound = currentRoundTrades(
        listTradesAsc(db, ledgerId, position.stockCode),
      ).length > 0
      if (position.quantity > 0) {
        open.push(position.stockName === '' ? position.stockCode : position.stockName)
      } else if (hasOpenRound) {
        open.push(`${position.stockCode} （0 手）`)
      }
    }
    if (open.length > 0) {
      throw new AppError(
        `仍有未清仓的轮次（${open.join('、')}），请先清仓归档后再归档账本`,
        { status: 409 },
      )
    }

    newLedgerId = randomUUID()
    createLedger(db, {
      id: newLedgerId,
      name: ledgerName,
      description: `股票归档 ${todayYmd()}`,
    })

    const fee = getFeeSetting(db, ledgerId)
    if (fee) {
      createFeeSetting(db, { ...fee, id: randomUUID(), ledgerId: newLedgerId })
    }

    for (const table of STOCK_DATA_TABLES) {
      db.prepare(`UPDATE ${table} SET ledger_id = ? WHERE ledger_id = ?`).run(
        newLedgerId,
        ledgerId,
      )
    }
    db.prepare('DELETE FROM stock_operation WHERE ledger_id = ?').run(ledgerId)
  })
  return newLedgerId
}
