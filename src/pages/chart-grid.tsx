import { useMemo, useState, type JSX, type RefObject } from 'react'
import { Popconfirm, Select, Table } from 'antd'

import { PIE_OTHER_KEY, foldPieSlices } from '../../shared/domain/pie'
import type { ChartLine } from '../../shared/domain/models'
import type { ChartDto } from '../../shared/types/chart'
import type { CategoryDto } from '../../shared/types/category'
import type { ChartPieResponse, ChartQueryResponse } from '../../shared/types/transaction'
import { AntvLineChart } from '../components/antv-line-chart'
import { AntvPieChart } from '../components/antv-pie-chart'
import { Button } from '../components/button'
import { EmptyState } from '../components/empty-state'
import { Icon } from '../components/icon'
import { ScrollArea } from '../components/scroll-area'
import { Spin } from '../components/spin'
import { pieSliceColors, seriesPalette } from '../theme/chart-colors'
import { useThemeMode } from '../theme/theme-mode'
import { GRANULARITIES, GROUP_FIELDS, LINE_TYPES, categoryOptionsFor } from './chart-options'
import { ChartLineSummary, ChartPieSummary } from './chart-summary'

function typeLabel(transactionType: string): string {
  if (transactionType === 'income') return '收入'
  if (transactionType === 'expense') return '支出'
  if (transactionType === 'transfer') return '转账'
  return transactionType
}

/**
 * 饼图的空态把「为什么空」说清楚，三级各有各的说法：
 * 整个范围没有记录 → 换范围；没有这一种类型 / 分类 → 换类型或分类；
 * 有记录但都没有标签 → 去给记录打标签。
 */
export function pieEmptyDescription(pie: ChartPieResponse | null, chart: ChartDto): string {
  if (!pie || pie.rangeRecords === 0) return '这个时间范围里没有记录，换一个范围试试。'
  const scope = typeLabel(chart.groupTransactionType)
  if (pie.filteredRecords === 0) {
    if (chart.groupField === 'tag') {
      return `这个范围里没有「${scope} · ${chart.groupCategory}」记录，换一种交易类型或分类看看。`
    }
    if (chart.groupField === 'category') {
      return `这个范围里没有「${scope}」记录，换一种交易类型看看。`
    }
    return '这个范围里没有可统计的记录，换一个范围试试。'
  }
  if (chart.groupField === 'tag') {
    return `这个范围里「${scope} · ${chart.groupCategory}」的记录都没有标签，先给记录加上标签。`
  }
  return '这个范围里没有可统计的记录，换一个范围试试。'
}

function conditionSummary(line: ChartLine): string {
  if (line.conditions.length === 0) return '不限'
  return line.conditions
    .map((condition) => {
      const parts: string[] = []
      if (condition.transactionType) parts.push(typeLabel(condition.transactionType))
      if (condition.category) parts.push(condition.category)
      if (condition.tags.length > 0) parts.push(condition.tags.join('/'))
      if (condition.description) parts.push(`“${condition.description}”`)
      return parts.join(' · ') || '不限'
    })
    .join('；')
}

export interface ChartGridProps {
  charts: ChartDto[]; selectedId: string; selected: ChartDto | null
  onSelect: (chartId: string) => void; onDelete: (chartId: string) => void
  onMove: (from: number, to: number) => void
  onChangeGranularity: (granularity: string) => void; onRename: (chart: ChartDto) => void
  onAddLine: () => void; onEditLine: (index: number) => void; onRemoveLine: (index: number) => void
  onChangeGrouping: (next: { field?: string; type?: string; category?: string }) => void
  data: ChartQueryResponse | null; loading: boolean
  pie: ChartPieResponse | null; pieLoading: boolean
  categories: CategoryDto[]; savingLine: boolean; summaryCollapsed: boolean
  onToggleSummaryCollapsed: (collapsed: boolean) => void
  collapseToggleRef: RefObject<HTMLButtonElement | null>
  expandToggleRef: RefObject<HTMLButtonElement | null>
}

/** 分析 · 图表网格：左侧图表卡片（选中 / 删除 / 拖动排序）与右侧卡片渲染。 */
export function ChartGrid(props: ChartGridProps): JSX.Element {
  const {
    charts, selectedId, selected, onSelect, onDelete, onMove, onChangeGranularity, onRename,
    onAddLine, onEditLine, onRemoveLine, onChangeGrouping, data, loading, pie, pieLoading,
    categories, savingLine, summaryCollapsed, onToggleSummaryCollapsed,
    collapseToggleRef, expandToggleRef,
  } = props
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  const responseLines = data?.lines ?? []
  const hasValues = responseLines.some((line) => line.data.some((point) => point.amount !== 0))
  const isPie = selected?.chartType === 'pie'
  const pieTotal = pie?.total ?? 0
  /** 图上与右侧合计列读同一份折叠结果：超过 10 组折成一片「其他（N 组）」。 */
  const pieSlices = useMemo(() => {
    const folded = foldPieSlices(pie?.slices ?? [])
    if (folded.folded === 0) return folded.slices
    return folded.slices.map((slice) =>
      slice.key === PIE_OTHER_KEY ? { ...slice, label: `其他（${folded.folded} 组）` } : slice,
    )
  }, [pie])
  /** 用画布画的图读不到 CSS 变量：主题一变就得重算颜色（`mode` 只用来触发重新解析令牌）。 */
  const mode = useThemeMode()
  /** 折线图与饼图共用这一份色板 —— 第 N 条曲线和第 N 名是同一个颜色。 */
  const seriesColors = useMemo(() => seriesPalette(), [mode])
  const pieColors = useMemo(() => pieSliceColors(pieSlices, selected?.groupField ?? ''), [pieSlices, selected?.groupField, mode])
  const hasPie = pieSlices.length > 0
  const pieLabel = useMemo(() => {
    if (!selected || selected.chartType !== 'pie') return ''
    if (selected.groupField === 'category') return `${typeLabel(selected.groupTransactionType)}按分类`
    if (selected.groupField === 'tag') {
      return `${typeLabel(selected.groupTransactionType)} · ${selected.groupCategory} 按标签`
    }
    return '按交易类型'
  }, [selected])
  /* 颜色表按曲线条数记忆：`AntvLineChart` 的建图 effect 依赖这个数组，
   * 以前每次渲染都 `slice()` 出一个新数组 → 重命名弹窗里每敲一个字都销毁重画整张图
   * （实测 20 个字 = 20 次重建、926ms）。数组现在只在条数变化时换新。 */
  const lineCount = responseLines.length
  const colors = useMemo(() => seriesColors.slice(0, Math.max(1, lineCount)), [lineCount, seriesColors])
  const lineRows = selected?.lines ?? []
  const hasLines = lineRows.length > 0

  /** 合计条：折线的可折叠，饼图的是分组合计；两者都挂在卡片正文右侧。 */
  const summary = isPie ? (
    hasPie ? (
      <ChartPieSummary slices={pieSlices} colors={pieColors} total={pieTotal} filteredTotal={pie?.filteredTotal ?? 0} />
    ) : null
  ) : hasValues ? (
    <ChartLineSummary
      lines={responseLines} colors={colors} collapsed={summaryCollapsed}
      onToggleCollapsed={onToggleSummaryCollapsed}
      collapseToggleRef={collapseToggleRef} expandToggleRef={expandToggleRef}
    />
  ) : null

  return (
    <div className="da-main">
      <ScrollArea className="da-sidebar">
        <div className="da-list">
          {charts.length === 0 ? (
            <div className="da-list__empty" data-testid="chart-empty">暂无图表</div>
          ) : (
            charts.map((chart, index) => (
              <div
                key={chart.chartId}
                className={`da-list__row ui-drag-item${dragFrom === index ? ' is-dragging' : ''}${dragOver === index ? ' is-over' : ''}`}
                draggable
                onDragStart={() => setDragFrom(index)}
                onDragOver={(event) => { event.preventDefault(); setDragOver(index) }}
                onDrop={() => {
                  if (dragFrom === null) return
                  setDragFrom(null)
                  setDragOver(null)
                  onMove(dragFrom, index)
                }}
                onDragEnd={() => { setDragFrom(null); setDragOver(null) }}
              >
                <div
                  className={`da-list__item${chart.chartId === selectedId ? ' is-active' : ''}`}
                  data-testid="chart-item"
                  onClick={() => onSelect(chart.chartId)}
                >
                  <span className="ui-drag-handle" title="拖动排序"><Icon name="DragHandle" size={16} /></span>
                  <span className="da-list__title" title={chart.title}>{chart.title}</span>
                  <Popconfirm
                    title={`删除图表「${chart.title}」？`}
                    okText="删除"
                    cancelText="取消"
                    okType="danger"
                    placement="topRight"
                    onConfirm={() => onDelete(chart.chartId)}
                  >
                    <button
                      type="button"
                      className="tr-icon-btn is-danger-static da-list__delete"
                      data-testid="chart-delete"
                      aria-label={`删除图表 ${chart.title}`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Icon name="Trash" size={14} />
                    </button>
                  </Popconfirm>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <div className="da-content">
        {!selected ? (
          <div className="da-empty">
            <EmptyState testId="chart-selection-empty" title="请选择左侧图表，或点右上角「新增图表」" />
          </div>
        ) : (
          <div className="da-chart">
            <div className="da-chart__header">
              <h2 className="da-chart__title">{selected.title}</h2>
              <div className="da-chart__meta">
                {/* 饼图没有时间粒度：构成不按时间分桶，摆一个用不上的选择器只会让人以为它能改。 */}
                {isPie ? null : (
                  <Select
                    data-testid="chart-granularity" aria-label="曲线粒度" size="small"
                    value={selected.granularity} disabled={selected.isPreset}
                    onChange={(value) => onChangeGranularity(value)}
                    options={GRANULARITIES} style={{ width: 72 }}
                  />
                )}
                {selected.isPreset ? null : (
                  <Button variant="secondary" size="sm" testId="chart-rename" onClick={() => onRename(selected)}>重命名</Button>
                )}
              </div>
            </div>

            <div className="da-chart__body">
              <div className="da-chart__canvas">
                {isPie ? (
                  pieLoading && !pie ? (
                    <div className="da-chart__loading"><Spin /></div>
                  ) : hasPie ? (
                    <AntvPieChart slices={pieSlices} colors={pieColors} total={pieTotal} label={pieLabel} />
                  ) : (
                    <div className="da-chart__empty" data-testid="chart-data-empty">
                      <EmptyState title="暂无数据" description={pieEmptyDescription(pie, selected)} />
                    </div>
                  )
                ) : loading && !data ? (
                  <div className="da-chart__loading"><Spin /></div>
                ) : !hasLines ? (
                  // 一条曲线都没有时，画布不摆第二个空态插画：这里说的不是「没数据」，
                  // 而是「没东西可画」，一句安静的话把眼睛交给下面的曲线配置。
                  <p className="da-chart__canvas-hint" data-testid="chart-canvas-hint">
                    加一条曲线之后，这里会画出趋势。
                  </p>
                ) : hasValues ? (
                  <>
                    <ul className="da-chart__legend">
                      {responseLines.map((line, index) => (
                        <li key={line.label}>
                          <span className="da-chart__legend-dot" style={{ background: colors[index % colors.length] }} />
                          <span>{line.label}</span>
                        </li>
                      ))}
                    </ul>
                    <AntvLineChart lines={responseLines} colors={colors} />
                  </>
                ) : (
                  <div className="da-chart__empty" data-testid="chart-data-empty">
                    <EmptyState
                      title="暂无数据"
                      description="这个时间范围里没有可统计的记录，换一个范围试试。"
                    />
                  </div>
                )}
              </div>

              {summary}
            </div>

            {isPie ? (
              <div className="da-chart__lines" data-testid="chart-group-config">
                <div className="da-chart__lines-head">
                  <h3 className="da-panel__title">分组配置</h3>
                </div>
                <div className="da-group-config">
                  <div className="da-group-config__field">
                    <span className="da-group-config__label">分组字段</span>
                    <Select
                      className="da-group-config__select" data-testid="chart-group-field" aria-label="分组字段"
                      size="small" value={selected.groupField} options={GROUP_FIELDS}
                      onChange={(value: string) => onChangeGrouping({ field: value })}
                    />
                  </div>
                  {selected.groupField === 'category' || selected.groupField === 'tag' ? (
                    <div className="da-group-config__field">
                      <span className="da-group-config__label">交易类型</span>
                      <Select
                        className="da-group-config__select" data-testid="chart-group-type" aria-label="交易类型"
                        size="small" value={selected.groupTransactionType || 'expense'}
                        options={LINE_TYPES}
                        onChange={(value: string) => onChangeGrouping({ type: value })}
                      />
                    </div>
                  ) : null}
                  {selected.groupField === 'tag' ? (
                    <div className="da-group-config__field">
                      <span className="da-group-config__label">分类</span>
                      <Select
                        className="da-group-config__select" data-testid="chart-group-category" aria-label="分类"
                        size="small" placeholder="选择分类" value={selected.groupCategory || undefined}
                        options={categoryOptionsFor(categories, selected.groupTransactionType || 'expense')}
                        onChange={(value: string) => onChangeGrouping({ category: value })}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="da-chart__lines">
                <div className="da-chart__lines-head">
                  <h3 className="da-panel__title">曲线配置</h3>
                  {selected.isPreset ? null : (
                    <div className="da-chart__lines-actions">
                      <Button
                        variant="secondary" size="sm" testId="chart-line-add"
                        icon={<Icon name="Plus" size={14} />} loading={savingLine}
                        onClick={() => onAddLine()}
                      >
                        添加曲线
                      </Button>
                    </div>
                  )}
                </div>
                <Table<ChartLine>
                  className="tr-table da-table"
                  rowKey={(line) => line.label}
                  pagination={false}
                  size="small"
                  dataSource={lineRows}
                  // 窄窗里放不下时由表格自己横向滚，别把整页顶出可视区
                  scroll={{ x: 'max-content' }}
                  locale={{
                    emptyText: (
                      <div className="da-chart__lines-empty">
                        <EmptyState
                          testId="chart-lines-empty" title="还没有曲线"
                          description={selected.isPreset ? '预设图表的曲线由系统提供' : '点右上角「添加曲线」建一条'}
                        />
                      </div>
                    ),
                  }}
                  columns={[
                    {
                      title: '曲线名称', dataIndex: 'label',
                      render: (value: string, _line: ChartLine, index: number) => (
                        <span className="da-line-name">
                          <span
                            className="da-line-swatch"
                            style={{ background: seriesColors[index % seriesColors.length] }}
                            aria-hidden="true"
                          />
                          {value}
                        </span>
                      ),
                    },
                    {
                      title: '交易类型', dataIndex: 'transactionType', width: 100, align: 'center',
                      render: (value: string) => <span className={`ui-tag ui-tag--${value}`}>{typeLabel(value)}</span>,
                    },
                    {
                      title: '包含离群值', dataIndex: 'includeOutlier', width: 120, align: 'center',
                      render: (value: boolean) => (value ? '是' : '否'),
                    },
                    {
                      title: '筛选条件', dataIndex: 'conditions',
                      render: (_: unknown, line: ChartLine) => conditionSummary(line),
                    },
                    ...(selected.isPreset
                      ? []
                      : [
                          {
                            title: '操作', key: 'actions', width: 120, align: 'center' as const,
                            render: (_: unknown, line: ChartLine, index: number) => (
                              <span className="da-line-actions">
                                <Button
                                  variant="text" size="sm" testId="chart-line-edit"
                                  disabled={savingLine} onClick={() => onEditLine(index)}
                                >
                                  编辑
                                </Button>
                                <Popconfirm
                                  title={`删除曲线「${line.label}」？`} okText="删除" cancelText="取消"
                                  okType="danger" placement="topRight" onConfirm={() => onRemoveLine(index)}
                                >
                                  <Button
                                    variant="text-danger" size="sm" testId="chart-line-delete"
                                    disabled={savingLine}
                                  >
                                    删除
                                  </Button>
                                </Popconfirm>
                              </span>
                            ),
                          },
                        ]),
                  ]}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
