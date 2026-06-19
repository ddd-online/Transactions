# 关键记录页面三栏布局重构 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 KeyEventView 从日历+弹窗模式重构为左中右三栏面板布局

**Architecture:** KeyEventView 作为三栏容器 + 年份导航；拆分为 KeyEventList（左栏事件列表）、KeyEventDetail（中栏图片+描述+编辑）、KeyEventAddModal（添加事件弹窗）；关联交易从弹窗 Tab 移至右栏 KeyEventLinkedTr 组件。三栏高度撑满可用空间，栏内独立滚动。

**Tech Stack:** Vue 3 Composition API + TypeScript + Ant Design Vue + Pinia (keyEventStore)

---

### 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `app/src/stores/keyEventStore.ts` | 修改 | 新增 `events` 缓存完整事件列表（含 content） |
| `app/src/components/key_event_view/KeyEventList.vue` | 新建 | 左栏：事件卡片列表（按日期倒序）+ 添加按钮 |
| `app/src/components/key_event_view/KeyEventDetail.vue` | 新建 | 中栏：图片宫格 + 文字描述（查看/编辑双模式） |
| `app/src/components/key_event_view/KeyEventLinkedTr.vue` | 新建 | 右栏：关联交易卡片列表 + 删除 |
| `app/src/components/key_event_view/KeyEventAddModal.vue` | 新建 | 添加事件弹窗：日期 + 名称 + 颜色 |
| `app/src/components/key_event_view/KeyEventView.vue` | 重写 | 三栏容器 + 年份导航 + 状态协调 |

---

### Task 1: 扩展 keyEventStore 缓存完整事件列表

**Files:**
- Modify: `app/src/stores/keyEventStore.ts`

- [ ] **Step 1: 新增 events 状态和 getEvents 方法**

在 `keyEventStore.ts` 中，在 `images` ref 下方新增：

```typescript
// 完整事件列表缓存（用于左栏列表展示）
const events = ref<KeyEvent[]>([]);
```

在 `fetchDatesByYear` 函数中，`currentYear.value = year;` 之前添加：

```typescript
events.value = events;
```

在 `saveEvent` 成功后，`colors.value.set(date, color);` 之后添加刷新逻辑——保存后需要重新 fetch 整个列表以获取最新排序：

```typescript
// saveEvent 内已更新 datesWithRecords / titles / colors，
// 但 events 列表需要重新拉取以保持排序正确。
// 调用方应在 saveEvent 成功后调用 fetchDatesByYear 刷新。
```

在 `deleteEvent` 成功后，`colors.value.delete(date);` 之后添加：

```typescript
events.value = events.value.filter(e => e.date !== date);
```

在 `return` 对象中新增导出：

```typescript
events,
```

> **说明**：`events` 缓存 `fetchDatesByYear` 返回的完整 `KeyEvent[]`，左栏可直接使用，无需额外 API 调用。`KeyEvent` 类型已包含 `date`, `title`, `content`, `color` 字段。

- [ ] **Step 2: 类型检查验证**

```bash
cd app && npx vue-tsc --noEmit --pretty false 2>&1 | tail -5
```

预期：无错误输出

- [ ] **Step 3: Commit**

```bash
git add app/src/stores/keyEventStore.ts
git commit -m "feat: keyEventStore 新增 events 缓存完整事件列表"
```

---

### Task 2: 创建 KeyEventList.vue（左栏事件列表）

**Files:**
- Create: `app/src/components/key_event_view/KeyEventList.vue`

- [ ] **Step 1: 编写组件**

```vue
<template>
  <div class="event-list-panel">
    <!-- 空状态 -->
    <div v-if="sortedEvents.length === 0" class="panel-empty">
      <span>暂无事件记录</span>
    </div>

    <!-- 事件卡片列表 -->
    <div v-else class="event-cards">
      <div
        v-for="event in sortedEvents"
        :key="event.date"
        class="event-card"
        :class="{ 'is-active': event.date === selectedDate }"
        :style="{ '--event-color': event.color || '#4A8C6F' }"
        @click="$emit('select', event.date)"
      >
        <div class="event-card-bar"></div>
        <div class="event-card-body">
          <span class="event-card-name">{{ event.title || event.date }}</span>
          <span class="event-card-date">{{ formatShortDate(event.date) }}</span>
          <span class="event-card-desc" v-if="event.content">{{ truncate(event.content, 30) }}</span>
        </div>
      </div>
    </div>

    <!-- 添加按钮 -->
    <div class="panel-footer">
      <a-button type="dashed" block @click="$emit('add-event')">
        <template #icon><PlusOutlined /></template>
        添加事件
      </a-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { PlusOutlined } from '@ant-design/icons-vue'
import type { KeyEvent } from '@/types/billadm'

const props = defineProps<{
  events: KeyEvent[]
  selectedDate: string
}>()

defineEmits<{
  (e: 'select', date: string): void
  (e: 'add-event'): void
}>()

const sortedEvents = computed(() =>
  [...props.events].sort((a, b) => b.date.localeCompare(a.date))
)

const formatShortDate = (date: string): string => {
  const parts = date.split('-')
  return `${parseInt(parts[1])}-${parseInt(parts[2])}`
}

const truncate = (text: string, max: number): string =>
  text.length > max ? text.slice(0, max) + '…' : text
</script>

<style scoped>
.event-list-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  border-right: 1px solid var(--billadm-color-divider);
  background-color: var(--billadm-color-major-background);
}

.panel-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--billadm-color-text-disabled);
  font-size: var(--billadm-size-text-body);
}

.event-cards {
  flex: 1;
  overflow-y: auto;
  padding: var(--billadm-space-xs);
}

.event-card {
  display: flex;
  align-items: stretch;
  border-radius: var(--billadm-radius-md);
  overflow: hidden;
  cursor: pointer;
  transition: background-color var(--billadm-transition-fast);
}

.event-card:hover {
  background-color: var(--billadm-color-hover-bg);
}

.event-card.is-active {
  background-color: var(--billadm-color-active-bg);
}

.event-card-bar {
  width: 4px;
  flex-shrink: 0;
  background-color: var(--event-color);
  border-radius: 2px 0 0 2px;
}

.event-card-body {
  flex: 1;
  padding: var(--billadm-space-sm) var(--billadm-space-md);
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.event-card-name {
  font-size: var(--billadm-size-text-body-sm);
  font-weight: 500;
  color: var(--billadm-color-text-major);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.event-card-date {
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-secondary);
  font-variant-numeric: tabular-nums;
}

.event-card-desc {
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-disabled);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}

.panel-footer {
  padding: var(--billadm-space-sm);
  border-top: 1px solid var(--billadm-color-divider);
}
</style>
```

- [ ] **Step 2: 验证使用到的 types 导入正确**

KeyEvent 类型已存在于 `@/types/billadm`，包含 `date`, `title`, `content`, `color` 字段。

- [ ] **Step 3: Commit**

```bash
git add app/src/components/key_event_view/KeyEventList.vue
git commit -m "feat: 新增 KeyEventList 左栏事件列表组件"
```

---

### Task 3: 创建 KeyEventDetail.vue（中栏事件详情）

**Files:**
- Create: `app/src/components/key_event_view/KeyEventDetail.vue`

- [ ] **Step 1: 编写组件**

```vue
<template>
  <div class="detail-panel">
    <!-- 未选中事件 -->
    <div v-if="!event" class="panel-empty">
      <span>选择左侧事件查看详情</span>
    </div>

    <template v-else>
      <!-- 图片宫格 -->
      <div class="detail-images">
        <div class="image-grid" v-if="images.length > 0 || true">
          <div
            v-for="img in images"
            :key="img.id"
            class="image-thumb"
          >
            <a-image
              :src="img.data"
              :preview="true"
              width="100%"
              height="120px"
              style="object-fit: cover; border-radius: 4px;"
            />
            <a-button
              type="text"
              danger
              size="small"
              class="image-delete-btn"
              @click="$emit('delete-image', img.id)"
            >
              <template #icon><CloseOutlined /></template>
            </a-button>
          </div>
          <!-- 添加图片按钮 -->
          <div class="image-thumb image-add" @click="triggerFileInput" @paste="handlePaste">
            <PlusOutlined />
            <input
              ref="fileInputRef"
              type="file"
              accept="image/*"
              multiple
              style="display: none"
              @change="handleFileSelect"
            />
          </div>
        </div>
      </div>

      <!-- 描述区域 -->
      <div class="detail-description">
        <div class="description-header">
          <span class="description-label">描述</span>
          <a-button v-if="!isEditing" type="link" size="small" @click="$emit('edit')">
            编辑
          </a-button>
        </div>

        <!-- 查看模式 -->
        <div v-if="!isEditing" class="description-content">
          <p v-if="event.content" class="description-text">{{ event.content }}</p>
          <span v-else class="description-placeholder">暂无描述</span>
        </div>

        <!-- 编辑模式 -->
        <div v-else class="description-edit">
          <a-textarea
            v-model:value="localContent"
            placeholder="记录今天发生的事情..."
            :rows="8"
            :maxlength="5000"
            show-count
          />
          <div class="description-actions">
            <a-button @click="$emit('cancel-edit')">取消</a-button>
            <a-button type="primary" @click="$emit('save', localContent)">保存</a-button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { PlusOutlined, CloseOutlined } from '@ant-design/icons-vue'
import type { KeyEvent, KeyEventImage } from '@/types/billadm'

const props = defineProps<{
  event: KeyEvent | null
  images: KeyEventImage[]
  isEditing: boolean
}>()

const emit = defineEmits<{
  (e: 'edit'): void
  (e: 'save', content: string): void
  (e: 'cancel-edit'): void
  (e: 'add-image', file: File): void
  (e: 'delete-image', imageId: string): void
}>()

const localContent = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)

watch(
  () => props.event?.content,
  (val) => { localContent.value = val || '' }
)

const triggerFileInput = () => {
  fileInputRef.value?.click()
}

const handleFileSelect = (event: Event) => {
  const input = event.target as HTMLInputElement
  const files = input.files
  if (!files) return
  for (const file of files) {
    emit('add-image', file)
  }
  input.value = ''
}

const handlePaste = (event: ClipboardEvent) => {
  const items = event.clipboardData?.items
  if (!items) return
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) emit('add-image', file)
    }
  }
}
</script>

<style scoped>
.detail-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  padding: var(--billadm-space-md);
  background-color: var(--billadm-color-major-background);
}

.panel-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--billadm-color-text-disabled);
  font-size: var(--billadm-size-text-body);
}

/* 图片宫格 */
.detail-images {
  margin-bottom: var(--billadm-space-md);
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.image-thumb {
  position: relative;
  border-radius: var(--billadm-radius-sm);
  overflow: hidden;
  aspect-ratio: 4 / 3;
}

.image-thumb :deep(.ant-image) {
  display: block;
}

.image-delete-btn {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 20px;
  height: 20px;
  padding: 0;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity var(--billadm-transition-fast);
}

.image-thumb:hover .image-delete-btn {
  opacity: 1;
}

.image-delete-btn :deep(.anticon) {
  color: #fff;
  font-size: 10px;
}

.image-add {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--billadm-color-window-border);
  color: var(--billadm-color-text-secondary);
  cursor: pointer;
  font-size: 20px;
  transition: border-color var(--billadm-transition-fast),
              background-color var(--billadm-transition-fast);
}

.image-add:hover {
  border-color: var(--billadm-color-primary);
  background-color: var(--billadm-color-hover-bg);
}

/* 描述区域 */
.detail-description {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.description-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--billadm-space-sm);
}

.description-label {
  font-size: var(--billadm-size-text-body-sm);
  font-weight: 500;
  color: var(--billadm-color-text-major);
}

.description-content {
  flex: 1;
}

.description-text {
  font-size: var(--billadm-size-text-body);
  color: var(--billadm-color-text-major);
  line-height: var(--billadm-height-relaxed);
  white-space: pre-wrap;
  margin: 0;
}

.description-placeholder {
  color: var(--billadm-color-text-disabled);
  font-size: var(--billadm-size-text-body);
}

.description-edit {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--billadm-space-sm);
}

.description-edit :deep(textarea) {
  flex: 1;
  resize: none;
}

.description-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--billadm-space-sm);
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add app/src/components/key_event_view/KeyEventDetail.vue
git commit -m "feat: 新增 KeyEventDetail 中栏事件详情组件"
```

---

### Task 4: 创建 KeyEventLinkedTr.vue（右栏关联交易）

**Files:**
- Create: `app/src/components/key_event_view/KeyEventLinkedTr.vue`

- [ ] **Step 1: 编写组件**

```vue
<template>
  <div class="linked-panel">
    <!-- 未选中事件 -->
    <div v-if="!hasSelection" class="panel-empty">
      <span>选择事件查看关联交易</span>
    </div>

    <!-- 加载中 -->
    <div v-else-if="loading" class="panel-loading">
      <a-spin />
    </div>

    <!-- 无关联交易 -->
    <div v-else-if="transactions.length === 0" class="panel-empty">
      <span>暂无关联交易</span>
    </div>

    <!-- 交易卡片列表 -->
    <div v-else class="linked-cards">
      <div
        v-for="tr in transactions"
        :key="tr.transactionId"
        class="linked-card"
      >
        <div class="linked-card-body">
          <div class="linked-card-row">
            <span class="linked-card-label">账本</span>
            <span class="linked-card-value">{{ getLedgerName(tr.ledgerId) }}</span>
          </div>
          <div class="linked-card-row">
            <span class="linked-card-label">分类</span>
            <span class="linked-card-value">{{ tr.category }}</span>
          </div>
          <div class="linked-card-row" v-if="tr.tags && tr.tags.length > 0">
            <span class="linked-card-label">标签</span>
            <div class="linked-card-tags">
              <a-tag v-for="tag in tr.tags" :key="tag" style="font-size:11px">{{ tag }}</a-tag>
            </div>
          </div>
          <div class="linked-card-row" v-if="tr.description">
            <span class="linked-card-label">描述</span>
            <span class="linked-card-value linked-card-desc">{{ tr.description }}</span>
          </div>
          <div class="linked-card-row">
            <span class="linked-card-label">金额</span>
            <span
              class="linked-card-amount"
              :class="{
                'is-income': tr.transactionType === 'income',
                'is-expense': tr.transactionType === 'expense',
                'is-transfer': tr.transactionType === 'transfer',
              }"
            >
              <template v-if="tr.transactionType === 'expense'">-</template>
              <template v-else-if="tr.transactionType === 'income'">+</template>
              {{ centsToYuan(tr.price) }}
            </span>
          </div>
        </div>
        <div class="linked-card-action">
          <a-button type="text" danger size="small" @click="$emit('delete', tr.transactionId!)">
            <template #icon><DeleteOutlined /></template>
            删除
          </a-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { DeleteOutlined } from '@ant-design/icons-vue'
import { useLedgerStore } from '@/stores/ledgerStore'
import { centsToYuan } from '@/backend/functions'
import type { TransactionRecord } from '@/types/billadm'

const props = defineProps<{
  transactions: TransactionRecord[]
  loading: boolean
  hasSelection: boolean
}>()

defineEmits<{
  (e: 'delete', transactionId: string): void
}>()

const ledgerStore = useLedgerStore()

const getLedgerName = (ledgerId: string): string => {
  const ledger = ledgerStore.ledgers.find(l => l.id === ledgerId)
  return ledger?.name || ledgerId
}
</script>

<style scoped>
.linked-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  border-left: 1px solid var(--billadm-color-divider);
  background-color: var(--billadm-color-major-background);
}

.panel-empty,
.panel-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--billadm-color-text-disabled);
  font-size: var(--billadm-size-text-body);
}

.linked-cards {
  flex: 1;
  overflow-y: auto;
  padding: var(--billadm-space-xs);
}

.linked-card {
  padding: var(--billadm-space-sm) var(--billadm-space-md);
  margin-bottom: var(--billadm-space-xs);
  border: 1px solid var(--billadm-color-divider);
  border-radius: var(--billadm-radius-md);
  background-color: var(--billadm-color-major-background);
}

.linked-card-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.linked-card-row {
  display: flex;
  align-items: baseline;
  gap: var(--billadm-space-sm);
}

.linked-card-label {
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-disabled);
  min-width: 32px;
  flex-shrink: 0;
}

.linked-card-value {
  font-size: var(--billadm-size-text-body-sm);
  color: var(--billadm-color-text-major);
}

.linked-card-desc {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.linked-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.linked-card-amount {
  font-family: var(--billadm-font-mono);
  font-size: var(--billadm-size-text-body);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.linked-card-amount.is-income { color: var(--billadm-color-income); }
.linked-card-amount.is-expense { color: var(--billadm-color-expense); }
.linked-card-amount.is-transfer { color: var(--billadm-color-transfer); }

.linked-card-action {
  margin-top: var(--billadm-space-xs);
  display: flex;
  justify-content: flex-end;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add app/src/components/key_event_view/KeyEventLinkedTr.vue
git commit -m "feat: 新增 KeyEventLinkedTr 右栏关联交易组件"
```

---

### Task 5: 创建 KeyEventAddModal.vue（添加事件弹窗）

**Files:**
- Create: `app/src/components/key_event_view/KeyEventAddModal.vue`

- [ ] **Step 1: 编写组件**

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
      <a-date-picker
        v-model:value="formDate"
        style="width: 100%"
        size="large"
      />

      <label class="form-label">名称</label>
      <a-input
        v-model:value="formTitle"
        placeholder="事件名称（可选）"
        :maxlength="200"
        size="large"
      />

      <label class="form-label">颜色</label>
      <div class="color-picker">
        <div
          v-for="c in EVENT_COLORS"
          :key="c"
          class="color-swatch"
          :class="{ 'is-selected': formColor === c }"
          :style="{ backgroundColor: c }"
          @click="formColor = c"
        >
          <CheckOutlined v-if="formColor === c" class="check-icon" />
        </div>
      </div>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import dayjs, { type Dayjs } from 'dayjs'
import { CheckOutlined } from '@ant-design/icons-vue'

const props = defineProps<{
  open: boolean
  loading: boolean
}>()

const emit = defineEmits<{
  (e: 'confirm', date: string, title: string, color: string): void
  (e: 'close'): void
}>()

const EVENT_COLORS = [
  '#D9705A', '#E89280', '#4A8C6F', '#6BAA8C',
  '#5C8DB5', '#7EABCC', '#C6963A', '#8C7B6E',
  '#9E8C7E', '#6B9E7E',
  '#8C6B9E', '#A88CC0', '#C68E30', '#D4A84B',
  '#5C9EA8', '#7EB8C2', '#B89A80', '#CCB098',
  '#7E8C94', '#9EAAB0'
]

const DEFAULT_COLOR = '#4A8C6F'

const formDate = ref<Dayjs>(dayjs())
const formTitle = ref('')
const formColor = ref(DEFAULT_COLOR)

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      formDate.value = dayjs()
      formTitle.value = ''
      formColor.value = DEFAULT_COLOR
    }
  }
)

const handleConfirm = () => {
  const date = formDate.value.format('YYYY-MM-DD')
  emit('confirm', date, formTitle.value.trim(), formColor.value)
}
</script>

<style scoped>
.add-event-form {
  display: flex;
  flex-direction: column;
  gap: var(--billadm-space-sm);
}

.form-label {
  font-size: var(--billadm-size-text-body);
  font-weight: 500;
  color: var(--billadm-color-text-major);
  margin-top: var(--billadm-space-sm);
}

.form-label:first-child {
  margin-top: 0;
}

.color-picker {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.color-swatch {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: border-color var(--billadm-transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
}

.color-swatch:hover {
  border-color: rgba(0, 0, 0, 0.3);
}

.color-swatch.is-selected {
  border-color: #000;
}

.check-icon {
  color: #fff;
  font-size: 12px;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.5));
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add app/src/components/key_event_view/KeyEventAddModal.vue
git commit -m "feat: 新增 KeyEventAddModal 添加事件弹窗组件"
```

---

### Task 6: 重写 KeyEventView.vue（三栏容器）

**Files:**
- Modify: `app/src/components/key_event_view/KeyEventView.vue`

- [ ] **Step 1: 重写模板和脚本**

用以下内容完整替换 `KeyEventView.vue`：

```vue
<template>
  <BilladmPageLayout>
    <template #toolbar>
      <div class="key-event-toolbar-left">
        <a-button type="text" @click="goToPrevYear">
          <template #icon><LeftOutlined /></template>
        </a-button>
        <span class="year-display">{{ selectedYear }}</span>
        <a-button type="text" @click="goToNextYear">
          <template #icon><RightOutlined /></template>
        </a-button>
      </div>
    </template>

    <!-- 三栏主体 -->
    <div class="key-event-body">
      <!-- 左栏：事件列表 -->
      <KeyEventList
        :events="keyEventStore.events"
        :selected-date="selectedDate"
        @select="onSelectEvent"
        @add-event="openAddModal"
      />

      <!-- 中栏：事件详情 -->
      <KeyEventDetail
        :event="currentEvent"
        :images="keyEventStore.images"
        :is-editing="isEditing"
        @edit="isEditing = true"
        @save="handleSaveContent"
        @cancel-edit="isEditing = false"
        @add-image="handleAddImage"
        @delete-image="handleDeleteImage"
      />

      <!-- 右栏：关联交易 -->
      <KeyEventLinkedTr
        :transactions="linkedTransactions"
        :loading="linkedLoading"
        :has-selection="!!selectedDate"
        @delete="handleUnlinkTr"
      />
    </div>

    <!-- 添加事件弹窗 -->
    <KeyEventAddModal
      :open="addModalOpen"
      :loading="addModalLoading"
      @confirm="handleAddEvent"
      @close="addModalOpen = false"
    />
  </BilladmPageLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import dayjs, { type Dayjs } from 'dayjs'
import { LeftOutlined, RightOutlined } from '@ant-design/icons-vue'
import { useKeyEventStore } from '@/stores/keyEventStore'
import { getLinkedTransactions, unlinkTransactionFromKeyEvent, centsToYuan } from '@/backend/functions'
import type { KeyEvent, TransactionRecord } from '@/types/billadm'

const keyEventStore = useKeyEventStore()

// ========== 年份导航 ==========
const selectedYearDayjs = ref<Dayjs>(dayjs())
const selectedYear = ref(selectedYearDayjs.value.year())

const goToPrevYear = () => {
  selectedYearDayjs.value = selectedYearDayjs.value.year(selectedYearDayjs.value.year() - 1)
  selectedYear.value = selectedYearDayjs.value.year()
  clearSelection()
  keyEventStore.fetchDatesByYear(selectedYear.value)
}

const goToNextYear = () => {
  selectedYearDayjs.value = selectedYearDayjs.value.year(selectedYearDayjs.value.year() + 1)
  selectedYear.value = selectedYearDayjs.value.year()
  clearSelection()
  keyEventStore.fetchDatesByYear(selectedYear.value)
}

// ========== 选中事件 ==========
const selectedDate = ref('')
const currentEvent = ref<KeyEvent | null>(null)
const isEditing = ref(false)

const clearSelection = () => {
  selectedDate.value = ''
  currentEvent.value = null
  isEditing.value = false
  keyEventStore.clearImages()
}

const onSelectEvent = async (date: string) => {
  selectedDate.value = date
  isEditing.value = false
  try {
    const event = await keyEventStore.fetchEventByDate(date)
    currentEvent.value = event
    keyEventStore.fetchImages(date)
    loadLinkedTransactions(date)
  } catch {
    currentEvent.value = null
  }
}

// ========== 编辑描述 ==========
const handleSaveContent = async (content: string) => {
  if (!currentEvent.value) return
  const title = currentEvent.value.title || content.split('\n')[0]?.trim()?.slice(0, 200) || ''
  try {
    await keyEventStore.saveEvent(selectedDate.value, title, content, currentEvent.value.color)
    // 刷新以更新列表中的 title/content
    await keyEventStore.fetchDatesByYear(selectedYear.value)
    isEditing.value = false
    // 重新加载当前事件
    const updated = await keyEventStore.fetchEventByDate(selectedDate.value)
    currentEvent.value = updated
  } catch { /* error handled in store */ }
}

// ========== 图片管理 ==========
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}

const handleAddImage = async (file: File) => {
  try {
    const data = await fileToBase64(file)
    await keyEventStore.addImage(selectedDate.value, data, file.name)
  } catch { /* error handled in store */ }
}

const handleDeleteImage = async (imageId: string) => {
  try {
    await keyEventStore.removeImage(imageId)
  } catch { /* error handled in store */ }
}

// ========== 关联交易 ==========
const linkedTransactions = ref<TransactionRecord[]>([])
const linkedLoading = ref(false)

const loadLinkedTransactions = async (date: string) => {
  linkedLoading.value = true
  try {
    linkedTransactions.value = await getLinkedTransactions(date)
  } finally {
    linkedLoading.value = false
  }
}

const handleUnlinkTr = async (transactionId: string) => {
  const ok = await unlinkTransactionFromKeyEvent(transactionId)
  if (ok) {
    linkedTransactions.value = linkedTransactions.value.filter(
      t => t.transactionId !== transactionId
    )
  }
}

// ========== 添加事件弹窗 ==========
const addModalOpen = ref(false)
const addModalLoading = ref(false)

const openAddModal = () => {
  addModalOpen.value = true
}

const handleAddEvent = async (date: string, title: string, color: string) => {
  addModalLoading.value = true
  try {
    await keyEventStore.saveEvent(date, title, '', color)
    addModalOpen.value = false
    // 刷新列表并选中新事件
    await keyEventStore.fetchDatesByYear(selectedYear.value)
    onSelectEvent(date)
  } catch { /* error handled in store */ }
  finally {
    addModalLoading.value = false
  }
}

// ========== 初始化 ==========
onMounted(() => {
  keyEventStore.fetchDatesByYear(selectedYear.value)
})
</script>

<style scoped>
.key-event-toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.year-display {
  font-size: var(--billadm-size-text-title);
  font-weight: 600;
  color: var(--billadm-color-text-major);
  min-width: 80px;
  text-align: center;
}

/* 三栏主体 */
.key-event-body {
  flex: 1;
  display: grid;
  grid-template-columns: 280px 1fr 320px;
  min-height: 0;
  overflow: hidden;
}
</style>
```

- [ ] **Step 2: 构建验证**

```bash
cd app && npm run build 2>&1 | tail -5
```

预期：构建成功

- [ ] **Step 3: Commit**

```bash
git add app/src/components/key_event_view/KeyEventView.vue
git commit -m "refactor: KeyEventView 重写为三栏面板布局"
```

---

### Task 7: 端到端验证

**Files:** 无新建，验证所有功能

- [ ] **Step 1: 运行完整构建**

```bash
cd app && npm run build 2>&1 | tail -3
```

预期：`✓ built in XXs`

- [ ] **Step 2: 运行类型检查**

```bash
cd app && npx vue-tsc --noEmit --pretty false 2>&1 | tail -5
```

预期：无错误

- [ ] **Step 3: 手动验证清单**

启动应用后验证：
1. 年份切换 → 左栏列表刷新，中/右栏清空
2. 点击左栏事件 → 中栏加载图片+描述，右栏加载关联交易
3. 添加事件弹窗 → 选择日期/名称/颜色 → 保存后列表刷新并自动选中
4. 中栏编辑描述 → 编辑/保存/取消模式切换
5. 图片添加和删除
6. 关联交易删除
7. 空状态各场景（无事件、未选中、无关联交易）

---

## 自审检查

| 检查项 | 状态 |
|--------|------|
| 设计文档覆盖 | Task 1-6 覆盖所有设计要点（三栏布局、编辑模式、图片管理、添加弹窗、关联交易） |
| 无占位符 | 所有步骤包含完整代码，无 TBD/TODO |
| 类型一致性 | KeyEvent、KeyEventImage、TransactionRecord 类型与现有定义一致 |
| 组件接口一致 | emit 命名与模板绑定一致（kebab-case ↔ camelCase） |
