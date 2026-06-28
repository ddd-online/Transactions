<template>
  <div class="template-setting">
    <BilladmPageHeader title="消费模板" />

    <div v-if="templates.length === 0 && !loading" class="template-empty">
      <a-empty description="暂无模板" />
    </div>

    <div v-else ref="tableWrapperRef" class="template-table-wrapper">
      <a-table
        :columns="columns"
        :data-source="templates"
        :loading="loading"
        :pagination="false"
        row-key="template_id"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'drag'">
            <span class="drag-handle" title="拖动排序">
              <svg viewBox="0 0 16 16" fill="currentColor">
                <circle cx="5" cy="3" r="1.5" />
                <circle cx="11" cy="3" r="1.5" />
                <circle cx="5" cy="8" r="1.5" />
                <circle cx="11" cy="8" r="1.5" />
                <circle cx="5" cy="13" r="1.5" />
                <circle cx="11" cy="13" r="1.5" />
              </svg>
            </span>
          </template>
          <template v-else-if="column.key === 'type'">
            <a-tag :color="getTypeColor(record.transaction_type)">
              {{ getTypeLabel(record.transaction_type) }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'tags'">
            <template v-if="record.tags && record.tags.length > 0">
              <a-tag v-for="tag in record.tags" :key="tag">{{ tag }}</a-tag>
            </template>
            <span v-else>-</span>
          </template>
          <template v-else-if="column.key === 'flags'">
            <template v-if="record.flags">
              <a-tag color="orange">离群值</a-tag>
            </template>
            <span v-else>-</span>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-popconfirm
              :title="`确认删除模板「${record.template_name}」？`"
              @confirm="handleDelete(record.template_id)"
              ok-text="确认"
              cancel-text="取消"
            >
              <button class="action-icon delete" title="删除">
                <svg class="delete-icon" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M12 4v8a2 2 0 01-2 2H6a2 2 0 01-2-2V4"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            </a-popconfirm>
          </template>
        </template>
      </a-table>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { message } from 'ant-design-vue'
import type { TransactionTemplate } from '@/types/billadm'
import { getTemplatesByLedgerId, removeTemplate, reorderTemplate } from '@/backend/functions.ts'
import { useLedgerStore } from '@/stores/ledgerStore.ts'
import { TransactionTypeToLabel, TransactionTypeToColor } from '@/backend/constant.ts'
import Sortable from 'sortablejs'

const ledgerStore = useLedgerStore()
const templates = ref<TransactionTemplate[]>([])
const loading = ref(false)

const columns = [
  {
    title: '',
    key: 'drag',
    width: 36,
  },
  {
    title: '模板名称',
    dataIndex: 'template_name',
    key: 'name',
  },
  {
    title: '交易类型',
    dataIndex: 'transaction_type',
    key: 'type',
    width: 100,
  },
  {
    title: '分类',
    dataIndex: 'category',
    key: 'category',
  },
  {
    title: '标签',
    key: 'tags',
  },
  {
    title: '标记',
    dataIndex: 'flags',
    key: 'flags',
  },
  {
    title: '描述',
    dataIndex: 'description',
    key: 'description',
    ellipsis: true,
  },
  {
    title: '操作',
    key: 'action',
    width: 60,
  },
]

// ── 拖拽排序 ──
const tableWrapperRef = ref<HTMLElement>()
let sortable: Sortable | null = null

const initSortable = async () => {
  await nextTick()
  if (!tableWrapperRef.value) return
  const tbody = tableWrapperRef.value.querySelector('tbody')
  if (!tbody) return

  if (sortable) {
    sortable.destroy()
    sortable = null
  }

  if (templates.value.length <= 1) return

  sortable = Sortable.create(tbody, {
    animation: 200,
    handle: '.drag-handle',
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    dragClass: 'sortable-drag',
    onEnd(evt) {
      if (evt.oldIndex !== undefined && evt.newIndex !== undefined && evt.oldIndex !== evt.newIndex) {
        handleReorder(evt.oldIndex, evt.newIndex)
      }
    },
  })
}

const destroySortable = () => {
  if (sortable) {
    sortable.destroy()
    sortable = null
  }
}

const handleReorder = async (oldIndex: number, newIndex: number) => {
  const list = [...templates.value]
  const [moved] = list.splice(oldIndex, 1)
  list.splice(newIndex, 0, moved!)
  // 全量重排：按新顺序重新分配 sortOrder
  for (let i = 0; i < list.length; i++) {
    const item = list[i]!
    if (item.sort_order !== i) {
      item.sort_order = i
      try {
        await reorderTemplate(item.template_id!, ledgerStore.currentLedgerId!, i)
      } catch { /* error handled in reorderTemplate */ }
    }
  }
  templates.value = list
}

const loadTemplates = async () => {
  if (!ledgerStore.currentLedgerId) {
    templates.value = []
    return
  }
  loading.value = true
  try {
    templates.value = await getTemplatesByLedgerId(ledgerStore.currentLedgerId)
    initSortable()
  } finally {
    loading.value = false
  }
}

const handleDelete = async (templateId: string) => {
  await removeTemplate(templateId)
  message.success('删除模板成功')
  await loadTemplates()
}

const getTypeLabel = (type: string) => {
  return TransactionTypeToLabel.get(type) || type
}

const getTypeColor = (type: string) => {
  return TransactionTypeToColor.get(type) || '#999'
}

onMounted(() => {
  loadTemplates()
})

onUnmounted(() => {
  destroySortable()
})

watch(() => ledgerStore.currentLedgerId, () => {
  destroySortable()
  loadTemplates()
})
</script>

<style scoped>
.template-setting {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.template-table-wrapper {
  flex: 1;
  overflow: auto;
}

/* Drag Handle — 始终可见 */
.drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  color: var(--billadm-color-text-disabled);
  cursor: grab;
  transition: color var(--billadm-transition-fast);
  vertical-align: middle;
}

.drag-handle svg {
  width: 16px;
  height: 16px;
}

.drag-handle:hover {
  color: var(--billadm-color-primary);
}

.drag-handle:active {
  cursor: grabbing;
}

/* SortableJS 拖拽状态 */
.sortable-ghost {
  opacity: 0.3;
}

.sortable-chosen {
  background-color: var(--billadm-color-active-bg);
}

.sortable-drag {
  opacity: 0;
}

.action-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  color: var(--billadm-color-text-secondary);
  background: transparent;
  border: none;
  border-radius: var(--billadm-radius-sm);
  cursor: pointer;
  transition: all var(--billadm-transition-fast);
}

.action-icon .delete-icon {
  width: 16px;
  height: 16px;
}

.action-icon.delete:hover:not(:disabled) {
  color: var(--billadm-color-negative);
  background-color: rgba(199, 62, 58, 0.08);
}

.action-icon:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* 表头列间分割线 */
:deep(.ant-table-thead > tr > th) {
  border-right: 1px solid var(--billadm-color-divider);
}

:deep(.ant-table-thead > tr > th:last-child) {
  border-right: none;
}

.template-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
