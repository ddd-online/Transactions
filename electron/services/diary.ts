/**
 * 日记服务：日期树（列表 / 查询）、导入（扫描目录 + 逐文件导入）、导出（按月 / 年筛选后
 * 写 `<date>.txt`）。
 *
 * 逐条移植自既有实现。导入与导出**都只支持 `.txt`**：正文是纯文本
 * （界面不做 Markdown 渲染），扫描时只认 `YYYY-MM-DD.txt`，导出也一律写 `.txt`，
 * 两个方向对称、导出即可再导入。
 *
 * **日记按账本隔离**：所有读写都必须带 `ledgerId`（唯一键是 `(ledger_id, date)`），
 * 导入落到指定账本，导出只导指定账本。
 *
 * 编码回退链（顺序是历史日记文件能正确导入的关键）：
 * 1. 合法 UTF-8 直接用（BOM 保留，与 `str::from_utf8` 一致）；
 * 2. 带 BOM 的 UTF-16（LE / BE）解码；
 * 3. 否则按 GBK 解码；
 * 4. 仍不合法则把非法 UTF-8 序列替换为 `?`（逐字节模拟 的 `Utf8Error::error_len`，
 *    见 {@link replaceInvalidUtf8}）。
 *
 * 错误文案保持既有行为的原文（`扫描目录失败:` / `读取文件失败` /
 * `只支持 YYYY-MM-DD.txt 格式的日记文件` / `创建导出目录失败:`），它们会原样经错误信封
 * 展示给用户，属于回归契约。
 */

import { randomUUID } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import { daysInMonth } from '../../shared/domain/calendar'
import type { DiaryDateItem, DiaryEntry } from '../../shared/domain/models'
import { AppError } from '../../shared/errors'
import type { DiaryExportResult, DiaryFileItem, DiaryScanResponse } from '../../shared/types/diary'
import type { Db } from '../db/driver'
import {
  deleteByDate as deleteByDateRow,
  listByLedger as listByLedgerRows,
  listDates as listDatesRows,
  queryByDate as queryByDateRow,
  upsert as upsertRow,
} from '../db/dao/diary'
import { logInfo } from '../logging'

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function nowUnix(): number {
  return Math.floor(Date.now() / 1000)
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Unicode 码点数（不是字节数）——与既有 `util::char_count` 同一口径。 */
function charCount(text: string): number {
  return Array.from(text).length
}

// ---------------------------------------------------------------- 日期 / 文件名

/**
 * `YYYY-MM-DD` 严格校验（含闰年）：格式不合法或日期不存在都算非法。
 *
 * 与既有 `stock::parse_strict_date` 同一口径：**恰好 10 个 ASCII 字符、零填充**，
 * `2026-1-01` / `2026/01/01` / `2026-02-29` 全部拒绝。
 */
export function isValidDiaryDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12) return false
  return day >= 1 && day <= daysInMonth(year, month)
}

/** `YYYY-MM-DD` → `[年, 月]`；日期非法返回 `null`。 */
export function parseDiaryYearMonth(value: string): [number, number] | null {
  if (!isValidDiaryDate(value)) return null
  return [Number(value.slice(0, 4)), Number(value.slice(5, 7))]
}

/**
 * 匹配 `^(\d{4}-\d{2}-\d{2})\.txt$`，并校验日期真实存在。
 *
 * 只认 `.txt`：别的扩展名（`.md` / `.markdown` / 无扩展名…）一律跳过，不猜内容格式。
 * 扩展名大小写敏感（`TXT` 不认），与既有行为的 `rsplit_once('.')` 一致。
 */
function parseDiaryFileName(name: string): string | null {
  const dot = name.lastIndexOf('.')
  if (dot < 0) return null
  if (name.slice(dot + 1) !== 'txt') return null
  const stem = name.slice(0, dot)
  return isValidDiaryDate(stem) ? stem : null
}

// ---------------------------------------------------------------- 文本解码

interface Utf8Sequence {
  /** 整个字符占的字节数（2 / 3 / 4）。 */
  length: number
  /** 第二个字节的允许区间（首字节已定长，后续延续字节固定 0x80–0xBF）。 */
  secondMin: number
  secondMax: number
}

/** 首字节 → 序列形状；非法首字节（含孤立延续字节与 5/6 字节旧式序列）返回 `null`。 */
function utf8Sequence(first: number): Utf8Sequence | null {
  if (first >= 0xc2 && first <= 0xdf) return { length: 2, secondMin: 0x80, secondMax: 0xbf }
  if (first === 0xe0) return { length: 3, secondMin: 0xa0, secondMax: 0xbf }
  if (first >= 0xe1 && first <= 0xec) return { length: 3, secondMin: 0x80, secondMax: 0xbf }
  if (first === 0xed) return { length: 3, secondMin: 0x80, secondMax: 0x9f }
  if (first >= 0xee && first <= 0xef) return { length: 3, secondMin: 0x80, secondMax: 0xbf }
  if (first === 0xf0) return { length: 4, secondMin: 0x90, secondMax: 0xbf }
  if (first >= 0xf1 && first <= 0xf3) return { length: 4, secondMin: 0x80, secondMax: 0xbf }
  if (first === 0xf4) return { length: 4, secondMin: 0x80, secondMax: 0x8f }
  return null
}

function decodeUtf8CodePoint(raw: Uint8Array, index: number, length: number): string {
  const first = raw[index]
  if (length === 2) {
    return String.fromCodePoint(((first & 0x1f) << 6) | (raw[index + 1] & 0x3f))
  }
  if (length === 3) {
    return String.fromCodePoint(
      ((first & 0x0f) << 12) | ((raw[index + 1] & 0x3f) << 6) | (raw[index + 2] & 0x3f),
    )
  }
  return String.fromCodePoint(
    ((first & 0x07) << 18) |
      ((raw[index + 1] & 0x3f) << 12) |
      ((raw[index + 2] & 0x3f) << 6) |
      (raw[index + 3] & 0x3f),
  )
}

/**
 * 把非法 UTF-8 序列替换为 `?`（合法前缀原样保留）。
 *
 * 跳过长度按 的 `Utf8Error::error_len` 口径：首字节非法 / 约束不满足时推进到
 * **出错的那个字节**（可能只推进 1 字节），序列在文件末尾被截断时只推进 1 字节。
 * 这样同一段坏字节在 与这里产生的 `?` 数量一致。
 */
function replaceInvalidUtf8(raw: Uint8Array): string {
  const output: string[] = []
  let index = 0
  while (index < raw.length) {
    const first = raw[index]
    if (first < 0x80) {
      output.push(String.fromCharCode(first))
      index += 1
      continue
    }
    const sequence = utf8Sequence(first)
    if (sequence === null) {
      output.push('?')
      index += 1
      continue
    }

    let skip = 0
    for (let offset = 1; offset < sequence.length; offset += 1) {
      if (index + offset >= raw.length) {
        // 文件在字符中间结束：的 error_len 是 None，替换循环按 1 字节推进
        skip = 1
        break
      }
      const byte = raw[index + offset]
      const min = offset === 1 ? sequence.secondMin : 0x80
      const max = offset === 1 ? sequence.secondMax : 0xbf
      if (byte < min || byte > max) {
        skip = offset
        break
      }
    }
    if (skip > 0) {
      output.push('?')
      index += skip
      continue
    }
    output.push(decodeUtf8CodePoint(raw, index, sequence.length))
    index += sequence.length
  }
  return output.join('')
}

/** 带 BOM 的 UTF-16 解码；无 BOM 返回 `null`。 */
function decodeUtf16(raw: Uint8Array): string | null {
  if (raw.length < 2) return null
  let littleEndian: boolean
  if (raw[0] === 0xff && raw[1] === 0xfe) {
    littleEndian = true
  } else if (raw[0] === 0xfe && raw[1] === 0xff) {
    littleEndian = false
  } else {
    return null
  }
  // 用 chunks_exact(2) 丢掉末尾的孤立字节；这里同样先裁成偶数长度
  const bodyLength = raw.length - 2 - ((raw.length - 2) % 2)
  const body = raw.subarray(2, 2 + bodyLength)
  return new TextDecoder(littleEndian ? 'utf-16le' : 'utf-16be', { ignoreBOM: true }).decode(body)
}

/**
 * 文本解码回退链：UTF-8 → UTF-16(BOM) → GBK → 非法序列替换为 `?`。
 *
 * `ignoreBOM: true` 是刻意的：的 `str::from_utf8` 不剥 UTF-8 BOM，导出再导入时
 * 正文必须逐字节还原（默认的 TextDecoder 会把 BOM 吃掉）。
 */
function decodeText(raw: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(raw)
  } catch {
    // 不是合法 UTF-8，继续回退链
  }
  const utf16 = decodeUtf16(raw)
  if (utf16 !== null) return utf16
  try {
    return new TextDecoder('gbk', { fatal: true }).decode(raw)
  } catch {
    return replaceInvalidUtf8(raw)
  }
}

// ---------------------------------------------------------------- 服务函数

/** 某账本的日期列表（倒序）。 */
export function listDates(db: Db, ledgerId: string): DiaryDateItem[] {
  return listDatesRows(db, ledgerId).map((entry) => ({
    date: entry.date,
    wordCount: entry.wordCount,
    mood: entry.mood,
  }))
}

/** 按账本 + 日期取日记；不存在时报 `record not found`（而不是返回空条目）。 */
export function getByDate(db: Db, ledgerId: string, date: string): DiaryEntry {
  return queryByDateRow(db, ledgerId, date)
}

/**
 * 保存日记，返回写入后的条目（字数按 Unicode 码点数计算）。
 *
 * 同账本同日期是覆盖保存：DAO 保留原 `id` / `created_at` / `updated_at`，但返回值仍是
 * 本次构造的新条目（与既有行为一致）。
 */
export function upsert(
  db: Db,
  ledgerId: string,
  date: string,
  content: string,
  mood: string,
): DiaryEntry {
  const now = nowUnix()
  const entry: DiaryEntry = {
    id: randomUUID(),
    date,
    content,
    wordCount: charCount(content),
    mood,
    createdAt: now,
    updatedAt: now,
    ledgerId,
  }
  upsertRow(db, entry, now)
  return entry
}

/** 删除某账本某天的日记（别的账本的同一天不受影响）。 */
export function deleteByDate(db: Db, ledgerId: string, date: string): void {
  logInfo(`删除日记, 账本: ${ledgerId}, 日期: ${date}`)
  deleteByDateRow(db, ledgerId, date)
}

/** 递归收集日记文件（遇到错误即中止）。 */
function collectDiaryFiles(directory: string, out: DiaryFileItem[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      collectDiaryFiles(path, out)
      continue
    }
    const date = parseDiaryFileName(entry.name)
    if (date !== null) out.push({ date, path })
  }
}

/**
 * 递归扫描目录，找出 `YYYY-MM-DD.txt` 并按日期升序返回（**其它扩展名一律跳过**）。
 *
 * 只读文件系统、不碰数据库，因此**不需要账本**。
 */
export function scanDirectory(directory: string): DiaryScanResponse {
  const files: DiaryFileItem[] = []
  try {
    collectDiaryFiles(directory, files)
  } catch (error) {
    throw new AppError(`扫描目录失败: ${errorText(error)}`, { status: 500 })
  }
  files.sort((left, right) => {
    if (left.date === right.date) return 0
    return left.date < right.date ? -1 : 1
  })
  return { files }
}

/**
 * 导入单个文件（编码自动识别）到指定账本，导入后返回条目。
 *
 * 与扫描同一口径：**只接受 `.txt`**。界面走的顺序是"扫描 → 逐个导入"，文件是扫描
 * 挑出来的，这里再挡一次是防"调用方自己传了别的文件"。
 */
export function importFile(
  db: Db,
  ledgerId: string,
  path: string,
  date: string,
): DiaryEntry {
  const name = basename(path)
  if (parseDiaryFileName(name) === null) {
    throw new AppError(`只支持 YYYY-MM-DD.txt 格式的日记文件: ${path}`, { status: 500 })
  }
  let raw: Uint8Array
  try {
    raw = readFileSync(path)
  } catch (error) {
    throw new AppError(`读取文件失败 ${path}: ${errorText(error)}`, { status: 500 })
  }
  return upsert(db, ledgerId, date, decodeText(raw), '')
}

/**
 * 把某账本的日记导出到目录：`year` / `month` 为 0 表示不限（`month` 需配合 `year`）。
 *
 * 写文件用 UTF-8（既有行为的 `content.as_bytes()`），因此导出的目录可以直接再扫描导入。
 */
export function exportToDirectory(
  db: Db,
  ledgerId: string,
  directory: string,
  year: number,
  month: number,
): DiaryExportResult {
  let entries = listByLedgerRows(db, ledgerId)

  if (year > 0 || month > 0) {
    entries = entries.filter((entry) => {
      const parsed = parseDiaryYearMonth(entry.date)
      if (parsed === null) return false // 日期非法：直接跳过
      if (year > 0 && parsed[0] !== year) return false
      if (month > 0 && parsed[1] !== month) return false
      return true
    })
  }

  try {
    mkdirSync(directory, { recursive: true })
  } catch (error) {
    throw new AppError(`创建导出目录失败: ${errorText(error)}`, { status: 500 })
  }

  const result: DiaryExportResult = {
    total: entries.length,
    success: 0,
    failed: [],
  }

  for (const entry of entries) {
    try {
      writeFileSync(join(directory, `${entry.date}.txt`), entry.content, 'utf8')
      result.success += 1
    } catch (error) {
      result.failed.push({ date: entry.date, error: errorText(error) })
    }
  }

  return result
}
