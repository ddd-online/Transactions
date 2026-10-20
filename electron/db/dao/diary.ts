/**
 * 日记 DAO（**按账本隔离**），逐条移植自旧 `tr-store/src/dao/diary.rs`。
 *
 * 三处必须照抄的细节：
 * 1. `listDates` / `listDatesByKeyword` 只 SELECT `date, word_count, mood`，其余字段保持
 *    零值（`id` / `content` / 时间戳 / 账本都为空串或 0），随后由 service 映射成
 *    `DiaryDateItem`；
 * 2. `upsert` 的冲突键是 **`(ledger_id, date)`（账本内一天一篇）**，冲突时只更新
 *    `content / word_count / mood`，**不更新 `updated_at`**（更新列表里没有它）。
 *    同一日期在不同账本可以各存一篇，靠的是 schema 里的复合唯一索引；
 * 3. 关键词过滤用 `instr(content, ?) > 0`（区分大小写、不把 `%_` 当通配符）。
 *
 * 所有查询都必须带 `ledger_id` 条件：日记是账本私有数据，跨账本不可见。
 * SQL 只拼常量片段（表名 / 列名），值一律 `?`。
 */

import type { DiaryEntry } from '../../../shared/domain/models'
import { AppError } from '../../../shared/errors'
import type { Db } from '../driver'

const TABLE = 'diary_entry'
const COLUMNS = 'id, date, content, word_count, mood, created_at, updated_at, ledger_id'
const DATE_COLUMNS = 'date, word_count, mood'

interface DiaryRow {
  id: string
  date: string
  content: string | null
  word_count: number
  mood: string | null
  created_at: number
  updated_at: number
  ledger_id: string | null
}

interface DiaryDateRow {
  date: string
  word_count: number
  mood: string | null
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000)
}

/** 旧 DAO 以 `QueryReturnedNoRows` 表示"查无此行"；对外文案固定为 `record not found`。 */
function notFound(): AppError {
  return new AppError('record not found', { status: 404 })
}

function fromRow(row: DiaryRow): DiaryEntry {
  return {
    id: row.id,
    date: row.date,
    content: row.content ?? '',
    wordCount: row.word_count,
    mood: row.mood ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ledgerId: row.ledger_id ?? '',
  }
}

/** 日期列表专用映射：只填 date / wordCount / mood（与 `DATE_COLUMNS` 的 SELECT 列表一致）。 */
function fromDateRow(row: DiaryDateRow): DiaryEntry {
  return {
    id: '',
    date: row.date,
    content: '',
    wordCount: row.word_count,
    mood: row.mood ?? '',
    createdAt: 0,
    updatedAt: 0,
    ledgerId: '',
  }
}

/** 某账本的日期列表（倒序），只带日期 / 字数 / 心情。 */
export function listDates(db: Db, ledgerId: string): DiaryEntry[] {
  const rows = db
    .prepare(`SELECT ${DATE_COLUMNS} FROM ${TABLE} WHERE ledger_id = ? ORDER BY date DESC`)
    .all(ledgerId) as unknown as DiaryDateRow[]
  return rows.map(fromDateRow)
}

/** 某账本下正文包含关键词的日期列表（倒序）。 */
export function listDatesByKeyword(db: Db, ledgerId: string, keyword: string): DiaryEntry[] {
  const rows = db
    .prepare(
      `SELECT ${DATE_COLUMNS} FROM ${TABLE} WHERE ledger_id = ? AND instr(content, ?) > 0 ORDER BY date DESC`,
    )
    .all(ledgerId, keyword) as unknown as DiaryDateRow[]
  return rows.map(fromDateRow)
}

/** 某账本的全部日记（正序，导出用）。 */
export function listByLedger(db: Db, ledgerId: string): DiaryEntry[] {
  const rows = db
    .prepare(`SELECT ${COLUMNS} FROM ${TABLE} WHERE ledger_id = ? ORDER BY date ASC`)
    .all(ledgerId) as unknown as DiaryRow[]
  return rows.map(fromRow)
}

/** 按账本 + 日期查询；不存在时抛 `record not found`。 */
export function queryByDate(db: Db, ledgerId: string, date: string): DiaryEntry {
  const row = db
    .prepare(`SELECT ${COLUMNS} FROM ${TABLE} WHERE ledger_id = ? AND date = ?`)
    .get(ledgerId, date) as unknown as DiaryRow | undefined
  if (!row) throw notFound()
  return fromRow(row)
}

/**
 * 幂等写入（同账本同日期冲突则更新正文 / 字数 / 心情）。
 *
 * `now` 只用于**新插入**那一行；冲突分支不触碰 `created_at` / `updated_at`，
 * 与旧 DAO 的 `ON CONFLICT ... DO UPDATE` 更新列表逐字一致。
 */
export function upsert(db: Db, entry: DiaryEntry, now = nowUnix()): void {
  db.prepare(
    `INSERT INTO ${TABLE} (id, date, content, word_count, mood, created_at, updated_at, ledger_id) ` +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?) ' +
      'ON CONFLICT(ledger_id, date) DO UPDATE SET ' +
      'content = excluded.content, word_count = excluded.word_count, mood = excluded.mood',
  ).run(
    entry.id,
    entry.date,
    entry.content,
    entry.wordCount,
    entry.mood,
    now,
    now,
    entry.ledgerId,
  )
}

/** 按账本 + 日期删除（不存在不报错；别的账本的同日期不受影响）。 */
export function deleteByDate(db: Db, ledgerId: string, date: string): void {
  db.prepare(`DELETE FROM ${TABLE} WHERE ledger_id = ? AND date = ?`).run(ledgerId, date)
}
