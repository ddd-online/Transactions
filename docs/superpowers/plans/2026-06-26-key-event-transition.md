# 关键事件切换过渡动效 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 事件切换时先清空旧数据，再有节奏地闪入新内容，消除图片延迟感和生硬切换。

**Architecture:** onSelectEvent 改为 await 全部异步请求（先事件→再图片→最后交易）。详情面板包裹 Vue `<Transition>` 实现 scale+opacity 切换。画廊和交易卡片各自管理加载态和 staggered 入场。

**Tech Stack:** Vue 3 `<Transition>`, CSS animation, Ant Design Vue

## Global Constraints

- 不改变 Go 后端
- 不改变 store 结构
- 不改变上传逻辑
- 不改变三栏布局
- 闪出 150ms ease，闪入 300ms cubic-bezier(0.25, 1, 0.5, 1)
- detail-panel 闪出 scale(0.98)+opacity(0)，闪入 scale(1)+opacity(1)

---
---

### Task 1: KeyEventView.vue — onSelectEvent await 改造

**Files:**
- Modify: `app/src/components/key_event_view/KeyEventView.vue:115-126`

**Interfaces:**
- Produces: `imagesLoading: Ref<boolean>`、`trsLoading: Ref<boolean>` — 传给 KeyEventDetail 和 KeyEventLinkedTr

- [ ] **Step 1: 新增 loading 状态变量**

在 `const isEditing = ref(false)` 之后（第 102 行后）添加：

```typescript
const imagesLoading = ref(false)
const trsLoading = ref(false)
```

- [ ] **Step 2: 重写 onSelectEvent**

替换第 115-126 行的 `onSelectEvent`：

```typescript
const onSelectEvent = async (date: string) => {
  // 立即清空旧数据
  selectedDate.value = date
  isEditing.value = false
  currentEvent.value = null
  keyEventStore.clearImages()
  linkedTransactions.value = []
  appDataStore.setStatistics({ income: 0, expense: 0, transfer: 0 })
  imagesLoading.value = true
  trsLoading.value = false

  try {
    // 第1步：获取事件内容
    const event = await keyEventStore.fetchEventByDate(date)
    currentEvent.value = event

    // 第2步：获取图片
    if (event) {
      trsLoading.value = true
      imagesLoading.value = true
      await keyEventStore.fetchImages(date)
      imagesLoading.value = false

      // 第3步：获取关联交易
      await loadLinkedTransactions(date)
      trsLoading.value = false
    }
  } catch {
    currentEvent.value = null
    imagesLoading.value = false
    trsLoading.value = false
  }
}
```

- [ ] **Step 3: 修改模板中 KeyEventDetail 的 props 绑定**

在模板中 `KeyEventDetail` 标签上增加 `:loading="imagesLoading"`：

```vue
<KeyEventDetail
  class="panel-center"
  :event="currentEvent"
  :images="keyEventStore.images"
  :is-editing="isEditing"
  :loading="imagesLoading"
  :progress="uploadProgress"
  @edit="isEditing = true"
  @save="handleSaveContent"
  @cancel-edit="isEditing = false"
  @add-images="handleAddImages"
  @delete-image="handleDeleteImage"
  @color-change="handleColorChange"
  @retry-upload="handleRetryUpload"
  @skip-upload="handleSkipUpload"
/>
```

- [ ] **Step 4: 修改模板中 KeyEventLinkedTr 的 props 绑定**

在模板中 `KeyEventLinkedTr` 标签上将 `:loading="linkedLoading"` 改为 `:loading="trsLoading"`：

```vue
<KeyEventLinkedTr
  class="panel-right"
  :transactions="linkedTransactions"
  :loading="trsLoading"
  :has-selection="!!selectedDate"
  @delete="handleUnlinkTr"
/>
```

- [ ] **Step 5: 清理 linkedLoading ref**

删除 `const linkedLoading = ref(false)`（第 309 行），`loadLinkedTransactions` 中移除 `linkedLoading.value = true/false`，函数现在只负责数据获取不负责 loading 状态：

```typescript
const loadLinkedTransactions = async (date: string) => {
  try {
    linkedTransactions.value = await getLinkedTransactions(date)
    let income = 0, expense = 0, transfer = 0
    for (const t of linkedTransactions.value) {
      if (t.transactionType === 'income') income += t.price
      else if (t.transactionType === 'expense') expense += t.price
      else if (t.transactionType === 'transfer') transfer += t.price
    }
    appDataStore.setStatistics({ income, expense, transfer })
  } catch {
    linkedTransactions.value = []
  }
}
```

- [ ] **Step 6: 验证编译通过**

```bash
cd app && npx vue-tsc --noEmit --project tsconfig.json
```

- [ ] **Step 7: Commit**

```bash
git add app/src/components/key_event_view/KeyEventView.vue
git commit -m "feat: onSelectEvent 改为 await 全部请求，新增 imagesLoading/trsLoading 状态"
```

---

### Task 2: KeyEventDetail.vue — Transition 包裹 + 骨架屏

**Files:**
- Modify: `app/src/components/key_event_view/KeyEventDetail.vue`

**Interfaces:**
- Consumes: `loading?: boolean` — 新增 prop，来自 Task 1 的 `imagesLoading`
- Produces: `<Transition name="panel">` 包裹 detail-panel 内容

- [ ] **Step 1: 新增 loading prop**

在 Props 接口中添加 `loading`：

```typescript
interface Props {
  event: KeyEvent | null;
  images: KeyEventImage[];
  isEditing: boolean;
  loading?: boolean;
  progress?: UploadProgress;
}
```

- [ ] **Step 2: 包裹事件内容区域**

将模板中 `<template v-else>` 内的内容（第 10-90 行区域，颜色栏+画廊+描述+底部栏）用 `<Transition name="panel">` 包裹：

注意 `<Transition>` 需要单个根元素。当前 v-else 内的内容已经是多个元素。需要在颜色栏、画廊、描述、底部栏外面包一层 `<div>` 或使用 `<TransitionGroup>`。

最简单的方式：在 `v-else` 内将 `<div class="detail-panel">` 的子内容改为：

```vue
<template v-else>
  <Transition name="panel" mode="out-in">
    <div v-if="!loading && event" key="content" class="panel-body">
      <!-- 颜色选择栏 -->
      <div class="color-toolbar">...</div>
      <!-- 图片画廊 -->
      <KeyEventImageGallery ... />
      <!-- 描述区域 -->
      <div class="detail-description">...</div>
      <!-- 底部操作栏 -->
      <div class="detail-footer">...</div>
    </div>
    <div v-else key="loading" class="panel-loading">
      <!-- 骨架屏 -->
      <div class="skeleton-block skeleton-colors" />
      <div class="skeleton-gallery">
        <div class="skeleton-gallery-main" />
        <div class="skeleton-gallery-thumbs">
          <div class="skeleton-thumb" />
          <div class="skeleton-thumb" />
        </div>
      </div>
      <div class="skeleton-block skeleton-desc" />
    </div>
  </Transition>
</template>
```

- [ ] **Step 3: 添加 Transition CSS**

在 `<style scoped>` 末尾添加：

```css
/* ========== 面板过渡 ========== */
.panel-enter-active {
  transition: opacity 300ms cubic-bezier(0.25, 1, 0.5, 1),
              transform 300ms cubic-bezier(0.25, 1, 0.5, 1);
}
.panel-leave-active {
  transition: opacity 150ms ease,
              transform 150ms ease;
}
.panel-enter-from {
  opacity: 0;
  transform: scale(0.98);
}
.panel-leave-to {
  opacity: 0;
  transform: scale(0.98);
}

/* ========== 骨架屏 ========== */
.panel-body {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.panel-loading {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: var(--billadm-space-sm);
  padding: var(--billadm-space-md);
}

.skeleton-block {
  border-radius: var(--billadm-radius-md);
  background: var(--billadm-color-minor-background);
  animation: panel-shimmer 1.5s ease-in-out infinite;
}

.skeleton-colors {
  height: 28px;
  width: 60%;
}

.skeleton-gallery {
  flex: 1;
  display: flex;
  gap: 8px;
  min-height: 0;
}

.skeleton-gallery-main {
  flex: 1;
  border-radius: var(--billadm-radius-md);
  background: var(--billadm-color-minor-background);
  animation: panel-shimmer 1.5s ease-in-out infinite;
}

.skeleton-gallery-thumbs {
  width: 160px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.skeleton-thumb {
  height: 90px;
  border-radius: var(--billadm-radius-sm);
  background: var(--billadm-color-minor-background);
  animation: panel-shimmer 1.5s ease-in-out infinite;
}

.skeleton-desc {
  height: 80px;
}

@keyframes panel-shimmer {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

- [ ] **Step 4: 验证编译通过**

```bash
cd app && npx vue-tsc --noEmit --project tsconfig.json
```

- [ ] **Step 5: Commit**

```bash
git add app/src/components/key_event_view/KeyEventDetail.vue
git commit -m "feat: KeyEventDetail 添加 panel Transition + 骨架屏 loading 态"
```

---

### Task 3: KeyEventImageGallery.vue — 清空 + 骨架 + stagger

**Files:**
- Modify: `app/src/components/key_event_view/KeyEventImageGallery.vue`

**Interfaces:**
- 无新增 prop — 通过 watch `props.images` 的变化来处理切换

- [ ] **Step 1: 修改 watch 以在图片清空时立即清空选中**

已有的 watch 会在 `imgs.length === 0` 时设置 `selectedId = ''`，这已经处理了清空。但需要确保切换时预览也关闭：

在 watch 的 `imgs.length === 0` 分支中增加 `previewVisible.value = false`：

```typescript
watch(
  () => props.images,
  (imgs) => {
    if (imgs.length === 0) {
      selectedId.value = ''
      previewVisible.value = false
      return
    }
    if (!imgs.find(i => i.id === selectedId.value)) {
      selectedId.value = imgs[0]!.id
    }
  },
  { immediate: true, deep: true }
)
```

- [ ] **Step 2: 缩略图添加 staggered 入场动画**

为每个缩略图添加动态 `style` 设置 `transition-delay`：

```vue
<div
  v-for="(img, index) in images"
  :key="img.id"
  class="thumb-item"
  :class="{ 'is-selected': selectedId === img.id, 'thumb-enter': true }"
  :style="{ transitionDelay: `${Math.min(index * 50, 300)}ms` }"
  @click="selectedId = img.id"
>
```

- [ ] **Step 3: 添加 thumb-item 入场 CSS**

在 `<style scoped>` 中添加：

```css
.thumb-item {
  /* ...existing... */
  transition: border-color var(--billadm-transition-smooth),
              box-shadow var(--billadm-transition-smooth),
              transform var(--billadm-transition-fast),
              opacity 300ms cubic-bezier(0.25, 1, 0.5, 1);
}

/* 入场初始态（由 JS 通过 class 或 Vue Transition 触发） */
.thumb-enter {
  animation: thumb-fade-in 350ms cubic-bezier(0.25, 1, 0.5, 1) both;
}

@keyframes thumb-fade-in {
  from {
    opacity: 0;
    transform: translateX(8px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
```

- [ ] **Step 4: 大图添加 fade 过渡**

大图已用 `a-image`，添加 CSS 过渡：

```css
.gallery-main :deep(.ant-image-img) {
  object-fit: cover;
  animation: main-fade-in 400ms cubic-bezier(0.25, 1, 0.5, 1) both;
}

@keyframes main-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

- [ ] **Step 5: 验证编译通过**

```bash
cd app && npx vue-tsc --noEmit --project tsconfig.json
```

- [ ] **Step 6: Commit**

```bash
git add app/src/components/key_event_view/KeyEventImageGallery.vue
git commit -m "feat: KeyEventImageGallery 切换时清空预览 + staggered 缩略图入场 + 大图 fade"
```

---

### Task 4: KeyEventLinkedTr.vue — 卡片 staggered 淡入

**Files:**
- Modify: `app/src/components/key_event_view/KeyEventLinkedTr.vue`

**Interfaces:**
- Consumes: `transactions` prop — 当 Task 1 清空 `linkedTransactions` 后卡片消失，数据到达后卡片入场

- [ ] **Step 1: 卡片增加 staggered delay**

在第 20 行 `v-for` 的卡片 div 上添加动态 delay：

```vue
<div
  v-for="(tr, index) in transactions"
  :key="tr.transactionId"
  class="linked-card card-enter"
  :style="{ animationDelay: `${Math.min(index * 40, 280)}ms` }"
>
```

- [ ] **Step 2: 添加卡片入场动画 CSS**

在 `<style scoped>` 中 `.linked-card` 部分之后添加：

```css
/* ========== 卡片 staggered 入场 ========== */
.card-enter {
  animation: card-fade-up 300ms cubic-bezier(0.25, 1, 0.5, 1) both;
}

@keyframes card-fade-up {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

- [ ] **Step 3: 验证编译通过**

```bash
cd app && npx vue-tsc --noEmit --project tsconfig.json
```

- [ ] **Step 4: Commit**

```bash
git add app/src/components/key_event_view/KeyEventLinkedTr.vue
git commit -m "feat: KeyEventLinkedTr 卡片 staggered fade-up 入场动效"
```

---

### Task 5: 整体验证

- [ ] **Step 1: 完整构建**

```bash
cd app && npm run build
```

- [ ] **Step 2: Go 测试**

```bash
cd kernel && go test ./...
```

- [ ] **Step 3: 更新 .wolf/anatomy.md 和 .wolf/memory.md**

```bash
git add .wolf/anatomy.md .wolf/memory.md
git commit -m "chore: 记录关键事件过渡动效实施完成"
```
