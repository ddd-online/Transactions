<template>
  <BilladmPageLayout>
    <template #toolbar>
      <div class="da-toolbar-left">
        <BilladmTimeRangePicker
          v-model:time-range="trQueryConditionStore.timeRange"
          v-model:time-range-type="trQueryConditionStore.timeRangeType"
        />
      </div>
      <div class="da-toolbar-right">
      </div>
    </template>

    <!-- 主内容区 -->
    <div class="da-main">
      <!-- 左侧图表列表 -->
      <div class="da-sidebar">
        <billadm-chart-list
          :all-charts="allCharts"
          @select="onChartSelect"
          @create="onChartCreate"
          @edit="onChartEdit"
          @delete="onChartDelete"
          @refresh="loadAllCharts"
        />
      </div>

      <!-- 右侧图表显示 -->
      <div class="da-content">
        <billadm-chart-view
          v-if="selectedChart"
          :title="selectedChart.title"
          :data="selectedChart.data"
          :lines="selectedChart.lines"
          :granularity="selectedChart.granularity"
          :is-preset="false"
          :chart-id="selectedChartId"
          @update="onChartUpdate"
          @add-line="onChartAddLine"
        />
        <div v-else class="da-empty">
          <a-empty description="请选择一个图表" />
        </div>
      </div>
    </div>
  </BilladmPageLayout>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import BilladmTimeRangePicker from '@/components/common/BilladmTimeRangePicker.vue'
import BilladmChartList from '@/components/da_view/BilladmChartList.vue'
import BilladmChartView from '@/components/da_view/BilladmChartView.vue'
import { useLedgerStore } from '@/stores/ledgerStore.ts'
import { useTrQueryConditionStore } from '@/stores/trQueryConditionStore.ts'
import { useAppDataStore } from '@/stores/appDataStore.ts'
import { convertToUnixTimeRange } from '@/backend/timerange.ts'
import { withErrorHandling } from '@/backend/errorHandler'
import { queryChartData, queryTrOnCondition as queryTrOnConditionRaw } from '@/backend/api/tr.ts'
import { queryCharts, createChart as createChartApi, updateChart as updateChartApi, type ChartDto } from '@/backend/api/chart'
import { buildLineChartData, type ChartLine, type TimeSeriesData } from '@/backend/chart'
import type { TrStatistics } from '@/types/billadm'

const ledgerStore = useLedgerStore()
const trQueryConditionStore = useTrQueryConditionStore()
const appDataStore = useAppDataStore()

interface ChartInstance {
  title: string
  granularity: 'year' | 'month'
  data: TimeSeriesData[]
  lines: ChartLine[]
  chartId: string
}

const selectedChart = ref<ChartInstance | null>(null)
const selectedChartId = ref<string | null>(null)
const allCharts = ref<ChartDto[]>([])

// 缓存图表数据
const chartDataCache = ref<Map<string, ChartInstance>>(new Map())

let cachedLedgerId: string | null = null
let cachedTimeKey: string | null = null

function makeTimeKey(): string {
  const tr = trQueryConditionStore.timeRange
  if (!tr) return 'all'
  return `${tr[0]?.unix() ?? 0}_${tr[1]?.unix() ?? 0}`
}

// 查询底部统计数据
const queryStatistics = async (): Promise<TrStatistics | null> => {
  if (!ledgerStore.currentLedgerId) return null
  const result = await withErrorHandling(
    () => queryTrOnConditionRaw({
      ledgerId: ledgerStore.currentLedgerId,
      tsRange: trQueryConditionStore.timeRange
        ? convertToUnixTimeRange(trQueryConditionStore.timeRange)
        : undefined,
      items: [],
    }),
    {
      errorPrefix: '查询消费记录失败',
      fallback: { items: [], total: 0, trStatistics: { income: 0, expense: 0, transfer: 0 } }
    }
  )
  return result.trStatistics || null
}

// 加载图表数据
const loadChartData = async (chart: ChartDto): Promise<ChartInstance | null> => {
  const response = await queryChartData({
    ledgerId: chart.ledgerId,
    tsRange: trQueryConditionStore.timeRange
      ? convertToUnixTimeRange(trQueryConditionStore.timeRange)
      : undefined,
    granularity: chart.granularity,
    lines: chart.lines,
  })

  const lineRecords = response.lines.map((line) => ({
    label: line.label,
    type: line.type,
    items: line.items,
  }))
  const data = buildLineChartData(lineRecords, chart.granularity)

  return {
    title: chart.title,
    granularity: chart.granularity,
    data,
    lines: chart.lines,
    chartId: chart.chartId,
  }
}

// 加载所有图表
const loadAllCharts = async () => {
  const currentLedgerId = ledgerStore.currentLedgerId
  const timeKey = makeTimeKey()

  if (cachedLedgerId === currentLedgerId && cachedTimeKey === timeKey) return

  cachedLedgerId = currentLedgerId
  cachedTimeKey = timeKey

  if (!currentLedgerId) return

  // 加载图表列表（懒播种会在后端 ListByLedgerId 中触发）
  try {
    allCharts.value = await queryCharts(currentLedgerId)
  } catch (error) {
    console.error('load charts failed:', error)
    allCharts.value = []
  }

  // 并行加载所有图表数据
  const results = await Promise.all(
    allCharts.value.map(async (chart) => {
      const instance = await loadChartData(chart)
      return { chartId: chart.chartId, instance }
    })
  )

  chartDataCache.value = new Map()
  results.forEach(({ chartId, instance }) => {
    if (instance) chartDataCache.value.set(chartId, instance)
  })

  // 更新底部统计
  const statistics = await queryStatistics()
  if (statistics) appDataStore.setStatistics(statistics)

  // 保持当前选中
  if (selectedChartId.value) {
    selectedChart.value = chartDataCache.value.get(selectedChartId.value) || null
  }

  // 初始化选中第一个
  if (!selectedChart.value && allCharts.value.length > 0) {
    const first = allCharts.value[0]!
    selectedChart.value = chartDataCache.value.get(first.chartId) || null
    selectedChartId.value = first.chartId
  }
}

// 图表选择
const onChartSelect = (chart: ChartDto) => {
  selectedChart.value = chartDataCache.value.get(chart.chartId) || null
  selectedChartId.value = chart.chartId
}

// 创建图表
const onChartCreate = async (request: { title: string; granularity: 'year' | 'month' }) => {
  if (!ledgerStore.currentLedgerId) {
    message.error('请先选择账本')
    return
  }
  try {
    const newChart = await createChartApi({
      ledgerId: ledgerStore.currentLedgerId,
      title: request.title,
      granularity: request.granularity,
      lines: [],
      chartType: 'line',
    })
    allCharts.value.push(newChart)

    const instance = await loadChartData(newChart)
    if (instance) {
      chartDataCache.value.set(newChart.chartId, instance)
    }

    selectedChart.value = instance
    selectedChartId.value = newChart.chartId
    message.success('创建成功')
  } catch (error) {
    message.error('创建失败')
  }
}

// 编辑图表
const onChartEdit = async (chart: ChartDto) => {
  // 打开编辑弹窗 — 使用 updateChart 接口
  // 编辑功能由 BilladmChartView 的 @update 事件处理
  // 这里只是选中图表，编辑按钮在图表视图中
  selectedChart.value = chartDataCache.value.get(chart.chartId) || null
  selectedChartId.value = chart.chartId
}

// 删除图表
const onChartDelete = async (chartId: string) => {
  if (selectedChartId.value === chartId) {
    selectedChart.value = null
    selectedChartId.value = null
  }
  cachedLedgerId = null
  cachedTimeKey = null
  await loadAllCharts()

  if (!selectedChart.value && allCharts.value.length > 0) {
    const first = allCharts.value[0]!
    selectedChart.value = chartDataCache.value.get(first.chartId) || null
    selectedChartId.value = first.chartId
  }
}

// 更新图表
const onChartUpdate = async (chartId: string, request: { title?: string; granularity?: 'year' | 'month'; lines?: ChartLine[] }) => {
  const chart = allCharts.value.find(c => c.chartId === chartId)
  if (!chart) return

  try {
    await updateChartApi({
      chartId,
      title: request.title || chart.title,
      granularity: request.granularity || chart.granularity,
      lines: request.lines || chart.lines,
      chartType: chart.chartType,
      sortOrder: chart.sortOrder,
    })
    cachedLedgerId = null
    cachedTimeKey = null
    await loadAllCharts()
    message.success('更新成功')
  } catch (error) {
    message.error('更新失败')
  }
}

// 添加曲线
const onChartAddLine = async (chartId: string, line: ChartLine) => {
  const chart = allCharts.value.find(c => c.chartId === chartId)
  if (!chart) return
  const newLines = [...chart.lines, line]
  await onChartUpdate(chartId, { lines: newLines })
}

onMounted(() => loadAllCharts())

watch(() => ledgerStore.currentLedgerId, () => loadAllCharts())
watch(() => trQueryConditionStore.timeRange, () => loadAllCharts(), { deep: true })
</script>

<style scoped>
.da-toolbar-left {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-md);
}

.da-toolbar-right {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-md);
}

.da-main {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  gap: var(--billadm-space-md);
}

.da-sidebar {
  flex: 0 0 220px;
  background-color: var(--billadm-color-minor-background);
  border-radius: var(--billadm-radius-lg);
  overflow-y: auto;
}

.da-content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  background-color: transparent;
  border-radius: var(--billadm-radius-lg);
}

.da-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}
</style>
