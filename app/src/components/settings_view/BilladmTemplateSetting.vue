<template>
  <div class="template-setting">
    <BilladmPageHeader title="消费模板" />

    <div v-if="templates.length === 0 && !loading" class="template-empty">
      <a-empty description="暂无模板" />
    </div>

    <a-table v-else :columns="columns" :data-source="templates" :loading="loading" :pagination="false" row-key="template_id">
      <template #bodyCell="{ column, record, index }">
        <template v-if="column.key === 'type'">
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
          <span class="action-buttons">
            <button class="action-icon" @click="moveTemplate(index, -1)" :disabled="index === 0" title="上移">
              <svg class="arrow-icon" viewBox="0 0 16 16" fill="none">
                <path d="M8 2L8 14M8 2L4 6M8 2L12 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
                  stroke-linejoin="round" />
              </svg>
            </button>
            <button class="action-icon" @click="moveTemplate(index, 1)" :disabled="index === templates.length - 1" title="下移">
              <svg class="arrow-icon" viewBox="0 0 16 16" fill="none">
                <path d="M8 14L8 2M8 14L4 10M8 14L12 10" stroke="currentColor" stroke-width="1.5"
                  stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
            <a-popconfirm :title="`确认删除模板「${record.name}」？`" @confirm="handleDelete(record.template_id)" ok-text="确认" cancel-text="取消">
              <button class="action-icon delete" title="删除">
                <svg class="delete-icon" viewBox="0 0 16 16" fill="none">
                  <path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M12 4v8a2 2 0 01-2 2H6a2 2 0 01-2-2V4"
                    stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
            </a-popconfirm>
          </span>
        </template>
      </template>
    </a-table>
  </div>
</template>

<script lang="ts" setup>
import { ref, watch, onMounted } from 'vue';
import { message } from 'ant-design-vue';
import type { TransactionTemplate } from '@/types/billadm';
import { getTemplatesByLedgerId, removeTemplate, reorderTemplate } from '@/backend/functions.ts';
import { useLedgerStore } from '@/stores/ledgerStore.ts';
import { TransactionTypeToLabel, TransactionTypeToColor } from '@/backend/constant.ts';

const ledgerStore = useLedgerStore();
const templates = ref<TransactionTemplate[]>([]);
const loading = ref(false);

const columns = [
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
    width: 120,
  },
];

const loadTemplates = async () => {
  if (!ledgerStore.currentLedgerId) {
    templates.value = [];
    return;
  }
  loading.value = true;
  try {
    templates.value = await getTemplatesByLedgerId(ledgerStore.currentLedgerId);
  } finally {
    loading.value = false;
  }
};

const handleDelete = async (templateId: string) => {
  await removeTemplate(templateId);
  message.success('删除模板成功');
  await loadTemplates();
};

const moveTemplate = async (index: number, direction: number) => {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= templates.value.length) return;

  const template = templates.value[index];
  const targetTemplate = templates.value[newIndex];
  if (!template || !targetTemplate) return;

  const templateSortOrder = template.sort_order || 0;
  const targetSortOrder = targetTemplate.sort_order || 0;

  try {
    await reorderTemplate(template.template_id!, ledgerStore.currentLedgerId!, targetSortOrder);
    await reorderTemplate(targetTemplate.template_id!, ledgerStore.currentLedgerId!, templateSortOrder);
    await loadTemplates();
  } catch {
    // error already shown in reorderTemplate
  }
};

const getTypeLabel = (type: string) => {
  return TransactionTypeToLabel.get(type) || type;
};

const getTypeColor = (type: string) => {
  return TransactionTypeToColor.get(type) || '#999';
};

onMounted(() => {
  loadTemplates();
});

// 切换账本时刷新模板
watch(() => ledgerStore.currentLedgerId, () => {
  loadTemplates();
});
</script>

<style scoped>
.template-setting {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 2px;
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

.action-icon .arrow-icon,
.action-icon .delete-icon {
  width: 16px;
  height: 16px;
}

.action-icon:hover:not(:disabled) {
  color: var(--billadm-color-text-major);
  background-color: var(--billadm-color-hover-bg);
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
