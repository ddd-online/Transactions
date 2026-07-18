<template>
  <a-table :columns="columns" :data-source="items" :pagination="false" :sticky="true" size="middle"
    class="transaction-table">
    <template #bodyCell="{ column, record }">
      <template v-if="column.dataIndex === 'transactionAt'">
        <span class="cell-date">
          {{ formatTimestamp(record.transactionAt, 'MM-DD') }}
        </span>
      </template>

      <template v-else-if="column.dataIndex === 'transactionType'">
        <span class="cell-type" :class="`type-${record.transactionType}`">
          {{ TransactionTypeToLabel.get(record.transactionType) || record.transactionType }}
        </span>
      </template>

      <template v-else-if="column.dataIndex === 'category'">
        <span class="cell-category">{{ record.category }}</span>
      </template>

      <template v-else-if="column.dataIndex === 'tags'">
        <div class="cell-tags">
          <a-tag v-for="tag in record.tags" :key="tag" class="tag-item">
            {{ tag }}
          </a-tag>
        </div>
      </template>

      <template v-else-if="column.dataIndex === 'flags'">
        <a-tag v-if="record.outlier" key="outlier" class="tag-outlier">
          离群值
        </a-tag>
      </template>

      <template v-else-if="column.dataIndex === 'description'">
        <span class="cell-description">{{ record.description || '-' }}</span>
      </template>

      <template v-else-if="column.dataIndex === 'price'">
        <span class="cell-price" :class="`price-${record.transactionType}`">
          <template v-if="record.transactionType === 'expense'">-</template>
          <template v-else-if="record.transactionType === 'income'">+</template>
          {{ centsToYuan(record.price) }}
        </span>
      </template>

      <template v-else-if="column.dataIndex === 'action'">
        <div class="cell-actions">
          <a-tooltip title="编辑">
            <a-button type="text" size="small" @click="handleEdit(record as TransactionRecord)">
              <EditOutlined />
            </a-button>
          </a-tooltip>
          <a-tooltip v-if="(record as TransactionRecord).keyEventDate"
            :title="'已关联至 ' + (record as TransactionRecord).keyEventDate">
            <a-button type="text" size="small" @click="handleLink(record as TransactionRecord)">
              <LinkOutlined />
            </a-button>
          </a-tooltip>
          <a-tooltip v-else title="关联">
            <a-button type="text" size="small" @click="handleLink(record as TransactionRecord)">
              <LinkOutlined />
            </a-button>
          </a-tooltip>
          <a-popover :open="syncPopoverTarget === (record as TransactionRecord).transactionId"
            @update:open="(val) => { if (syncingTransactionId === (record as TransactionRecord).transactionId) return; syncPopoverTarget = val ? (record as TransactionRecord).transactionId : null }"
            trigger="click" placement="bottomRight">
            <template #content>
              <div class="sync-popover-content">
                <div v-for="ledger in ledgers.filter(l => l.id !== currentLedgerId)" :key="ledger.id"
                  class="sync-ledger-item" @click="handleSyncTarget(record as TransactionRecord, ledger.id)">
                  {{ ledger.name }}
                </div>
                <div v-if="ledgers.filter(l => l.id !== currentLedgerId).length === 0" class="sync-empty">
                  无可用账本
                </div>
              </div>
            </template>
            <a-tooltip title="同步到其他账本">
              <a-button type="text" size="small"
                :disabled="syncingTransactionId === (record as TransactionRecord).transactionId">
                <SyncOutlined :spin="syncingTransactionId === (record as TransactionRecord).transactionId" />
              </a-button>
            </a-tooltip>
          </a-popover>
          <a-popconfirm title="确认删除此条记录？" ok-text="确认" @confirm="handleDelete(record as TransactionRecord)"
            :showCancel="false">
            <a-tooltip title="删除">
              <a-button type="text" size="small" danger>
                <DeleteOutlined />
              </a-button>
            </a-tooltip>
          </a-popconfirm>
        </div>
      </template>
    </template>
  </a-table>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { TransactionRecord, Ledger } from '@/types/billadm';
import { centsToYuan, formatTimestamp } from "@/backend/functions";
import { TransactionTypeToLabel } from "@/backend/constant";
import type { ColumnsType } from "ant-design-vue/es/table";
import { EditOutlined, DeleteOutlined, LinkOutlined, SyncOutlined } from "@ant-design/icons-vue";
import { createTrForLedger } from "@/backend/api/tr";
import { message } from "ant-design-vue";

const columns: ColumnsType = [
  {
    title: '日期',
    dataIndex: 'transactionAt',
    width: 100,
    align: 'center'
  },
  {
    title: '类型',
    dataIndex: 'transactionType',
    width: 100,
    align: 'center'
  },
  {
    title: '分类',
    dataIndex: 'category',
    width: 100,
    align: 'center'
  },
  {
    title: '标签',
    dataIndex: 'tags',
    width: 180
  },
  {
    title: '描述',
    dataIndex: 'description',
    ellipsis: true
  },
  {
    title: '金额',
    dataIndex: 'price',
    width: 110,
    align: 'right'
  },
  {
    title: '标记',
    dataIndex: 'flags',
    width: 100,
    align: 'center'
  },
  {
    title: '操作',
    dataIndex: 'action',
    width: 160,
    align: 'center'
  }
];

interface Props {
  items: TransactionRecord[];
  ledgers: Ledger[];
  currentLedgerId: string;
}

defineProps<Props>()

const emit = defineEmits<{
  (e: 'edit', record: TransactionRecord): void;
  (e: 'delete', record: TransactionRecord): void;
  (e: 'link', record: TransactionRecord): void;
}>();

const syncPopoverTarget = ref<string | null>(null);
const syncingTransactionId = ref<string | null>(null);

const handleEdit = (record: TransactionRecord) => {
  emit('edit', record);
};

const handleDelete = (record: TransactionRecord) => {
  emit('delete', record);
};

const handleLink = (record: TransactionRecord) => {
  emit('link', record);
};

const handleSyncTarget = async (record: TransactionRecord, targetLedgerId: string) => {
  syncingTransactionId.value = record.transactionId;
  try {
    const syncRecord = {
      ...record,
      ledgerId: targetLedgerId,
      transactionId: '', // 清空ID让后端生成新UUID
    } as TransactionRecord;
    await createTrForLedger(syncRecord);
    syncPopoverTarget.value = null;
    message.success('同步成功');
  } catch {
    message.error('同步失败');
  } finally {
    syncingTransactionId.value = null;
  }
};
</script>

<style scoped>
.transaction-table {
  width: 100%;
}

.transaction-table :deep(.ant-table) {
  background: transparent;
}

.transaction-table :deep(.ant-table-thead > tr > th) {
  font-family: var(--billadm-font-body);
  font-size: var(--billadm-size-text-caption);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--billadm-color-text-secondary);
  background-color: var(--billadm-color-minor-background);
  border-bottom: 1px solid var(--billadm-color-divider);
  padding: var(--billadm-space-sm) var(--billadm-space-md);
  position: sticky;
  top: 0;
  z-index: 1;
}

.transaction-table :deep(.ant-table-tbody > tr > td) {
  font-family: var(--billadm-font-body);
  font-size: var(--billadm-size-text-body);
  color: var(--billadm-color-text-major);
  border-bottom: 1px solid var(--billadm-color-divider);
  padding: var(--billadm-space-sm) var(--billadm-space-md);
}

.transaction-table :deep(.ant-table-tbody > tr:hover > td) {
  background-color: var(--billadm-color-hover-bg);
}

.cell-date {
  font-family: var(--billadm-font-mono);
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-secondary);
  font-variant-numeric: tabular-nums;
}

.cell-type {
  font-size: var(--billadm-size-text-caption);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.cell-type.type-income {
  color: var(--billadm-color-income);
}

.cell-type.type-expense {
  color: var(--billadm-color-expense);
}

.cell-type.type-transfer {
  color: var(--billadm-color-transfer);
}

.cell-category {
  font-size: var(--billadm-size-text-body);
  color: var(--billadm-color-text-major);
}

.cell-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--billadm-space-xs);
}

.tag-item {
  font-size: var(--billadm-size-text-caption);
  background-color: var(--billadm-color-minor-background);
  border: none;
  color: var(--billadm-color-text-secondary);
}

.tag-outlier {
  font-size: var(--billadm-size-text-caption);
  background-color: rgba(184, 134, 11, 0.1);
  color: var(--billadm-color-warning);
  border: none;
}

.cell-description {
  font-size: var(--billadm-size-text-body);
  color: var(--billadm-color-text-major);
}

.cell-price {
  font-family: var(--billadm-font-mono);
  font-size: var(--billadm-size-text-body);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}

.cell-price.price-income {
  color: var(--billadm-color-income);
}

.cell-price.price-expense {
  color: var(--billadm-color-expense);
}

.cell-price.price-transfer {
  color: var(--billadm-color-transfer);
}

.cell-actions {
  display: flex;
  gap: var(--billadm-space-xs);
  justify-content: center;
}

.sync-popover-content {
  min-width: 120px;
}

.sync-ledger-item {
  padding: var(--billadm-space-sm) var(--billadm-space-md);
  cursor: pointer;
  border-radius: var(--billadm-radius-sm);
  font-size: var(--billadm-size-text-body);
  color: var(--billadm-color-text-major);
  transition: background-color var(--billadm-transition-fast);
}

.sync-ledger-item:hover {
  background-color: var(--billadm-color-hover-bg);
}

.sync-empty {
  padding: var(--billadm-space-sm) var(--billadm-space-md);
  color: var(--billadm-color-text-secondary);
  font-size: var(--billadm-size-text-caption);
}

@media (prefers-reduced-motion: reduce) {
  .sync-ledger-item {
    transition: none;
  }
}
</style>
