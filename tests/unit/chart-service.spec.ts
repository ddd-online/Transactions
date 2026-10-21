import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { closeWorkspace, openWorkspace } from '../../electron/db'
import type { Db } from '../../electron/db/driver'
import {
  countChartsByLedgerId,
  createChart as createChartRow,
  deleteChartById as deleteChartRow,
  findChart,
  getMaxSort,
  listChartsByLedgerId as listChartRows,
  saveChart,
  updateChartSort,
} from '../../electron/db/dao/chart'
import {
  createChart,
  deleteChartById,
  listChartsByLedgerId,
  seedDefaultCharts,
  updateChart,
  updateChartSortOrder,
} from '../../electron/services/chart'
import type { Chart, ChartLine } from '../../shared/domain/models'
import type { CreateChartRequest, UpdateChartRequest } from '../../shared/types/chart'
import { AppError } from '../../shared/errors'

const directories: string[] = []

function workspaceDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'tr-chart-test-'))
  directories.push(directory)
  return directory
}

function openedWorkspace() {
  return openWorkspace(workspaceDirectory())
}

afterEach(() => {
  closeWorkspace()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function captureAppError(run: () => void): AppError {
  try {
    run()
  } catch (error) {
    if (error instanceof AppError) return error
    throw error
  }
  throw new Error('应当抛出 AppError')
}

/** 与 既有实现 预设曲线同构的一行 JSON（仅用于 DAO 往返断言）。 */
const LINES =
  '[{"label":"支出","transactionType":"expense","includeOutlier":false,"conditions":[]}]'

function chart(
  id: string,
  ledgerId: string,
  title: string,
  isPreset: boolean,
  sortOrder: number,
): Chart {
  return {
    chartId: id,
    ledgerId,
    title,
    granularity: 'month',
    chartLines: LINES,
    chartType: 'line',
    isPreset,
    sortOrder,
    createdAt: 0,
    updatedAt: 0,
  }
}

function requireChart(db: Db, chartId: string): Chart {
  const value = findChart(db, chartId)
  if (value === null) throw new Error(`图表不存在: ${chartId}`)
  return value
}

/** 直接插一行（时间戳可控），用于排序 / 时间戳 / 坏 JSON 测试。 */
function insertChartRow(
  db: Db,
  values: {
    chartId: string
    ledgerId: string
    title: string
    isPreset: boolean
    sortOrder: number
    createdAt: number
    chartLines?: string
  },
): void {
  db.prepare(
    "INSERT INTO chart (chart_id, ledger_id, title, granularity, chart_lines, chart_type, is_preset, sort_order, created_at, updated_at) VALUES (?, ?, ?, 'month', ?, 'line', ?, ?, ?, ?)",
  ).run(
    values.chartId,
    values.ledgerId,
    values.title,
    values.chartLines ?? '[]',
    values.isPreset ? 1 : 0,
    values.sortOrder,
    values.createdAt,
    values.createdAt,
  )
}

// ------------------------------------------------------------------ 预设曲线基线

/** 以下期望值来自既有 版的一次真实运行，作为回归基线，不要手改。 */
const MONTHLY_LINES_JSON =
  '[{"label":"支出","transactionType":"expense","includeOutlier":false,"conditions":[]},' +
  '{"label":"收入","transactionType":"income","includeOutlier":false,"conditions":[]},' +
  '{"label":"转账","transactionType":"transfer","includeOutlier":false,"conditions":[]}]'

const YEARLY_LINES_JSON =
  '[{"label":"支出","transactionType":"expense","includeOutlier":true,"conditions":[]},' +
  '{"label":"收入","transactionType":"income","includeOutlier":true,"conditions":[]},' +
  '{"label":"转账","transactionType":"transfer","includeOutlier":true,"conditions":[]}]'

const INCOME_LINES_JSON =
  '[{"label":"年度总收入","transactionType":"income","includeOutlier":true,"conditions":[]},' +
  '{"label":"年度工资收入","transactionType":"income","includeOutlier":true,"conditions":[' +
  '{"transactionType":"income","category":"工资奖金","tags":["工资"],"tagPolicy":"all","tagNot":false,"description":""}]},' +
  '{"label":"年度奖金收入","transactionType":"income","includeOutlier":true,"conditions":[' +
  '{"transactionType":"income","category":"工资奖金","tags":["奖金"],"tagPolicy":"all","tagNot":false,"description":"年奖金"}]},' +
  '{"label":"年度分红收入","transactionType":"income","includeOutlier":true,"conditions":[' +
  '{"transactionType":"income","category":"投资理财","tags":[],"tagPolicy":"all","tagNot":false,"description":"年分红"}]}]'

function line(label: string, transactionType: string, includeOutlier = false): ChartLine {
  return { label, transactionType, includeOutlier, conditions: [] }
}

function chartLines(includeOutlier: boolean): ChartLine[] {
  return [
    line('支出', 'expense', includeOutlier),
    line('收入', 'income', includeOutlier),
    line('转账', 'transfer', includeOutlier),
  ]
}

function incomeChartLines(): ChartLine[] {
  return [
    line('年度总收入', 'income', true),
    {
      label: '年度工资收入',
      transactionType: 'income',
      includeOutlier: true,
      conditions: [
        {
          transactionType: 'income',
          category: '工资奖金',
          tags: ['工资'],
          tagPolicy: 'all',
          tagNot: false,
          description: '',
        },
      ],
    },
    {
      label: '年度奖金收入',
      transactionType: 'income',
      includeOutlier: true,
      conditions: [
        {
          transactionType: 'income',
          category: '工资奖金',
          tags: ['奖金'],
          tagPolicy: 'all',
          tagNot: false,
          description: '年奖金',
        },
      ],
    },
    {
      label: '年度分红收入',
      transactionType: 'income',
      includeOutlier: true,
      conditions: [
        {
          transactionType: 'income',
          category: '投资理财',
          tags: [],
          tagPolicy: 'all',
          tagNot: false,
          description: '年分红',
        },
      ],
    },
  ]
}

function createRequest(
  ledgerId: string,
  overrides: Partial<CreateChartRequest> = {},
): CreateChartRequest {
  return {
    ledgerId,
    title: '自定义图表',
    granularity: 'month',
    lines: [line('支出', 'expense')],
    chartType: 'line',
    ...overrides,
  }
}

function updateRequest(
  chartId: string,
  overrides: Partial<UpdateChartRequest> = {},
): UpdateChartRequest {
  return {
    chartId,
    title: '',
    granularity: '',
    lines: [],
    chartType: '',
    sortOrder: 0,
    ...overrides,
  }
}

// ==================================================================== DAO

describe('chart dao', () => {
  it('create_fills_timestamps_and_reads_back_every_column', () => {
    const workspace = openedWorkspace()

    createChartRow(workspace.db, chart('c1', 'l1', '月度消费趋势', true, 0))
    const loaded = requireChart(workspace.db, 'c1')
    expect(loaded.title).toBe('月度消费趋势')
    expect(loaded.granularity).toBe('month')
    expect(loaded.chartType).toBe('line')
    expect(loaded.isPreset).toBe(true)
    expect(loaded.sortOrder).toBe(0)
    expect(loaded.createdAt).toBeGreaterThan(0)
    expect(loaded.createdAt).toBe(loaded.updatedAt)
    expect(loaded.chartLines).toBe(LINES)

    // 主键冲突
    expect(() => createChartRow(workspace.db, chart('c1', 'l1', '重复', false, 1))).toThrow(
      /UNIQUE constraint failed/,
    )
  })

  it('missing_chart_reports_not_found', () => {
    const workspace = openedWorkspace()
    expect(findChart(workspace.db, 'nope')).toBeNull()
  })

  it('query_orders_by_sort_then_created_desc', () => {
    const workspace = openedWorkspace()

    insertChartRow(workspace.db, {
      chartId: 'a',
      ledgerId: 'l1',
      title: '自定义甲',
      isPreset: false,
      sortOrder: 0,
      createdAt: 100,
    })
    insertChartRow(workspace.db, {
      chartId: 'b',
      ledgerId: 'l1',
      title: '预设甲',
      isPreset: true,
      sortOrder: 1,
      createdAt: 200,
    })
    insertChartRow(workspace.db, {
      chartId: 'c',
      ledgerId: 'l1',
      title: '预设乙',
      isPreset: true,
      sortOrder: 0,
      createdAt: 300,
    })
    insertChartRow(workspace.db, {
      chartId: 'd',
      ledgerId: 'l2',
      title: '其它账本',
      isPreset: true,
      sortOrder: 0,
      createdAt: 400,
    })

    const charts = listChartRows(workspace.db, 'l1')
    const ids = charts.map((item) => item.chartId)
    // 预设不再优先：`a`（自定义、序号 0）排在 `b`（预设、序号 1）之前；
    // 序号相同（a 与 c 都是 0）时按 created_at DESC。
    expect(ids).toEqual(['c', 'a', 'b'])
    expect(countChartsByLedgerId(workspace.db, 'l1')).toBe(3)
    expect(getMaxSort(workspace.db, 'l1')).toBe(1)
    expect(getMaxSort(workspace.db, 'l9')).toBe(0)
  })

  it('save_writes_back_all_fields_and_refreshes_updated_at', async () => {
    const workspace = openedWorkspace()

    createChartRow(workspace.db, chart('c1', 'l1', '旧标题', true, 0))
    const created = requireChart(workspace.db, 'c1')

    await sleep(1100)
    saveChart(workspace.db, {
      ...created,
      title: '新标题',
      granularity: 'year',
      chartLines: '[]',
      chartType: 'bar',
      sortOrder: 7,
    })

    const saved = requireChart(workspace.db, 'c1')
    expect(saved.title).toBe('新标题')
    expect(saved.granularity).toBe('year')
    expect(saved.chartLines).toBe('[]')
    expect(saved.chartType).toBe('bar')
    expect(saved.sortOrder).toBe(7)
    expect(saved.isPreset, 'Save 不改动 is_preset').toBe(true)
    expect(saved.createdAt).toBe(created.createdAt)
    expect(saved.updatedAt, 'updated_at 必须刷新').toBeGreaterThan(created.updatedAt)
  })

  it('delete_by_id_and_by_ledger', () => {
    const workspace = openedWorkspace()

    createChartRow(workspace.db, chart('c1', 'l1', '甲', false, 0))
    createChartRow(workspace.db, chart('c2', 'l1', '乙', false, 1))
    createChartRow(workspace.db, chart('c3', 'l2', '丙', false, 0))

    deleteChartRow(workspace.db, 'c1')
    expect(countChartsByLedgerId(workspace.db, 'l1')).toBe(1)

    // 账本级联清理走活路径（语句与 LEDGER_CASCADE 一致）
    workspace.db.prepare('DELETE FROM chart WHERE ledger_id = ?').run('l1')
    expect(countChartsByLedgerId(workspace.db, 'l1')).toBe(0)
    expect(countChartsByLedgerId(workspace.db, 'l2')).toBe(1)
    // 删除不存在的记录视为成功
    expect(() => deleteChartRow(workspace.db, 'absent')).not.toThrow()
  })

  it('update_sort_touches_only_the_order', async () => {
    const workspace = openedWorkspace()

    createChartRow(workspace.db, chart('c1', 'l1', '甲', true, 0))
    createChartRow(workspace.db, chart('c2', 'l1', '乙', false, 1))
    const created = requireChart(workspace.db, 'c1')

    await sleep(1100)
    updateChartSort(workspace.db, 'c1', 3)

    const saved = requireChart(workspace.db, 'c1')
    expect(saved.sortOrder).toBe(3)
    expect(saved.updatedAt, 'updated_at 必须刷新').toBeGreaterThan(created.updatedAt)
    // 只写序号：内容与其它列的读回值一字不变
    expect(saved.title).toBe(created.title)
    expect(saved.granularity).toBe(created.granularity)
    expect(saved.chartLines).toBe(created.chartLines)
    expect(saved.chartType).toBe(created.chartType)
    expect(saved.isPreset, '预设标记不动').toBe(created.isPreset)
    expect(saved.createdAt).toBe(created.createdAt)

    // 列表顺序跟着序号走（同一账本里 3 在 1 之后）
    expect(listChartRows(workspace.db, 'l1').map((item) => item.chartId)).toEqual(['c2', 'c1'])

    // 不存在的图表视为成功（0 行）
    expect(() => updateChartSort(workspace.db, 'absent', 9)).not.toThrow()
  })
})

// ==================================================================== 服务

describe('chart service', () => {
  it('list_seeds_three_presets_with_exact_json', () => {
    const workspace = openedWorkspace()
    const charts = listChartsByLedgerId(workspace.db, 'l1')
    expect(charts, '预设图表数量').toHaveLength(3)

    // sort_order ASC, created_at DESC
    expect(charts.map((item) => item.title)).toEqual(['月度消费趋势', '年度消费趋势', '年度收入趋势'])
    expect(charts.every((item) => item.isPreset)).toBe(true)
    expect(charts.map((item) => item.sortOrder)).toEqual([0, 1, 2])
    expect(charts.map((item) => item.granularity)).toEqual(['month', 'year', 'year'])
    expect(charts.every((item) => item.chartType === 'line')).toBe(true)

    // chart_lines 的落库文本必须逐字节一致
    const stored = listChartRows(workspace.db, 'l1')
    expect(stored.map((item) => item.chartLines)).toEqual([
      MONTHLY_LINES_JSON,
      YEARLY_LINES_JSON,
      INCOME_LINES_JSON,
    ])

    // 解析往返：DTO 的 lines 与逐字 JSON 一一对应；再编码回去完全相同
    expect(charts[0].lines).toEqual(chartLines(false))
    expect(charts[1].lines).toEqual(chartLines(true))
    expect(charts[2].lines).toEqual(incomeChartLines())
    for (const [index, item] of charts.entries()) {
      expect(JSON.stringify(item.lines), 'encode/decode 必须往返一致').toBe(
        stored[index].chartLines,
      )
    }
    expect(JSON.stringify(incomeChartLines())).toBe(INCOME_LINES_JSON)
  })

  it('list_is_idempotent_and_skips_seeding_when_charts_exist', () => {
    const workspace = openedWorkspace()
    const first = listChartsByLedgerId(workspace.db, 'l1')
    const second = listChartsByLedgerId(workspace.db, 'l1')
    expect(second, '第二次调用不得重复插入').toHaveLength(3)
    expect(first.map((item) => item.chartId)).toEqual(second.map((item) => item.chartId))
    expect(countChartsByLedgerId(workspace.db, 'l1')).toBe(3)

    // 不同账本各自 seed
    expect(listChartsByLedgerId(workspace.db, 'l2')).toHaveLength(3)

    // 已有图表（哪怕是自定义的）时不再补预设
    closeWorkspace()
    const otherWorkspace = openedWorkspace()
    createChart(
      otherWorkspace.db,
      createRequest('l1', {
        title: '自定义',
        chartType: 'bar',
      }),
    )
    const charts = listChartsByLedgerId(otherWorkspace.db, 'l1')
    expect(charts, '已有图表时不插入预设').toHaveLength(1)
    expect(charts[0].title).toBe('自定义')
  })

  it('create_assigns_uuid_and_sort_order_after_presets', () => {
    const workspace = openedWorkspace()
    listChartsByLedgerId(workspace.db, 'l1')

    const created = createChart(
      workspace.db,
      createRequest('l1', {
        title: '自定义图表',
        lines: [line('支出', 'expense'), line('收入', 'income')],
        chartType: 'bar',
      }),
    )

    expect(created.chartId).not.toBe('')
    expect(created.isPreset).toBe(false)
    expect(created.sortOrder, '预设占 0..2，新建取最大值 + 1').toBe(3)
    expect(created.chartType).toBe('bar')
    expect(created.lines).toEqual([line('支出', 'expense'), line('收入', 'income')])

    const stored = requireChart(workspace.db, created.chartId)
    expect(stored.chartLines).toBe(
      '[{"label":"支出","transactionType":"expense","includeOutlier":false,"conditions":[]},' +
        '{"label":"收入","transactionType":"income","includeOutlier":false,"conditions":[]}]',
    )
  })

  it('update_keeps_is_preset_and_reports_missing_chart', () => {
    const workspace = openedWorkspace()
    listChartsByLedgerId(workspace.db, 'l1')
    const presetId = listChartRows(workspace.db, 'l1')[0].chartId

    const updated = updateChart(
      workspace.db,
      updateRequest(presetId, {
        title: '改名后的月度',
        granularity: 'year',
        lines: [line('支出', 'expense')],
        chartType: 'bar',
        sortOrder: 9,
      }),
    )

    expect(updated.title).toBe('改名后的月度')
    expect(updated.granularity).toBe('year')
    expect(updated.chartType).toBe('bar')
    expect(updated.sortOrder).toBe(9)
    expect(updated.isPreset, '预设标记不变').toBe(true)
    expect(updated.lines).toEqual([line('支出', 'expense')])

    const error = captureAppError(() => updateChart(workspace.db, updateRequest('absent')))
    expect(error.message).toBe('get chart failed: record not found')
    expect(error.status).toBe(500)
  })

  it('update_sort_order_writes_only_the_order', async () => {
    const workspace = openedWorkspace()
    const presets = listChartsByLedgerId(workspace.db, 'l1')
    const custom = createChart(workspace.db, createRequest('l1', { title: '自定义图表' }))
    expect(custom.sortOrder, '预设占 0..2，新建取最大值 + 1').toBe(3)

    // 只写序号：内容 / 预设标记 / created_at 都不动，updated_at 刷新
    const before = requireChart(workspace.db, custom.chartId)
    await sleep(1100)
    updateChartSortOrder(workspace.db, custom.chartId, 0)

    const after = requireChart(workspace.db, custom.chartId)
    expect(after.sortOrder).toBe(0)
    expect(after.updatedAt, 'updated_at 必须刷新').toBeGreaterThan(before.updatedAt)
    expect(after.title).toBe(before.title)
    expect(after.granularity).toBe(before.granularity)
    expect(after.chartLines).toBe(before.chartLines)
    expect(after.chartType).toBe(before.chartType)
    expect(after.isPreset, '只写序号不改预设标记').toBe(false)
    expect(after.createdAt).toBe(before.createdAt)

    // 与界面侧同形：被拖走的项之后，整段按新下标写回（稠密 0..N-1）
    presets.forEach((chart, index) => {
      updateChartSortOrder(workspace.db, chart.chartId, index + 1)
    })
    const reordered = listChartsByLedgerId(workspace.db, 'l1')
    expect(reordered.map((item) => item.title)).toEqual([
      '自定义图表',
      '月度消费趋势',
      '年度消费趋势',
      '年度收入趋势',
    ])
    expect(reordered.map((item) => item.sortOrder)).toEqual([0, 1, 2, 3])

    // 不存在的图表：不报错
    expect(() => updateChartSortOrder(workspace.db, 'absent', 1)).not.toThrow()
  })

  it('delete_removes_only_that_chart', () => {
    const workspace = openedWorkspace()
    const charts = listChartsByLedgerId(workspace.db, 'l1')
    const target = charts[0].chartId

    deleteChartById(workspace.db, target)
    const remaining = listChartsByLedgerId(workspace.db, 'l1')
    expect(remaining).toHaveLength(2)
    expect(remaining.every((item) => item.chartId !== target)).toBe(true)
    // 删到 0 之后，下一次查询会重新补齐预设（count > 0 则跳过）
    deleteChartById(workspace.db, remaining[0].chartId)
    deleteChartById(workspace.db, remaining[1].chartId)
    expect(listChartsByLedgerId(workspace.db, 'l1')).toHaveLength(3)

    // 不存在的 ID 视为成功
    expect(() => deleteChartById(workspace.db, 'absent')).not.toThrow()
  })

  // ---------------------------------------------------------------- chart_lines 往返

  it('chart_lines_roundtrip_keeps_nested_conditions_and_exact_json', () => {
    const workspace = openedWorkspace()
    const lines: ChartLine[] = [
      line('支出', 'expense'),
      {
        label: '餐饮',
        transactionType: 'expense',
        includeOutlier: true,
        conditions: [
          {
            transactionType: 'expense',
            category: '餐饮美食',
            tags: ['三餐', '外卖'],
            tagPolicy: 'any',
            tagNot: true,
            description: '备注',
          },
        ],
      },
    ]

    const created = createChart(
      workspace.db,
      createRequest('l1', { title: '往返', chartType: 'bar', lines }),
    )
    // 新建返回的 DTO 与入库 JSON 一致（字段顺序 / 紧凑格式都要对）
    expect(created.lines).toEqual(lines)
    const stored = requireChart(workspace.db, created.chartId)
    expect(stored.chartLines).toBe(JSON.stringify(lines))

    // 再经列表解码回来仍一致；重新编码逐字相同
    const listed = listChartsByLedgerId(workspace.db, 'l1')
    expect(listed).toHaveLength(1)
    expect(listed[0].lines).toEqual(lines)
    expect(JSON.stringify(listed[0].lines)).toBe(stored.chartLines)
  })

  it('preset_seeding_is_idempotent_and_respects_existing_charts', () => {
    const workspace = openedWorkspace()

    seedDefaultCharts(workspace.db, 'l1')
    expect(countChartsByLedgerId(workspace.db, 'l1')).toBe(3)
    seedDefaultCharts(workspace.db, 'l1')
    expect(countChartsByLedgerId(workspace.db, 'l1'), '第二次 seed 不得重复插入').toBe(3)
    expect(listChartRows(workspace.db, 'l1').every((item) => item.isPreset)).toBe(true)

    // 自定义图表也算"已有图表"：直接 seed 也跳过
    createChart(workspace.db, createRequest('l2'))
    seedDefaultCharts(workspace.db, 'l2')
    expect(countChartsByLedgerId(workspace.db, 'l2')).toBe(1)

    // 删空之后重新补齐（预设的 chartId 是新生成的）
    workspace.db.prepare('DELETE FROM chart WHERE ledger_id = ?').run('l1')
    seedDefaultCharts(workspace.db, 'l1')
    expect(countChartsByLedgerId(workspace.db, 'l1')).toBe(3)
  })

  it('malformed_chart_lines_reports_unmarshal_failure', () => {
    const workspace = openedWorkspace()
    insertChartRow(workspace.db, {
      chartId: 'bad',
      ledgerId: 'l1',
      title: '坏数据',
      isPreset: false,
      sortOrder: 0,
      createdAt: 1,
      chartLines: '{not json',
    })

    const error = captureAppError(() => listChartsByLedgerId(workspace.db, 'l1'))
    expect(error.message).toMatch(/^unmarshal chart lines failed:/)
    expect(error.status).toBe(500)
  })

  it('decodes_chart_lines_with_missing_fields_using_defaults', () => {
    const workspace = openedWorkspace()
    insertChartRow(workspace.db, {
      chartId: 'sparse',
      ledgerId: 'l1',
      title: '缺省字段',
      isPreset: false,
      sortOrder: 0,
      createdAt: 1,
      chartLines: '[{"label":"缺省","conditions":[{}]}]',
    })

    const charts = listChartsByLedgerId(workspace.db, 'l1')
    expect(charts).toHaveLength(1)
    expect(charts[0].lines).toEqual([
      {
        label: '缺省',
        transactionType: '',
        includeOutlier: false,
        conditions: [
          {
            transactionType: '',
            category: '',
            tags: [],
            tagPolicy: '',
            tagNot: false,
            description: '',
          },
        ],
      },
    ])
  })
})
