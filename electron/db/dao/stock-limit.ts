import type { StockLimitEntry } from '../../../shared/types/stock-limit'
import type { Db } from '../driver'

/** `stock_limit_day` 的一行：某天抓过没有、抓到了几只。 */
export interface StockLimitDayRow {
  /** `ok` 有数据 / `empty` 该日无涨停 */
  status: 'ok' | 'empty'
  count: number
  fetchedAt: number
}

interface DayDbRow {
  status: string
  count: number
  fetched_at: number
}

interface EntryDbRow {
  stock_code: string
  stock_name: string
  market: number
  price_milli: number
  pct: number
  amount_cents: number
  float_mv_cents: number
  turnover: number
  level: number
  first_seal: number
  last_seal: number
  broken_count: number
  seal_fund_cents: number
  industry: string
  stat_days: number
  stat_count: number
}

const ENTRY_COLUMNS =
  'stock_code, stock_name, market, price_milli, pct, amount_cents, float_mv_cents, turnover, ' +
  'level, first_seal, last_seal, broken_count, seal_fund_cents, industry, stat_days, stat_count'

function entryFromRow(row: EntryDbRow): StockLimitEntry {
  return {
    stockCode: row.stock_code,
    stockName: row.stock_name,
    market: row.market,
    priceMilli: row.price_milli,
    pct: row.pct,
    amountCents: row.amount_cents,
    floatMvCents: row.float_mv_cents,
    turnover: row.turnover,
    level: row.level,
    firstSeal: row.first_seal,
    lastSeal: row.last_seal,
    brokenCount: row.broken_count,
    sealFundCents: row.seal_fund_cents,
    industry: row.industry,
    statDays: row.stat_days,
    statCount: row.stat_count,
  }
}

/** 某天是否已经抓过；没有返回 `null`。 */
export function getLimitDay(db: Db, date: string): StockLimitDayRow | null {
  const row = db
    .prepare('SELECT status, count, fetched_at FROM stock_limit_day WHERE trade_date = ?')
    .get(date) as DayDbRow | undefined
  if (!row) return null
  return {
    status: row.status === 'ok' ? 'ok' : 'empty',
    count: row.count,
    fetchedAt: row.fetched_at,
  }
}

/** 某天的涨停股，按首次封板时间升序（与天梯层内顺序一致）。 */
export function listLimitEntries(db: Db, date: string): StockLimitEntry[] {
  const rows = db
    .prepare(
      `SELECT ${ENTRY_COLUMNS} FROM stock_limit_pool WHERE trade_date = ? ` +
        'ORDER BY first_seal ASC, stock_code ASC',
    )
    .all(date) as unknown as EntryDbRow[]
  return rows.map(entryFromRow)
}

/** 用一次抓取结果覆盖某天：先删旧行再插入，最后写日标记。 */
export function saveLimitDay(
  db: Db,
  date: string,
  entries: readonly StockLimitEntry[],
  fetchedAt: number,
): void {
  db.transaction(() => {
    db.prepare('DELETE FROM stock_limit_pool WHERE trade_date = ?').run(date)
    db.prepare('DELETE FROM stock_limit_day WHERE trade_date = ?').run(date)

    if (entries.length > 0) {
      const insert = db.prepare(
        'INSERT INTO stock_limit_pool ' +
          `(trade_date, ${ENTRY_COLUMNS}) ` +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      for (const entry of entries) {
        insert.run(
          date,
          entry.stockCode,
          entry.stockName,
          entry.market,
          entry.priceMilli,
          entry.pct,
          entry.amountCents,
          entry.floatMvCents,
          entry.turnover,
          entry.level,
          entry.firstSeal,
          entry.lastSeal,
          entry.brokenCount,
          entry.sealFundCents,
          entry.industry,
          entry.statDays,
          entry.statCount,
        )
      }
    }

    db.prepare(
      'INSERT INTO stock_limit_day (trade_date, status, count, fetched_at) VALUES (?, ?, ?, ?)',
    ).run(date, entries.length > 0 ? 'ok' : 'empty', entries.length, fetchedAt)
  })
}
