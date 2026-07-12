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
      <div
        v-for="chart in allCharts"
        :key="chart.chartId"
        class="chart-list-item"
        :class="{ active: selectedId === chart.chartId }"
        tabindex="0"
        role="option"
        :aria-selected="selectedId === chart.chartId"
        @click="selectChart(chart)"
        @keydown.enter="selectChart(chart)"
        @keydown.space.prevent="selectChart(chart)"
      >
        <span class="chart-list-item-title">{{ chart.title }}</span>
        <div class="chart-list-item-actions" @click.stop>
          <a-button type="text" size="small" danger @click="handleDelete(chart)">
            <template #icon>
              <DeleteOutlined />
            </template>
          </a-button>
        </div>
      </div>
    </div>

    <!-- 新增图表弹窗 -->
    <a-modal
      v-model:open="showCreateModal"
      title="新增图表"
      @ok="handleCreate"
      :confirm-loading="createLoading"
    >
      <a-form :model="createForm" layout="vertical">
        <a-form-item label="图表名称" name="title">
          <a-input v-model:value="createForm.title" placeholder="请输入图表名称" />
        </a-form-item>
        <a-form-item label="时间粒度" name="granularity">
          <a-select v-model:value="createForm.granularity" size="small" placeholder="请选择时间粒度">
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
    message.success('删除成功')
    emit('delete', chart.chartId)
  } catch (error) {
    message.error('删除失败')
  }
}
</script>

<style scoped>
.chart-list {
  display: flex;
  flex-direction: column;
  padding: var(--billadm-space-md);
}

.chart-list-add {
  padding: 0 var(--billadm-space-xs);
  margin-bottom: var(--billadm-space-md);
}

.chart-list-section {
  margin-top: 0;
}

.chart-list-item {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-sm);
  padding: var(--billadm-space-sm);
  cursor: pointer;
  transition: all var(--billadm-transition-fast);
  color: var(--billadm-color-text-secondary);
  border-radius: var(--billadm-radius-md);
}

.chart-list-item:hover {
  background-color: var(--billadm-color-hover-bg);
  color: var(--billadm-color-text-major);
}

.chart-list-item:focus-visible {
  outline: 2px solid var(--billadm-color-primary);
  outline-offset: -2px;
}

.chart-list-item.active {
  background-color: var(--billadm-color-hover-bg);
  color: var(--billadm-color-primary);
  font-weight: 500;
}

.chart-list-item-title {
  flex: 1;
  font-family: var(--billadm-font-body);
  font-size: var(--billadm-size-text-body-sm);
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
