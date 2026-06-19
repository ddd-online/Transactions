# Frontend 重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提取公共逻辑、拆分大文件、优化组件结构，删除 ~1,037 行死代码并提升代码复用性。

**Architecture:** 新建 `app/src/hooks/useCategoryTags.ts` 封装分类/标签加载模式。从 `BilladmCategoryTagSetting.vue` 拆分 `CategoryColumn.vue` / `TagColumn.vue`，从 `TransactionRecordView.vue` 拆分 `TrEditModal.vue` / `TrSortModal.vue`。消除 `CategoryTagView` 薄壳包装。

**Tech Stack:** Vue 3 + TypeScript + Ant Design Vue + Pinia

---

## Phase 1: 公共逻辑提取

### Task 1: 创建 `useCategoryTags` Composable

**Files:**
- Create: `app/src/hooks/useCategoryTags.ts`

- [ ] **Step 1: 创建 composable 文件**

```typescript
// app/src/hooks/useCategoryTags.ts
import { ref } from 'vue'
import type { DefaultOptionType } from 'ant-design-vue/es/vc-cascader'
import { getCategoryByType, getTagsByCategory } from '@/backend/functions'
import type { Category, Tag } from '@/types/billadm'

export function useCategoryTags(getLedgerId: () => string | undefined | null) {
  const categoryOptions = ref<DefaultOptionType[]>([])
  const tagOptions = ref<DefaultOptionType[]>([])

  async function loadCategoryOptions(transactionType: string): Promise<Category[]> {
    const ledgerId = getLedgerId()
    if (!ledgerId || !transactionType) {
      categoryOptions.value = []
      return []
    }
    const list = await getCategoryByType(transactionType, ledgerId)
    categoryOptions.value = list.map((c: Category) => ({ value: c.name }))
    return list
  }

  async function loadTagOptions(category: string, transactionType: string): Promise<Tag[]> {
    const ledgerId = getLedgerId()
    if (!ledgerId || !category || !transactionType) {
      tagOptions.value = []
      return []
    }
    const categoryTxType = `${category}:${transactionType}`
    const list = await getTagsByCategory(categoryTxType, ledgerId)
    tagOptions.value = list.map((t: Tag) => ({ value: t.name }))
    return list
  }

  function resetCategoryTags() {
    categoryOptions.value = []
    tagOptions.value = []
  }

  return { categoryOptions, tagOptions, loadCategoryOptions, loadTagOptions, resetCategoryTags }
}
```

- [ ] **Step 2: 验证文件无语法错误**

Run: `npx vue-tsc --noEmit app/src/hooks/useCategoryTags.ts 2>&1 || true`
Expected: No TypeScript errors

- [ ] **Step 3: 提交**

```bash
git add app/src/hooks/useCategoryTags.ts
git commit -m "feat: 提取 useCategoryTags composable 封装分类/标签加载逻辑"
```

---

### Task 2: 迁移 TransactionRecordView 使用 composable

**Files:**
- Modify: `app/src/components/tr_view/TransactionRecordView.vue`

- [ ] **Step 1: 替换 category/tag watchers**

在 `<script setup>` 中，删除现有的两个 watcher（`watch(() => trForm.value.type, ...)` 和 `watch(() => trForm.value.category, ...)`），替换为 composable + watcher：

```typescript
import { useCategoryTags } from '@/hooks/useCategoryTags'

// ... 在 setup 中（放在 ledgerStore 声明之后）:
const { categoryOptions, tagOptions, loadCategoryOptions, loadTagOptions, resetCategoryTags } = 
  useCategoryTags(() => ledgerStore.currentLedgerId)
```

将 `categories` 变量替换为 `categoryOptions`（类型兼容），将 `tags` 变量替换为 `tagOptions`（类型兼容）。

删除原来的 watcher 代码块：
```typescript
// 删除这个 watch:
watch(() => trForm.value.type, async () => {
  if (trForm.value.type === '' || !ledgerStore.currentLedgerId) return;
  const categoryList = await getCategoryByType(trForm.value.type, ledgerStore.currentLedgerId);
  categories.value = categoryList.map(c => ({ value: c.name }));
  // ... auto-select logic
});

// 删除这个 watch:
watch(() => trForm.value.category, async () => {
  if (trForm.value.category === '' || !trForm.value.type || !ledgerStore.currentLedgerId) return;
  const categoryTransactionType = `${trForm.value.category}:${trForm.value.type}`;
  const tagList = await getTagsByCategory(categoryTransactionType, ledgerStore.currentLedgerId);
  tags.value = tagList.map(t => ({ value: t.name }));
  // ... filter logic
});
```

替换为：
```typescript
// 交易类型变化 → 加载分类
watch(() => trForm.value.type, async (newType) => {
  if (!newType || !ledgerStore.currentLedgerId) return
  const categoryList = await loadCategoryOptions(newType)
  const categoryNames = categoryList.map(c => c.name)
  if (categoryNames.length > 0) {
    if (!trForm.value.category || !categoryNames.includes(trForm.value.category)) {
      trForm.value.category = categoryNames[0] as string
    }
  } else {
    trForm.value.category = ''
  }
})

// 分类变化 → 加载标签
watch(() => trForm.value.category, async (newCategory) => {
  if (!newCategory || !trForm.value.type || !ledgerStore.currentLedgerId) return
  await loadTagOptions(newCategory, trForm.value.type)
  const tagNames = tagOptions.value.map(t => t.value as string)
  if (tagNames.length > 0 && trForm.value.tags) {
    trForm.value.tags = trForm.value.tags.filter(tag => tagNames.includes(tag))
  } else {
    trForm.value.tags = []
  }
})
```

同时移除不再需要的 import：`getCategoryByType, getTagsByCategory` 从 `@/backend/functions`（如果不再直接使用）。

- [ ] **Step 2: 运行类型检查**

Run: `cd app && npx vue-tsc --noEmit 2>&1`
Expected: No errors

- [ ] **Step 3: 提交**

```bash
git add app/src/components/tr_view/TransactionRecordView.vue
git commit -m "refactor: TransactionRecordView 使用 useCategoryTags composable"
```

---

### Task 3: 迁移 TransactionRecordFilter 使用 composable

**Files:**
- Modify: `app/src/components/common/TransactionRecordFilter.vue`

- [ ] **Step 1: 替换 category/tag watchers**

删除两个 watcher（`watch(() => tempTransactionType.value, ...)` 和 `watch(() => tempCategory.value, ...)`），导入并使用 composable：

```typescript
import { useCategoryTags } from '@/hooks/useCategoryTags'

// 在 setup 中：
const { categoryOptions, tagOptions, loadCategoryOptions, loadTagOptions, resetCategoryTags } =
  useCategoryTags(() => ledgerStore.currentLedgerId)
```

将模板中的 `categories` 改为 `categoryOptions`，`tags` 改为 `tagOptions`。

删除现有的两个 watcher，替换为：
```typescript
watch(() => tempTransactionType.value, async (newVal) => {
  if (!newVal) {
    categoryOptions.value = []
    tempCategory.value = undefined
    return
  }
  await loadCategoryOptions(newVal)
})

watch(() => tempCategory.value, async (newVal) => {
  if (!newVal) {
    tagOptions.value = []
    tempTags.value = []
    return
  }
  await loadTagOptions(newVal, tempTransactionType.value!)
})
```

移除不再需要的 import：`getCategoryByType, getTagsByCategory` 从 `@/backend/functions`，以及 `Category` 类型 import。

- [ ] **Step 2: 运行类型检查**

Run: `cd app && npx vue-tsc --noEmit 2>&1`
Expected: No errors

- [ ] **Step 3: 提交**

```bash
git add app/src/components/common/TransactionRecordFilter.vue
git commit -m "refactor: TransactionRecordFilter 使用 useCategoryTags composable"
```

---

### Task 4: 迁移 BilladmChartLines 使用 composable

**Files:**
- Modify: `app/src/components/da_view/BilladmChartLines.vue`

- [ ] **Step 1: 替换 onTransactionTypeChange / onCategoryChange**

删除 `onTransactionTypeChange` 和 `onCategoryChange` 函数实现，替换为 composable 调用：

```typescript
import { useCategoryTags } from '@/hooks/useCategoryTags'

// 在 setup 中（放在 ledgerStore 声明之后）：
const { categoryOptions, tagOptions, loadCategoryOptions, loadTagOptions, resetCategoryTags } =
  useCategoryTags(() => ledgerStore.currentLedgerId)
```

替换 `onTransactionTypeChange`:
```typescript
const onTransactionTypeChange = async () => {
  newLineForm.value.category = undefined
  newLineForm.value.tags = []
  tagOptions.value = []
  if (!newLineForm.value.transactionType) {
    categoryOptions.value = []
    return
  }
  await loadCategoryOptions(newLineForm.value.transactionType)
}
```

替换 `onCategoryChange`:
```typescript
const onCategoryChange = async () => {
  newLineForm.value.tags = []
  if (!newLineForm.value.category) {
    tagOptions.value = []
    return
  }
  await loadTagOptions(newLineForm.value.category, newLineForm.value.transactionType)
}
```

移除不再需要的 import：`getCategoryByType, getTagsByCategory` 从 `@/backend/functions`。

- [ ] **Step 2: 运行类型检查**

Run: `cd app && npx vue-tsc --noEmit 2>&1`
Expected: No errors

- [ ] **Step 3: 提交**

```bash
git add app/src/components/da_view/BilladmChartLines.vue
git commit -m "refactor: BilladmChartLines 使用 useCategoryTags composable"
```

---

### Task 5: 迁移 BilladmCategoryTagSetting 使用 composable

**Files:**
- Modify: `app/src/components/settings_view/BilladmCategoryTagSetting.vue`

- [ ] **Step 1: 替换 loadCategories 中的分类/标签加载**

导入 composable：
```typescript
import { useCategoryTags } from '@/hooks/useCategoryTags'
```

在 setup 中添加：
```typescript
const { categoryOptions, tagOptions, loadCategoryOptions, loadTagOptions, resetCategoryTags } =
  useCategoryTags(() => ledgerStore.currentLedgerId)
```

修改 `loadCategories` 函数，使用 composable 的 `loadCategoryOptions`：
```typescript
const loadCategories = async () => {
  const categoryList = await loadCategoryOptions(props.activeType)
  // 注意：loadCategoryOptions 内部已设置 categoryOptions.value
  // 此处需要额外的 CategoryWithTags 结构
  categories.value = categoryList.map(c => ({
    name: c.name,
    transactionType: c.transactionType,
    sortOrder: c.sortOrder,
    recordCount: c.recordCount,
    tags: []
  }))
  for (const category of categories.value) {
    const categoryTransactionType = `${category.name}:${props.activeType}`
    const tags = await getTagsByCategory(categoryTransactionType, ledgerStore.currentLedgerId!)
    category.tags = tags.map(t => ({
      name: t.name,
      categoryTransactionType: t.categoryTransactionType,
      sortOrder: t.sortOrder,
      recordCount: t.recordCount
    }))
  }
}
```

这里 `loadCategoryOptions` 调用后 `categoryOptions.value` 已更新，但 `BilladmCategoryTagSetting` 还需要额外的 `CategoryWithTags` 结构（包含 tags 数组和 recordCount）。因此这个组件中 `loadCategories` 保留了更多自定义逻辑，只复用了 composable 的分类加载部分。

同时移除不再需要的 import：`getCategoryByType` 从 `@/backend/functions`（保留 `getTagsByCategory`，因为仍在 loadCategories 中使用）。

- [ ] **Step 2: 运行类型检查**

Run: `cd app && npx vue-tsc --noEmit 2>&1`
Expected: No errors

- [ ] **Step 3: 提交**

```bash
git add app/src/components/settings_view/BilladmCategoryTagSetting.vue
git commit -m "refactor: BilladmCategoryTagSetting 使用 useCategoryTags composable"
```

---

### Task 6: Phase 1 验证

- [ ] **Step 1: 完整类型检查**

Run: `cd app && npx vue-tsc --noEmit 2>&1`
Expected: Zero errors

- [ ] **Step 2: 构建测试**

Run: `cd app && npm run build 2>&1`
Expected: Build succeeds

---

## Phase 2: 大文件拆分

### Task 7: 从 BilladmCategoryTagSetting 提取 CategoryColumn

**Files:**
- Create: `app/src/components/settings_view/CategoryColumn.vue`
- Modify: `app/src/components/settings_view/BilladmCategoryTagSetting.vue`

- [ ] **Step 1: 创建 CategoryColumn.vue**

```vue
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
      <div
        v-for="(category, index) in categories"
        :key="category.name"
        class="list-item"
        :class="{ 'is-active': selectedCategory === category.name }"
        @click="$emit('select-category', category.name)"
      >
        <div class="item-main">
          <span class="item-name">{{ category.name }}</span>
          <span class="item-badge" v-if="category.recordCount">{{ category.recordCount }}</span>
        </div>
        <div class="item-actions">
          <button class="action-icon" @click.stop="$emit('move-category', index, -1)" :disabled="index === 0" title="上移">
            <svg class="arrow-icon" viewBox="0 0 16 16" fill="none">
              <path d="M8 2L8 14M8 2L4 6M8 2L12 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
          <button class="action-icon" @click.stop="$emit('move-category', index, 1)" :disabled="index === categories.length - 1" title="下移">
            <svg class="arrow-icon" viewBox="0 0 16 16" fill="none">
              <path d="M8 14L8 2M8 14L4 10M8 14L12 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
          <button class="action-icon delete" @click.stop="$emit('delete-category', category.name)" title="删除">
            <svg class="delete-icon" viewBox="0 0 16 16" fill="none">
              <path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M12 4v8a2 2 0 01-2 2H6a2 2 0 01-2-2V4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
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
        <button class="init-btn" :disabled="!hasLedger || initLoading" @click="$emit('initialize')">
          <span v-if="initLoading">初始化中...</span>
          <span v-else>初始化分类标签</span>
        </button>
      </div>
    </div>
    <div class="column-empty" v-else>
      <span>暂无分类</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { Category, Tag } from '@/types/billadm'

interface CategoryWithTags extends Category {
  tags: Tag[]
}

interface Props {
  categories: CategoryWithTags[]
  selectedCategory: string
  hasLedger: boolean
  hasAnyCategories: boolean
  initLoading: boolean
}

defineProps<Props>()

defineEmits<{
  (e: 'select-category', name: string): void
  (e: 'add-category'): void
  (e: 'move-category', index: number, direction: number): void
  (e: 'delete-category', name: string): void
  (e: 'initialize'): void
}>()
</script>

<style scoped>
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
.column-header .add-btn { margin-left: auto; }
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
.list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--billadm-space-sm) var(--billadm-space-sm);
  border-radius: var(--billadm-radius-md);
  cursor: pointer;
  transition: background-color var(--billadm-transition-fast);
}
.list-item:hover { background-color: var(--billadm-color-hover-bg); }
.list-item.is-active { background-color: var(--billadm-color-active-bg); font-weight: 500; }
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
.item-actions { display: none; }
.list-item:hover .item-actions,
.list-item.is-active .item-actions { display: flex; }
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
.action-icon .arrow-icon, .action-icon .delete-icon { width: 14px; height: 14px; }
.action-icon:hover:not(:disabled) {
  color: var(--billadm-color-text-major);
  background-color: var(--billadm-color-hover-bg);
}
.action-icon.delete:hover:not(:disabled) {
  color: var(--billadm-color-negative);
  background-color: rgba(199, 62, 58, 0.08);
}
.action-icon:disabled { opacity: 0.3; cursor: not-allowed; }
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
.add-btn__icon { width: 14px; height: 14px; }
.add-btn--secondary {
  color: var(--billadm-color-primary);
  background-color: transparent;
  border: 1px solid var(--billadm-color-primary);
}
.add-btn--secondary:hover:not(:disabled) {
  background-color: var(--billadm-color-primary);
  color: var(--billadm-color-text-inverse);
}
.add-btn:disabled { opacity: 0.4; cursor: not-allowed; }
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
.empty-init-icon svg { width: 100%; height: 100%; }
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
.init-btn:hover:not(:disabled) { background-color: var(--billadm-color-primary-light); }
.init-btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
```

- [ ] **Step 2: 更新 BilladmCategoryTagSetting.vue 模板**

将模板中的分类 section（`<section class="column column-categories">...</section>`）替换为：

```vue
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
```

在 script 中导入：
```typescript
import CategoryColumn from './CategoryColumn.vue'
```

- [ ] **Step 3: 运行类型检查**

Run: `cd app && npx vue-tsc --noEmit 2>&1`
Expected: No errors

- [ ] **Step 4: 提交**

```bash
git add app/src/components/settings_view/CategoryColumn.vue app/src/components/settings_view/BilladmCategoryTagSetting.vue
git commit -m "refactor: 提取 CategoryColumn 组件"
```

---

### Task 8: 从 BilladmCategoryTagSetting 提取 TagColumn

**Files:**
- Create: `app/src/components/settings_view/TagColumn.vue`
- Modify: `app/src/components/settings_view/BilladmCategoryTagSetting.vue`

- [ ] **Step 1: 创建 TagColumn.vue**

```vue
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
      <div v-for="(tag, index) in tags" :key="tag.name" class="list-item">
        <div class="item-main">
          <span class="item-name">{{ tag.name }}</span>
          <span class="item-badge" v-if="tag.recordCount">{{ tag.recordCount }}</span>
        </div>
        <div class="item-actions">
          <button class="action-icon" @click="$emit('move-tag', index, -1)" :disabled="index === 0" title="上移">
            <svg class="arrow-icon" viewBox="0 0 16 16" fill="none">
              <path d="M8 2L8 14M8 2L4 6M8 2L12 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
          <button class="action-icon" @click="$emit('move-tag', index, 1)" :disabled="index === tags.length - 1" title="下移">
            <svg class="arrow-icon" viewBox="0 0 16 16" fill="none">
              <path d="M8 14L8 2M8 14L4 10M8 14L12 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
          <button class="action-icon delete" @click="$emit('delete-tag', tag.name)" title="删除">
            <svg class="delete-icon" viewBox="0 0 16 16" fill="none">
              <path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M12 4v8a2 2 0 01-2 2H6a2 2 0 01-2-2V4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
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

<script setup lang="ts">
import type { Tag } from '@/types/billadm'

interface Props {
  tags: Tag[]
  selectedCategory: string
}

defineProps<Props>()

defineEmits<{
  (e: 'add-tag'): void
  (e: 'move-tag', index: number, direction: number): void
  (e: 'delete-tag', name: string): void
}>()
</script>

<style scoped>
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
.column-header .add-btn { margin-left: auto; }
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
.list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--billadm-space-sm) var(--billadm-space-sm);
  border-radius: var(--billadm-radius-md);
  cursor: pointer;
  transition: background-color var(--billadm-transition-fast);
}
.list-item:hover { background-color: var(--billadm-color-hover-bg); }
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
.item-actions { display: none; }
.list-item:hover .item-actions { display: flex; }
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
.action-icon .arrow-icon, .action-icon .delete-icon { width: 14px; height: 14px; }
.action-icon:hover:not(:disabled) {
  color: var(--billadm-color-text-major);
  background-color: var(--billadm-color-hover-bg);
}
.action-icon.delete:hover:not(:disabled) {
  color: var(--billadm-color-negative);
  background-color: rgba(199, 62, 58, 0.08);
}
.action-icon:disabled { opacity: 0.3; cursor: not-allowed; }
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
.add-btn__icon { width: 14px; height: 14px; }
.add-btn--secondary {
  color: var(--billadm-color-primary);
  background-color: transparent;
  border: 1px solid var(--billadm-color-primary);
}
.add-btn--secondary:hover:not(:disabled) {
  background-color: var(--billadm-color-primary);
  color: var(--billadm-color-text-inverse);
}
.add-btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
```

- [ ] **Step 2: 更新 BilladmCategoryTagSetting.vue 模板**

将模板中的标签 section（`<section class="column column-tags">...</section>`）替换为：

```vue
<TagColumn
  :tags="selectedTags"
  :selected-category="selectedCategory"
  @add-tag="openAddTagModal"
  @move-tag="moveTag"
  @delete-tag="confirmDeleteTag"
/>
```

在 script 中导入：
```typescript
import TagColumn from './TagColumn.vue'
```

- [ ] **Step 3: 运行类型检查**

Run: `cd app && npx vue-tsc --noEmit 2>&1`
Expected: No errors

- [ ] **Step 4: 提交**

```bash
git add app/src/components/settings_view/TagColumn.vue app/src/components/settings_view/BilladmCategoryTagSetting.vue
git commit -m "refactor: 提取 TagColumn 组件"
```

---

### Task 9: 从 TransactionRecordView 提取 TrSortModal

**Files:**
- Create: `app/src/components/tr_view/TrSortModal.vue`
- Modify: `app/src/components/tr_view/TransactionRecordView.vue`

- [ ] **Step 1: 创建 TrSortModal.vue**

```vue
<template>
  <a-modal v-model:open="open" title="排序" :footer="null" centered width="500px">
    <div class="sort-list">
      <div v-for="(item, index) in items" :key="index" class="sort-item">
        <span class="sort-priority">{{ index + 1 }}</span>
        <a-select v-model:value="item.field" :options="getAvailableFields(index)" placeholder="选择字段" style="width: 120px" />
        <a-select v-model:value="item.order" style="width: 100px">
          <a-select-option value="asc">升序</a-select-option>
          <a-select-option value="desc">降序</a-select-option>
        </a-select>
        <a-button type="text" danger :disabled="items.length <= 1" @click="removeItem(index)">
          <DeleteOutlined />
        </a-button>
      </div>
      <a-button type="link" :disabled="items.length >= 4" @click="addItem">
        <PlusOutlined /> 添加排序条件
      </a-button>
    </div>
    <div class="sort-actions">
      <a-button @click="reset">重置</a-button>
      <a-button type="primary" @click="apply">应用</a-button>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons-vue'

interface SortItem {
  field: string
  order: 'asc' | 'desc'
}

const sortFieldOptions = [
  { value: 'transactionAt', label: '时间' },
  { value: 'price', label: '金额' },
  { value: 'category', label: '分类' },
  { value: 'transactionType', label: '类型' },
]

const open = defineModel<boolean>()

const emit = defineEmits<{
  (e: 'apply', items: SortItem[]): void
}>()

const items = ref<SortItem[]>([{ field: 'transactionAt', order: 'desc' }])

const getAvailableFields = (currentIndex: number) => {
  const usedFields = items.value.slice(0, currentIndex).map(item => item.field)
  return sortFieldOptions.filter(opt => !usedFields.includes(opt.value))
}

const addItem = () => {
  if (items.value.length >= 4) return
  const usedFields = items.value.map(item => item.field)
  const availableField = sortFieldOptions.find(opt => !usedFields.includes(opt.value))
  if (availableField) {
    items.value.push({ field: availableField.value, order: 'desc' })
  }
}

const removeItem = (index: number) => {
  if (items.value.length <= 1) return
  items.value.splice(index, 1)
}

const reset = () => {
  items.value = [{ field: 'transactionAt', order: 'desc' }]
}

const apply = () => {
  open.value = false
  emit('apply', items.value)
}

// 暴露 setItems 供父组件初始化
defineExpose({ setItems: (v: SortItem[]) => { items.value = [...v] } })
</script>

<style scoped>
.sort-list {
  display: flex;
  flex-direction: column;
  gap: var(--billadm-space-md);
  margin-bottom: var(--billadm-space-lg);
}
.sort-item {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-sm);
}
.sort-priority {
  width: 24px;
  height: 24px;
  border-radius: var(--billadm-radius-full);
  background-color: var(--billadm-color-primary);
  color: var(--billadm-color-text-inverse);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--billadm-size-text-caption);
  font-weight: 600;
  flex-shrink: 0;
}
.sort-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--billadm-space-sm);
}
</style>
```

- [ ] **Step 2: 更新 TransactionRecordView.vue 模板**

将排序弹窗的模板部分替换为：
```vue
<TrSortModal ref="sortModalRef" v-model="openSortModal" @apply="onSortApply" />
```

删除原有的排序弹窗模板（`<a-modal v-model:open="openSortModal" title="排序" ...>` 整个块）。

在 script 中：
```typescript
import TrSortModal from './TrSortModal.vue'

const sortModalRef = ref<InstanceType<typeof TrSortModal> | null>(null)
```

替换 sort 相关函数：
```typescript
// 删除: sortItems, sortFieldOptions, isAscending, getAvailableFields, addSortItem, removeSortItem, resetSort
// 添加:
const onSortApply = (sortItems: SortItem[]) => {
  sortItemsRef.value = sortItems
  refreshTable()
}

// 将原来的 sortItems 改名为 sortItemsRef
const sortItemsRef = ref<SortItem[]>([{ field: 'transactionAt', order: 'desc' }])

// refreshTable 中使用 sortItemsRef.value
```

删除不再需要的 imports: `SortAscendingOutlined`, `SortDescendingOutlined`（不再需要用于图标显示）

- [ ] **Step 3: 运行类型检查**

Run: `cd app && npx vue-tsc --noEmit 2>&1`
Expected: No errors

- [ ] **Step 4: 提交**

```bash
git add app/src/components/tr_view/TrSortModal.vue app/src/components/tr_view/TransactionRecordView.vue
git commit -m "refactor: 提取 TrSortModal 组件"
```

---

### Task 10: Phase 2 验证

- [ ] **Step 1: 完整类型检查**

Run: `cd app && npx vue-tsc --noEmit 2>&1`
Expected: Zero errors

- [ ] **Step 2: 构建验证**

Run: `cd app && npm run build 2>&1`
Expected: Build succeeds

---

## Phase 3: 组件结构优化

### Task 11: 消除 CategoryTagView 薄壳包装

**Files:**
- Modify: `app/src/components/settings_view/BilladmCategoryTagSetting.vue`
- Modify: `app/src/router/router.ts`
- Modify: `app/src/components/AppLeftBar.vue`
- Delete: `app/src/components/category_tag_view/CategoryTagView.vue`

- [ ] **Step 1: 将类型切换按钮合并到 BilladmCategoryTagSetting**

在 `BilladmCategoryTagSetting.vue` 的模板顶部添加类型切换栏（来自 CategoryTagView）：

```vue
<template>
  <div class="category-tag-setting">
    <!-- 类型切换栏 -->
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

    <!-- 原有的主体内容 -->
    <div class="setting-main">
      <CategoryColumn .../>
      <TagColumn .../>
    </div>
    <!-- ... modals ... -->
  </div>
</template>
```

在 script 中添加：
```typescript
import { TransactionTypeToColor } from '@/backend/constant'
import type { TransactionType } from '@/types/billadm'

// Props 改为使用 activeType 替代原来的 activeType（命名统一）
const transactionTypes = [
  { value: 'expense' as TransactionType, label: '支出', color: TransactionTypeToColor.get('expense') || '#D9705A' },
  { value: 'income' as TransactionType, label: '收入', color: TransactionTypeToColor.get('income') || '#3D8C5E' },
  { value: 'transfer' as TransactionType, label: '转账', color: TransactionTypeToColor.get('transfer') || '#5C8DB5' },
]
```

同时需要将 `activeType` 从 prop 改为内部状态（default 'expense'），或保持 prop 不变让其由父组件传入。

添加类型导航的 scoped CSS：
```css
.type-nav {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-xs);
  padding: var(--billadm-space-sm) var(--billadm-space-md);
  flex-shrink: 0;
}
.type-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
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
```

- [ ] **Step 2: 更新路由指向**

在 `router.ts` 中：
```typescript
// 将 category_tag_view 路由的 component 改为 BilladmCategoryTagSetting
{
  name: '分类标签',
  path: 'category_tag_view',
  component: () => import('@/components/settings_view/BilladmCategoryTagSetting.vue')
}
```

- [ ] **Step 3: 删除 CategoryTagView.vue**

```bash
rm app/src/components/category_tag_view/CategoryTagView.vue
```

如果 `category_tag_view/` 目录变空，也删除目录。

- [ ] **Step 4: 运行类型检查**

Run: `cd app && npx vue-tsc --noEmit 2>&1`
Expected: No errors

- [ ] **Step 5: 提交**

```bash
git add app/src/components/settings_view/BilladmCategoryTagSetting.vue app/src/router/router.ts
git rm app/src/components/category_tag_view/CategoryTagView.vue
git commit -m "refactor: 消除 CategoryTagView 薄壳，类型切换合并至 BilladmCategoryTagSetting"
```

---

### Task 12: 最终验证

- [ ] **Step 1: 完整类型检查**

Run: `cd app && npx vue-tsc --noEmit 2>&1`
Expected: Zero errors

- [ ] **Step 2: 生产构建**

Run: `cd app && npm run build 2>&1`
Expected: Build succeeds with no warnings

- [ ] **Step 3: 确认 components.d.ts 已自动更新**

Run: `cat app/src/types/components.d.ts | grep -E "CategoryTagPanel|CategoryTagView|BilladmButton|BilladmFullScreen|BilladmModal"`
Expected: No matches (所有死代码引用已消失)

- [ ] **Step 4: 最终提交**

```bash
git add .
git commit -m "chore: Phase 3 完成 — 最终验证通过"
```
