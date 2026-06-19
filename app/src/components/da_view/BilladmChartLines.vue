<template>
  <div class="chart-lines">
    <!-- 添加曲线弹窗 -->
    <a-modal v-model:open="showAddLineModal" title="添加曲线" @ok="handleAddLine" width="500px">
      <a-form :model="newLineForm" layout="vertical">
        <a-form-item label="曲线名称" name="label">
          <a-input v-model:value="newLineForm.label" placeholder="请输入曲线名称" />
        </a-form-item>
        <a-form-item label="交易类型" name="transactionType">
          <a-select v-model:value="newLineForm.transactionType" placeholder="请选择交易类型" @change="onTransactionTypeChange">
            <a-select-option value="income">收入</a-select-option>
            <a-select-option value="expense">支出</a-select-option>
            <a-select-option value="transfer">转账</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="分类" name="category">
          <a-select v-model:value="newLineForm.category" placeholder="请选择分类" :options="categoryOptions" allow-clear
            @change="onCategoryChange" />
        </a-form-item>
        <a-form-item label="标签" name="tags">
          <a-select v-model:value="newLineForm.tags" mode="multiple" placeholder="请选择标签" :options="tagOptions"
            allow-clear />
        </a-form-item>
        <a-form-item label="标签匹配" name="tagPolicy">
          <a-select v-model:value="newLineForm.tagPolicy">
            <a-select-option value="any">任意</a-select-option>
            <a-select-option value="all">全部</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="描述包含" name="description">
          <a-input v-model:value="newLineForm.description" placeholder="输入关键词" />
        </a-form-item>
        <a-form-item label="包含离群值" name="includeOutlier">
          <a-switch v-model:checked="newLineForm.includeOutlier" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 曲线详情 -->
    <div class="chart-lines-section">
      <div class="chart-lines-section-header">
        <span class="chart-lines-section-title">曲线详情</span>
        <div v-if="!isPreset" class="chart-lines-section-actions">
          <a-button type="primary" size="small" @click="showAddLineModal = true">
            <template #icon><PlusOutlined /></template>
            添加曲线
          </a-button>
          <a-button size="small" @click="handleSave">保存修改</a-button>
        </div>
      </div>
      <a-table :data-source="localLines" :pagination="false" size="small">
        <a-table-column title="曲线名称" data-index="label" />
        <a-table-column title="交易类型" data-index="transactionType">
          <template #default="{ text }">
            <a-tag :color="getTypeColor(text)">{{ getTypeLabel(text) }}</a-tag>
          </template>
        </a-table-column>
        <a-table-column title="包含离群值">
          <template #default="{ record: r }">
            <a-tag :color="r.includeOutlier ? 'orange' : 'green'">
              {{ r.includeOutlier ? '是' : '否' }}
            </a-tag>
          </template>
        </a-table-column>
        <a-table-column title="筛选条件">
          <template #default="{ record }">
            <template v-if="record.conditions && record.conditions.length > 0">
              <div class="conditions-tags">
                <a-tag v-for="cond in record.conditions" :key="cond.description" color="purple">
                  {{ cond.category }}
                  <template v-if="cond.tags && cond.tags.length > 0"> / {{ cond.tags.join(', ') }}</template>
                  <template v-if="cond.description"> / {{ cond.description }}</template>
                </a-tag>
              </div>
            </template>
            <span v-else class="text-disabled">无</span>
          </template>
        </a-table-column>
        <a-table-column v-if="!isPreset" title="操作" width="60">
          <template #default="{ index }">
            <a-button type="text" size="small" danger @click="handleDeleteLine(index)">
              <template #icon><DeleteOutlined /></template>
            </a-button>
          </template>
        </a-table-column>
      </a-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import type { ChartLine } from '@/backend/chart'
import { TransactionTypeToColor, TransactionTypeToLabel } from '@/backend/constant'
import { getCategoryByType, getTagsByCategory } from '@/backend/functions'
import { useLedgerStore } from '@/stores/ledgerStore'

const ledgerStore = useLedgerStore()

interface Props {
  lines: ChartLine[]
  isPreset?: boolean
  chartId?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  isPreset: false,
  chartId: null
})

const emit = defineEmits<{
  (e: 'update', chartId: string, lines: ChartLine[]): void
  (e: 'addLine', chartId: string, line: ChartLine): void
}>()

const localLines = ref<ChartLine[]>([...props.lines])
const showAddLineModal = ref(false)
const categoryOptions = ref<{ value: string }[]>([])
const tagOptions = ref<{ value: string }[]>([])

interface NewLineForm {
  label: string
  transactionType: string
  category: string | undefined
  tags: string[]
  tagPolicy: 'any' | 'all'
  description: string
  includeOutlier: boolean
}

const newLineForm = ref<NewLineForm>({
  label: '',
  transactionType: 'income',
  category: undefined,
  tags: [],
  tagPolicy: 'any',
  description: '',
  includeOutlier: true,
})

watch(() => props.lines, (v) => { localLines.value = [...v] }, { deep: true })

const getTypeColor = (type: string) => TransactionTypeToColor.get(type) || '#999'
const getTypeLabel = (type: string) => TransactionTypeToLabel.get(type) || type

const handleSave = () => {
  if (!props.chartId) return
  emit('update', props.chartId, localLines.value)
}

const handleDeleteLine = (index: number) => {
  localLines.value.splice(index, 1)
}

const onTransactionTypeChange = async () => {
  newLineForm.value.category = undefined
  newLineForm.value.tags = []
  tagOptions.value = []
  if (!newLineForm.value.transactionType) {
    categoryOptions.value = []
    return
  }
  const categoryList = await getCategoryByType(newLineForm.value.transactionType, ledgerStore.currentLedgerId!)
  categoryOptions.value = categoryList.map((c) => ({ value: c.name }))
}

const onCategoryChange = async () => {
  newLineForm.value.tags = []
  if (!newLineForm.value.category) {
    tagOptions.value = []
    return
  }
  const categoryTransactionType = `${newLineForm.value.category}:${newLineForm.value.transactionType}`
  const tagList = await getTagsByCategory(categoryTransactionType, ledgerStore.currentLedgerId!)
  tagOptions.value = tagList.map((t) => ({ value: t.name }))
}

const handleAddLine = () => {
  if (!newLineForm.value.label.trim()) {
    message.error('请输入曲线名称')
    return
  }
  if (!props.chartId) return

  const conditions: ChartLine['conditions'] = []
  if (newLineForm.value.category || newLineForm.value.tags.length > 0 || newLineForm.value.description) {
    conditions.push({
      transactionType: newLineForm.value.transactionType,
      category: newLineForm.value.category || '',
      tags: [...newLineForm.value.tags],
      tagPolicy: newLineForm.value.tagPolicy,
      tagNot: false,
      description: newLineForm.value.description,
    })
  }

  emit('addLine', props.chartId, {
    label: newLineForm.value.label,
    transactionType: newLineForm.value.transactionType,
    includeOutlier: newLineForm.value.includeOutlier,
    conditions,
  })
  showAddLineModal.value = false
  resetNewLineForm()
}

const resetNewLineForm = () => {
  newLineForm.value = {
    label: '',
    transactionType: 'income',
    category: undefined,
    tags: [],
    tagPolicy: 'any',
    description: '',
    includeOutlier: true,
  }
  categoryOptions.value = []
  tagOptions.value = []
}
</script>

<style scoped>
.chart-lines-section {
  background-color: var(--billadm-color-major-background);
  overflow: hidden;
}

.chart-lines-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--billadm-space-lg) var(--billadm-space-xl);
  border-bottom: 1px solid var(--billadm-color-divider);
  background-color: var(--billadm-color-major-warm);
}

.chart-lines-section-title {
  font-family: var(--billadm-font-display);
  font-size: var(--billadm-size-text-section);
  font-weight: 600;
  color: var(--billadm-color-text-major);
  margin: 0;
}

.chart-lines-section-actions {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-sm);
}

.conditions-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--billadm-space-xs);
}

.text-disabled {
  color: var(--billadm-color-text-disabled);
}
</style>
