<template>
  <a-modal v-model:open="open" title="排序" :footer="null" centered width="500px">
    <div class="sort-list">
      <div v-for="(item, index) in items" :key="index" class="sort-item">
        <span class="sort-priority">{{ index + 1 }}</span>
        <a-select v-model:value="item.field" :options="getAvailableFields(index)" placeholder="选择字段" style="width: 120px" />
        <a-select v-model:value="item.order" style="width: 100px">
          <a-select-option value="asc">升序</a-select-option>
          <a-select-option value="desc">降序</a-select-option>
        </a-select>
        <a-button type="text" danger :disabled="items.length <= 1" @click="removeItem(index)">
          <DeleteOutlined />
        </a-button>
      </div>
      <a-button type="link" :disabled="items.length >= 4" @click="addItem">
        <PlusOutlined /> 添加排序条件
      </a-button>
    </div>
    <div class="sort-actions">
      <a-button @click="reset">重置</a-button>
      <a-button type="primary" @click="apply">应用</a-button>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons-vue'

export interface SortItem {
  field: string
  order: 'asc' | 'desc'
}

const sortFieldOptions = [
  { value: 'transactionAt', label: '时间' },
  { value: 'price', label: '金额' },
  { value: 'category', label: '分类' },
  { value: 'transactionType', label: '类型' },
]

const open = defineModel<boolean>({ required: true })

const emit = defineEmits<{
  (e: 'apply', items: SortItem[]): void
}>()

const items = ref<SortItem[]>([{ field: 'transactionAt', order: 'desc' }])

const getAvailableFields = (currentIndex: number) => {
  const usedFields = items.value.slice(0, currentIndex).map(item => item.field)
  return sortFieldOptions.filter(opt => !usedFields.includes(opt.value))
}

const addItem = () => {
  if (items.value.length >= 4) return
  const usedFields = items.value.map(item => item.field)
  const availableField = sortFieldOptions.find(opt => !usedFields.includes(opt.value))
  if (availableField) {
    items.value.push({ field: availableField.value, order: 'desc' })
  }
}

const removeItem = (index: number) => {
  if (items.value.length <= 1) return
  items.value.splice(index, 1)
}

const reset = () => {
  items.value = [{ field: 'transactionAt', order: 'desc' }]
}

const apply = () => {
  open.value = false
  emit('apply', [...items.value])
}

defineExpose({ setItems: (v: SortItem[]) => { items.value = [...v] } })
</script>

<style scoped>
.sort-list {
  display: flex;
  flex-direction: column;
  gap: var(--billadm-space-md);
  margin-bottom: var(--billadm-space-lg);
}
.sort-list :deep(.ant-btn-link) {
  color: var(--billadm-color-primary);
}
.sort-item {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-sm);
}
.sort-priority {
  width: 24px;
  height: 24px;
  border-radius: var(--billadm-radius-full);
  background-color: var(--billadm-color-primary);
  color: var(--billadm-color-text-inverse);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--billadm-size-text-caption);
  font-weight: 600;
  flex-shrink: 0;
}
.sort-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--billadm-space-sm);
}
</style>
