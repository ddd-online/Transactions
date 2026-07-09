<template>
  <section class="column column-tags">
    <div class="column-header">
      <span class="column-title">{{ selectedCategory || '标签' }}</span>
      <span class="column-count">{{ tags.length }}</span>
      <button class="add-btn add-btn--secondary" @click="$emit('add-tag')" :disabled="!selectedCategory">
        <svg class="add-btn__icon" viewBox="0 0 20 20" fill="none">
          <path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
        <span>添加标签</span>
      </button>
    </div>
    <div
      ref="listRef"
      class="column-body tag-list"
      v-if="tags.length > 0"
    >
      <div v-for="tag in tags" :key="tag.name" class="list-item">
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
        <div class="item-main">
          <span class="item-name">{{ tag.name }}</span>
          <span class="item-badge" v-if="tag.recordCount">{{ tag.recordCount }}</span>
        </div>
        <div class="item-actions">
          <button class="action-icon delete" @click="$emit('delete-tag', tag.name)" title="删除">
            <svg class="delete-icon" viewBox="0 0 16 16" fill="none">
              <path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M12 4v8a2 2 0 01-2 2H6a2 2 0 01-2-2V4"
                stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
    <div class="column-empty" v-else>
      <span>{{ selectedCategory ? '暂无标签' : '选择分类查看标签' }}</span>
    </div>
  </section>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue'
import type { Tag } from '@/types/billadm'
import { useListDragSort } from '@/hooks/useListDragSort'

const props = defineProps<{
  tags: Tag[]
  selectedCategory: string
}>()

const emit = defineEmits<{
  (e: 'add-tag'): void
  (e: 'reorder-tag', oldIndex: number, newIndex: number): void
  (e: 'delete-tag', name: string): void
}>()

const listRef = ref<HTMLElement>()
const dragEnabled = computed(() => props.tags.length > 1)

useListDragSort(listRef, dragEnabled, {
  handle: '.drag-handle',
  animation: 200,
  onReorder(oldIndex, newIndex) {
    emit('reorder-tag', oldIndex, newIndex)
  },
})
</script>

<style scoped>
.add-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  font-size: var(--billadm-size-text-body-sm);
  font-weight: 500;
  border-radius: var(--billadm-radius-md);
  border: none;
  cursor: pointer;
  transition: all var(--billadm-transition-fast);
}

.add-btn__icon {
  width: 14px;
  height: 14px;
}

.add-btn--secondary {
  color: var(--billadm-color-primary);
  background-color: transparent;
  border: 1px solid var(--billadm-color-primary);
}

.add-btn--secondary:hover:not(:disabled) {
  background-color: var(--billadm-color-primary);
  color: var(--billadm-color-text-inverse);
}

.add-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Column */
.column {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: color-mix(in srgb, var(--c, #D9705A) 8%, var(--billadm-color-major-background));
  border: 1px solid var(--billadm-color-divider);
}

.column-tags {
  border-radius: 0 var(--billadm-radius-lg) var(--billadm-radius-lg) 0;
}

.column-header {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-sm);
  padding: var(--billadm-space-sm) var(--billadm-space-md);
  border-bottom: 1px solid var(--billadm-color-divider);
  flex-shrink: 0;
}

.column-header .add-btn {
  margin-left: auto;
}

.column-title {
  font-size: var(--billadm-size-text-body);
  font-weight: 600;
  color: var(--billadm-color-text-major);
}

.column-count {
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-secondary);
  background-color: var(--billadm-color-minor-background);
  padding: 1px 6px;
  border-radius: var(--billadm-radius-full);
}

.column-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--billadm-space-xs);
}

.column-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  font-size: var(--billadm-size-text-body);
  color: var(--billadm-color-text-disabled);
}

/* Drag Handle — 始终可见 */
.drag-handle {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  color: var(--billadm-color-text-disabled);
  cursor: grab;
  transition: color var(--billadm-transition-fast);
  margin-right: 2px;
  touch-action: none;
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

/* List Item */
.list-item {
  display: flex;
  align-items: center;
  padding: var(--billadm-space-sm) var(--billadm-space-sm);
  border-radius: var(--billadm-radius-md);
  cursor: pointer;
  transition: background-color var(--billadm-transition-fast);
}

.list-item:hover {
  background-color: var(--billadm-color-hover-bg);
}

.item-main {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-xs);
  min-width: 0;
  flex: 1;
}

.item-name {
  font-size: var(--billadm-size-text-body-sm);
  color: var(--billadm-color-text-major);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-badge {
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-secondary);
  background-color: var(--billadm-color-minor-background);
  padding: 1px 5px;
  border-radius: var(--billadm-radius-full);
  flex-shrink: 0;
}

.item-actions {
  display: none;
  flex-shrink: 0;
  margin-left: 4px;
}

.list-item:hover .item-actions {
  display: flex;
}

.action-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: var(--billadm-color-text-secondary);
  background: transparent;
  border: none;
  border-radius: var(--billadm-radius-sm);
  cursor: pointer;
  transition: all var(--billadm-transition-fast);
}

.action-icon .delete-icon {
  width: 14px;
  height: 14px;
}

.action-icon.delete:hover:not(:disabled) {
  color: var(--billadm-color-negative);
  background-color: rgba(199, 62, 58, 0.08);
}

.action-icon:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* SortableJS 拖拽状态 */
.sortable-ghost {
  opacity: 0.3;
  background-color: var(--billadm-color-hover-bg);
}

.sortable-chosen {
  background-color: var(--billadm-color-active-bg);
  box-shadow: var(--billadm-shadow-md);
}

.sortable-drag {
  opacity: 0;
}
</style>
