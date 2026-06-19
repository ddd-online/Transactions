<template>
  <div class="linked-panel">
    <!-- 未选择事件 -->
    <div v-if="!hasSelection" class="panel-empty">
      <span class="panel-empty-text">选择事件查看关联交易</span>
    </div>

    <!-- 加载中 -->
    <div v-else-if="loading" class="panel-loading">
      <a-spin />
    </div>

    <!-- 空状态 -->
    <div v-else-if="transactions.length === 0" class="panel-empty">
      <span class="panel-empty-text">暂无关联交易</span>
    </div>

    <!-- 关联交易卡片列表 -->
    <div v-else class="linked-cards">
      <div
        v-for="tr in transactions"
        :key="tr.transactionId"
        class="linked-card"
      >
        <div class="linked-card-body">
          <!-- 账本 -->
          <div class="linked-card-row">
            <span class="linked-card-label">账本</span>
            <span class="linked-card-value">{{ getLedgerName(tr.ledgerId) }}</span>
          </div>

          <!-- 分类 -->
          <div class="linked-card-row">
            <span class="linked-card-label">分类</span>
            <span class="linked-card-value">{{ tr.category }}</span>
          </div>

          <!-- 标签 -->
          <div v-if="tr.tags && tr.tags.length > 0" class="linked-card-row">
            <span class="linked-card-label">标签</span>
            <div class="linked-card-tags">
              <a-tag v-for="tag in tr.tags" :key="tag" class="linked-card-tag">{{ tag }}</a-tag>
            </div>
          </div>

          <!-- 描述 -->
          <div v-if="tr.description" class="linked-card-row">
            <span class="linked-card-label">描述</span>
            <span class="linked-card-value linked-card-desc">{{ tr.description }}</span>
          </div>

          <!-- 金额 -->
          <div class="linked-card-row">
            <span class="linked-card-label">金额</span>
            <span
              class="linked-card-amount"
              :class="[
                tr.transactionType === 'income' ? 'amount-income' :
                tr.transactionType === 'expense' ? 'amount-expense' :
                'amount-transfer'
              ]"
            >
              <template v-if="tr.transactionType === 'expense'">-</template>
              <template v-else-if="tr.transactionType === 'income'">+</template>
              {{ centsToYuan(tr.price) }}
            </span>
          </div>
        </div>

        <!-- 操作：删除 -->
        <div class="linked-card-action">
          <a-button
            type="text"
            danger
            size="small"
            @click="$emit('delete', tr.transactionId)"
          >
            <template #icon><DeleteOutlined /></template>
            删除
          </a-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { DeleteOutlined } from "@ant-design/icons-vue";
import { useLedgerStore } from "@/stores/ledgerStore";
import { centsToYuan } from "@/backend/functions";
import type { TransactionRecord } from "@/types/billadm";

interface Props {
  transactions: TransactionRecord[];
  loading: boolean;
  hasSelection: boolean;
}

defineProps<Props>();

defineEmits<{
  (e: 'delete', transactionId: string): void;
}>();

const ledgerStore = useLedgerStore();

const getLedgerName = (ledgerId: string): string => {
  const ledger = ledgerStore.ledgers.find(l => l.id === ledgerId);
  return ledger?.name || ledgerId;
};
</script>

<style scoped>
.linked-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  border-left: 1px solid var(--billadm-color-divider);
  background-color: var(--billadm-color-major-background);
}

/* ========== 空状态 & 加载 ========== */
.panel-empty,
.panel-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.panel-empty-text {
  font-size: var(--billadm-size-text-body-sm);
  color: var(--billadm-color-text-disabled);
}

/* ========== 卡片列表 ========== */
.linked-cards {
  flex: 1;
  overflow-y: auto;
  padding: var(--billadm-space-xs);
}

/* ========== 卡片 ========== */
.linked-card {
  padding: var(--billadm-space-sm) var(--billadm-space-md);
  margin-bottom: var(--billadm-space-2xs);
  border: 1px solid var(--billadm-color-window-border);
  border-radius: var(--billadm-radius-md);
}

.linked-card-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* ========== 行 ========== */
.linked-card-row {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  gap: var(--billadm-space-sm);
}

.linked-card-label {
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-disabled);
  min-width: 32px;
  flex-shrink: 0;
}

.linked-card-value {
  font-size: var(--billadm-size-text-body-sm);
  color: var(--billadm-color-text-major);
}

/* ========== 标签 ========== */
.linked-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.linked-card-tag {
  font-size: var(--billadm-size-text-caption) !important;
  line-height: 1.5 !important;
  height: auto !important;
  padding: 0 6px !important;
}

/* ========== 描述截断 ========== */
.linked-card-desc {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

/* ========== 金额 ========== */
.linked-card-amount {
  font-family: var(--billadm-font-mono);
  font-size: var(--billadm-size-text-body);
  font-weight: var(--billadm-weight-semibold);
  font-variant-numeric: tabular-nums;
}

.linked-card-amount.amount-income {
  color: var(--billadm-color-income);
}

.linked-card-amount.amount-expense {
  color: var(--billadm-color-expense);
}

.linked-card-amount.amount-transfer {
  color: var(--billadm-color-transfer);
}

/* ========== 操作 ========== */
.linked-card-action {
  margin-top: var(--billadm-space-2xs);
  display: flex;
  justify-content: flex-end;
}
</style>
