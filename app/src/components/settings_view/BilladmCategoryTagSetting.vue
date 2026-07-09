<template>
  <BilladmPageLayout>
    <template #toolbar>
      <!-- 类型切换导航 -->
      <nav class="type-nav">
        <button
          v-for="type in transactionTypes"
          :key="type.value"
          class="type-card"
          :class="{ 'is-active': activeType === type.value }"
          :style="{ '--c': type.color }"
          @click="activeType = type.value"
        >
          <span class="type-card-bar"></span>
          <span class="type-card-label">{{ type.label }}</span>
        </button>
      </nav>
    </template>

    <!-- 主体：分类列表 + 标签列表 -->
    <div class="setting-main" :style="{ '--c': activeTypeColor }">
      <CategoryColumn
        :categories="categories"
        :selected-category="selectedCategory"
        :has-ledger="!!ledgerStore.currentLedgerId"
        :has-any-categories="hasAnyCategories"
        :init-loading="initLoading"
        @select-category="selectCategory"
        @add-category="openAddCategoryModal"
        @reorder-category="reorderCategories"
        @delete-category="confirmDeleteCategory"
        @initialize="handleInitialize"
      />

      <TagColumn
        :tags="selectedTags"
        :selected-category="selectedCategory"
        @add-tag="openAddTagModal"
        @reorder-tag="reorderTags"
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
import { ref, computed, watch } from 'vue';
import type { TransactionType, Category, Tag } from '@/types/billadm';
import { TransactionTypeToColor } from '@/backend/constant';
import { useLedgerStore } from '@/stores/ledgerStore';
import { withErrorHandling } from '@/backend/errorHandler'
import {
  queryCategory, createCategory, deleteCategory, updateCategorySort, initializeCategories
} from '@/backend/api/category'
import { queryTags, createTag, deleteTag, updateTagSort } from '@/backend/api/tag'
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
const activeTypeColor = computed(() =>
  transactionTypes.find(t => t.value === activeType.value)?.color || '#D9705A'
)

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
    await withErrorHandling(
      () => createCategory(ledgerStore.currentLedgerId!, name, activeType.value),
      { errorPrefix: '创建分类失败', rethrow: true }
    );
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
    await withErrorHandling(
      () => createTag(ledgerStore.currentLedgerId!, name, categoryTransactionType),
      { errorPrefix: '创建标签失败', rethrow: true }
    );
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
      await withErrorHandling(
        () => deleteCategory(deleteTarget.value.name, activeType.value, ledgerStore.currentLedgerId!),
        { errorPrefix: '删除分类失败', rethrow: true }
      );
      message.success('分类已删除');
      if (selectedCategory.value === deleteTarget.value.name) {
        selectedCategory.value = '';
        selectedTags.value = [];
      }
    } else {
      const categoryTransactionType = `${selectedCategory.value}:${activeType.value}`;
      await withErrorHandling(
        () => deleteTag(deleteTarget.value.name, categoryTransactionType, ledgerStore.currentLedgerId!),
        { errorPrefix: '删除标签失败', rethrow: true }
      );
      message.success('标签已删除');
    }
    openDeleteModal.value = false;
    await loadCategories();
    if (deleteTarget.value.type === 'tag') {
      selectCategory(selectedCategory.value);
    }
  } catch { /* error handled in backend */ }
};

const reorderCategories = async (oldIndex: number, newIndex: number) => {
  const list = [...categories.value]
  const [moved] = list.splice(oldIndex, 1)
  list.splice(newIndex, 0, moved!)
  const ledgerId = ledgerStore.currentLedgerId!
  // 全量重排：按新顺序重新分配 sortOrder
  for (let i = 0; i < list.length; i++) {
    const category = list[i]!
    if (category.sortOrder !== i) {
      category.sortOrder = i
      try {
        await withErrorHandling(
          () => updateCategorySort(category.name, activeType.value, i, ledgerId),
          { errorPrefix: '更新分类排序失败', rethrow: true }
        )
      } catch { /* error handled in backend */ }
    }
  }
  categories.value = list
};

const reorderTags = async (oldIndex: number, newIndex: number) => {
  const list = [...selectedTags.value]
  const [moved] = list.splice(oldIndex, 1)
  list.splice(newIndex, 0, moved!)
  const categoryTransactionType = `${selectedCategory.value}:${activeType.value}`
  const ledgerId = ledgerStore.currentLedgerId!
  // 全量重排：按新顺序重新分配 sortOrder
  for (let i = 0; i < list.length; i++) {
    const tag = list[i]!
    if (tag.sortOrder !== i) {
      tag.sortOrder = i
      try {
        await withErrorHandling(
          () => updateTagSort(tag.name, categoryTransactionType, i, ledgerId),
          { errorPrefix: '更新标签排序失败', rethrow: true }
        )
      } catch { /* error handled in backend */ }
    }
  }
  selectedTags.value = list
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
    const tags = await withErrorHandling(
      () => queryTags(categoryTransactionType, ledgerStore.currentLedgerId!),
      { errorPrefix: `查询 ${categoryTransactionType} 消费标签失败`, fallback: [] as Tag[] }
    );
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
    const list = await withErrorHandling(
      () => queryCategory(type, ledgerStore.currentLedgerId),
      { errorPrefix: `查询 ${type} 消费类型失败`, fallback: [] as Category[] }
    );
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
    const result = await withErrorHandling(
      () => initializeCategories(ledgerStore.currentLedgerId),
      { errorPrefix: '初始化分类标签失败', rethrow: true }
    );
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
/* ========== Type Navigation — card-style with left color bar ========== */
.type-nav {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-xs);
}

.type-card {
  position: relative;
  display: flex;
  align-items: center;
  height: 36px;
  padding: 0 var(--billadm-space-md) 0 calc(var(--billadm-space-md) + 4px);
  font-family: var(--billadm-font-body);
  font-size: var(--billadm-size-text-body-sm);
  font-weight: 500;
  color: var(--billadm-color-text-secondary);
  background: var(--billadm-color-major-background);
  border: 1px solid var(--billadm-color-divider);
  border-radius: var(--billadm-radius-md);
  cursor: pointer;
  user-select: none;
  transition: background-color var(--billadm-transition-smooth),
              box-shadow var(--billadm-transition-smooth),
              color var(--billadm-transition-fast);
}

.type-card-bar {
  position: absolute;
  left: 0;
  top: 4px;
  bottom: 4px;
  width: 3px;
  border-radius: 0 2px 2px 0;
  background-color: var(--billadm-color-divider);
  transition: width var(--billadm-transition-smooth),
              background-color var(--billadm-transition-smooth);
}

.type-card:hover:not(.is-active) {
  color: var(--billadm-color-text-major);
  box-shadow: var(--billadm-shadow-sm);
}

.type-card:hover:not(.is-active) .type-card-bar {
  background-color: var(--c);
  opacity: 0.5;
}

.type-card.is-active {
  color: var(--c);
  background-color: color-mix(in srgb, var(--c) 8%, var(--billadm-color-major-background));
  border-color: color-mix(in srgb, var(--c) 20%, transparent);
  box-shadow: var(--billadm-shadow-sm);
}

.type-card.is-active .type-card-bar {
  width: 4px;
  background-color: var(--c);
}

.type-card-label {
  position: relative;
  z-index: 1;
}

/* Main Grid */
.setting-main {
  flex: 1;
  display: grid;
  grid-template-columns: 240px 1fr;
  overflow: hidden;
  min-height: 0;
  background-color: color-mix(in srgb, var(--c) 8%, var(--billadm-color-major-warm));
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
