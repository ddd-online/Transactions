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
        v-for="(tr, index) in transactions"
        :key="tr.transactionId"
        class="linked-card card-enter"
        :style="{ animationDelay: `${Math.min(index * 40, 280)}ms` }"
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

          <!-- 第二行：标签 + 描述同行 -->
          <div v-if="(tr.tags && tr.tags.length > 0) || tr.description" class="linked-card-row linked-card-row--meta">
            <div v-if="tr.tags && tr.tags.length > 0" class="linked-card-tags">
              <a-tag v-for="tag in tr.tags" :key="tag" class="tag-item">{{ tag }}</a-tag>
            </div>
            <span v-if="tr.description" class="linked-card-desc">{{ tr.description }}</span>
          </div>
        </div>

        <!-- 操作 -->
        <a-popconfirm
          title="确定删除此关联交易？"
          ok-text="删除"
          cancel-text="取消"
          placement="left"
          @confirm="$emit('delete', tr.transactionId)"
        >
          <button class="linked-card-delete" @click.stop aria-label="删除交易">
            <DeleteOutlined />
          </button>
        </a-popconfirm>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { DeleteOutlined } from "@ant-design/icons-vue";
import { centsToYuan } from "@/backend/functions";
import type { TransactionRecord } from "@/types/transactions";

interface Props {
  transactions: TransactionRecord[];
  loading: boolean;
  hasSelection: boolean;
}

const props = defineProps<Props>();

defineEmits<{
  (e: 'delete', transactionId: string): void;
}>();
</script>

<style scoped lang="scss">
@use '@/styles/mixins' as *;
.linked-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: var(--transactions-space-md);
  background-color: var(--transactions-color-minor-background);
  border-radius: var(--transactions-radius-lg);
  overflow: hidden;
  position: relative;
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
  font-size: var(--transactions-size-text-body-sm);
  color: var(--transactions-color-text-secondary);
}

/* ========== 卡片列表 ========== */
.linked-cards {
  flex: 1;
  overflow-y: auto;
  padding: var(--transactions-space-xs);
  contain: strict;

  @include custom-scrollbar;
}

/* ========== 卡片 ========== */
.linked-card {
  position: relative;
  display: flex;
  align-items: flex-start;
  padding: var(--transactions-space-sm);
  margin-bottom: var(--transactions-space-xs);
  border: 1px solid var(--transactions-color-window-border);
  border-radius: var(--transactions-radius-md);
  background-color: var(--transactions-color-major-background);
  box-shadow: var(--transactions-shadow-sm);
  transition: box-shadow var(--transactions-transition-smooth);
  min-height: 68px;
  box-sizing: border-box;
  content-visibility: auto;
  contain-intrinsic-size: auto 68px;
}

.linked-card:hover {
  box-shadow: var(--transactions-shadow-md);
}

/* ========== 卡片 staggered 入场 ========== */
.card-enter {
  animation: card-fade-up 300ms cubic-bezier(0.25, 1, 0.5, 1) both;
}

@keyframes card-fade-up {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.linked-card-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--transactions-space-xs);
}

/* ========== 主行：分类 + 金额 ========== */
.linked-card-row--main {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--transactions-space-sm);
}

/* ========== 副行：标签 + 描述 ========== */
.linked-card-row--meta {
  display: flex;
  align-items: center;
  gap: var(--transactions-space-sm);
  min-height: 20px;
}

.linked-card-value {
  font-size: var(--transactions-size-text-body-sm);
  font-weight: 500;
  color: var(--transactions-color-text-major);
}

/* ========== 标签 ========== */
.linked-card-tags {
  display: flex;
  flex-wrap: nowrap;
  gap: 3px;
  flex-shrink: 0;
}

.tag-item {
  font-size: var(--transactions-size-text-caption);
  background-color: var(--transactions-color-hover-bg);
  border: none;
  color: var(--transactions-color-primary);
}

/* ========== 描述 ========== */
.linked-card-desc {
  font-size: var(--transactions-size-text-caption);
  color: var(--transactions-color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

/* ========== 金额 ========== */
.linked-card-amount {
  font-family: var(--transactions-font-mono);
  font-size: var(--transactions-size-text-body);
  font-weight: var(--transactions-weight-semibold);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.linked-card-amount.amount-income {
  color: var(--transactions-color-income);
}

.linked-card-amount.amount-expense {
  color: var(--transactions-color-expense);
}

.linked-card-amount.amount-transfer {
  color: var(--transactions-color-transfer);
}

/* ========== 删除按钮 ========== */
.linked-card-delete {
  position: absolute;
  bottom: var(--transactions-space-xs);
  right: var(--transactions-space-xs);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  background: var(--transactions-color-elevated);
  color: var(--transactions-color-text-secondary);
  cursor: pointer;
  border-radius: var(--transactions-radius-full);
  transition: color var(--transactions-transition-fast),
              background-color var(--transactions-transition-fast),
              transform var(--transactions-transition-fast);
  font-size: var(--transactions-size-text-caption);
  opacity: 0;
}

.linked-card:hover .linked-card-delete {
  opacity: 1;
}

.linked-card-delete:hover {
  color: var(--transactions-color-expense);
  background: var(--transactions-color-danger-hover-bg);
  transform: scale(1.1);
}

.linked-card-delete:focus-visible {
  outline: 2px solid var(--transactions-color-primary);
  outline-offset: 2px;
  opacity: 1;
}

.linked-card:focus-visible {
  outline: 2px solid var(--transactions-color-primary);
  outline-offset: 2px;
  box-shadow: var(--transactions-shadow-md);
}

@media (prefers-reduced-motion: reduce) {
  .linked-card {
    transition: none;
  }
  .linked-card-delete {
    transition: none;
  }
  .linked-card-delete:hover {
    transform: none;
  }
  .card-enter {
    animation: none;
  }
}
</style>
