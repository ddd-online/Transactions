<template>
  <div class="chart-view">
    <!-- 图表头部 -->
    <div class="chart-view-header">
      <h2 class="chart-view-title">{{ title }}</h2>
      <div class="header-controls">
        <a-select
          v-if="!isPreset"
          v-model:value="editGranularity"
          class="granularity-select"
          @change="handleGranularityChange"
        >
          <a-select-option value="year">年度</a-select-option>
          <a-select-option value="month">月度</a-select-option>
        </a-select>
        <a-tag v-else :color="granularity === 'year' ? 'blue' : 'green'">
          {{ granularity === 'year' ? '年度' : '月度' }}
        </a-tag>
      </div>
    </div>

    <!-- 中间主体：图表 + 统计面板 -->
    <div class="chart-body">
      <div class="chart-view-content">
        <Transition name="chart-fade" mode="out-in">
          <BilladmChart v-if="data.length > 0" key="chart" class="chart-canvas" :data="data" x-field="time" y-field="amount" :title="title" :lines="lines" />
          <a-empty v-else key="empty" class="chart-canvas" description="暂无数据" />
        </Transition>
      </div>
      <div v-if="lineSums.length > 0" class="chart-view-stats">
        <div v-for="item in lineSums" :key="item.label" class="stat-row">
          <span class="stat-dot" :style="{ backgroundColor: getTypeColor(item.type) }" />
          <div class="stat-text">
            <span class="stat-label">{{ item.label }}</span>
            <span class="stat-value">{{ formatAmount(item.sum) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 曲线详情 -->
    <BilladmChartLines
      :lines="lines"
      :is-preset="isPreset"
      :chart-id="chartId"
      @update="(chartId, lines) => emit('update', chartId, { lines })"
      @add-line="(chartId, line) => emit('addLine', chartId, line)"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import BilladmChart from '@/components/da_view/BilladmChart.vue'
import BilladmChartLines from '@/components/da_view/BilladmChartLines.vue'
import type { TimeSeriesData, ChartLine } from '@/backend/chart'
import { TransactionTypeToColor } from '@/backend/constant'

interface Props {
  title: string
  data: TimeSeriesData[]
  lines: ChartLine[]
  granularity?: 'year' | 'month'
  isPreset?: boolean
  chartId?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  granularity: 'year',
  isPreset: false,
  chartId: null
})

const emit = defineEmits<{
  (e: 'update', chartId: string, request: { title?: string; granularity?: 'year' | 'month'; lines?: ChartLine[] }): void
  (e: 'addLine', chartId: string, line: ChartLine): void
}>()

const editGranularity = ref(props.granularity)
watch(() => props.granularity, (v) => { editGranularity.value = v })

const getTypeColor = (type: string) => TransactionTypeToColor.get(type) || 'var(--billadm-color-text-secondary)'

const handleGranularityChange = () => {
  if (!props.chartId) return
  emit('update', props.chartId, {
    title: props.title,
    granularity: editGranularity.value,
  })
}

const lineSums = computed(() => {
  const sums = new Map<string, { label: string; type: string; sum: number }>()
  props.data.forEach((item) => {
    const existing = sums.get(item.label)
    if (existing) {
      existing.sum += item.amount
    } else {
      sums.set(item.label, { label: item.label, type: item.type, sum: item.amount })
    }
  })
  return Array.from(sums.values())
})

const formatAmount = (amount: number) => {
  return amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
</script>

<style scoped>
.chart-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.chart-view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--billadm-space-lg) var(--billadm-space-xl);
  flex-shrink: 0;
  background-color: var(--billadm-color-major-background);
  border-bottom: 1px solid var(--billadm-color-divider);
}

.chart-view-title {
  margin: 0;
  font-family: var(--billadm-font-display);
  font-size: var(--billadm-size-text-title);
  font-weight: 600;
  color: var(--billadm-color-text-major);
}

.header-controls {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-sm);
}

.granularity-select {
  width: 100px;
}

/* ========== 中间主体：双栏布局 ========== */
.chart-body {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
  border-radius: 0 0 var(--billadm-radius-lg) var(--billadm-radius-lg);
}

.chart-view-content {
  flex: 1;
  min-width: 0;
  padding: var(--billadm-space-xl);
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--billadm-color-major-background);
}

.chart-canvas {
  width: 100%;
  aspect-ratio: 16 / 9;
}

/* 右侧：统计面板 */
.chart-view-stats {
  flex: 0 0 180px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--billadm-space-sm);
  padding: var(--billadm-space-lg);
  background-color: var(--billadm-color-major-background);
  border-left: 1px solid var(--billadm-color-divider);
  overflow-y: auto;
}

.stat-row {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-sm);
  padding: var(--billadm-space-sm) var(--billadm-space-md);
  border-radius: var(--billadm-radius-md);
  transition: background-color var(--billadm-transition-fast);
}

.stat-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--billadm-radius-full);
  flex-shrink: 0;
}

.stat-row:hover {
  background-color: var(--billadm-color-minor-background);
}

.stat-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.stat-label {
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-secondary);
  line-height: 1.3;
}

.stat-value {
  font-size: var(--billadm-size-text-body);
  font-weight: 600;
  color: var(--billadm-color-text-major);
  font-variant-numeric: tabular-nums;
  line-height: 1.3;
}

/* 图表过渡 */
.chart-fade-enter-active,
.chart-fade-leave-active {
  transition: opacity var(--billadm-transition-fast);
}
.chart-fade-enter-from,
.chart-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .chart-fade-enter-active,
  .chart-fade-leave-active {
    transition: none;
  }
}

</style>
