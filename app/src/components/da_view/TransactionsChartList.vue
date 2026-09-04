<template>
  <div class="chart-list">
    <!-- 新增图表按钮 -->
    <div class="chart-list-add">
      <a-button type="primary" block @click="showCreateModal = true">
        <template #icon>
          <PlusOutlined />
        </template>
        新增图表
      </a-button>
    </div>

    <!-- 图表列表 -->
    <div class="chart-list-section">
      <div v-for="chart in allCharts" :key="chart.chartId" class="chart-list-item"
        :class="{ active: selectedId === chart.chartId }" tabindex="0" role="option"
        :aria-selected="selectedId === chart.chartId" @click="selectChart(chart)" @keydown.enter="selectChart(chart)"
        @keydown.space.prevent="selectChart(chart)">
        <span class="chart-list-item-title">{{ chart.title }}</span>
        <span class="chart-list-dots" aria-hidden="true">
          <span
            v-for="(color, i) in lineColors(chart)"
            :key="`${chart.chartId}-${i}`"
            class="chart-list-dot"
            :style="{ backgroundColor: color }"
          />
          <span v-if="chart.lines.length === 0" class="chart-list-dot chart-list-dot--empty" />
        </span>
        <div class="chart-list-item-actions" @click.stop>
          <a-popconfirm
            :title="`删除图表「${chart.title}」？此操作不可恢复。`"
            ok-text="删除"
            cancel-text="取消"
            @confirm="handleDelete(chart)"
          >
            <a-button type="text" size="small" danger aria-label="删除图表">
              <template #icon>
                <DeleteOutlined />
              </template>
            </a-button>
          </a-popconfirm>
        </div>
      </div>
    </div>

    <!-- 新增图表弹窗 -->
    <a-modal v-model:open="showCreateModal" title="新增图表" @ok="handleCreate" :confirm-loading="createLoading">
      <a-form :model="createForm" layout="vertical">
        <a-form-item label="图表名称" name="title">
          <a-input v-model:value="createForm.title" placeholder="请输入图表名称" />
        </a-form-item>
        <a-form-item label="时间粒度" name="granularity">
          <a-select v-model:value="createForm.granularity" placeholder="请选择时间粒度">
            <a-select-option value="year">年度</a-select-option>
            <a-select-option value="month">月度</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import type { ChartDto } from '@/backend/api/chart'
import { deleteChart as deleteChartApi } from '@/backend/api/chart'
import { useTransactionTypeColor } from '@/utils/themeColors'

interface Props {
  allCharts: ChartDto[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'select', chart: ChartDto): void
  (e: 'create', request: { title: string; granularity: 'year' | 'month' }): void
  (e: 'delete', chartId: string): void
  (e: 'refresh'): void
}>()

const selectedId = ref<string>('')
const showCreateModal = ref(false)
const createLoading = ref(false)

const getTypeColor = useTransactionTypeColor()

// 每个图表的曲线类型颜色（去重，最多 3 个），用于列表项的色彩区分
const lineColors = (chart: ChartDto): string[] => {
  const seen = new Set<string>()
  const colors: string[] = []
  for (const line of chart.lines) {
    const color = getTypeColor(line.transactionType)
    if (color && !seen.has(color)) {
      seen.add(color)
      colors.push(color)
      if (colors.length === 3) break
    }
  }
  return colors
}
const createForm = ref<{ title: string; granularity: 'year' | 'month' }>({
  title: '',
  granularity: 'year'
})

const selectChart = (chart: ChartDto) => {
  selectedId.value = chart.chartId
  emit('select', chart)
}

const handleCreate = async () => {
  if (!createForm.value.title.trim()) {
    message.error('请输入图表名称')
    return
  }
  createLoading.value = true
  try {
    emit('create', { title: createForm.value.title, granularity: createForm.value.granularity })
    showCreateModal.value = false
    createForm.value = { title: '', granularity: 'year' }
  } finally {
    createLoading.value = false
  }
}

const handleDelete = async (chart: ChartDto) => {
  try {
    await deleteChartApi(chart.chartId)
    message.success('图表已删除')
    emit('delete', chart.chartId)
  } catch (error) {
    message.error('删除图表失败')
  }
}
</script>

<style scoped>
.chart-list {
  display: flex;
  flex-direction: column;
  padding: var(--transactions-space-md);
}

.chart-list-add {
  padding: 0 var(--transactions-space-xs);
  margin-bottom: var(--transactions-space-md);
}

.chart-list-section {
  margin-top: 0;
}

.chart-list-item {
  display: flex;
  align-items: center;
  gap: var(--transactions-space-sm);
  padding: var(--transactions-space-sm);
  cursor: pointer;
  transition: all var(--transactions-transition-fast);
  color: var(--transactions-color-text-secondary);
  border-radius: var(--transactions-radius-md);
}

.chart-list-dots {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
  margin-left: auto;
}

.chart-list-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--transactions-radius-full);
  flex-shrink: 0;
}

.chart-list-dot--empty {
  background: transparent;
  border: 1px dashed var(--transactions-color-text-disabled);
}

.chart-list-item:hover {
  background-color: var(--transactions-color-hover-bg);
  color: var(--transactions-color-text-major);
}

.chart-list-item:focus-visible {
  outline: 2px solid var(--transactions-color-primary);
  outline-offset: -2px;
}

.chart-list-item.active {
  background-color: var(--transactions-color-hover-bg);
  color: var(--transactions-color-primary);
  font-weight: 500;
}

.chart-list-item-title {
  flex: 1;
  font-family: var(--transactions-font-body);
  font-size: var(--transactions-size-text-body-sm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chart-list-item-actions {
  display: none;
}

.chart-list-item:hover .chart-list-item-actions,
.chart-list-item.active .chart-list-item-actions {
  display: flex;
}
</style>
