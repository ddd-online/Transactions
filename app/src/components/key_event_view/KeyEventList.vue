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
        <a-popconfirm
          title="确定删除此事件？"
          ok-text="删除"
          cancel-text="取消"
          placement="left"
          @confirm="$emit('delete', event.date)"
        >
          <button class="event-card-delete" @click.stop aria-label="删除事件">
            <CloseOutlined />
          </button>
        </a-popconfirm>
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
import { CloseOutlined } from '@ant-design/icons-vue';
import type { KeyEvent } from '@/types/billadm';

interface Props {
  events: KeyEvent[];
  selectedDate: string;
}

const props = defineProps<Props>();

defineEmits<{
  (e: 'select', date: string): void;
  (e: 'delete', date: string): void;
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
  const month = parts[1] ?? '1';
  const day = parts[2] ?? '1';
  return `${parseInt(month, 10)}-${parseInt(day, 10)}`;
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
  padding: var(--billadm-space-md);
  background-color: var(--billadm-color-minor-background);
  border-radius: var(--billadm-radius-lg);
  overflow: hidden;
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
  display: flex;
  flex-direction: column;
  gap: var(--billadm-space-sm);
}

/* ========== 事件卡片 ========== */
.event-card {
  position: relative;
  display: flex;
  flex-direction: row;
  border-radius: var(--billadm-radius-md);
  cursor: pointer;
  transition: background-color var(--billadm-transition-smooth),
              box-shadow var(--billadm-transition-smooth),
              transform var(--billadm-transition-smooth);
  background-color: var(--billadm-color-major-background);
}

.event-card:hover {
  background-color: var(--billadm-color-major-background);
  box-shadow: var(--billadm-shadow-sm);
  transform: translateX(2px);
}

.event-card.is-active {
  background-color: var(--billadm-color-active-bg);
  box-shadow: var(--billadm-shadow-sm);
}

.event-card.is-active:hover {
  box-shadow: var(--billadm-shadow-md);
}

.event-card-bar {
  width: 4px;
  flex-shrink: 0;
  background-color: var(--event-color, var(--billadm-color-primary));
  border-radius: 2px;
  margin: var(--billadm-space-sm) 0;
  transition: width var(--billadm-transition-smooth);
}

.event-card.is-active .event-card-bar {
  width: 6px;
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

/* ========== 删除按钮 ========== */
.event-card-delete {
  position: absolute;
  top: 4px;
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

.event-card:hover .event-card-delete,
.event-card.is-active .event-card-delete {
  opacity: 1;
}

.event-card-delete:hover {
  color: var(--billadm-color-expense);
  background: rgba(217, 112, 90, 0.12);
  transform: scale(1.1);
}

/* ========== 底部 ========== */
.panel-footer {
  flex-shrink: 0;
}
</style>
