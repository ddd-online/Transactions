<template>
  <BilladmPageLayout>
    <template #toolbar>
      <!-- 类型切换导航 -->
      <nav class="type-nav">
      <button
        v-for="type in transactionTypes"
        :key="type.value"
        class="type-pill"
        :class="{ 'is-active': activeType === type.value }"
        :style="{ '--c': type.color }"
        @click="activeType = type.value"
      >
        <span class="pill-dot"></span>
        {{ type.label }}
      </button>
    </nav>
    </template>

    <!-- 主体：分类列表 + 标签列表 -->
    <div class="setting-main">
      <CategoryColumn
        :categories="categories"
        :selected-category="selectedCategory"
        :has-ledger="!!ledgerStore.currentLedgerId"
        :has-any-categories="hasAnyCategories"
        :init-loading="initLoading"
        @select-category="selectCategory"
        @add-category="openAddCategoryModal"
        @move-category="moveCategory"
        @delete-category="confirmDeleteCategory"
        @initialize="handleInitialize"
      />

      <TagColumn
        :tags="selectedTags"
        :selected-category="selectedCategory"
        @add-tag="openAddTagModal"
        @move-tag="moveTag"
        @delete-tag="confirmDeleteTag"
      />
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
  </BilladmPageLayout>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import type { TransactionType, Category, Tag } from '@/types/billadm';
import { TransactionTypeToColor } from '@/backend/constant';
import { useLedgerStore } from '@/stores/ledgerStore';
import {
  getCategoryByType, getTagsByCategory,
  addCategory, removeCategory, addTag, removeTag,
  reorderCategory, reorderTag, initializeCategoriesForLedger
} from '@/backend/functions';
import { useCategoryTags } from '@/hooks/useCategoryTags'
import { message } from "ant-design-vue";
import CategoryColumn from './CategoryColumn.vue'
import TagColumn from './TagColumn.vue'

interface CategoryWithTags extends Category {
  tags: Tag[];
}

const transactionTypes = [
  { value: 'expense' as TransactionType, label: '支出', color: TransactionTypeToColor.get('expense') || '#D9705A' },
  { value: 'income' as TransactionType, label: '收入', color: TransactionTypeToColor.get('income') || '#3D8C5E' },
  { value: 'transfer' as TransactionType, label: '转账', color: TransactionTypeToColor.get('transfer') || '#5C8DB5' },
]

const activeType = ref<TransactionType>('expense')

const ledgerStore = useLedgerStore();

const { loadCategoryOptions } = useCategoryTags(() => ledgerStore.currentLedgerId)

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
    await addCategory(ledgerStore.currentLedgerId!, name, activeType.value);
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
  const categoryTransactionType = `${selectedCategory.value}:${activeType.value}`;
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
      await removeCategory(deleteTarget.value.name, activeType.value, ledgerStore.currentLedgerId!);
      message.success('分类已删除');
      if (selectedCategory.value === deleteTarget.value.name) {
        selectedCategory.value = '';
        selectedTags.value = [];
      }
    } else {
      const categoryTransactionType = `${selectedCategory.value}:${activeType.value}`;
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
    await reorderCategory(category.name, activeType.value, targetSortOrder);
    await reorderCategory(targetCategory.name, activeType.value, categorySortOrder);
    await loadCategories();
  } catch { /* error handled in backend */ }
};

const moveTag = async (index: number, direction: number) => {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= selectedTags.value.length) return;
  const tag = selectedTags.value[index];
  const targetTag = selectedTags.value[newIndex];
  if (!tag || !targetTag) return;
  const categoryTransactionType = `${selectedCategory.value}:${activeType.value}`;
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
  const categoryList = await loadCategoryOptions(activeType.value);
  categories.value = categoryList.map(c => ({
    name: c.name,
    transactionType: c.transactionType,
    sortOrder: c.sortOrder,
    recordCount: c.recordCount,
    tags: []
  }));
  for (const category of categories.value) {
    const categoryTransactionType = `${category.name}:${activeType.value}`;
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
  () => [ledgerStore.currentLedgerId, activeType.value],
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
/* Type Navigation */
.type-nav {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-xs);
  height: 32px;
}

.type-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  box-sizing: border-box;
  padding: 0 12px;
  font-size: var(--billadm-size-text-body-sm);
  font-weight: 500;
  color: var(--billadm-color-text-secondary);
  background: transparent;
  border: 1px solid var(--billadm-color-divider);
  border-radius: var(--billadm-radius-full);
  cursor: pointer;
  transition: all var(--billadm-transition-fast);
}

.type-pill:hover:not(.is-active) {
  color: var(--billadm-color-text-major);
  border-color: var(--billadm-color-text-disabled);
}

.type-pill.is-active {
  color: var(--c);
  border-color: var(--c);
  background-color: color-mix(in srgb, var(--c) 8%, transparent);
}

.pill-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

/* Main Grid */
.setting-main {
  flex: 1;
  display: grid;
  grid-template-columns: 240px 1fr;
  overflow: hidden;
  min-height: 0;
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
</style>
