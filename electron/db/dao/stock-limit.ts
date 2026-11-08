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

/**
 * 断板当天的行情：涨跌幅（百分数，算不出时 `null`）与价格（厘）。
 *
 * 只对**收盘定稿**的日期有值 —— 见 `services/stock-limit` 的落库纪律。
 */
export interface BrokenQuote {
  pct: number | null
  priceMilli: number
}

interface BrokenQuoteDbRow {
  stock_code: string
  pct: number | null
  price_milli: number
}

/** 某天已经存下的断板行情，按代码索引；没有就是空映射。 */
export function listBrokenQuotes(db: Db, date: string): Map<string, BrokenQuote> {
  const rows = db
    .prepare(
      'SELECT stock_code, pct, price_milli FROM stock_limit_broken_quote WHERE trade_date = ?',
    )
    .all(date) as unknown as BrokenQuoteDbRow[]
  return new Map(
    rows.map((row) => [row.stock_code, { pct: row.pct, priceMilli: row.price_milli }]),
  )
}

/**
 * 写某天的断板行情（只覆盖同一天的同一只股票，不动别的日期）。
 *
 * 用 `INSERT OR REPLACE` 而不是先删后插：一天的断板是"昨日池 − 今日池"算出来的，
 * 分开几次补（有的股票有行情、有的停牌）时，已经存下的那几行不该被删掉。
 */
export function saveBrokenQuotes(
  db: Db,
  date: string,
  quotes: ReadonlyMap<string, BrokenQuote>,
  fetchedAt: number,
): void {
  if (quotes.size === 0) return
  const insert = db.prepare(
    'INSERT OR REPLACE INTO stock_limit_broken_quote ' +
      '(trade_date, stock_code, pct, price_milli, fetched_at) VALUES (?, ?, ?, ?, ?)',
  )
  db.transaction(() => {
    for (const [code, quote] of quotes) {
      insert.run(date, code, quote.pct, quote.priceMilli, fetchedAt)
    }
  })
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
