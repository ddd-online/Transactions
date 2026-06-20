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
    <div v-else ref="cardsRef" class="linked-cards" @scroll="onScroll">
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

    <!-- 滚动指示箭头 -->
    <Transition name="scroll-hint">
      <div v-if="showScrollHint" class="scroll-hint-arrow">
        <DownOutlined />
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { DeleteOutlined, DownOutlined } from "@ant-design/icons-vue";
import { centsToYuan } from "@/backend/functions";
import type { TransactionRecord } from "@/types/billadm";

interface Props {
  transactions: TransactionRecord[];
  loading: boolean;
  hasSelection: boolean;
}

const props = defineProps<Props>();

defineEmits<{
  (e: 'delete', transactionId: string): void;
}>();

const cardsRef = ref<HTMLElement | null>(null)
const showScrollHint = ref(false)

const checkOverflow = () => {
  const el = cardsRef.value
  if (!el) return
  showScrollHint.value = el.scrollHeight > el.clientHeight + 2 && el.scrollTop + el.clientHeight < el.scrollHeight - 4
}

const onScroll = () => {
  checkOverflow()
}

watch(
  () => props.transactions,
  () => {
    nextTick(() => checkOverflow())
  }
)
</script>

<style scoped>
.linked-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: var(--billadm-space-sm);
  background-color: var(--billadm-color-minor-background);
  border-radius: var(--billadm-radius-lg);
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
  font-size: var(--billadm-size-text-body-sm);
  color: var(--billadm-color-text-disabled);
}

/* ========== 卡片列表 ========== */
.linked-cards {
  flex: 1;
  overflow-y: auto;
  padding: var(--billadm-space-xs);
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.linked-cards::-webkit-scrollbar {
  display: none;
}

/* ========== 卡片 ========== */
.linked-card {
  position: relative;
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
  background-color: var(--billadm-color-hover-bg);
  border: none;
  color: var(--billadm-color-primary);
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
  position: absolute;
  bottom: 4px;
  right: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  background: rgba(255, 255, 255, 0.85);
  color: var(--billadm-color-text-secondary);
  cursor: pointer;
  border-radius: var(--billadm-radius-full);
  transition: color var(--billadm-transition-fast),
              background-color var(--billadm-transition-fast),
              transform var(--billadm-transition-fast);
  font-size: 12px;
  opacity: 0;
}

.linked-card:hover .linked-card-delete {
  opacity: 1;
}

.linked-card-delete:hover {
  color: var(--billadm-color-expense);
  background: rgba(217, 112, 90, 0.12);
  transform: scale(1.1);
}

/* ========== 滚动指示箭头 ========== */
.scroll-hint-arrow {
  position: absolute;
  bottom: var(--billadm-space-sm);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(74, 140, 111, 0.18);
  color: var(--billadm-color-primary);
  font-size: 14px;
  pointer-events: none;
  backdrop-filter: blur(2px);
}

/* 过渡动画 */
.scroll-hint-enter-active,
.scroll-hint-leave-active {
  transition: opacity var(--billadm-transition-smooth);
}

.scroll-hint-enter-from,
.scroll-hint-leave-to {
  opacity: 0;
}
</style>
