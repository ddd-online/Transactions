/**
 * 股票名称的查询与刷新。
 *
 * 名称是行情源的**显示名**，**代码才是身份**：除权除息当天行情会把名字换成 `XD工商银`，
 * ST 摘帽、公司更名也会让同一个代码换名字。所以名称只能当缓存看待，两种用法方向相反：
 *
 * * 建仓补名（{@link lookupStockName}）先读本地、读不到再问行情 —— 一次录入不该为了名字卡在网络；
 * * 刷新名称（{@link refreshStockName}）**只认代码**：不问本地，直接去行情取当前名称，
 *   再把账本里该股冗余的名称一起改掉（持仓行 / 成交行 / 历史集合 / 心得）。
 *
 * 有意不改的一处：已经记下的账本文字（事件正文与备注）。那是当时那笔交易的样子，
 * 一并改写就不是账本了 —— 界面上该股的新名字，只影响"这一只股票叫什么"。
 */

import { isValidStockCode } from '../../shared/domain/fee'
import { AppError } from '../../shared/errors'
import type { StockNameDto } from '../../shared/types/stock-position'
import type { Db } from '../db/driver'
import { updateLessonStockName } from '../db/dao/stock-lesson'
import { updateHistoryStockName, updateStockName } from '../db/dao/stock-trade'
import type { StockQuoteFetcher } from './stock-quote'

/** 股票名称：先查本地成交，未命中走行情；都没有时报 404。 */
export async function lookupStockName(
  db: Db,
  fetcher: StockQuoteFetcher,
  stockCode: string,
): Promise<StockNameDto> {
  if (!stockCode) throw new AppError('stock_code is required', { status: 400 })
  try {
    const row = db
      .prepare(
        "SELECT stock_name FROM stock_trade WHERE stock_code = ? AND stock_name != '' LIMIT 1",
      )
      .get(stockCode) as { stock_name: string } | undefined
    if (row && row.stock_name) return { stockCode, stockName: row.stock_name }
  } catch {
    // 本地查询失败继续走外部行情
  }
  const name = await fetcher.fetchName(stockCode)
  if (!name) throw new AppError(`未找到股票: ${stockCode}`, { status: 404 })
  return { stockCode, stockName: name }
}

/**
 * 以代码为准刷新名称：行情取当前名称 → 写回账本里该股的全部名称副本。
 *
 * 行情查不到名称时报 502（行情是临时外部数据，但不能把"没拿到"当成"没变化"）；
 * 三次 UPDATE 在一个事务里，要么全成、要么全不成。
 */
export async function refreshStockName(
  db: Db,
  fetcher: StockQuoteFetcher,
  ledgerId: string,
  stockCode: string,
): Promise<StockNameDto> {
  if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
  const code = stockCode.trim()
  if (!isValidStockCode(code)) throw new AppError(`股票代码不合法: ${code}`, { status: 400 })
  const name = (await fetcher.fetchName(code)).trim()
  if (name === '') throw new AppError(`行情没有返回 ${code} 的名称`, { status: 502 })
  db.transaction(() => {
    updateStockName(db, ledgerId, code, name)
    updateHistoryStockName(db, ledgerId, code, name)
    updateLessonStockName(db, ledgerId, code, name)
  })
  return { stockCode: code, stockName: name }
}
