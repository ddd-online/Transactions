<template>
  <div class="category-tag-setting">
    <!-- 主体：分类列表 + 标签列表 -->
    <div class="setting-main">
      <!-- 分类列 -->
      <section class="column column-categories">
        <div class="column-header">
          <span class="column-title">分类</span>
          <span class="column-count">{{ categories.length }}</span>
          <button class="add-btn add-btn--secondary" @click="openAddCategoryModal" :disabled="!ledgerStore.currentLedgerId">
            <svg class="add-btn__icon" viewBox="0 0 20 20" fill="none">
              <path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
            <span>添加分类</span>
          </button>
        </div>
        <div class="column-body category-list" v-if="categories.length > 0">
          <div v-for="(category, index) in categories" :key="category.name" class="list-item"
            :class="{ 'is-active': selectedCategory === category.name }" @click="selectCategory(category.name)">
            <div class="item-main">
              <span class="item-name">{{ category.name }}</span>
              <span class="item-badge" v-if="category.recordCount">{{ category.recordCount }}</span>
            </div>
            <div class="item-actions">
              <button class="action-icon" @click.stop="moveCategory(index, -1)" :disabled="index === 0" title="上移">
                <svg class="arrow-icon" viewBox="0 0 16 16" fill="none">
                  <path d="M8 2L8 14M8 2L4 6M8 2L12 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
                    stroke-linejoin="round" />
                </svg>
              </button>
              <button class="action-icon" @click.stop="moveCategory(index, 1)"
                :disabled="index === categories.length - 1" title="下移">
                <svg class="arrow-icon" viewBox="0 0 16 16" fill="none">
                  <path d="M8 14L8 2M8 14L4 10M8 14L12 10" stroke="currentColor" stroke-width="1.5"
                    stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
              <button class="action-icon delete" @click.stop="confirmDeleteCategory(category.name)" title="删除">
                <svg class="delete-icon" viewBox="0 0 16 16" fill="none">
                  <path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M12 4v8a2 2 0 01-2 2H6a2 2 0 01-2-2V4"
                    stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
            </div>
          </div>
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
              :disabled="!ledgerStore.currentLedgerId || initLoading"
              @click="handleInitialize"
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

      <!-- 标签列 -->
      <section class="column column-tags">
        <div class="column-header">
          <span class="column-title">{{ selectedCategory || '标签' }}</span>
          <span class="column-count">{{ selectedTags.length }}</span>
          <button class="add-btn add-btn--secondary" @click="openAddTagModal" :disabled="!selectedCategory">
            <svg class="add-btn__icon" viewBox="0 0 20 20" fill="none">
              <path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
            <span>添加标签</span>
          </button>
        </div>
        <div class="column-body tag-list" v-if="selectedTags.length > 0">
          <div v-for="(tag, index) in selectedTags" :key="tag.name" class="list-item">
            <div class="item-main">
              <span class="item-name">{{ tag.name }}</span>
              <span class="item-badge" v-if="tag.recordCount">{{ tag.recordCount }}</span>
            </div>
            <div class="item-actions">
              <button class="action-icon" @click="moveTag(index, -1)" :disabled="index === 0" title="上移">
                <svg class="arrow-icon" viewBox="0 0 16 16" fill="none">
                  <path d="M8 2L8 14M8 2L4 6M8 2L12 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
                    stroke-linejoin="round" />
                </svg>
              </button>
              <button class="action-icon" @click="moveTag(index, 1)" :disabled="index === selectedTags.length - 1"
                title="下移">
                <svg class="arrow-icon" viewBox="0 0 16 16" fill="none">
                  <path d="M8 14L8 2M8 14L4 10M8 14L12 10" stroke="currentColor" stroke-width="1.5"
                    stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
              <button class="action-icon delete" @click="confirmDeleteTag(tag.name)" title="删除">
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
    </div>

    <!-- 添加分类弹窗 -->
    <a-modal v-model:open="openCategoryModal" title="新增分类" @ok="confirmAddCategory" ok-text="确认" cancel-text="取消"
      centered :width="360">
      <div class="modal-form">
        <label class="form-label">名称</label>
        <a-input v-model:value="categoryForm.name" placeholder="输入分类名称" size="large" :maxlength="20" />
      </div>
    </a-modal>

    <!-- 添加标签弹窗 -->
    <a-modal v-model:open="openTagModal" title="新增标签" @ok="confirmAddTag" ok-text="确认" cancel-text="取消" centered
      :width="360">
      <div class="modal-form">
        <label class="form-label">名称</label>
        <a-input v-model:value="tagForm.name" placeholder="输入标签名称" size="large" :maxlength="20" />
      </div>
    </a-modal>

    <!-- 删除确认弹窗 -->
    <a-modal v-model:open="openDeleteModal" :title="deleteTarget.type === 'category' ? '删除分类' : '删除标签'"
      @ok="executeDelete" ok-text="删除" ok-type="danger" cancel-text="取消" centered :width="360">
      <p>{{ deleteTarget.message }}</p>
    </a-modal>
  </div>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import type { TransactionType, Category, Tag } from '@/types/billadm';
import { useLedgerStore } from '@/stores/ledgerStore';
import {
  getCategoryByType, getTagsByCategory,
  addCategory, removeCategory, addTag, removeTag,
  reorderCategory, reorderTag, initializeCategoriesForLedger
} from '@/backend/functions';
import { message } from "ant-design-vue";

interface CategoryWithTags extends Category {
  tags: Tag[];
}

const props = defineProps<{
  activeColor?: string;
  activeType: TransactionType;
}>();

const emit = defineEmits<{
  (e: 'update:activeType', value: TransactionType): void;
}>();

const ledgerStore = useLedgerStore();

const categories = ref<CategoryWithTags[]>([]);
const selectedCategory = ref<string>('');
const selectedTags = ref<Tag[]>([]);
const initLoading = ref(false);
const hasAnyCategories = ref(false); // 账本中是否存在任意分类（跨所有交易类型）

// 添加分类弹窗
const openCategoryModal = ref(false);
const categoryForm = ref({ name: '' });

// 添加标签弹窗
const openTagModal = ref(false);
const tagForm = ref({ name: '' });

// 删除确认弹窗
const openDeleteModal = ref(false);
const deleteTarget = ref<{ type: 'category' | 'tag', name: string, message: string }>({
  type: 'category',
  name: '',
  message: ''
});

const openAddCategoryModal = () => {
  categoryForm.value.name = '';
  openCategoryModal.value = true;
};

const openAddTagModal = () => {
  tagForm.value.name = '';
  openTagModal.value = true;
};

const confirmAddCategory = async () => {
  const name = categoryForm.value.name.trim();
  if (!name) return;
  if (categories.value.some(c => c.name === name)) {
    message.error('该分类已存在');
    return;
  }
  try {
    await addCategory(ledgerStore.currentLedgerId!, name, props.activeType);
    message.success('分类已添加');
    openCategoryModal.value = false;
    await loadCategories();
    selectCategory(name);
  } catch { /* error handled in backend */ }
};

const confirmAddTag = async () => {
  const name = tagForm.value.name.trim();
  if (!name) return;
  if (selectedTags.value.some(t => t.name === name)) {
    message.error('该标签已存在');
    return;
  }
  const categoryTransactionType = `${selectedCategory.value}:${props.activeType}`;
  try {
    await addTag(name, categoryTransactionType);
    message.success('标签已添加');
    openTagModal.value = false;
    await loadCategories();
    selectCategory(selectedCategory.value);
  } catch { /* error handled in backend */ }
};

const confirmDeleteCategory = (name: string) => {
  deleteTarget.value = {
    type: 'category',
    name,
    message: `确定删除分类「${name}」及其所有标签？`
  };
  openDeleteModal.value = true;
};

const confirmDeleteTag = (name: string) => {
  deleteTarget.value = {
    type: 'tag',
    name,
    message: `确定删除标签「${name}」？`
  };
  openDeleteModal.value = true;
};

const executeDelete = async () => {
  try {
    if (deleteTarget.value.type === 'category') {
      await removeCategory(deleteTarget.value.name, props.activeType, ledgerStore.currentLedgerId!);
      message.success('分类已删除');
      if (selectedCategory.value === deleteTarget.value.name) {
        selectedCategory.value = '';
        selectedTags.value = [];
      }
    } else {
      const categoryTransactionType = `${selectedCategory.value}:${props.activeType}`;
      await removeTag(deleteTarget.value.name, categoryTransactionType, ledgerStore.currentLedgerId!);
      message.success('标签已删除');
    }
    openDeleteModal.value = false;
    await loadCategories();
    if (deleteTarget.value.type === 'tag') {
      selectCategory(selectedCategory.value);
    }
  } catch { /* error handled in backend */ }
};

const moveCategory = async (index: number, direction: number) => {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= categories.value.length) return;
  const category = categories.value[index];
  const targetCategory = categories.value[newIndex];
  if (!category || !targetCategory) return;
  const categorySortOrder = category.sortOrder || 0;
  const targetSortOrder = targetCategory.sortOrder || 0;
  try {
    await reorderCategory(category.name, props.activeType, targetSortOrder);
    await reorderCategory(targetCategory.name, props.activeType, categorySortOrder);
    await loadCategories();
  } catch { /* error handled in backend */ }
};

const moveTag = async (index: number, direction: number) => {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= selectedTags.value.length) return;
  const tag = selectedTags.value[index];
  const targetTag = selectedTags.value[newIndex];
  if (!tag || !targetTag) return;
  const categoryTransactionType = `${selectedCategory.value}:${props.activeType}`;
  const tagSortOrder = tag.sortOrder || 0;
  const targetSortOrder = targetTag.sortOrder || 0;
  try {
    await reorderTag(tag.name, categoryTransactionType, targetSortOrder);
    await reorderTag(targetTag.name, categoryTransactionType, tagSortOrder);
    await loadCategories();
    selectCategory(selectedCategory.value);
  } catch { /* error handled in backend */ }
};

const loadCategories = async () => {
  const categoryList = await getCategoryByType(props.activeType, ledgerStore.currentLedgerId!);
  categories.value = categoryList.map(c => ({
    name: c.name,
    transactionType: c.transactionType,
    sortOrder: c.sortOrder,
    recordCount: c.recordCount,
    tags: []
  }));
  for (const category of categories.value) {
    const categoryTransactionType = `${category.name}:${props.activeType}`;
    const tags = await getTagsByCategory(categoryTransactionType, ledgerStore.currentLedgerId!);
    category.tags = tags.map(t => ({
      name: t.name,
      categoryTransactionType: t.categoryTransactionType,
      sortOrder: t.sortOrder,
      recordCount: t.recordCount
    }));
  }
};

const checkHasAnyCategories = async () => {
  if (!ledgerStore.currentLedgerId) {
    hasAnyCategories.value = false;
    return;
  }
  const allTypes: TransactionType[] = ['expense', 'income', 'transfer'];
  for (const type of allTypes) {
    const list = await getCategoryByType(type, ledgerStore.currentLedgerId);
    if (list.length > 0) {
      hasAnyCategories.value = true;
      return;
    }
  }
  hasAnyCategories.value = false;
};

const selectCategory = (categoryName: string) => {
  selectedCategory.value = categoryName;
  const category = categories.value.find(c => c.name === categoryName);
  selectedTags.value = category ? category.tags : [];
};

const handleInitialize = async () => {
  if (!ledgerStore.currentLedgerId) return;
  initLoading.value = true;
  try {
    const result = await initializeCategoriesForLedger(ledgerStore.currentLedgerId);
    message.success(`已添加 ${result.categories} 个分类、${result.tags} 个标签`);
    hasAnyCategories.value = true;
    await loadCategories();
  } catch (error: any) {
    message.error(error?.message || '初始化失败');
  } finally {
    initLoading.value = false;
  }
};

watch(
  () => [ledgerStore.currentLedgerId, props.activeType],
  () => {
    selectedCategory.value = '';
    selectedTags.value = [];
    loadCategories();
    checkHasAnyCategories();
  },
  { immediate: true }
);
</script>

<style scoped>
.category-tag-setting {
  height: 100%;
  display: flex;
  flex-direction: column;
}

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

.add-btn--primary {
  color: var(--billadm-color-text-inverse);
  background-color: var(--billadm-color-primary);
}

.add-btn--primary:hover:not(:disabled) {
  background-color: var(--billadm-color-primary-light);
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

/* Main Grid */
.setting-main {
  flex: 1;
  display: grid;
  grid-template-columns: 240px 1fr;
  overflow: hidden;
  min-height: 0;
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

/* Modal Form */
.modal-form {
  display: flex;
  flex-direction: column;
  gap: var(--billadm-space-xs);
}

.form-label {
  font-size: var(--billadm-size-text-body);
  color: var(--billadm-color-text-secondary);
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
</style>
