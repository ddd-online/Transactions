# 交互设计优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补全缺失的交互状态、统一删除确认模式、增强操作反馈和过渡动效。

**Architecture:** 前端 Vue 3 组件层修改，不涉及后端 API 变更。每个 Task 独立修改 1-3 个文件，`vue-tsc --noEmit` + `npm run build` 验证后提交。

**Tech Stack:** Vue 3 + TypeScript + Ant Design Vue

---

## Phase 1: 安全修复

### Task 1: 事件卡片删除确认

**Files:** Modify `app/src/components/key_event_view/KeyEventList.vue`

- [ ] **Step 1: 为删除按钮包裹 a-popconfirm**

```vue
<!-- 替换原有的 button.event-card-delete -->
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
```

- [ ] **Step 2: 移除 button 的 @click.stop 中的 emit**

button 本身不再 emmit delete，改为 popconfirm 的 @confirm 处理：
```html
<button class="event-card-delete" @click.stop aria-label="删除事件">
```

- [ ] **Step 3: 类型检查 + 构建**

```bash
cd app && npx vue-tsc --noEmit 2>&1 && npm run build 2>&1 | tail -1
```

- [ ] **Step 4: 提交**

```bash
git add app/src/components/key_event_view/KeyEventList.vue
git commit -m "fix: 事件卡片删除前加 popconfirm 确认"
```

---

### Task 2: 关联交易删除确认

**Files:** Modify `app/src/components/key_event_view/KeyEventLinkedTr.vue`

- [ ] **Step 1: 为删除按钮包裹 a-popconfirm**

将模板中的：
```html
<button class="linked-card-delete" @click.stop="$emit('delete', tr.transactionId)" title="删除">
  <DeleteOutlined />
</button>
```
替换为：
```vue
<a-popconfirm
  title="确定删除此关联交易？"
  ok-text="删除"
  cancel-text="取消"
  placement="left"
  @confirm="$emit('delete', tr.transactionId)"
>
  <button class="linked-card-delete" @click.stop aria-label="删除交易">
    <DeleteOutlined />
  </button>
</a-popconfirm>
```

- [ ] **Step 2: 类型检查 + 构建**

```bash
cd app && npx vue-tsc --noEmit 2>&1 && npm run build 2>&1 | tail -1
```

- [ ] **Step 3: 提交**

```bash
git add app/src/components/key_event_view/KeyEventLinkedTr.vue
git commit -m "fix: 关联交易删除前加 popconfirm 确认"
```

---

## Phase 2: 反馈补全

### Task 3: 事件保存成功反馈

**Files:** Modify `app/src/components/key_event_view/KeyEventView.vue`

- [ ] **Step 1: handleSaveContent 加 message.success**

在 `handleSaveContent` 函数中，`keyEventStore.fetchEventByDate` 成功后添加消息：

```typescript
const handleSaveContent = async (content: string) => {
  if (!currentEvent.value) return
  const title = currentEvent.value.title || extractTitle(content)
  try {
    await keyEventStore.saveEvent(selectedDate.value, title, content, currentEvent.value.color)
    await keyEventStore.fetchDatesByYear(selectedYear.value)
    isEditing.value = false
    const updated = await keyEventStore.fetchEventByDate(selectedDate.value)
    currentEvent.value = updated
    message.success('保存成功')
  } catch { /* error handled in store */ }
}
```

需要确保 `message` 已从 `ant-design-vue` 导入。检查 script import 中是否有 `import { message } from 'ant-design-vue'`，若没有则添加。

- [ ] **Step 2: handleAddEvent 加 message.success**

在 `handleAddEvent` 的 `await keyEventStore.fetchDatesByYear` 后添加：
```typescript
message.success('添加成功')
```

- [ ] **Step 3: 类型检查 + 构建**

```bash
cd app && npx vue-tsc --noEmit 2>&1 && npm run build 2>&1 | tail -1
```

- [ ] **Step 4: 提交**

```bash
git add app/src/components/key_event_view/KeyEventView.vue
git commit -m "fix: 事件保存/添加成功后显示 message.success"
```

---

### Task 4: 添加事件弹窗表单校验

**Files:** Modify `app/src/components/key_event_view/KeyEventAddModal.vue`

- [ ] **Step 1: 日期字段即时校验**

将日期字段改为带校验的 form-item，日期不能为空：

```vue
<a-form :model="formData" layout="vertical">
  <a-form-item label="日期" name="date" :rules="[{ required: true, message: '请选择日期' }]">
    <a-date-picker v-model:value="formDate" style="width: 100%" size="large" />
  </a-form-item>
  <a-form-item label="名称" name="title">
    <a-input v-model:value="formTitle" placeholder="事件名称（可选）" :maxlength="200" size="large" />
  </a-form-item>
</a-form>
```

在 script 中添加：
```typescript
import { reactive } from 'vue'
const formData = reactive({ date: '', title: '' })
```

并将 `handleConfirm` 改为先校验：
```typescript
const handleConfirm = () => {
  if (!formDate.value) return
  const date = formDate.value.format('YYYY-MM-DD')
  emit('confirm', date, formTitle.value.trim())
}
```

- [ ] **Step 2: 类型检查 + 构建**

- [ ] **Step 3: 提交**

```bash
git add app/src/components/key_event_view/KeyEventAddModal.vue
git commit -m "fix: 添加事件弹窗加表单即时校验"
```

---

### Task 5: 数据加载状态

**Files:** Modify `app/src/components/tr_view/TransactionRecordView.vue`, `app/src/components/key_event_view/KeyEventLinkedTr.vue`

- [ ] **Step 1: 消费记录加 loading**

TransactionRecordView 已有一处使用了 `tr-total` 控制显示。在 `refreshTable` 开始时加 loading 标记：

模板中包裹 table 区域：
```vue
<a-spin :spinning="tableLoading">
  <div class="tr-content">
    <transaction-record-table ... />
  </div>
</a-spin>
```

script 中添加：
```typescript
const tableLoading = ref(false)

const refreshTable = async () => {
  if (!ledgerStore.currentLedgerId) return
  tableLoading.value = true
  try {
    // ... existing query logic
  } finally {
    tableLoading.value = false
  }
}
```

- [ ] **Step 2: 关联交易加 loading 骨架**

KeyEventLinkedTr 已有 `loading` prop 和 `<a-spin />` 展示。确认其工作正常即可。

- [ ] **Step 3: 类型检查 + 构建**

- [ ] **Step 4: 提交**

```bash
git add app/src/components/tr_view/TransactionRecordView.vue
git commit -m "fix: 消费记录表格数据加载加 a-spin"
```

---

## Phase 3: 交互增强

### Task 6: 键盘焦点样式

**Files:** Modify `app/src/components/key_event_view/KeyEventList.vue`

- [ ] **Step 1: 添加 :focus-visible 样式**

在 `.event-card` 样式后追加：

```css
.event-card:focus-visible {
  outline: 2px solid var(--billadm-color-primary);
  outline-offset: 2px;
  box-shadow: var(--billadm-shadow-md);
}
```

- [ ] **Step 2: 类型检查 + 构建**

- [ ] **Step 3: 提交**

```bash
git add app/src/components/key_event_view/KeyEventList.vue
git commit -m "fix: 事件卡片添加键盘 focus-visible 焦点样式"
```

---

### Task 7: 页面切换过渡动画

**Files:** Modify `app/src/components/Layout.vue`

- [ ] **Step 1: router-view 包裹 Transition**

```vue
<router-view v-slot="{ Component }">
  <Transition name="page-fade" mode="out-in">
    <component :is="Component" class="app-router-view" />
  </Transition>
</router-view>
```

注意：这会将 `.app-router-view` class 从 `router-view` 组件移到了 Transition 内部的 component 上。

- [ ] **Step 2: 添加过渡 CSS**

在 `<style scoped>` 中添加：
```css
.page-fade-enter-active,
.page-fade-leave-active {
  transition: opacity 180ms ease;
}

.page-fade-enter-from,
.page-fade-leave-to {
  opacity: 0;
}
```

- [ ] **Step 3: 修复 router-view class 应用方式**

由于 `app-router-view` 需要应用到路由组件上，确保：
```css
.app-router-view {
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
}
```
改为作用于 `.app-content > .page-fade-enter-active` 或其子元素。最简单的做法是将 flex 样式放在 Transition 包裹的 div 上：

```vue
<router-view v-slot="{ Component }">
  <Transition name="page-fade" mode="out-in">
    <div class="app-router-view" :key="$route.path">
      <component :is="Component" />
    </div>
  </Transition>
</router-view>
```

- [ ] **Step 4: 类型检查 + 构建**

- [ ] **Step 5: 提交**

```bash
git add app/src/components/Layout.vue
git commit -m "feat: 页面切换添加 fade 过渡动画"
```

---

## Phase 4: 动效

### Task 8: 图表数据更新过渡

**Files:** Modify `app/src/components/da_view/BilladmChartView.vue`

- [ ] **Step 1: 图表视图包裹 Transition**

```vue
<Transition name="chart-fade" mode="out-in">
  <BilladmChart v-if="data.length > 0" key="chart" ... />
  <a-empty v-else key="empty" ... />
</Transition>
```

- [ ] **Step 2: 添加过渡 CSS**

```css
.chart-fade-enter-active,
.chart-fade-leave-active {
  transition: opacity 200ms ease;
}
.chart-fade-enter-from,
.chart-fade-leave-to {
  opacity: 0;
}
```

- [ ] **Step 3: 类型检查 + 构建**

- [ ] **Step 4: 提交**

```bash
git add app/src/components/da_view/BilladmChartView.vue
git commit -m "feat: 图表数据更新添加 fade 过渡"
```

---

### Task 9: 分类标签切换过渡

**Files:** Modify `app/src/components/settings_view/CategoryColumn.vue`, `app/src/components/settings_view/TagColumn.vue`

- [ ] **Step 1: CategoryColumn 列表项加 TransitionGroup**

在 `CategoryColumn.vue` 模板中，将分类列表包裹在 `<TransitionGroup>` 中：

```vue
<TransitionGroup name="list-fade" tag="div" class="column-body category-list">
  <div v-for="..." :key="category.name" class="list-item" ...>...</div>
</TransitionGroup>
```

- [ ] **Step 2: TagColumn 同样处理**

- [ ] **Step 3: 添加 TransitionGroup CSS**

在 `CategoryColumn.vue` 和 `TagColumn.vue` 中添加：
```css
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
```

- [ ] **Step 4: 类型检查 + 构建**

- [ ] **Step 5: 提交**

```bash
git add app/src/components/settings_view/CategoryColumn.vue app/src/components/settings_view/TagColumn.vue
git commit -m "feat: 分类标签列表项添加 TransitionGroup 过渡动画"
```

---

### Task 10: 最终验证

- [ ] **Step 1: 完整类型检查**

```bash
cd app && npx vue-tsc --noEmit 2>&1
```
Expected: Zero errors

- [ ] **Step 2: 生产构建**

```bash
cd app && npm run build 2>&1 | tail -1
```
Expected: ✓ built

- [ ] **Step 3: 提交**

```bash
git add .
git commit -m "chore: IxD 优化全部完成，最终验证通过"
```

---

## 不变约束

- 不修改后端 API
- 不修改 CSS 设计 token
- 每 Task 独立可验证
- `vue-tsc --noEmit` 零错误
- `npm run build` 通过
