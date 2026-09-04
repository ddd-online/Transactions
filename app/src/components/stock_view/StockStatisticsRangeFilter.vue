<template>
  <div class="stats-range-filter">
    <a-segmented
      :value="mode"
      :options="modeOptions"
      @change="emit('mode-change', $event)"
      aria-label="选择统计区间"
    />
    <span v-if="mode !== 'all'" class="stats-range-divider" aria-hidden="true" />
    <div v-if="mode === 'range'" class="stats-range-controls">
      <a-range-picker
        :value="monthRange"
        picker="month"
        :allow-clear="false"
        :presets="monthPresets"
        class="stats-range-month-picker"
        format="YYYY-MM"
        @change="emit('range-change', $event)"
      />
    </div>
    <div v-else-if="mode === 'recent'" class="stats-range-controls">
      <a-select
        :value="recent"
        class="stats-range-recent-select"
        @change="emit('recent-change', $event)"
        aria-label="选择最近笔数"
      >
        <a-select-option :value="10">最近 10 笔</a-select-option>
        <a-select-option :value="50">最近 50 笔</a-select-option>
        <a-select-option :value="100">最近 100 笔</a-select-option>
        <a-select-option :value="0">全部</a-select-option>
      </a-select>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'

type FilterMode = 'all' | 'range' | 'recent'

defineProps<{
  mode: FilterMode
  monthRange?: [Dayjs, Dayjs]
  recent?: number
}>()

const emit = defineEmits<{
  (e: 'mode-change', value: string | number): void
  (e: 'range-change', value: [Dayjs, Dayjs] | [string, string] | null): void
  (e: 'recent-change', value: unknown): void
}>()

const monthPresets = computed(() => {
  const thisYear = dayjs().year()
  const preset = (year: number): [Dayjs, Dayjs] => [
    dayjs(`${year}-01-01`),
    dayjs(`${year}-12-31`),
  ]
  return [
    { label: '本年', value: preset(thisYear) },
    { label: '去年', value: preset(thisYear - 1) },
  ]
})

const modeOptions = [
  { label: '全部', value: 'all' },
  { label: '按时间', value: 'range' },
  { label: '最近N笔', value: 'recent' },
]
</script>

<style scoped lang="scss">
.stats-range-filter {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--transactions-space-sm);
}

.stats-range-filter :deep(.ant-segmented) {
  padding: var(--transactions-space-2xs);
  background-color: var(--transactions-color-minor-background);
  border-radius: var(--transactions-radius-md);
}

.stats-range-filter :deep(.ant-picker) {
  height: 32px;
}

.stats-range-controls {
  display: flex;
  align-items: center;
  gap: var(--transactions-space-sm);
  min-width: 0;
}

.stats-range-month-picker {
  width: 248px;
}

.stats-range-recent-select {
  width: 136px;
}

.stats-range-divider {
  width: 1px;
  height: 18px;
  background-color: var(--transactions-color-divider);
  flex-shrink: 0;
}
</style>
