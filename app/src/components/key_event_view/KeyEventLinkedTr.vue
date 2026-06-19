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
          <!-- 第一行：分类 + 金额 -->
          <div class="linked-card-row linked-card-row--main">
            <span class="linked-card-value">{{ tr.category }}</span>
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

          <!-- 标签行 -->
          <div v-if="tr.tags && tr.tags.length > 0" class="linked-card-tags">
            <a-tag v-for="tag in tr.tags" :key="tag" class="tag-item">{{ tag }}</a-tag>
          </div>

          <!-- 描述行 -->
          <div v-if="tr.description" class="linked-card-desc">{{ tr.description }}</div>
        </div>

        <!-- 操作 -->
        <button class="linked-card-delete" @click="$emit('delete', tr.transactionId)" title="删除">
          <DeleteOutlined />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { DeleteOutlined } from "@ant-design/icons-vue";
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
</script>

<style scoped>
.linked-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  border-left: 1px solid var(--billadm-color-divider);
  padding: var(--billadm-space-sm);
  background-color: var(--billadm-color-major-warm);
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
  display: flex;
  align-items: flex-start;
  padding: var(--billadm-space-xs) var(--billadm-space-sm);
  margin-bottom: var(--billadm-space-2xs);
  border: 1px solid var(--billadm-color-window-border);
  border-radius: var(--billadm-radius-md);
  background-color: var(--billadm-color-major-background);
  box-shadow: var(--billadm-shadow-sm);
  transition: box-shadow var(--billadm-transition-smooth);
}

.linked-card:hover {
  box-shadow: var(--billadm-shadow-md);
}

.linked-card-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

/* ========== 主行：分类 + 金额 ========== */
.linked-card-row--main {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--billadm-space-sm);
}

.linked-card-value {
  font-size: var(--billadm-size-text-body-sm);
  font-weight: 500;
  color: var(--billadm-color-text-major);
}

/* ========== 标签 ========== */
.linked-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.tag-item {
  font-size: var(--billadm-size-text-caption);
  background-color: var(--billadm-color-minor-background);
  border: none;
  color: var(--billadm-color-text-secondary);
}

/* ========== 描述 ========== */
.linked-card-desc {
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ========== 金额 ========== */
.linked-card-amount {
  font-family: var(--billadm-font-mono);
  font-size: var(--billadm-size-text-body);
  font-weight: var(--billadm-weight-semibold);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
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

/* ========== 删除按钮 ========== */
.linked-card-delete {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: none;
  color: var(--billadm-color-text-disabled);
  cursor: pointer;
  border-radius: var(--billadm-radius-sm);
  transition: color var(--billadm-transition-fast),
              background-color var(--billadm-transition-fast);
  font-size: 12px;
  margin-left: var(--billadm-space-xs);
}

.linked-card-delete:hover {
  color: var(--billadm-color-expense);
  background-color: rgba(217, 112, 90, 0.08);
}
</style>
