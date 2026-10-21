/**
 * 图表服务：预设图表的补齐与图表的增 / 删 / 改 / 查。
 *
 * 与既有实现 的自由函数风格一致：无状态函数 + 显式 `Db` 入参。
 * `chart_lines` 的 JSON 编码是紧凑格式且字段顺序固定（预设图表的落库文本因此逐字节稳定）；
 * 解码时字段缺省按既有 DTO 的 `缺省字段` 语义补默认值。
 *
 * 错误文案保持既有行为的固定前缀（`create chart failed` / `get chart failed` /
 * `unmarshal chart lines failed` / `marshal {title}` / `seed {title}`）——这些文本会原样
 * 经错误信封展示给用户，属于回归契约。
 */

import { randomUUID } from 'node:crypto'

import { AppError } from '../../shared/errors'
import type { Chart, ChartLine, QueryConditionItem } from '../../shared/domain/models'
import type { ChartDto, CreateChartRequest, UpdateChartRequest } from '../../shared/types/chart'
import type { Db } from '../db/driver'
import {
  countChartsByLedgerId,
  createChart as createChartRow,
  deleteChartById as deleteChartRow,
  findChart,
  getMaxSort,
  listChartsByLedgerId as listChartRows,
  saveChart,
  updateChartSort,
} from '../db/dao/chart'
import { logError, logInfo, logWarn } from '../logging'

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// ------------------------------------------------------------------ 预设曲线

/** 一条曲线（`conditions` 为空数组）。 */
function line(label: string, transactionType: string, includeOutlier: boolean): ChartLine {
  return { label, transactionType, includeOutlier, conditions: [] }
}

/** 一条带查询条件的曲线。 */
function conditioned(
  label: string,
  transactionType: string,
  includeOutlier: boolean,
  conditions: QueryConditionItem[],
): ChartLine {
  return { label, transactionType, includeOutlier, conditions }
}

/** 单个查询条件项（`tagNot` 保持 false）。 */
function condition(
  transactionType: string,
  category: string,
  tags: readonly string[],
  tagPolicy: string,
  description: string,
): QueryConditionItem {
  return {
    transactionType,
    category,
    tags: [...tags],
    tagPolicy,
    tagNot: false,
    description,
  }
}

/**
 * 预设的支出 / 收入 / 转账三条曲线；`includeOutlier` 决定是否把离群点计入
 * （月度预设为 false，年度预设为 true）。
 */
function chartLines(includeOutlier: boolean): ChartLine[] {
  return [
    line('支出', 'expense', includeOutlier),
    line('收入', 'income', includeOutlier),
    line('转账', 'transfer', includeOutlier),
  ]
}

/** 预设的年度收入曲线（含离群点与查询条件）。 */
function incomeChartLines(): ChartLine[] {
  return [
    line('年度总收入', 'income', true),
    conditioned('年度工资收入', 'income', true, [
      condition('income', '工资奖金', ['工资'], 'all', ''),
    ]),
    conditioned('年度奖金收入', 'income', true, [
      condition('income', '工资奖金', ['奖金'], 'all', '年奖金'),
    ]),
    conditioned('年度分红收入', 'income', true, [
      condition('income', '投资理财', [], 'all', '年分红'),
    ]),
  ]
}

// ------------------------------------------------------------------ chart_lines 编解码

/** 曲线配置 → 紧凑 JSON（字段顺序由对象字面量固定，落库文本因此逐字节稳定）。 */
function encodeChartLines(lines: readonly ChartLine[]): string {
  return JSON.stringify(lines)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringField(value: unknown, field: string): string {
  if (value === undefined) return ''
  if (typeof value !== 'string') throw new Error(`invalid type for ${field}: expected a string`)
  return value
}

function booleanField(value: unknown, field: string): boolean {
  if (value === undefined) return false
  if (typeof value !== 'boolean') throw new Error(`invalid type for ${field}: expected a boolean`)
  return value
}

function arrayField(value: unknown, field: string): unknown[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error(`invalid type for ${field}: expected an array`)
  return value
}

function decodeConditionItem(value: unknown): QueryConditionItem {
  if (!isRecord(value)) throw new Error('invalid type for conditions: expected an object')
  return {
    transactionType: stringField(value.transactionType, 'transactionType'),
    category: stringField(value.category, 'category'),
    tags: arrayField(value.tags, 'tags').map((tag) => {
      if (typeof tag !== 'string') throw new Error('invalid type for tags: expected a string')
      return tag
    }),
    tagPolicy: stringField(value.tagPolicy, 'tagPolicy'),
    tagNot: booleanField(value.tagNot, 'tagNot'),
    description: stringField(value.description, 'description'),
  }
}

/**
 * JSON → 曲线配置（既有 `decode_chart_lines` 的移植）。
 *
 * 缺字段补默认值（对应 DTO 的 `缺省字段`）；未知字段丢弃（与 序列化 的默认行为一致，
 * 因此 decode → encode 往返不会把未知键带回去）。
 */
function decodeChartLines(text: string): ChartLine[] {
  const parsed: unknown = JSON.parse(text)
  if (!Array.isArray(parsed)) throw new Error('invalid type: expected an array of chart lines')
  return parsed.map((value) => {
    if (!isRecord(value)) throw new Error('invalid type: expected a chart line object')
    return {
      label: stringField(value.label, 'label'),
      transactionType: stringField(value.transactionType, 'transactionType'),
      includeOutlier: booleanField(value.includeOutlier, 'includeOutlier'),
      conditions: arrayField(value.conditions, 'conditions').map(decodeConditionItem),
    }
  })
}

/** 模型 → DTO；`chart_lines` 解析失败时报错（文案固定为 `unmarshal chart lines failed: ...`）。 */
function toDto(chart: Chart): ChartDto {
  let lines: ChartLine[]
  try {
    lines = decodeChartLines(chart.chartLines)
  } catch (error) {
    throw new AppError(`unmarshal chart lines failed: ${errorText(error)}`, { status: 500 })
  }

  return {
    chartId: chart.chartId,
    ledgerId: chart.ledgerId,
    title: chart.title,
    granularity: chart.granularity,
    lines,
    chartType: chart.chartType,
    isPreset: chart.isPreset,
    sortOrder: chart.sortOrder,
  }
}

// ------------------------------------------------------------------ 预设 seeding

type PresetChart = readonly [
  title: string,
  granularity: string,
  lines: readonly ChartLine[],
  sortOrder: number,
]

/**
 * 为账本写入 3 个预设图表（月度消费趋势 / 年度消费趋势 / 年度收入趋势）。
 *
 * 已有任何图表时直接返回（幂等，且**自定义图表也算**）。失败文案为
 * `marshal {title}` / `seed {title}`；调用方（{@link listChartsByLedgerId}）只告警不中断。
 */
export function seedDefaultCharts(db: Db, ledgerId: string): void {
  let count: number
  try {
    count = countChartsByLedgerId(db, ledgerId)
  } catch (error) {
    logWarn(`统计图表数量失败: ${errorText(error)}`)
    throw new AppError(errorText(error), { status: 500 })
  }
  if (count > 0) return
  logInfo(`账本 ${ledgerId} 无图表，创建预设图表`)

  const presets: readonly PresetChart[] = [
    ['月度消费趋势', 'month', chartLines(false), 0],
    ['年度消费趋势', 'year', chartLines(true), 1],
    ['年度收入趋势', 'year', incomeChartLines(), 2],
  ]

  for (const [title, granularity, lines, sortOrder] of presets) {
    let linesJson: string
    try {
      linesJson = encodeChartLines(lines)
    } catch (error) {
      throw new AppError(`marshal ${title}: ${errorText(error)}`, { status: 500 })
    }

    const chart: Chart = {
      chartId: randomUUID(),
      ledgerId,
      title,
      granularity,
      chartLines: linesJson,
      chartType: 'line',
      isPreset: true,
      sortOrder,
      createdAt: 0,
      updatedAt: 0,
    }
    try {
      createChartRow(db, chart)
    } catch (error) {
      throw new AppError(`seed ${title}: ${errorText(error)}`, { status: 500 })
    }
  }

  logInfo(`已为账本 ${ledgerId} 创建 3 个预设图表`)
}

// ------------------------------------------------------------------ 增 / 删 / 改 / 查

/** 新建图表，返回完整 DTO（`isPreset` 恒为 false，排序号取该账本最大值 + 1）。 */
export function createChart(db: Db, req: CreateChartRequest): ChartDto {
  let maxSortOrder: number
  try {
    maxSortOrder = getMaxSort(db, req.ledgerId)
  } catch (error) {
    throw new AppError(errorText(error), { status: 500 })
  }

  let linesJson: string
  try {
    linesJson = encodeChartLines(req.lines)
  } catch (error) {
    throw new AppError(`marshal chart lines failed: ${errorText(error)}`, { status: 500 })
  }

  const chart: Chart = {
    chartId: randomUUID(),
    ledgerId: req.ledgerId,
    title: req.title,
    granularity: req.granularity,
    chartLines: linesJson,
    chartType: req.chartType,
    isPreset: false,
    sortOrder: maxSortOrder + 1,
    createdAt: 0,
    updatedAt: 0,
  }

  try {
    createChartRow(db, chart)
  } catch (error) {
    throw new AppError(`create chart failed: ${errorText(error)}`, { status: 500 })
  }

  return toDto(chart)
}

/** 删除图表（不存在的 ID 视为成功）。 */
export function deleteChartById(db: Db, chartId: string): void {
  try {
    deleteChartRow(db, chartId)
  } catch (error) {
    throw new AppError(`delete chart failed: ${errorText(error)}`, { status: 500 })
  }
}

/** 某账本的全部图表；查询前先尝试补齐预设图表（失败只告警）。 */
export function listChartsByLedgerId(db: Db, ledgerId: string): ChartDto[] {
  try {
    seedDefaultCharts(db, ledgerId)
  } catch (error) {
    logWarn(`为账本 ${ledgerId} 创建预设图表失败: ${errorText(error)}`)
  }

  let charts: Chart[]
  try {
    charts = listChartRows(db, ledgerId)
  } catch (error) {
    throw new AppError(errorText(error), { status: 500 })
  }

  return charts.map(toDto)
}

/**
 * 更新图表（标题 / 粒度 / 曲线 / 类型 / 排序号）。
 *
 * 整行回写但保留 `isPreset` 与 `createdAt`（从库里读出的原值），因此预设图表改完仍是预设。
 */
export function updateChart(db: Db, req: UpdateChartRequest): ChartDto {
  let chart: Chart | null
  try {
    chart = findChart(db, req.chartId)
  } catch (error) {
    throw new AppError(`get chart failed: ${errorText(error)}`, { status: 500 })
  }
  // 既有 DAO 的 `query_by_id` 返回 QueryReturnedNoRows，ServiceError 的 Display 固定为
  // `record not found`；这里保持同一文案（服务层测试逐字断言）。
  if (chart === null) {
    throw new AppError('get chart failed: record not found', { status: 500 })
  }

  let linesJson: string
  try {
    linesJson = encodeChartLines(req.lines)
  } catch (error) {
    throw new AppError(`marshal chart lines failed: ${errorText(error)}`, { status: 500 })
  }

  const edited: Chart = {
    ...chart,
    title: req.title,
    granularity: req.granularity,
    chartLines: linesJson,
    chartType: req.chartType,
    sortOrder: req.sortOrder,
  }

  try {
    saveChart(db, edited)
  } catch (error) {
    throw new AppError(`update chart failed: ${errorText(error)}`, { status: 500 })
  }

  return toDto(edited)
}

/**
 * 更新图表排序号（拖拽排序用；只写 `sort_order`，`updated_at` 由 DAO 刷新）。
 *
 * 与 {@link updateChart} 的分工：`updateChart` 是"整行回写"（可能碰到曲线与标题），
 * 这里是"只写序号" —— 排序不该有机会覆盖图表内容。
 */
export function updateChartSortOrder(db: Db, chartId: string, sortOrder: number): void {
  try {
    updateChartSort(db, chartId, sortOrder)
  } catch (error) {
    logError(`更新图表排序失败: ${errorText(error)}`)
    throw new AppError(errorText(error), { status: 500 })
  }
}
