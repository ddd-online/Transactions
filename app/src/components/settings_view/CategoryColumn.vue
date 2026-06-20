<template>
  <section class="column column-categories">
    <div class="column-header">
      <span class="column-title">分类</span>
      <span class="column-count">{{ categories.length }}</span>
      <button class="add-btn add-btn--secondary" @click="$emit('add-category')" :disabled="!hasLedger">
        <svg class="add-btn__icon" viewBox="0 0 20 20" fill="none">
          <path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
        <span>添加分类</span>
      </button>
    </div>
    <div class="column-body category-list" v-if="categories.length > 0">
      <TransitionGroup name="list-fade">
        <div v-for="(category, index) in categories" :key="category.name" class="list-item"
        :class="{ 'is-active': selectedCategory === category.name }" @click="$emit('select-category', category.name)">
        <div class="item-main">
          <span class="item-name">{{ category.name }}</span>
          <span class="item-badge" v-if="category.recordCount">{{ category.recordCount }}</span>
        </div>
        <div class="item-actions">
          <button class="action-icon" @click.stop="$emit('move-category', index, -1)" :disabled="index === 0" title="上移">
            <svg class="arrow-icon" viewBox="0 0 16 16" fill="none">
              <path d="M8 2L8 14M8 2L4 6M8 2L12 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
                stroke-linejoin="round" />
            </svg>
          </button>
          <button class="action-icon" @click.stop="$emit('move-category', index, 1)"
            :disabled="index === categories.length - 1" title="下移">
            <svg class="arrow-icon" viewBox="0 0 16 16" fill="none">
              <path d="M8 14L8 2M8 14L4 10M8 14L12 10" stroke="currentColor" stroke-width="1.5"
                stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
          <button class="action-icon delete" @click.stop="$emit('delete-category', category.name)" title="删除">
            <svg class="delete-icon" viewBox="0 0 16 16" fill="none">
              <path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M12 4v8a2 2 0 01-2 2H6a2 2 0 01-2-2V4"
                stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </div>
      </div>
      </TransitionGroup>
    </div>
    <!-- 当前类型无分类，且账本中所有类型都无分类 → 显示初始化按钮 -->
    <div class="column-empty" v-else-if="!hasAnyCategories">
      <div class="empty-init">
        <div class="empty-init-icon">
          <svg viewBox="0 0 48 48" fill="none">
            <rect x="6" y="8" width="36" height="32" rx="3" stroke="currentColor" stroke-width="2"/>
            <path d="M6 16h36" stroke="currentColor" stroke-width="2"/>
            <path d="M16 4v8M32 4v8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M18 26h12M20 32h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </div>
        <span class="empty-init-text">当前账本暂无分类标签</span>
        <button
          class="init-btn"
          :disabled="!hasLedger || initLoading"
          @click="$emit('initialize')"
        >
          <span v-if="initLoading">初始化中...</span>
          <span v-else>初始化分类标签</span>
        </button>
      </div>
    </div>
    <!-- 当前类型无分类，但账本中其他类型已有分类 → 仅显示空提示 -->
    <div class="column-empty" v-else>
      <span>暂无分类</span>
    </div>
  </section>
</template>

<script lang="ts" setup>
import type { Category, Tag } from '@/types/billadm'

interface CategoryWithTags extends Category {
  tags: Tag[]
}

defineProps<{
  categories: CategoryWithTags[]
  selectedCategory: string
  hasLedger: boolean
  hasAnyCategories: boolean
  initLoading: boolean
}>()

defineEmits<{
  (e: 'select-category', name: string): void
  (e: 'add-category'): void
  (e: 'move-category', index: number, direction: number): void
  (e: 'delete-category', name: string): void
  (e: 'initialize'): void
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

.column-categories {
  border-radius: var(--billadm-radius-lg) 0 0 var(--billadm-radius-lg);
  border-right: none;
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

.list-item.is-active {
  background-color: var(--billadm-color-active-bg);
  font-weight: 500;
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

.list-item:hover .item-actions,
.list-item.is-active .item-actions {
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

/* 初始化空状态 */
.empty-init {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--billadm-space-md);
  padding: var(--billadm-space-xl);
  text-align: center;
}

.empty-init-icon {
  width: 64px;
  height: 64px;
  color: var(--billadm-color-text-disabled);
  opacity: 0.4;
}

.empty-init-icon svg {
  width: 100%;
  height: 100%;
}

.empty-init-text {
  font-size: var(--billadm-size-text-body);
  color: var(--billadm-color-text-secondary);
}

.init-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  font-size: var(--billadm-size-text-body-sm);
  font-weight: 500;
  color: var(--billadm-color-text-inverse);
  background-color: var(--billadm-color-primary);
  border: none;
  border-radius: var(--billadm-radius-md);
  cursor: pointer;
  transition: all var(--billadm-transition-fast);
}

.init-btn:hover:not(:disabled) {
  background-color: var(--billadm-color-primary-light);
}

.init-btn:disabled {
  opacity: 0.4;
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
