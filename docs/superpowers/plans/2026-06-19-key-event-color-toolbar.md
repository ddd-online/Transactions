# 关键事件颜色设置重构 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将颜色选择从添加事件弹窗移至中栏详情顶部，增加"不设置颜色"选项，颜色切换即时保存。

**Architecture:** 三个 Vue 组件的改动：KeyEventAddModal 移除颜色选择 UI、KeyEventDetail 新增颜色工具栏、KeyEventView 适配数据流。无后端/数据库变更。

**Tech Stack:** Vue 3 + TypeScript, Ant Design Vue, Pinia

---

### Task 1: 精简 KeyEventAddModal — 移除颜色选择器

**Files:**
- Modify: `app/src/components/key_event_view/KeyEventAddModal.vue`

- [ ] **Step 1: 移除模板中的颜色选择区域**

删除 `<label class="form-label">颜色</label>` 和 `<div class="color-picker">...</div>` 整块区域。

```vue
<template>
  <a-modal
    :open="open"
    title="添加事件"
    ok-text="确认"
    cancel-text="取消"
    centered
    :width="360"
    :confirm-loading="loading"
    @ok="handleConfirm"
    @cancel="$emit('close')"
  >
    <div class="add-event-form">
      <label class="form-label">日期</label>
      <a-date-picker v-model:value="formDate" style="width: 100%" size="large" />

      <label class="form-label">名称</label>
      <a-input v-model:value="formTitle" placeholder="事件名称（可选）" :maxlength="200" size="large" />
    </div>
  </a-modal>
</template>
```

- [ ] **Step 2: 移除不再使用的 script 代码**

删除 `EVENT_COLORS` 常量、`DEFAULT_COLOR` 常量、`formColor` ref、`CheckOutlined` import，以及 `emit` 类型定义中的 `color` 参数。

```typescript
<script setup lang="ts">
import { ref, watch } from 'vue';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';

interface Props {
  open: boolean;
  loading: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'confirm', date: string, title: string): void;
  (e: 'close'): void;
}>();

const formDate = ref<Dayjs>(dayjs());
const formTitle = ref('');

watch(
  () => props.open,
  (val) => {
    if (val) {
      formDate.value = dayjs();
      formTitle.value = '';
    }
  },
);

const handleConfirm = () => {
  if (!formDate.value) return
  const date = formDate.value.format('YYYY-MM-DD');
  emit('confirm', date, formTitle.value.trim());
};
</script>
```

- [ ] **Step 3: 精简样式 — 移除颜色选择器相关 CSS**

删除 `.color-picker`、`.color-swatch`、`.color-swatch:hover`、`.color-swatch.is-selected`、`.check-icon` 样式规则。保留 `.add-event-form`、`.form-label`。

当前移除的样式选择器：
```css
.color-picker { ... }
.color-swatch { ... }
.color-swatch:hover { ... }
.color-swatch.is-selected { ... }
.check-icon { ... }
```

（`<style scoped>` 块中仅保留 `.add-event-form` 和 `.form-label` 规则）

- [ ] **Step 4: 验证弹窗功能**

Run: `cd app && npm run dev`
Expected: 打开添加事件弹窗，只显示日期选择器和名称输入框，确认按钮正常创建事件。

- [ ] **Step 5: Commit**

```bash
git add app/src/components/key_event_view/KeyEventAddModal.vue
git commit -m "refactor: 从添加事件弹窗中移除颜色设置功能"
```

---

### Task 2: KeyEventView — 适配添加事件调用

**Files:**
- Modify: `app/src/components/key_event_view/KeyEventView.vue`

- [ ] **Step 1: 修改 handleAddEvent 不再传递 color**

将 `handleAddEvent` 的参数从 `(date, title, color)` 改为 `(date, title)`，调用 `saveEvent` 时 color 传空字符串。

找到第 203-216 行：

```typescript
const handleAddEvent = async (date: string, title: string, color: string) => {
  addModalLoading.value = true
  try {
    await keyEventStore.saveEvent(date, title, '', color)
    addModalOpen.value = false
    // 刷新列表并选中新事件
    await keyEventStore.fetchDatesByYear(selectedYear.value)
    onSelectEvent(date)
  } catch {
    /* error handled in store */
  } finally {
    addModalLoading.value = false
  }
}
```

改为：

```typescript
const handleAddEvent = async (date: string, title: string) => {
  addModalLoading.value = true
  try {
    await keyEventStore.saveEvent(date, title, '', '')
    addModalOpen.value = false
    // 刷新列表并选中新事件
    await keyEventStore.fetchDatesByYear(selectedYear.value)
    onSelectEvent(date)
  } catch {
    /* error handled in store */
  } finally {
    addModalLoading.value = false
  }
}
```

- [ ] **Step 2: 新增 handleColorChange 方法**

在 `handleAddEvent` 方法之后（第 216 行之后），添加颜色变更处理函数：

```typescript
const handleColorChange = async (color: string) => {
  if (!currentEvent.value) return
  const title = currentEvent.value.title || ''
  const content = currentEvent.value.content || ''
  try {
    await keyEventStore.saveEvent(selectedDate.value, title, content, color)
    // 刷新本地状态
    currentEvent.value = { ...currentEvent.value, color }
    // 刷新列表以同步颜色
    await keyEventStore.fetchDatesByYear(selectedYear.value)
  } catch {
    /* error handled in store */
  }
}
```

- [ ] **Step 3: 在 KeyEventDetail 模板绑定中新增 color-change 事件**

在第 27-29 行的 `<KeyEventDetail>` 标签中新增 `@color-change` 事件绑定：

```html
<KeyEventDetail
  class="panel-center"
  :event="currentEvent"
  :images="keyEventStore.images"
  :is-editing="isEditing"
  @edit="isEditing = true"
  @save="handleSaveContent"
  @cancel-edit="isEditing = false"
  @add-image="handleAddImage"
  @delete-image="handleDeleteImage"
  @color-change="handleColorChange"
/>
```

- [ ] **Step 4: 验证编译通过**

Run: `cd app && npx vue-tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 5: Commit**

```bash
git add app/src/components/key_event_view/KeyEventView.vue
git commit -m "feat: 关键事件视图适配颜色设置重构 — 新增 handleColorChange，简化 handleAddEvent"
```

---

### Task 3: KeyEventDetail — 新增颜色设置工具栏

**Files:**
- Modify: `app/src/components/key_event_view/KeyEventDetail.vue`

- [ ] **Step 1: 模板 — 在图片画廊上方添加颜色选择栏**

在 `<KeyEventImageGallery>` 之前插入颜色选择栏（仅在 `event` 存在时渲染）：

```html
<!-- 颜色选择栏 -->
<div v-if="event" class="color-toolbar">
  <div
    v-for="c in EVENT_COLORS"
    :key="c"
    class="color-swatch"
    :class="{ 'is-selected': event.color === c }"
    :style="{ backgroundColor: c }"
    :title="c"
    @click="$emit('color-change', c)"
  />
  <!-- 虚线空白圆：表示不设置颜色 -->
  <div
    class="color-swatch color-swatch-empty"
    :class="{ 'is-selected': !event.color }"
    title="使用默认颜色"
    @click="$emit('color-change', '')"
  />
</div>
```

- [ ] **Step 2: Script — 定义颜色常量 + 新增 emit**

在 `<script setup>` 中定义 `EVENT_COLORS` 常量，并在 `defineEmits` 中新增 `color-change` 事件：

```typescript
<script setup lang="ts">
import { ref, watch } from 'vue';
import type { KeyEvent, KeyEventImage } from '@/types/billadm';

const EVENT_COLORS = [
  '#D9705A', '#E89280', '#4A8C6F', '#6BAA8C',
  '#5C8DB5', '#7EABCC', '#C6963A', '#8C7B6E',
  '#9E8C7E', '#6B9E7E',
  '#8C6B9E', '#A88CC0', '#C68E30', '#D4A84B',
  '#5C9EA8', '#7EB8C2', '#B89A80', '#CCB098',
  '#7E8C94', '#9EAAB0',
];

interface Props {
  event: KeyEvent | null;
  images: KeyEventImage[];
  isEditing: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'edit'): void;
  (e: 'save', content: string): void;
  (e: 'cancel-edit'): void;
  (e: 'add-image', file: File): void;
  (e: 'delete-image', imageId: string): void;
  (e: 'color-change', color: string): void;
}>();
```

- [ ] **Step 3: 样式 — 添加颜色工具栏 CSS**

在 `<style scoped>` 中添加颜色栏和色块样式：

```css
/* ========== 颜色工具栏 ========== */
.color-toolbar {
  display: flex;
  flex-direction: row;
  gap: 6px;
  flex-wrap: wrap;
  padding-bottom: var(--billadm-space-sm);
  border-bottom: 1px solid var(--billadm-color-divider);
  margin-bottom: var(--billadm-space-sm);
  flex-shrink: 0;
}

.color-swatch {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: box-shadow var(--billadm-transition-fast),
              border-color var(--billadm-transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.color-swatch:hover {
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.3);
}

.color-swatch.is-selected {
  border-color: #000;
}

.color-swatch-empty {
  border: 2px dashed var(--billadm-color-text-disabled);
  background-color: transparent;
}

.color-swatch-empty.is-selected {
  border-style: solid;
  border-color: #000;
}
```

- [ ] **Step 4: 验证类型检查**

Run: `cd app && npx vue-tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 5: 功能验证**

Run: `cd app && npm run dev`

测试场景：
1. 选中一个有颜色的事件 → 颜色栏显示，对应色块高亮
2. 点击不同颜色块 → 事件颜色即时更新，列表中的色条同步变化
3. 选中一个无颜色事件 → 虚线圆呈选中态
4. 点击虚线圆 → 事件颜色变为默认，列表中的色条回退到默认色
5. 未选中任何事件 → 颜色栏不显示

- [ ] **Step 6: Commit**

```bash
git add app/src/components/key_event_view/KeyEventDetail.vue
git commit -m "feat: 关键事件详情顶部新增颜色设置工具栏，支持即时切换和默认颜色"
```
