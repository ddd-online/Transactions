# Frontend 重构设计文档

> 日期: 2026-06-19 | 状态: 实施中

## 目标

删除冗余代码，提取公共逻辑，拆分大文件，优化组件结构。

## Phase 1: 公共逻辑提取

### 1a. `useCategoryTags` Composable

**问题**: "选择交易类型 → 加载分类 → 选择分类 → 加载标签" 模式在 4 个组件中重复。

**方案**: 新建 `app/src/hooks/useCategoryTags.ts`

```ts
interface UseCategoryTagsOptions {
  ledgerId: Ref<string | undefined>
}

function useCategoryTags(options: UseCategoryTagsOptions) {
  const categories = ref<DefaultOptionType[]>([])
  const tags = ref<DefaultOptionType[]>([])

  async function loadCategories(transactionType: string): Promise<void>
  async function loadTags(category: string, transactionType: string): Promise<void>
  function reset(): void

  return { categories, tags, loadCategories, loadTags, reset }
}
```

**影响范围**: `BilladmCategoryTagSetting`, `TransactionRecordView`, `TransactionRecordFilter`, `BilladmChartLines`

### 1b. 错误处理简化

移除 `functions.ts` 中每个函数重复的 try/catch + Notification 样板代码，保持现有行为不变。

## Phase 2: 大文件拆分

### 2a. BilladmCategoryTagSetting.vue (651行 → ~150行)

| 子组件 | 职责 | 预估行数 |
|--------|------|----------|
| `CategoryColumn.vue` | 左侧分类列：列表渲染、移动、删除 | ~200 |
| `TagColumn.vue` | 右侧标签列：列表渲染、移动、删除 | ~160 |
| `BilladmCategoryTagSetting.vue` | 编排层：状态管理、弹窗控制 | ~150 |

### 2b. TransactionRecordView.vue (579行 → ~300行)

| 子组件 | 职责 | 预估行数 |
|--------|------|----------|
| `TrEditModal.vue` | 编辑/新建表单弹窗（模板、类型、分类、标签、金额等） | ~250 |
| `TrSortModal.vue` | 多字段排序弹窗 | ~90 |

## Phase 3: 组件结构优化

### 3a. 消除 CategoryTagView 薄壳

- `CategoryTagView.vue` 将类型切换按钮合并进 `BilladmCategoryTagSetting.vue`
- 直接在路由中使用 `BilladmCategoryTagSetting`，删除 `category_tag_view/` 目录

### 3b. 命名一致性（暂缓）

## 不变约束

- 保持现有功能行为完全相同
- 保持现有 CSS 设计 token 不修改
- `npm run build` 和 `vue-tsc --noEmit` 零错误
- 每阶段完成立即提交
