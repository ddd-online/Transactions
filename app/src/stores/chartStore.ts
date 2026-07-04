import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { RangeValue } from '@/types/billadm'
import { queryTrOnCondition as queryTrOnConditionRaw } from '@/backend/api/tr'
import { queryCharts, createChart as createChartApi, updateChart as updateChartApi, type ChartDto } from '@/backend/api/chart'
import { buildLineChartData, type ChartLine, type TimeSeriesData } from '@/backend/chart'
import { withErrorHandling } from '@/backend/errorHandler'
import { convertToUnixTimeRange } from '@/backend/timerange'
import { useLedgerStore } from '@/stores/ledgerStore'
import { useTrQueryConditionStore } from '@/stores/trQueryConditionStore'

export interface ChartInstance {
  title: string
  granularity: 'year' | 'month'
  data: TimeSeriesData[]
  lines: ChartLine[]
  isPreset: boolean
  chartId?: string
}

export const useChartStore = defineStore('chart', () => {
  const selectedChart = ref<ChartInstance | null>(null)
  const selectedIsPreset = ref(false)
  const selectedChartId = ref<string | null>(null)
  const customCharts = ref<ChartDto[]>([])

  // 缓存: `${ledgerId}_${timeKey}` → ChartInstance
  const chartDataCache = ref<Map<string, ChartInstance>>(new Map())
  let cachedLedgerId: string | null = null
  let cachedTimeKey: string | null = null

  function makeTimeKey(timeRange: RangeValue): string {
    if (!timeRange) return 'all'
    return `${timeRange[0]?.unix() ?? 0}_${timeRange[1]?.unix() ?? 0}`
  }

  function isCacheValid(ledgerId: string, timeKey: string): boolean {
    return cachedLedgerId === ledgerId && cachedTimeKey === timeKey
  }

  async function loadCustomCharts() {
    const ledgerStore = useLedgerStore()
    if (!ledgerStore.currentLedgerId) return
    customCharts.value = await queryCharts(ledgerStore.currentLedgerId)
  }

  async function fetchRawData(): Promise<{ items: any[] }> {
    const ledgerStore = useLedgerStore()
    const trQueryConditionStore = useTrQueryConditionStore()
    const timeRange = trQueryConditionStore.timeRange

    const trCondition = {
      ledgerId: ledgerStore.currentLedgerId,
      tsRange: timeRange ? convertToUnixTimeRange(timeRange) : undefined,
      items: [],
    }
    return withErrorHandling(
      () => queryTrOnConditionRaw(trCondition),
      { errorPrefix: '查询消费记录失败', fallback: { items: [], total: 0, trStatistics: { income: 0, expense: 0, transfer: 0 } } }
    )
  }

  function getCachedChart(cacheKey: string): ChartInstance | undefined {
    return chartDataCache.value.get(cacheKey)
  }

  function setCache(cacheKey: string, instance: ChartInstance) {
    chartDataCache.value = new Map(chartDataCache.value)
    chartDataCache.value.set(cacheKey, instance)
    cachedLedgerId = useLedgerStore().currentLedgerId
    cachedTimeKey = makeTimeKey(useTrQueryConditionStore().timeRange)
  }

  function selectChart(instance: ChartInstance, isPreset: boolean, chartId?: string | null) {
    selectedChart.value = instance
    selectedIsPreset.value = isPreset
    selectedChartId.value = chartId ?? null
  }

  async function createChart(title: string, granularity: 'year' | 'month', chartType: string, lines: ChartLine[]) {
    const ledgerStore = useLedgerStore()
    if (!ledgerStore.currentLedgerId) return
    await createChartApi({ ledgerId: ledgerStore.currentLedgerId, title, granularity, chartType, lines })
    await loadCustomCharts()
  }

  async function updateChart(chartId: string, title: string, granularity: 'year' | 'month', chartType: string, lines: ChartLine[], sortOrder: number) {
    await updateChartApi({ chartId, title, granularity, chartType, lines, sortOrder })
    await loadCustomCharts()

    if (selectedChart.value && selectedChartId.value === chartId) {
      selectedChart.value.title = title
      selectedChart.value.granularity = granularity
      selectedChart.value.lines = lines

      const result = await fetchRawData()
      const data = buildLineChartData(
        lines.map(line => ({
          label: line.label,
          type: line.transactionType,
          items: result.items.filter((item: any) => {
            if (!line.conditions || line.conditions.length === 0) return true
            return line.conditions.some((c: any) => {
              if (c.transactionType && item.transactionType !== c.transactionType) return false
              if (c.category && item.category !== c.category) return false
              return true
            })
          }),
        })),
        granularity
      )
      selectedChart.value.data = data
      setCache(`${chartId}`, { ...selectedChart.value, data })
    }
  }

  function invalidateCache() {
    chartDataCache.value = new Map()
    cachedLedgerId = null
    cachedTimeKey = null
  }

  return {
    selectedChart, selectedIsPreset, selectedChartId, customCharts,
    chartDataCache,
    isCacheValid, makeTimeKey, getCachedChart, setCache,
    loadCustomCharts, fetchRawData, selectChart,
    createChart, updateChart, invalidateCache,
  }
})
