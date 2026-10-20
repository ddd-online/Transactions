import type { Db } from '../driver'
import type { Chart } from '../../../shared/domain/models'

const COLUMNS =
  'chart_id, ledger_id, title, granularity, chart_lines, chart_type, is_preset, sort_order, created_at, updated_at'

interface ChartRow {
  chart_id: string
  ledger_id: string
  title: string
  granularity: string
  chart_lines: string
  chart_type: string
  is_preset: number
  sort_order: number
  created_at: number
  updated_at: number
}

function fromRow(row: ChartRow): Chart {
  return {
    chartId: row.chart_id,
    ledgerId: row.ledger_id,
    title: row.title,
    granularity: row.granularity,
    chartLines: row.chart_lines,
    chartType: row.chart_type,
    // 基线 schema 里 `is_preset` 是 numeric：按整数 0/1 存储，读回成布尔
    isPreset: row.is_preset !== 0,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000)
}

/**
 * 图表 DAO。
 *
 * 行为约定（与旧 `tr-store/src/dao/chart.rs` 一致）：
 * - `createChart` 自动填充 `created_at` / `updated_at`（均为秒级 Unix 秒，且两列同值）
 * - `saveChart` 是"按主键写回全部字段"，并刷新 `updated_at`：`ledger_id` / `created_at`
 *   保持调用方传入的值（因此整行回写不会改掉创建时间）
 * - 列表排序固定为 `ORDER BY sort_order ASC, created_at DESC`
 *   （**预设图表不再优先**：列表可拖拽排序，`is_preset` 只决定面板里能不能编辑）
 * - 删除 / 更新排序命中 0 行不报错；按 ID 查询不到返回 `null`
 */

/** 新建图表（时间戳由本函数填充，调用方传入的 `createdAt` / `updatedAt` 被忽略）。 */
export function createChart(db: Db, chart: Chart, now = nowUnix()): void {
  db.prepare(
    `INSERT INTO chart (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    chart.chartId,
    chart.ledgerId,
    chart.title,
    chart.granularity,
    chart.chartLines,
    chart.chartType,
    chart.isPreset ? 1 : 0,
    chart.sortOrder,
    now,
    now,
  )
}

/** 按图表 ID 删除（不存在的记录视为成功）。 */
export function deleteChartById(db: Db, chartId: string): void {
  db.prepare('DELETE FROM chart WHERE chart_id = ?').run(chartId)
}

/** 该账本下最大的 `sort_order`（无记录时为 0）。 */
export function getMaxSort(db: Db, ledgerId: string): number {
  const row = db
    .prepare(
      'SELECT COALESCE(MAX(sort_order), 0) AS max_sort_order FROM chart WHERE ledger_id = ?',
    )
    .get(ledgerId) as { max_sort_order: number } | undefined
  return row?.max_sort_order ?? 0
}

/** 按图表 ID 查询；不存在时返回 `null`。 */
export function findChart(db: Db, chartId: string): Chart | null {
  const row = db.prepare(`SELECT ${COLUMNS} FROM chart WHERE chart_id = ?`).get(chartId) as
    | ChartRow
    | undefined
  return row ? fromRow(row) : null
}

/** 某账本的全部图表（按排序号，其次按创建时间倒序）。 */
export function listChartsByLedgerId(db: Db, ledgerId: string): Chart[] {
  const rows = db
    .prepare(
      `SELECT ${COLUMNS} FROM chart WHERE ledger_id = ? ORDER BY sort_order ASC, created_at DESC`,
    )
    .all(ledgerId) as unknown as ChartRow[]
  return rows.map(fromRow)
}

/** 某账本的图表数量（用于预设图表 seeding 的幂等判断）。 */
export function countChartsByLedgerId(db: Db, ledgerId: string): number {
  const row = db.prepare('SELECT COUNT(*) AS count FROM chart WHERE ledger_id = ?').get(ledgerId) as
    | { count: number }
    | undefined
  return row?.count ?? 0
}

/**
 * 整行回写（主键命中则更新全部字段并刷新 `updated_at`；否则不改动任何行）。
 *
 * `created_at` 用调用方传入的值 —— 与旧实现一致：整行回写不得把创建时间改成"现在"。
 */
export function saveChart(db: Db, chart: Chart, now = nowUnix()): void {
  db.prepare(
    'UPDATE chart SET ledger_id = ?, title = ?, granularity = ?, chart_lines = ?, chart_type = ?, is_preset = ?, sort_order = ?, created_at = ?, updated_at = ? WHERE chart_id = ?',
  ).run(
    chart.ledgerId,
    chart.title,
    chart.granularity,
    chart.chartLines,
    chart.chartType,
    chart.isPreset ? 1 : 0,
    chart.sortOrder,
    chart.createdAt,
    now,
    chart.chartId,
  )
}

/**
 * 只改排序号并刷新 `updated_at`（拖拽排序用；主键未命中则不改动任何行）。
 *
 * 与 {@link saveChart} 的分工：`saveChart` 是"整行回写"（改名 / 改粒度 / 改曲线走它），
 * 这里是"只写序号" —— 排序不该有机会碰到图表内容。
 */
export function updateChartSort(db: Db, chartId: string, sortOrder: number, now = nowUnix()): void {
  db.prepare('UPDATE chart SET sort_order = ?, updated_at = ? WHERE chart_id = ?').run(
    sortOrder,
    now,
    chartId,
  )
}
