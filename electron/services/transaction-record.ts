import { randomUUID } from 'node:crypto'

import { AppError } from '../../shared/errors'
import { TRANSACTION_TYPES } from '../../shared/domain/consts'
import type { ChartLine, TransactionRecord, TrTag } from '../../shared/domain/models'
import type {
  ChartLineData,
  ChartQueryRequest,
  ChartQueryResponse,
  TransactionRecordDto,
  TrQueryCondition,
  TrQueryResult,
} from '../../shared/types/transaction'
import type { Db } from '../db/driver'
import {
  create as createRecord,
  createBatch as createRecords,
  deleteById as deleteRecord,
  queryByKeyEventDate,
  queryById as queryRecordById,
  queryChartLineData,
  queryFiltered,
  queryStatistics,
  updateKeyEventDate,
} from '../db/dao/transaction-record'
import {
  createBatch as createTagLinks,
  deleteByTrId as deleteTagLinks,
  queryByTrIds,
} from '../db/dao/transaction-record-tag'
import { logError, logInfo } from '../logging'

function nowUnix(): number {
  return Math.floor(Date.now() / 1000)
}

export function validateTransactionDto(dto: TransactionRecordDto): void {
  if (dto.ledgerId.trim().length === 0) {
    throw new AppError('LedgerID is empty', { status: 400 })
  }
  if (!(TRANSACTION_TYPES as readonly string[]).includes(dto.transactionType)) {
    throw new AppError(`invalid TransactionType: ${dto.transactionType}`, { status: 400 })
  }
}

function recordFromDto(dto: TransactionRecordDto, transactionId: string): TransactionRecord {
  return {
    transactionId,
    ledgerId: dto.ledgerId,
    amountCents: dto.price,
    transactionType: dto.transactionType,
    category: dto.category,
    description: dto.description,
    flags: JSON.stringify({ outlier: dto.outlier }),
    // 新建记录一律不关联关键事件；关联只能走 link。
    keyEventDate: '',
    transactionAt: dto.transactionAt,
    createdAt: 0,
    updatedAt: 0,
  }
}

function outlierOf(flags: string): boolean {
  try {
    const parsed = JSON.parse(flags) as { outlier?: unknown }
    return parsed.outlier === true
  } catch {
    return false
  }
}

function dtoFromRecord(record: TransactionRecord, tags: readonly string[]): TransactionRecordDto {
  return {
    ledgerId: record.ledgerId,
    transactionId: record.transactionId,
    price: record.amountCents,
    transactionType: record.transactionType,
    category: record.category,
    description: record.description,
    tags: [...tags],
    transactionAt: record.transactionAt,
    outlier: outlierOf(record.flags),
    keyEventDate: record.keyEventDate,
  }
}

function tagsOf(record: TransactionRecord, dto: TransactionRecordDto): TrTag[] {
  return dto.tags.map((tag) => ({
    ledgerId: record.ledgerId,
    transactionId: record.transactionId,
    tag,
  }))
}

/** 新建一条消费记录，返回新记录 ID。 */
export function createTr(db: Db, dto: TransactionRecordDto): string {
  validateTransactionDto(dto)
  const transactionId = randomUUID()
  const record = recordFromDto(dto, transactionId)
  try {
    db.transaction(() => {
      createRecord(db, record)
      createTagLinks(db, tagsOf(record, dto))
    })
  } catch (error) {
    logError(`创建交易记录失败: ${String(error)}`)
    throw error instanceof AppError ? error : new AppError('创建交易记录失败', { status: 500 })
  }
  return transactionId
}

/** 批量新建，返回成功创建条数。 */
export function batchCreateTr(db: Db, dtos: readonly TransactionRecordDto[]): number {
  logInfo(`开始批量创建 ${dtos.length} 条交易记录`)
  if (dtos.length === 0) return 0

  const records: TransactionRecord[] = []
  const tags: TrTag[] = []
  for (const dto of dtos) {
    validateTransactionDto(dto)
    const transactionId = randomUUID()
    const record = recordFromDto(dto, transactionId)
    records.push(record)
    tags.push(...tagsOf(record, dto))
  }

  try {
    db.transaction(() => {
      createRecords(db, records)
      if (tags.length > 0) createTagLinks(db, tags)
    })
  } catch (error) {
    logError(`批量创建交易记录失败: ${String(error)}`)
    throw error instanceof AppError ? error : new AppError('批量创建交易记录失败', { status: 500 })
  }
  logInfo(`批量创建交易记录成功, 数量: ${dtos.length}`)
  return dtos.length
}

/** 条件查询：筛选 + 排序 + 分页 + 标签补齐 + 范围统计。 */
export function queryTrsOnCondition(db: Db, condition: TrQueryCondition): TrQueryResult {
  if (condition.ledgerId.length === 0) {
    throw new AppError(`账本Id不可为空: ${condition.ledgerId}`, { status: 400 })
  }

  const result = queryFiltered(db, condition)
  const ids = result.items.map((record) => record.transactionId)
  const tagMap = queryByTrIds(db, ids)
  const items = result.items.map((record) =>
    dtoFromRecord(
      record,
      (tagMap[record.transactionId] ?? []).map((tag) => tag.tag),
    ),
  )

  const pageSize = condition.limit <= 0 ? items.length : condition.limit
  let totalPages = 0
  if (pageSize > 0) {
    totalPages =
      result.total % pageSize !== 0
        ? Math.floor(result.total / pageSize) + 1
        : Math.floor(result.total / pageSize)
  }
  const page =
    condition.limit > 0 && condition.offset >= 0
      ? Math.floor(condition.offset / condition.limit) + 1
      : 1

  return {
    items,
    total: result.total,
    page,
    page_size: pageSize,
    total_pages: totalPages,
    trStatistics: {
      income: result.statistics.income,
      expense: result.statistics.expense,
      transfer: result.statistics.transfer,
    },
  }
}

/** 数据分析页：逐曲线分桶聚合 + 连续时间轴补零 + 范围统计。 */
export function queryTrsForChart(db: Db, request: ChartQueryRequest): ChartQueryResponse {
  let minBucket = ''
  let maxBucket = ''
  const pointsPerLine: ReturnType<typeof queryChartLineData>[] = []

  for (const line of request.lines) {
    const points = queryChartLineData(
      db,
      request.ledgerId,
      request.tsRange,
      request.granularity,
      line as ChartLine,
    )
    for (const point of points) {
      if (minBucket.length === 0 || point.time < minBucket) minBucket = point.time
      if (maxBucket.length === 0 || point.time > maxBucket) maxBucket = point.time
    }
    pointsPerLine.push(points)
  }

  const statistics = queryStatistics(db, request.ledgerId, request.tsRange)
  const labels = chartTimeLabels(minBucket, maxBucket, request.granularity)
  const lines: ChartLineData[] = request.lines.map((line, index) => {
    const byBucket = new Map(pointsPerLine[index].map((point) => [point.time, point.amount]))
    return {
      label: line.label,
      type: line.transactionType,
      data: labels.map((time) => ({ time, amount: byBucket.get(time) ?? 0 })),
    }
  })

  return {
    lines,
    statistics: {
      income: statistics.income,
      expense: statistics.expense,
      transfer: statistics.transfer,
    },
  }
}

/** 删除记录及其标签关联（同一事务）。 */
export function deleteTrById(db: Db, transactionId: string): void {
  try {
    db.transaction(() => {
      deleteTagLinks(db, transactionId)
      deleteRecord(db, transactionId)
    })
  } catch (error) {
    logError(`删除交易记录失败: ${String(error)}`)
    throw error instanceof AppError ? error : new AppError('删除交易记录失败', { status: 500 })
  }
}

/** 关联到关键事件；目标日期没有关键事件时自动创建一条空事件。 */
export function linkToKeyEvent(db: Db, transactionId: string, date: string): void {
  try {
    db.transaction(() => {
      let record: TransactionRecord
      try {
        record = queryRecordById(db, transactionId)
      } catch {
        throw new AppError(`transaction not found: ${transactionId}`, { status: 500 })
      }
      updateKeyEventDate(db, transactionId, date)
      const existing = db
        .prepare('SELECT id FROM key_event WHERE ledger_id = ? AND date = ?')
        .get(record.ledgerId, date)
      if (!existing) {
        const now = nowUnix()
        db.prepare(
          'INSERT INTO key_event (id, date, title, content, color, created_at, updated_at, ledger_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ).run(randomUUID(), date, '', '', '', now, now, record.ledgerId)
        logInfo(`自动创建空关键事件, 日期: ${date}`)
      }
    })
  } catch (error) {
    logError(`关联交易 ${transactionId} 到关键事件 ${date} 失败: ${String(error)}`)
    throw error instanceof AppError ? error : new AppError('关联关键事件失败', { status: 500 })
  }
}

/** 解除关键事件关联（把 key_event_date 清空）。 */
export function unlinkFromKeyEvent(db: Db, transactionId: string): void {
  try {
    queryRecordById(db, transactionId)
    updateKeyEventDate(db, transactionId, '')
  } catch (error) {
    if (error instanceof AppError && error.status === 404) {
      throw new AppError(`transaction not found: ${transactionId}`, { status: 500 })
    }
    throw error instanceof AppError ? error : new AppError('解除关联失败', { status: 500 })
  }
}

/** 某账本下关联到指定日期的全部记录（含标签）。 */
export function queryLinkedByDate(db: Db, ledgerId: string, date: string): TransactionRecordDto[] {
  const records = queryByKeyEventDate(db, ledgerId, date)
  const tagMap = queryByTrIds(
    db,
    records.map((record) => record.transactionId),
  )
  return records.map((record) =>
    dtoFromRecord(
      record,
      (tagMap[record.transactionId] ?? []).map((tag) => tag.tag),
    ),
  )
}

/** 由实际桶范围生成连续时间轴；月 `YYYY-MM`、年 `YYYY`。 */
export function chartTimeLabels(minBucket: string, maxBucket: string, granularity: string): string[] {
  if (minBucket.length === 0) return []

  if (granularity === 'year') {
    const minYear = Number(minBucket)
    const maxYear = Number(maxBucket)
    if (!Number.isInteger(minYear) || !Number.isInteger(maxYear)) return []
    const labels: string[] = []
    for (let year = minYear; year <= maxYear; year += 1) labels.push(String(year))
    return labels
  }

  const min = parseYearMonth(minBucket)
  const max = parseYearMonth(maxBucket)
  if (!min || !max) return []
  if (min[0] > max[0] || (min[0] === max[0] && min[1] > max[1])) return []

  const labels: string[] = []
  let [year, month] = min
  while (year < max[0] || (year === max[0] && month <= max[1])) {
    labels.push(`${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`)
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return labels
}

function parseYearMonth(value: string): [number, number] | null {
  const parts = value.split('-')
  if (parts.length !== 2) return null
  if (parts[0].length !== 4 || parts[1].length !== 2) return null
  const year = Number(parts[0])
  const month = Number(parts[1])
  if (!Number.isInteger(year) || !Number.isInteger(month)) return null
  if (month < 1 || month > 12) return null
  return [year, month]
}
