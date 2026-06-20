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
    <div class="column-body tag-list" v-if="tags.length > 0">
      <TransitionGroup name="list-fade">
        <div v-for="(tag, index) in tags" :key="tag.name" class="list-item">
        <div class="item-main">
          <span class="item-name">{{ tag.name }}</span>
          <span class="item-badge" v-if="tag.recordCount">{{ tag.recordCount }}</span>
        </div>
        <div class="item-actions">
          <button class="action-icon" @click="$emit('move-tag', index, -1)" :disabled="index === 0" title="上移">
            <svg class="arrow-icon" viewBox="0 0 16 16" fill="none">
              <path d="M8 2L8 14M8 2L4 6M8 2L12 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
                stroke-linejoin="round" />
            </svg>
          </button>
          <button class="action-icon" @click="$emit('move-tag', index, 1)" :disabled="index === tags.length - 1"
            title="下移">
            <svg class="arrow-icon" viewBox="0 0 16 16" fill="none">
              <path d="M8 14L8 2M8 14L4 10M8 14L12 10" stroke="currentColor" stroke-width="1.5"
                stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
          <button class="action-icon delete" @click="$emit('delete-tag', tag.name)" title="删除">
            <svg class="delete-icon" viewBox="0 0 16 16" fill="none">
              <path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M12 4v8a2 2 0 01-2 2H6a2 2 0 01-2-2V4"
                stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </div>
      </div>
      </TransitionGroup>
    </div>
    <div class="column-empty" v-else>
      <span>{{ selectedCategory ? '暂无标签' : '选择分类查看标签' }}</span>
    </div>
  </section>
</template>

<script lang="ts" setup>
import type { Tag } from '@/types/billadm'

defineProps<{
  tags: Tag[]
  selectedCategory: string
}>()

defineEmits<{
  (e: 'add-tag'): void
  (e: 'move-tag', index: number, direction: number): void
  (e: 'delete-tag', name: string): void
}>()
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
  background-color: var(--billadm-color-major-background);
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

/* List Item */
.list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
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

.action-icon .arrow-icon,
.action-icon .delete-icon {
  width: 14px;
  height: 14px;
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
/* 列表过渡 */
.list-fade-enter-active,
.list-fade-leave-active {
  transition: all 200ms ease;
}
.list-fade-enter-from {
  opacity: 0;
  transform: translateY(-4px);
}
.list-fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
.list-fade-move {
  transition: transform 200ms ease;
}

</style>
