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
          :custom-charts="customCharts"
          @select="onChartSelect"
          @create="onChartCreate"
          @delete="onChartDelete"
          @refresh="loadCustomCharts"
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
          :is-preset="selectedIsPreset"
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
import { KEEP_CHART_CONFIGS, buildLineChartData, type ChartLine, type ChartConfig, type TimeSeriesData } from '@/backend/chart'
import type { TrStatistics } from '@/types/billadm'

const ledgerStore = useLedgerStore()
const trQueryConditionStore = useTrQueryConditionStore()
const appDataStore = useAppDataStore()

interface ChartInstance {
  title: string
  granularity: 'year' | 'month'
  data: TimeSeriesData[]
  lines: ChartLine[]
  isPreset: boolean
  chartId?: string
}

const selectedChart = ref<ChartInstance | null>(null)
const selectedIsPreset = ref(false)
const selectedChartId = ref<string | null>(null)
const customCharts = ref<ChartDto[]>([])

// 缓存图表数据
const chartDataCache = ref<Map<string, ChartInstance>>(new Map())

// 缓存key，用于判断是否需要重新查询
let cachedLedgerId: string | null = null
let cachedTimeRange: typeof trQueryConditionStore.timeRange = undefined

// 查询底部统计数据
const queryStatistics = async (): Promise<TrStatistics | null> => {
  if (!ledgerStore.currentLedgerId) return null
  const trCondition = {
    ledgerId: ledgerStore.currentLedgerId,
    tsRange: trQueryConditionStore.timeRange
      ? convertToUnixTimeRange(trQueryConditionStore.timeRange)
      : undefined,
    items: [],
  }
  const result = await withErrorHandling(
    () => queryTrOnConditionRaw(trCondition),
    {
      errorPrefix: '查询消费记录失败',
      fallback: { items: [], total: 0, trStatistics: { income: 0, expense: 0, transfer: 0 } }
    }
  )
  return result.trStatistics || null
}

// 加载自定义图表
const loadCustomCharts = async () => {
  if (!ledgerStore.currentLedgerId) return
  try {
    const charts = await queryCharts(ledgerStore.currentLedgerId)
    customCharts.value = charts
  } catch (error) {
    console.error('load custom charts failed:', error)
  }
}

// 查询图表数据
const loadChartData = async (config: ChartConfig | ChartDto, isPreset: boolean): Promise<ChartInstance | null> => {
  const currentLedgerId = ledgerStore.currentLedgerId
  const tsRange = trQueryConditionStore.timeRange
    ? convertToUnixTimeRange(trQueryConditionStore.timeRange)
    : undefined

  const lines = config.lines
  const granularity = config.granularity

  const response = await queryChartData({
    ledgerId: currentLedgerId || '',
    tsRange,
    granularity,
    lines,
  })

  // 转换API响应为TimeSeriesData格式（前端完成时间聚合）
  const lineRecords = response.lines.map((line) => ({
    label: line.label,
    type: line.type,
    items: line.items,
  }))
  const data = buildLineChartData(lineRecords, granularity)

  return {
    title: config.title,
    granularity,
    data,
    lines,
    isPreset,
    chartId: 'chartId' in config ? config.chartId : undefined,
  }
}

// 加载所有图表数据
const loadAllChartData = async () => {
  const currentLedgerId = ledgerStore.currentLedgerId
  const currentTimeRange = trQueryConditionStore.timeRange

  // 检查是否需要重新查询（时间范围需要深度比较）
  const timeRangeChanged = JSON.stringify(cachedTimeRange) !== JSON.stringify(currentTimeRange)
  const needRefetch = cachedLedgerId !== currentLedgerId || timeRangeChanged

  if (!needRefetch) {
    return
  }

  cachedLedgerId = currentLedgerId
  cachedTimeRange = currentTimeRange ? { ...currentTimeRange } : undefined

  // 加载自定义图表
  await loadCustomCharts()

  // 加载预设图表数据
  const presetResults = await Promise.all(
    KEEP_CHART_CONFIGS.map(async (config) => {
      const instance = await loadChartData(config, true)
      return { title: config.title, instance, isPreset: true }
    })
  )

  // 加载自定义图表数据
  const customResults = await Promise.all(
    customCharts.value.map(async (chart) => {
      const instance = await loadChartData(chart, false)
      return { id: chart.chartId, title: chart.title, instance, isPreset: false }
    })
  )

  // 更新缓存
  chartDataCache.value.clear()
  presetResults.forEach((result) => {
    if (result.instance) chartDataCache.value.set('preset_' + result.title, result.instance)
  })
  customResults.forEach((result) => {
    if (result.instance) chartDataCache.value.set(result.id, result.instance)
  })

  // 更新底部统计信息
  const statistics = await queryStatistics()
  if (statistics) {
    appDataStore.setStatistics(statistics)
  }

  // 如果当前有选中图表，刷新选中图表的数据
  if (selectedChart.value) {
    if (selectedIsPreset.value) {
      const cacheKey = 'preset_' + selectedChart.value.title
      selectedChart.value = chartDataCache.value.get(cacheKey) || null
    } else if (selectedChartId.value) {
      selectedChart.value = chartDataCache.value.get(selectedChartId.value) || null
    }
  }

  // 初始化选中第一个预设图表（仅当没有选中时）
  if (!selectedChart.value && KEEP_CHART_CONFIGS.length > 0) {
    const firstConfig = KEEP_CHART_CONFIGS[0]!
    const cacheKey = 'preset_' + firstConfig.title
    selectedChart.value = chartDataCache.value.get(cacheKey) || null
    selectedIsPreset.value = true
    selectedChartId.value = null
  }
}

// 图表选择
const onChartSelect = (config: ChartConfig | ChartDto, isPreset: boolean) => {
  if (isPreset) {
    const cacheKey = 'preset_' + (config as ChartConfig).title
    selectedChart.value = chartDataCache.value.get(cacheKey) || null
    selectedIsPreset.value = true
    selectedChartId.value = null
  } else {
    const chartId = (config as ChartDto).chartId
    selectedChart.value = chartDataCache.value.get(chartId) || null
    selectedIsPreset.value = false
    selectedChartId.value = chartId
  }
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
    customCharts.value.push(newChart)

    // 加载新图表数据
    const instance = await loadChartData(newChart, false)
    if (instance) {
      chartDataCache.value.set(newChart.chartId, { ...instance, isPreset: false, chartId: newChart.chartId })
    }

    // 选中新图表
    selectedChart.value = chartDataCache.value.get(newChart.chartId) || null
    selectedIsPreset.value = false
    selectedChartId.value = newChart.chartId

    message.success('创建成功')
  } catch (error) {
    message.error('创建失败')
    console.error('create chart failed:', error)
  }
}

// 删除图表
const onChartDelete = async (chartId: string) => {
  // 如果删除的是当前选中的图表，重置选中状态
  if (selectedChartId.value === chartId) {
    selectedChart.value = null
    selectedChartId.value = null
    selectedIsPreset.value = false
  }

  // 强制刷新图表数据
  cachedLedgerId = null
  cachedTimeRange = undefined

  try {
    await loadAllChartData()

    // 如果重置后没有选中图表，自动选中第一个预设图表
    if (!selectedChart.value && KEEP_CHART_CONFIGS.length > 0) {
      const firstConfig = KEEP_CHART_CONFIGS[0]!
      const cacheKey = 'preset_' + firstConfig.title
      selectedChart.value = chartDataCache.value.get(cacheKey) || null
      selectedIsPreset.value = true
      selectedChartId.value = null
    }
  } catch (error) {
    console.error('refresh after delete failed:', error)
  }
}

// 更新图表
const onChartUpdate = async (chartId: string, request: { title?: string; granularity?: 'year' | 'month'; lines?: ChartLine[] }) => {
  const chart = customCharts.value.find(c => c.chartId === chartId)
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
    // 强制刷新图表数据（失效缓存，确保 loadAllChartData 重新加载）
    cachedLedgerId = null
    cachedTimeRange = undefined
    await loadAllChartData()
    message.success('更新成功')
  } catch (error) {
    message.error('更新失败')
    console.error('update chart failed:', error)
  }
}

// 添加曲线
const onChartAddLine = async (chartId: string, line: ChartLine) => {
  const chart = customCharts.value.find(c => c.chartId === chartId)
  if (!chart) return

  const newLines = [...chart.lines, line]
  await onChartUpdate(chartId, { lines: newLines })
}

onMounted(() => {
  loadAllChartData()
})

// 监听查询条件或账本变化，重新加载
watch(
  () => ledgerStore.currentLedgerId,
  () => loadAllChartData()
)
watch(
  () => trQueryConditionStore.timeRange,
  () => loadAllChartData(),
  { deep: true }
)
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
  flex: 0 0 200px;
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
