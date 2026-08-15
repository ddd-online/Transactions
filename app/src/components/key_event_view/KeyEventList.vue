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
        :style="{ '--event-color': event.color || 'var(--transactions-color-primary)' }"
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
import type { KeyEvent } from '@/types/transactions';

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

<style scoped lang="scss">
@use '@/styles/mixins' as *;

.event-list-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: var(--transactions-space-md);
  background-color: var(--transactions-color-minor-background);
  border-radius: var(--transactions-radius-lg);
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
  font-size: var(--transactions-size-text-body-sm);
  color: var(--transactions-color-text-secondary);
}

/* ========== 事件列表 ========== */
.event-cards {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: var(--transactions-space-sm);
  contain: strict;

  @include custom-scrollbar;
}

/* ========== 事件卡片 ========== */
.event-card {
  position: relative;
  display: flex;
  flex-direction: row;
  border-radius: var(--transactions-radius-md);
  cursor: pointer;
  transition: background-color var(--transactions-transition-smooth),
              box-shadow var(--transactions-transition-smooth),
              transform var(--transactions-transition-smooth);
  background-color: var(--transactions-color-major-background);
  content-visibility: auto;
  contain-intrinsic-size: auto 56px;
}

.event-card:hover {
  background-color: var(--transactions-color-major-background);
  box-shadow: var(--transactions-shadow-sm);
  transform: translateX(2px);
}

.event-card.is-active {
  background-color: var(--transactions-color-active-bg);
  box-shadow: var(--transactions-shadow-sm);
}

.event-card.is-active:hover {
  box-shadow: var(--transactions-shadow-md);
}

.event-card:focus-visible {
  outline: 2px solid var(--transactions-color-primary);
  outline-offset: 2px;
  box-shadow: var(--transactions-shadow-md);
}

.event-card-bar {
  width: 4px;
  flex-shrink: 0;
  background-color: var(--event-color, var(--transactions-color-primary));
  border-radius: 2px;
  margin: var(--transactions-space-sm) 0;
  transform-origin: left;
  transition: transform var(--transactions-transition-smooth);
}

.event-card.is-active .event-card-bar {
  transform: scaleX(1.5);
}

.event-card-body {
  flex: 1;
  padding: var(--transactions-space-sm) var(--transactions-space-md);
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.event-card-name {
  font-size: var(--transactions-size-text-body-sm);
  font-weight: 500;
  color: var(--transactions-color-text-major);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.event-card-date {
  font-size: var(--transactions-size-text-caption);
  color: var(--transactions-color-text-secondary);
  font-variant-numeric: tabular-nums;
}

.event-card-desc {
  font-size: var(--transactions-size-text-caption);
  color: var(--transactions-color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: var(--transactions-space-2xs);
}

/* ========== 删除按钮 ========== */
.event-card-delete {
  position: absolute;
  top: var(--transactions-space-xs);
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

.event-card:hover .event-card-delete,
.event-card.is-active .event-card-delete {
  opacity: 1;
}

.event-card-delete:hover {
  color: var(--transactions-color-expense);
  background: var(--transactions-color-danger-hover-bg);
  transform: scale(1.1);
}

.event-card-delete:focus-visible {
  outline: 2px solid var(--transactions-color-primary);
  outline-offset: 2px;
  opacity: 1;
}

/* ========== 底部 ========== */
.panel-footer {
  flex-shrink: 0;
}

@media (prefers-reduced-motion: reduce) {
  .event-card {
    transition: none;
  }
  .event-card-bar {
    transition: none;
  }
  .event-card-delete {
    transition: none;
  }
  .event-card:hover {
    transform: none;
  }
  .event-card-delete:hover {
    transform: none;
  }
}
</style>
