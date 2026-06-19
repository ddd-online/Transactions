<template>
  <div class="event-list-panel">
    <!-- 空状态 -->
    <div v-if="sortedEvents.length === 0" class="panel-empty">
      <div class="panel-empty-text">暂无事件记录</div>
    </div>

    <!-- 事件列表 -->
    <div v-else class="event-cards">
      <div
        v-for="event in sortedEvents"
        :key="event.date"
        class="event-card"
        :class="{ 'is-active': event.date === selectedDate }"
        :style="{ '--event-color': event.color || 'var(--billadm-color-primary)' }"
        role="button"
        tabindex="0"
        :aria-selected="event.date === selectedDate"
        @click="$emit('select', event.date)"
        @keydown.enter.prevent="$emit('select', event.date)"
        @keydown.space.prevent="$emit('select', event.date)"
      >
        <div class="event-card-bar" />
        <div class="event-card-body">
          <div class="event-card-name">{{ event.title || event.date }}</div>
          <div class="event-card-date">{{ formatShortDate(event.date) }}</div>
          <div v-if="event.content" class="event-card-desc">{{ truncate(event.content, 30) }}</div>
        </div>
      </div>
    </div>

    <!-- 底部添加按钮 -->
    <div class="panel-footer">
      <a-button type="primary" block @click="$emit('add-event')">
        添加事件
      </a-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { KeyEvent } from '@/types/billadm';

interface Props {
  events: KeyEvent[];
  selectedDate: string;
}

const props = defineProps<Props>();

defineEmits<{
  (e: 'select', date: string): void;
  (e: 'add-event'): void;
}>();

// 按日期降序排列
const sortedEvents = computed(() => {
  return [...props.events].sort((a, b) => b.date.localeCompare(a.date));
});

// "2026-06-19" → "6-19"
const formatShortDate = (date: string): string => {
  const parts = date.split('-');
  if (parts.length !== 3) return date;
  return `${parseInt(parts[1], 10)}-${parseInt(parts[2], 10)}`;
};

// 截断文本
const truncate = (text: string, max: number): string => {
  if (text.length <= max) return text;
  return text.slice(0, max) + '…';
};
</script>

<style scoped>
.event-list-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  border-right: 1px solid var(--billadm-color-divider);
  background-color: var(--billadm-color-major-background);
}

/* ========== 空状态 ========== */
.panel-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.panel-empty-text {
  font-size: var(--billadm-size-text-body-sm);
  color: var(--billadm-color-text-disabled);
}

/* ========== 事件列表 ========== */
.event-cards {
  flex: 1;
  overflow-y: auto;
  padding: var(--billadm-space-xs);
}

/* ========== 事件卡片 ========== */
.event-card {
  display: flex;
  flex-direction: row;
  border-radius: var(--billadm-radius-md);
  cursor: pointer;
  transition: background-color var(--billadm-transition-fast);
  margin-bottom: var(--billadm-space-2xs);
}

.event-card:hover {
  background-color: var(--billadm-color-hover-bg);
}

.event-card.is-active {
  background-color: var(--billadm-color-active-bg);
}

.event-card-bar {
  width: 4px;
  flex-shrink: 0;
  background-color: var(--event-color, var(--billadm-color-primary));
  border-radius: 2px;
  margin: var(--billadm-space-sm) 0;
}

.event-card-body {
  flex: 1;
  padding: var(--billadm-space-sm) var(--billadm-space-md);
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.event-card-name {
  font-size: var(--billadm-size-text-body-sm);
  font-weight: 500;
  color: var(--billadm-color-text-major);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.event-card-date {
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-secondary);
  font-variant-numeric: tabular-nums;
}

.event-card-desc {
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-disabled);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}

/* ========== 底部 ========== */
.panel-footer {
  padding: var(--billadm-space-sm);
  border-top: 1px solid var(--billadm-color-divider);
}
</style>
