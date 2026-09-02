<template>
  <div class="stats-page">
    <!-- 加载骨架 -->
    <div v-if="loading && !stats" class="stats-loading" aria-hidden="true">
      <section class="stats-panel stats-panel-skeleton stats-skeleton-head" />
      <section class="stats-panel stats-panel-skeleton stats-skeleton-chart" />
    </div>

    <!-- 数据就绪：无结算 / 仅 1 笔 / 完整统计 -->
    <template v-else-if="stats">
      <!-- 无结算 -->
      <section v-if="stats.roundCount === 0" class="stats-empty-panel">
        <div class="stats-empty-inner">
          <span class="stats-empty-title">还没有结算记录</span>
          <span class="stats-empty-hint">
            股票清仓后，这一轮从建仓到清仓的完整交易会自动成为一笔结算；<br />
            完成第 2 笔结算后开始生成交易统计。
          </span>
        </div>
      </section>

      <!-- 仅 1 笔：说明统计起点 -->
      <section v-else-if="stats.roundCount === 1" class="stats-empty-panel">
        <div class="stats-empty-inner">
          <span class="stats-empty-title">已有 1 笔结算</span>
          <span class="stats-empty-hint">
            交易统计从第 2 笔开始。再完成一笔清仓，即可看到胜率、盈亏比、期望值与最大回撤的累计变化。
          </span>
        </div>
      </section>

      <template v-else-if="latestPoint">
        <!-- ===== 顶部汇总 ===== -->
        <section class="stats-panel stats-overview">
          <header class="stats-panel-head stats-overview-head">
            <div class="stats-heading">
              <h3 class="stats-title">结算统计</h3>
              <span class="stats-desc">已结算 {{ stats.roundCount }} 笔 · 每完成一笔结算，自第 2 笔起按累计口径统计一次</span>
            </div>
            <div class="stats-head-actions">
              <a-tooltip :overlay-style="{ maxWidth: '380px' }">
                <template #title>
                  <div class="stats-tip">
                    一笔 = 一只股票的一次完整「建仓 → 清仓」（一个已归档轮次）。<br />
                    全部股票按清仓时间先后合成结算序列；<br />
                    胜率 = 盈利笔数 ÷ 总笔数（平局计入总笔数）<br />
                    平均盈利 = 盈利总和 ÷ 盈利笔数<br />
                    平均亏损 = 亏损总和 ÷ 亏损笔数<br />
                    实际盈亏比 = 平均盈利 ÷ 平均亏损<br />
                    期望值 = 胜率 × 平均盈利 − 亏损率 × 平均亏损<br />
                    最大回撤 = 账户净值（本金 + 累计已结算盈亏）从高点的最大跌幅，占本金% 按当前本金口径。
                  </div>
                </template>
                <QuestionCircleOutlined class="stats-tip-icon" aria-label="统计口径说明" />
              </a-tooltip>
              <a-button size="small" :loading="loading" @click="statsStore.loadStats()">刷新</a-button>
            </div>
          </header>

          <div class="stats-overview-body">
            <!-- 主结果：总盈亏领衔 -->
            <div class="stats-metric stats-lead">
              <span class="stats-metric-label">总盈亏</span>
              <span class="stats-lead-value amount" :class="pnlClass(latestPoint.totalPnl)">
                {{ signedYuan(latestPoint.totalPnl) }}
              </span>
              <span class="stats-metric-sub">截至 {{ formatDate(latestPoint.closedAt) }} · 第 {{ latestPoint.sequence }} 笔结算</span>
            </div>

            <!-- 关键绩效：胜负形态、赔率、期望、回撤 -->
            <div class="stats-kpis">
              <div class="stats-metric stats-kpi">
                <span class="stats-metric-label">胜率</span>
                <span class="stats-metric-value amount">{{ rateText(latestPoint.winRate) }}</span>
                <span class="stats-metric-sub">{{ latestPoint.winCount }} 胜 · {{ latestPoint.lossCount }} 负</span>
              </div>
              <div class="stats-metric stats-kpi">
                <span class="stats-metric-label">实际盈亏比</span>
                <span class="stats-metric-value amount">{{ ratioText(latestPoint) }}</span>
                <span class="stats-metric-sub">平均盈利 ÷ 平均亏损</span>
              </div>
              <div class="stats-metric stats-kpi">
                <span class="stats-metric-label">期望值</span>
                <span class="stats-metric-value amount" :class="pnlClass(latestPoint.expectancy)">
                  {{ signedYuan(latestPoint.expectancy) }}
                </span>
                <span class="stats-metric-sub">平均每笔</span>
              </div>
              <div class="stats-metric stats-kpi">
                <span class="stats-metric-label">最大回撤</span>
                <span class="stats-metric-value amount" :class="latestPoint.maxDrawdown > 0 ? 'amount-expense' : ''">
                  {{ yuanText(latestPoint.maxDrawdown) }}
                </span>
                <span class="stats-metric-sub">占本金 {{ rateText(latestPoint.maxDrawdownPct) }}</span>
              </div>
            </div>
          </div>

          <!-- 均值样本：构成盈亏比的两端 -->
          <div class="stats-averages">
            <div class="stats-metric stats-average">
              <span class="stats-average-label">平均盈利</span>
              <span class="stats-average-value amount" :class="latestPoint.avgWin > 0 ? 'amount-income' : ''">
                {{ winAvgText(latestPoint.avgWin) }}
              </span>
              <span class="stats-average-sub">{{ latestPoint.winCount }} 笔盈利</span>
            </div>
            <div class="stats-metric stats-average">
              <span class="stats-average-label">平均亏损</span>
              <span class="stats-average-value amount" :class="latestPoint.avgLoss > 0 ? 'amount-expense' : ''">
                {{ lossAvgText(latestPoint.avgLoss) }}
              </span>
              <span class="stats-average-sub">{{ latestPoint.lossCount }} 笔亏损</span>
            </div>
          </div>
        </section>

        <!-- ===== 统计曲线 ===== -->
        <section class="stats-panel stats-chart-panel">
          <header class="stats-panel-head">
            <div class="stats-heading">
              <h3 class="stats-subtitle">统计曲线</h3>
              <span class="stats-desc">每个点都是一次结算后的累计计算点，从第 {{ firstPointSequence }} 笔开始</span>
            </div>
            <div class="stats-chart-controls">
              <a-segmented
                v-model:value="selectedMetric"
                :options="metricSegmentedOptions"
                size="small"
                aria-label="选择曲线指标"
              />
            </div>
          </header>
          <div v-if="chartEmpty" class="stats-chart-empty">
            <span>暂无亏损样本，实际盈亏比尚未有定义</span>
          </div>
          <v-chart v-else-if="chartOption" :option="chartOption" autoresize class="stats-chart" />
        </section>

        <!-- ===== 逐笔结算明细 ===== -->
        <section class="stats-panel stats-table-panel">
          <header class="stats-panel-head">
            <div class="stats-heading">
              <h3 class="stats-subtitle">逐笔结算明细</h3>
              <span class="stats-desc">每一行 = 结算到第 N 笔时的累计结果</span>
            </div>
          </header>
          <div class="stats-table-scroll">
            <table class="stats-table">
              <thead>
                <tr>
                  <th>结算点</th>
                  <th>结算日期</th>
                  <th>本笔盈亏</th>
                  <th>累计盈亏</th>
                  <th>胜负</th>
                  <th>胜率</th>
                  <th>平均盈利</th>
                  <th>平均亏损</th>
                  <th>实际盈亏比</th>
                  <th>期望值</th>
                  <th>最大回撤</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in points" :key="p.sequence" :class="{ 'row-latest': p.sequence === latestPoint.sequence }">
                  <td :title="`${p.stockName} ${p.stockCode} · 该股第 ${p.stockRoundNo} 轮`">
                    <span class="cell-seq amount">第 {{ p.sequence }} 笔</span>
                    <span class="cell-note amount">{{ p.stockName }} 第 {{ p.stockRoundNo }} 轮</span>
                  </td>
                  <td class="cell-date">{{ formatDate(p.closedAt) }}</td>
                  <td>
                    <span class="cell-money amount" :class="pnlClass(p.pnl)">{{ signedYuan(p.pnl) }}</span>
                    <span class="cell-note amount">{{ rateText(p.pnlRate) }}</span>
                  </td>
                  <td>
                    <span class="cell-money amount" :class="pnlClass(p.totalPnl)">{{ signedYuan(p.totalPnl) }}</span>
                  </td>
                  <td>
                    <span class="cell-winloss">{{ p.winCount }} 胜 {{ p.lossCount }} 负</span>
                  </td>
                  <td>
                    <span class="cell-money amount">{{ rateText(p.winRate) }}</span>
                  </td>
                  <td>
                    <span class="cell-money amount" :class="p.avgWin > 0 ? 'amount-income' : ''">{{ winAvgText(p.avgWin) }}</span>
                  </td>
                  <td>
                    <span class="cell-money amount" :class="p.avgLoss > 0 ? 'amount-expense' : ''">{{ lossAvgText(p.avgLoss) }}</span>
                  </td>
                  <td>
                    <span class="cell-money amount">{{ ratioText(p) }}</span>
                  </td>
                  <td>
                    <span class="cell-money amount" :class="pnlClass(p.expectancy)">{{ signedYuan(p.expectancy) }}</span>
                  </td>
                  <td>
                    <span class="cell-money amount" :class="p.maxDrawdown > 0 ? 'amount-expense' : ''">{{ yuanText(p.maxDrawdown) }}</span>
                    <span class="cell-note amount">占本金 {{ rateText(p.maxDrawdownPct) }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import dayjs from 'dayjs'
import { QuestionCircleOutlined } from '@ant-design/icons-vue'
import type { EChartsOption } from 'echarts'
import { useAppearanceStore } from '@/stores/appearanceStore'
import { useStockStatisticsStore } from '@/stores/stockStatisticsStore'
import { centsToYuan } from '@/backend/functions'
import type { StockStatisticsPoint } from '@/types/transactions'

const statsStore = useStockStatisticsStore()
const { stats, loading } = storeToRefs(statsStore)
const appearanceStore = useAppearanceStore()

const points = computed(() => stats.value?.points ?? [])
const latestPoint = computed<StockStatisticsPoint | null>(() => points.value[points.value.length - 1] ?? null)
const firstPointSequence = computed(() => points.value[0]?.sequence ?? 2)

// ---------- 展示 ----------
const signedYuan = (cents: number): string => {
  const sign = cents > 0 ? '+' : cents < 0 ? '-' : ''
  return `${sign}¥${centsToYuan(Math.abs(cents))}`
}
const yuanText = (cents: number): string => `¥${centsToYuan(Math.max(0, cents))}`
const winAvgText = (cents: number): string => (cents > 0 ? `¥${centsToYuan(cents)}` : '—')
const lossAvgText = (cents: number): string => (cents > 0 ? `-¥${centsToYuan(cents)}` : '—')
const rateText = (rate: number): string => `${rate.toFixed(2)}%`
const ratioText = (p: StockStatisticsPoint): string =>
  p.pnlRatio === null ? '∞' : p.pnlRatio.toFixed(2)
const pnlClass = (cents: number): string =>
  cents > 0 ? 'amount-income' : cents < 0 ? 'amount-expense' : ''
const formatDate = (t: number): string => dayjs(t * 1000).format('YYYY-MM-DD')
const formatMonthDay = (t: number): string => dayjs(t * 1000).format('MM-DD')

// ---------- 曲线指标 ----------
type MetricKey = 'totalPnl' | 'winRate' | 'avgWin' | 'avgLoss' | 'pnlRatio' | 'expectancy' | 'maxDrawdown'
interface MetricDef {
  key: MetricKey
  label: string
  kind: 'money' | 'percent' | 'ratio'
  signed?: boolean
  area?: boolean
}

const metricDefs: MetricDef[] = [
  { key: 'totalPnl', label: '累计盈亏', kind: 'money', signed: true, area: true },
  { key: 'winRate', label: '胜率', kind: 'percent' },
  { key: 'avgWin', label: '平均盈利', kind: 'money' },
  { key: 'avgLoss', label: '平均亏损', kind: 'money' },
  { key: 'pnlRatio', label: '实际盈亏比', kind: 'ratio' },
  { key: 'expectancy', label: '期望值', kind: 'money', signed: true },
  { key: 'maxDrawdown', label: '最大回撤', kind: 'money' },
]
const selectedMetric = ref<MetricKey>('totalPnl')
const activeMetric = computed<MetricDef>(
  () => metricDefs.find((m) => m.key === selectedMetric.value) ?? metricDefs[0]!
)
const metricSegmentedOptions = computed(() =>
  metricDefs.map((m) => ({ label: m.label, value: m.key }))
)

const metricValue = (p: StockStatisticsPoint, key: MetricKey): number | null => {
  switch (key) {
    case 'totalPnl':
      return p.totalPnl
    case 'winRate':
      return p.winRate
    case 'avgWin':
      return p.avgWin
    case 'avgLoss':
      return -p.avgLoss
    case 'pnlRatio':
      return p.pnlRatio
    case 'expectancy':
      return p.expectancy
    case 'maxDrawdown':
      return p.maxDrawdown
  }
}

const chartEmpty = computed(() =>
  selectedMetric.value === 'pnlRatio' && points.value.every((p) => p.pnlRatio === null)
)

const readThemeColors = () => {
  // 依赖追踪：主题切换时重新解析颜色
  appearanceStore.effective
  const styles = getComputedStyle(document.documentElement)
  const get = (name: string, fallback: string): string =>
    styles.getPropertyValue(name).trim() || fallback
  return {
    textMajor: get('--transactions-color-text-major', '#0f1115'),
    textSecondary: get('--transactions-color-text-secondary', '#61666b'),
    textTertiary: get('--transactions-color-text-tertiary', '#81858c'),
    bg: get('--transactions-color-major-background', '#ffffff'),
    border: get('--transactions-color-window-border', '#e8eaed'),
    split: get('--transactions-color-divider', '#eceef1'),
    income: get('--transactions-color-income', '#16a34a'),
    expense: get('--transactions-color-expense', '#dc2626'),
    incomeTint: get('--transactions-color-income-tint', 'rgba(22, 163, 74, 0.10)'),
    expenseTint: get('--transactions-color-expense-tint', 'rgba(220, 38, 38, 0.10)'),
  }
}

const moneyAxisText = (value: number): string => {
  const abs = Math.abs(value)
  if (abs >= 100000000) return `¥${(value / 100000000).toFixed(1)}亿`
  if (abs >= 10000) return `¥${(value / 10000).toFixed(1)}万`
  return `¥${value}`
}

const formatAxisValue = (value: number, metric: MetricDef): string => {
  if (metric.kind === 'money') return moneyAxisText(value)
  if (metric.kind === 'percent') return `${value}%`
  return value.toFixed(2)
}

const chartOption = computed<EChartsOption | null>(() => {
  const list = points.value
  if (!list.length || chartEmpty.value) return null
  const metric = activeMetric.value
  const colors = readThemeColors()
  const values = list.map((p) => metricValue(p, metric.key))

  // 语义色：金额按正负 / 指标性质着色
  let lineColor = colors.textMajor
  if (metric.key === 'avgWin' || metric.key === 'winRate' || metric.key === 'pnlRatio') {
    lineColor = colors.income
  } else if (metric.key === 'avgLoss' || metric.key === 'maxDrawdown') {
    lineColor = colors.expense
  } else if (metric.key === 'totalPnl' || metric.key === 'expectancy') {
    const latest = values[values.length - 1] ?? 0
    lineColor = latest >= 0 ? colors.income : colors.expense
  }

  const axisLabel: Record<string, unknown> = {
    color: colors.textSecondary,
    fontSize: 11,
    fontFamily: 'JetBrains Mono, monospace',
    interval: list.length > 12 ? 'auto' : 0,
    formatter: (value: string) => value,
  }
  if (list.length > 10) {
    axisLabel.rotate = 40
  }

  return {
    animation: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    grid: { left: 14, right: 20, top: 34, bottom: 14, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: colors.bg,
      borderColor: colors.border,
      borderWidth: 1,
      padding: [10, 14],
      textStyle: { color: colors.textMajor, fontSize: 12 },
      extraCssText: 'box-shadow: 0 8px 24px rgba(0,0,0,0.10); border-radius: 8px;',
      formatter: (params: unknown) => {
        const series = Array.isArray(params) ? params : []
        const dataIndex = series[0]?.dataIndex as number | undefined
        const p = typeof dataIndex === 'number' ? list[dataIndex] : null
        if (!p) return ''
        const mono = 'font-family: JetBrains Mono, monospace; font-variant-numeric: tabular-nums;'
        const signedStyle = (cents: number): string =>
          cents >= 0 ? `color:${colors.income}` : `color:${colors.expense}`
        const money = (cents: number): string =>
          `${cents >= 0 ? '+' : '-'}¥${centsToYuan(Math.abs(cents))}`
        const row = (label: string, value: string): string =>
          `<div style="display:flex;justify-content:space-between;gap:18px;line-height:1.7;">
             <span style="color:${colors.textTertiary}">${label}</span><span>${value}</span>
           </div>`
        return `
          <div style="margin-bottom:6px;font-weight:600">第 ${p.sequence} 笔结算 · ${formatDate(p.closedAt)}</div>
          ${row('该笔盈亏', `<span style="${mono}${signedStyle(p.pnl)}">${money(p.pnl)}</span>`)}
          ${row('累计盈亏', `<span style="${mono}${signedStyle(p.totalPnl)}">${money(p.totalPnl)}</span>`)}
          ${row('胜负', `<span>${p.winCount} 胜 · ${p.lossCount} 负</span>`)}
          ${row('胜率', `<span style="${mono}">${p.winRate.toFixed(2)}%</span>`)}
          ${row('平均盈利', `<span style="${mono}color:${colors.income}">¥${centsToYuan(p.avgWin)}</span>`)}
          ${row('平均亏损', `<span style="${mono}color:${colors.expense}">-¥${centsToYuan(p.avgLoss)}</span>`)}
          ${row('实际盈亏比', `<span style="${mono}">${p.pnlRatio === null ? '∞' : p.pnlRatio.toFixed(2)}</span>`)}
          ${row('期望值', `<span style="${mono}${signedStyle(p.expectancy)}">${money(p.expectancy)}</span>`)}
          ${row('最大回撤', `<span style="${mono}color:${colors.expense}">¥${centsToYuan(p.maxDrawdown)}（占本金 ${p.maxDrawdownPct.toFixed(2)}%）</span>`)}
        `
      },
    },
    xAxis: {
      type: 'category',
      data: list.map((p) => `第${p.sequence}笔\n${formatMonthDay(p.closedAt)}`),
      axisLabel,
      axisLine: { lineStyle: { color: colors.border } },
      axisTick: { show: false },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      scale: metric.key !== 'winRate',
      axisLabel: {
        color: colors.textSecondary,
        fontSize: 11,
        fontFamily: 'JetBrains Mono, monospace',
        formatter: (value: number) => formatAxisValue(value, metric),
      },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: colors.split } },
    },
    series: [
      {
        name: metric.label,
        type: 'line',
        data: values,
        smooth: false,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: lineColor, width: 2 },
        itemStyle: { color: lineColor, borderColor: colors.bg, borderWidth: 1.5 },
        areaStyle:
          metric.area && metric.key === 'totalPnl'
            ? { color: lineColor === colors.income ? colors.incomeTint : colors.expenseTint }
            : undefined,
        emphasis: { focus: 'series' },
        markLine:
          metric.kind === 'money' && metric.signed
            ? {
                silent: true,
                symbol: 'none',
                label: { show: false },
                lineStyle: { color: colors.border, type: 'dashed' },
                data: [{ yAxis: 0 }],
              }
            : undefined,
      },
    ],
  }
})

onMounted(() => {
  statsStore.loadStats()
})
</script>

<style scoped lang="scss">
@use '@/styles/mixins' as *;

.stats-page {
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--transactions-space-xl);
  padding-right: var(--transactions-space-2xs);
  @include custom-scrollbar;
}

/* ========== 面板容器 ========== */
.stats-panel {
  flex-shrink: 0;
  background-color: var(--transactions-color-major-background);
  border: 1px solid var(--transactions-color-window-border);
  border-radius: var(--transactions-radius-lg);
  box-shadow: var(--transactions-shadow-sm);
  overflow: hidden;
}

.stats-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--transactions-space-md);
  flex-wrap: wrap;
  padding: var(--transactions-space-lg) var(--transactions-space-xl);
  border-bottom: 1px solid var(--transactions-color-divider);
}

.stats-heading {
  display: flex;
  flex-direction: column;
  gap: var(--transactions-space-2xs);
  min-width: 0;
}

.stats-title {
  margin: 0;
  font-family: var(--transactions-font-display);
  font-size: var(--transactions-size-text-title-sm);
  font-weight: 600;
  color: var(--transactions-color-text-major);
  line-height: var(--transactions-height-snug);
}

.stats-subtitle {
  margin: 0;
  font-family: var(--transactions-font-body);
  font-size: var(--transactions-size-text-section);
  font-weight: 500;
  color: var(--transactions-color-text-major);
  line-height: var(--transactions-height-normal);
}

.stats-desc {
  font-size: var(--transactions-size-text-caption);
  color: var(--transactions-color-text-tertiary);
  line-height: var(--transactions-height-normal);
}

.stats-head-actions {
  display: flex;
  align-items: center;
  gap: var(--transactions-space-md);
  flex-shrink: 0;
}

.stats-tip-icon {
  font-size: var(--transactions-size-text-body);
  color: var(--transactions-color-text-tertiary);
  cursor: help;
  transition: color var(--transactions-transition-fast);
}

.stats-tip-icon:hover {
  color: var(--transactions-color-text-secondary);
}

.stats-tip {
  font-size: var(--transactions-size-text-caption);
  line-height: 1.8;
  color: var(--transactions-color-text-secondary);
}

/* ========== 顶部汇总 ========== */
.stats-metric {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--transactions-space-2xs);
  min-width: 0;
}

.stats-metric-label {
  font-size: var(--transactions-size-text-caption);
  font-weight: 500;
  color: var(--transactions-color-text-secondary);
  line-height: var(--transactions-height-snug);
  white-space: nowrap;
}

.stats-lead-value,
.stats-metric-value,
.stats-average-value {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.stats-metric-sub,
.stats-average-sub {
  font-size: var(--transactions-size-text-small);
  color: var(--transactions-color-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

/* 主区：左结果 + 右关键绩效 */
.stats-overview-body {
  display: grid;
  grid-template-columns: minmax(0, 300px) minmax(0, 1fr);
  align-items: stretch;
  gap: 0 var(--transactions-space-xl);
  padding: var(--transactions-space-lg) var(--transactions-space-xl) var(--transactions-space-xl);
}

.stats-lead {
  justify-content: center;
  padding-right: var(--transactions-space-xl);
  border-right: 1px solid var(--transactions-color-divider);
}

.stats-lead-value {
  color: var(--transactions-color-text-major);
  font-size: var(--transactions-size-text-display-sm);
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: var(--transactions-height-tight);
}

.stats-kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-items: center;
}

.stats-kpi {
  justify-content: center;
  align-self: stretch;
  padding-left: var(--transactions-space-xl);
}

.stats-kpi + .stats-kpi {
  border-left: 1px solid var(--transactions-color-divider);
}

.stats-metric-value {
  color: var(--transactions-color-text-major);
}

/* 均值样本带：次要层级，底色与主区区分 */
.stats-averages {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-top: 1px solid var(--transactions-color-window-border);
  background-color: var(--transactions-color-minor-background);
}

.stats-average {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  grid-template-areas:
    'label value'
    'label sub';
  column-gap: var(--transactions-space-lg);
  row-gap: var(--transactions-space-2xs);
  align-items: center;
  padding: var(--transactions-space-md) var(--transactions-space-xl);
}

.stats-average + .stats-average {
  border-left: 1px solid var(--transactions-color-window-border);
}

.stats-average-label {
  grid-area: label;
  font-size: var(--transactions-size-text-caption);
  font-weight: 500;
  color: var(--transactions-color-text-secondary);
  white-space: nowrap;
}

.stats-average-value {
  grid-area: value;
  justify-self: end;
  color: var(--transactions-color-text-major);
  font-size: var(--transactions-size-text-body);
  font-weight: 500;
  letter-spacing: -0.01em;
}

.stats-average-sub {
  grid-area: sub;
  justify-self: end;
}

/* ========== 统计曲线 ========== */
.stats-chart-controls {
  flex-shrink: 0;
  max-width: 100%;
}

.stats-chart-controls :deep(.ant-segmented) {
  padding: var(--transactions-space-2xs);
  background-color: var(--transactions-color-minor-background);
  border-radius: var(--transactions-radius-md);
}

.stats-chart {
  width: 100%;
  height: 320px;
  padding: var(--transactions-space-lg) var(--transactions-space-md) var(--transactions-space-md);
}

.stats-chart-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 320px;
  font-size: var(--transactions-size-text-body-sm);
  color: var(--transactions-color-text-tertiary);
}

/* ========== 逐笔明细表 ========== */
.stats-table-scroll {
  overflow: auto;
  max-height: 480px;
  @include custom-scrollbar;
}

.stats-table {
  width: 100%;
  min-width: 1140px;
  border-collapse: collapse;
}

.stats-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: var(--transactions-space-sm) var(--transactions-space-xs);
  background-color: var(--transactions-color-minor-background);
  font-family: var(--transactions-font-body);
  font-size: var(--transactions-size-text-caption);
  font-weight: 500;
  color: var(--transactions-color-text-secondary);
  text-align: left;
  white-space: nowrap;
  border-bottom: 1px solid var(--transactions-color-window-border);
}

.stats-table td {
  padding: var(--transactions-space-sm) var(--transactions-space-xs);
  font-size: var(--transactions-size-text-body);
  color: var(--transactions-color-text-major);
  text-align: left;
  border-bottom: 1px solid var(--transactions-color-divider);
  white-space: nowrap;
  vertical-align: middle;
}

.stats-table tbody tr:last-child td {
  border-bottom: none;
}

.stats-table tbody tr:hover td {
  background-color: var(--transactions-color-hover-bg);
}

.stats-table tbody tr.row-latest td {
  background-color: var(--transactions-color-primary-tint);
}

.stats-table tbody tr.row-latest:hover td {
  background-color: var(--transactions-color-active-bg);
}

.cell-seq,
.cell-money {
  font-size: var(--transactions-size-text-body);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}

.cell-note {
  margin-left: var(--transactions-space-xs);
  font-size: var(--transactions-size-text-small);
  color: var(--transactions-color-text-tertiary);
  font-weight: 400;
  letter-spacing: 0;
}

.cell-date,
.cell-winloss {
  font-family: var(--transactions-font-mono);
  font-size: var(--transactions-size-text-body);
  color: var(--transactions-color-text-secondary);
  font-variant-numeric: tabular-nums;
}

/* ========== 空态 / 骨架 ========== */
.stats-empty-panel {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 320px;
  background-color: var(--transactions-color-major-background);
  border: 1px solid var(--transactions-color-window-border);
  border-radius: var(--transactions-radius-lg);
  box-shadow: var(--transactions-shadow-sm);
}

.stats-empty-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--transactions-space-sm);
  text-align: center;
  max-width: 460px;
}

.stats-empty-title {
  font-size: var(--transactions-size-text-section);
  font-weight: 500;
  color: var(--transactions-color-text-major);
}

.stats-empty-hint {
  font-size: var(--transactions-size-text-body-sm);
  line-height: var(--transactions-height-relaxed);
  color: var(--transactions-color-text-secondary);
}

.stats-loading {
  display: flex;
  flex-direction: column;
  gap: var(--transactions-space-lg);
}

.stats-panel-skeleton {
  background-color: var(--transactions-color-major-background);
}

.stats-skeleton-head {
  height: 232px;
}

.stats-skeleton-chart {
  height: 420px;
}

@media (max-width: 1280px) {
  .stats-overview-body {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--transactions-space-xl) 0;
  }

  .stats-lead {
    padding-right: 0;
    padding-bottom: var(--transactions-space-lg);
    border-right: none;
    border-bottom: 1px solid var(--transactions-color-divider);
  }
}

@media (max-width: 1080px) {
  .stats-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    row-gap: var(--transactions-space-xl);
  }

  .stats-kpi {
    padding-left: 0;
  }

  .stats-kpi:nth-child(even) {
    padding-left: var(--transactions-space-xl);
    border-left: 1px solid var(--transactions-color-divider);
  }

  .stats-chart {
    height: 280px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .stats-chart {
    transition: none;
  }
}
</style>
