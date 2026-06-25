# 关键事件数据预加载与缓存 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 启动时预加载全年事件+图片+关联交易到缓存，切换事件时零 API 调用。

**Architecture:** keyEventStore 新增 imageCache/trCache 两个 Map；新增 preloadYearData 在 onMounted 中调用，并行预加载所有数据；onSelectEvent 改为纯缓存读取。

**Tech Stack:** Vue 3 + Pinia + TypeScript

## Global Constraints

- 不改变 Go 后端（不新增批量接口）
- 不改交易页面
- 不改图片组件本身
- 预加载失败不阻塞页面，切换事件时回退到按需加载
- 切换年份用 callId 竞态保护

---

### Task 1: keyEventStore — 缓存层 + preloadYearData

**Files:**
- Modify: `app/src/stores/keyEventStore.ts`

**Interfaces:**
- Produces: 
  - `imageCache: Ref<Map<string, KeyEventImage[]>>`
  - `trCache: Ref<Map<string, TransactionRecord[]>>`
  - `preloadYearData(year: number, ledgerId: string): Promise<void>`
  - `getEventByDate(date: string): KeyEvent | null`
  - `cacheLinkedTransactions(date: string, trs: TransactionRecord[]): void`
  - `fetchImages(date: string): Promise<void>` — 改为先查缓存

- [ ] **Step 1: 新增缓存 ref + 类型导入**

在 `images` ref 之后添加：

```typescript
import type { TransactionRecord } from "@/types/billadm";

const imageCache = ref(new Map<string, KeyEventImage[]>());
const trCache = ref(new Map<string, TransactionRecord[]>());
```

- [ ] **Step 2: 新增 getEventByDate（纯内存读取）**

在 `getColor` 之后添加：

```typescript
const getEventByDate = (date: string): KeyEvent | null => {
    return events.value.find(e => e.date === date) ?? null;
};
```

- [ ] **Step 3: fetchImages 改为先查缓存**

替换 `fetchImages` 函数：

```typescript
const fetchImages = async (date: string): Promise<void> => {
    const ledgerId = getLedgerId()
    if (!ledgerId) return
    // 已有缓存则直接用
    if (imageCache.value.has(date)) {
        images.value = imageCache.value.get(date)!
        return
    }
    try {
        const result = await queryKeyEventImages(date, ledgerId);
        imageCache.value.set(date, result);
        images.value = result;
    } catch (error) {
        NotificationUtil.error('加载图片失败', `${error}`);
        images.value = [];
    }
};
```

- [ ] **Step 4: 新增 cacheLinkedTransactions**

```typescript
const cacheLinkedTransactions = (date: string, trs: TransactionRecord[]): void => {
    trCache.value.set(date, trs);
};
```

- [ ] **Step 5: 新增 preloadYearData**

```typescript
const preloadYearData = async (year: number): Promise<void> => {
    const ledgerId = getLedgerId()
    if (!ledgerId) return
    try {
        const eventList = await queryKeyEventsByYear(year, ledgerId);
        datesWithRecords.value = new Set(eventList.map(e => e.date));
        titles.value = new Map(eventList.map(e => [e.date, e.title]));
        colors.value = new Map(eventList.map(e => [e.date, e.color]));
        events.value = eventList;
        currentYear.value = year;

        // 并行预加载图片和关联交易
        if (eventList.length === 0) return;
        const { getLinkedTransactions } = await import('@/backend/functions');
        await Promise.all([
            ...eventList.map(async (e) => {
                try {
                    const imgs = await queryKeyEventImages(e.date, ledgerId);
                    imageCache.value.set(e.date, imgs);
                } catch { /* 静默忽略单个失败 */ }
            }),
            ...eventList.map(async (e) => {
                try {
                    const trs = await getLinkedTransactions(e.date);
                    trCache.value.set(e.date, trs);
                } catch { /* 静默忽略单个失败 */ }
            }),
        ]);
    } catch (error) {
        NotificationUtil.error('预加载关键事件失败', `${error}`);
    }
};
```

- [ ] **Step 6: 保存事件时更新缓存**

在 `saveEvent` 的 try 块中，`datesWithRecords.value.add(date)` 之后添加：

```typescript
// 更新 events 缓存
const idx = events.value.findIndex(e => e.date === date);
if (idx >= 0) {
    events.value[idx] = { ...events.value[idx]!, title, color };
} else {
    events.value.push({
        id: '',
        date,
        title,
        content,
        color,
        createdAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
        ledgerId,
    });
}
```

- [ ] **Step 7: 删除事件时清除缓存**

在 `deleteEvent` 的 try 块中添加：

```typescript
imageCache.value.delete(date);
trCache.value.delete(date);
```

- [ ] **Step 8: addImage 更新 imageCache**

在 `addImage` 的 `images.value.push(...)` 之后添加：

```typescript
// 更新缓存
const cached = imageCache.value.get(date);
if (cached) {
    cached.push({
        id: imageId,
        eventDate: date,
        data,
        filename,
        sortOrder: cached.length + 1,
        createdAt: Math.floor(Date.now() / 1000),
    });
}
```

- [ ] **Step 9: 重写 removeImage 以更新 imageCache**

完整替换 `removeImage` 函数（需要先找到图片的 eventDate 再删除）：

```typescript
const removeImage = async (imageId: string): Promise<void> => {
    const ledgerId = getLedgerId()
    if (!ledgerId) return
    try {
        const target = images.value.find(img => img.id === imageId);
        await deleteKeyEventImage(imageId, ledgerId);
        images.value = images.value.filter(img => img.id !== imageId);
        if (target) {
            const cached = imageCache.value.get(target.eventDate);
            if (cached) {
                const idx = cached.findIndex(img => img.id === imageId);
                if (idx >= 0) cached.splice(idx, 1);
            }
        }
    } catch (error) {
        NotificationUtil.error('删除图片失败', `${error}`);
        throw error;
    }
};
```

- [ ] **Step 10: 导出新增项**

在 return 中添加：`imageCache`, `trCache`, `preloadYearData`, `getEventByDate`, `cacheLinkedTransactions`

- [ ] **Step 11: 保存时更新 content**

`saveEvent` 中更新 events 缓存时也需要包含 content：

```typescript
const idx = events.value.findIndex(e => e.date === date);
if (idx >= 0) {
    events.value[idx] = { ...events.value[idx]!, title, content, color };
}
```

- [ ] **Step 12: 验证编译通过**

```bash
cd app && npx vue-tsc --noEmit --project tsconfig.json
```

- [ ] **Step 13: Commit**

```bash
git add app/src/stores/keyEventStore.ts
git commit -m "feat: keyEventStore 新增 imageCache/trCache 缓存层 + preloadYearData 预加载"
```

---

### Task 2: KeyEventView — onMounted 预加载 + onSelectEvent 读缓存

**Files:**
- Modify: `app/src/components/key_event_view/KeyEventView.vue`

**Interfaces:**
- Consumes: `preloadYearData`, `getEventByDate`, `imageCache`, `trCache`, `cacheLinkedTransactions` — 来自 Task 1
- Produces: 无新增接口

- [ ] **Step 1: 替换 onMounted**

当前第 416 行的 `onMounted` 替换为：

```typescript
onMounted(async () => {
  await keyEventStore.preloadYearData(selectedYear.value)
  selectedDate.value = ''
})
```

- [ ] **Step 2: 简化 onSelectEvent（从缓存读取）**

替换第 119-158 行的 `onSelectEvent`：

```typescript
const onSelectEvent = async (date: string) => {
  selectedDate.value = date
  isEditing.value = false

  // 从 events 缓存取事件内容
  const event = keyEventStore.getEventByDate(date)
  currentEvent.value = event ?? null

  if (!event) return

  // 从 imageCache 取图片（调用 fetchImages 会自动走缓存）
  await keyEventStore.fetchImages(date)

  // 从 trCache 取关联交易
  const cachedTrs = keyEventStore.trCache.get(date)
  if (cachedTrs !== undefined) {
    linkedTransactions.value = cachedTrs
    let income = 0, expense = 0, transfer = 0
    for (const t of cachedTrs) {
      if (t.transactionType === 'income') income += t.price
      else if (t.transactionType === 'expense') expense += t.price
      else if (t.transactionType === 'transfer') transfer += t.price
    }
    appDataStore.setStatistics({ income, expense, transfer })
  } else {
    // 缓存未命中则走原路径
    await loadLinkedTransactions(date)
    keyEventStore.cacheLinkedTransactions(date, linkedTransactions.value)
  }
}
```

- [ ] **Step 3: 年份切换时重新预加载**

修改 `goToPrevYear` 和 `goToNextYear`，将 `keyEventStore.fetchDatesByYear` 替换为 `await keyEventStore.preloadYearData`：

```typescript
const goToPrevYear = async () => {
  selectedYearDayjs.value = selectedYearDayjs.value.year(selectedYearDayjs.value.year() - 1)
  selectedYear.value = selectedYearDayjs.value.year()
  clearSelection()
  await keyEventStore.preloadYearData(selectedYear.value)
}

const goToNextYear = async () => {
  selectedYearDayjs.value = selectedYearDayjs.value.year(selectedYearDayjs.value.year() + 1)
  selectedYear.value = selectedYearDayjs.value.year()
  clearSelection()
  await keyEventStore.preloadYearData(selectedYear.value)
}
```

- [ ] **Step 4: handleAddImages 后更新 trCache**

在 `uploadCurrentFile` 完成后（done 分支），更新缓存。由于上传完成后需要刷新关联交易缓存，在 `handleAddImages` 末尾添加：

```typescript
// uploadCurrentFile 最后 status='done' 后无需特殊处理 —— 
// trCache 在关联/取消关联时更新，图片上传不影响交易缓存
```

实际上不需要改动 — trCache 只在关联交易变化时才需要更新。这个 step 可以跳过。

- [ ] **Step 5: handleUnlinkTr 后更新 trCache**

在 `handleUnlinkTr` 的 `linkedTransactions.value = linkedTransactions.value.filter(...)` 之后，更新缓存：

```typescript
// 同步 trCache
if (selectedDate.value) {
  keyEventStore.trCache.set(selectedDate.value, [...linkedTransactions.value])
}
```

- [ ] **Step 6: handleSaveContent 后刷新缓存**

`handleSaveContent` 中已有 `fetchEventByDate` 调用来刷新 currentEvent。由于 Task 1 的 `saveEvent` 已经更新了 events 缓存中的 title/content，所以这里只需用更新后的缓存值：

```typescript
const handleSaveContent = async (content: string) => {
  if (!currentEvent.value) return
  const title = currentEvent.value.title || extractTitle(content)
  try {
    await keyEventStore.saveEvent(selectedDate.value, title, content, currentEvent.value.color)
    await keyEventStore.fetchDatesByYear(selectedYear.value)
    isEditing.value = false
    // 直接从缓存取（saveEvent 已更新 events 数组）
    currentEvent.value = keyEventStore.getEventByDate(selectedDate.value)
  } catch { /* error handled in store */ }
}
```

- [ ] **Step 7: 移除不再需要的代码**

删除 `imagesLoading`、`trsLoading` ref（不再需要骨架屏切换）和 `loadLinkedTransactions` 中的 loading 逻辑。实际上，由于预加载后切换零延迟，Transition 的骨架屏不再需要，但为保持兼容，保留 loading ref（值始终为 false）。

简化：删除 `const imagesLoading = ref(false)` 和 `const trsLoading = ref(false)`，模板中移除对应的 `:loading` prop。

在 KeyEventDetail 中移除 `:loading="imagesLoading"`，在 KeyEventLinkedTr 中将 `:loading="trsLoading"` 改回 `:loading="false"`（或删除 loading prop，由组件内部处理）。

实际上更好的做法：保留 `loading` prop 但保持 `false`，这样骨架屏逻辑不被触发但也不报错。

- [ ] **Step 8: handleColorChange 同步缓存读取**

```typescript
const handleColorChange = async (color: string) => {
  if (!currentEvent.value) return
  const title = currentEvent.value.title || ''
  const content = currentEvent.value.content || ''
  try {
    await keyEventStore.saveEvent(selectedDate.value, title, content, color)
    await keyEventStore.fetchDatesByYear(selectedYear.value)
    currentEvent.value = keyEventStore.getEventByDate(selectedDate.value)
  } catch { /* error handled in store */ }
}
```

- [ ] **Step 9: 验证编译通过**

```bash
cd app && npx vue-tsc --noEmit --project tsconfig.json
```

- [ ] **Step 10: Commit**

```bash
git add app/src/components/key_event_view/KeyEventView.vue
git commit -m "feat: KeyEventView 启动预加载 + 事件切换从缓存读取"
```

---

### Task 3: 模板清理 + 整体验证

**Files:**
- Modify: `app/src/components/key_event_view/KeyEventView.vue` (模板)
- Modify: `app/src/components/key_event_view/KeyEventDetail.vue` (移除 loading prop)
- Modify: `app/src/components/key_event_view/KeyEventLinkedTr.vue` (移除 loading 使用)

- [ ] **Step 1: KeyEventView 模板清理**

移除 `KeyEventDetail` 上的 `:loading="imagesLoading"`：

```vue
<KeyEventDetail
  class="panel-center"
  :event="currentEvent"
  :images="keyEventStore.images"
  :is-editing="isEditing"
  :progress="uploadProgress"
  @edit="isEditing = true"
  ...
/>
```

移除 `KeyEventLinkedTr` 上的 `:loading="trsLoading"`，改为 `:loading="false"`（预加载完成后不再有 loading 态）：

```vue
<KeyEventLinkedTr
  class="panel-right"
  :transactions="linkedTransactions"
  :loading="false"
  :has-selection="!!selectedDate"
  @delete="handleUnlinkTr"
/>
```

- [ ] **Step 2: 移除 imagesLoading 和 trsLoading ref**

删除第 105-106 行。

- [ ] **Step 3: 移除 loadLinkedTransactions 中不再需要的简化逻辑**

由于 `onSelectEvent` 已经改为从 `trCache` 读取，`loadLinkedTransactions` 只作为缓存未命中时的 fallback。保持不变。

- [ ] **Step 4: 完整构建**

```bash
cd app && npm run build
```

- [ ] **Step 5: Go 测试**

```bash
cd kernel && go test ./...
```

- [ ] **Step 6: 更新文档**

更新 `.wolf/anatomy.md` 和 `.wolf/memory.md`。

- [ ] **Step 7: Commit**

```bash
git add app/src/components/key_event_view/KeyEventView.vue \
        app/src/components/key_event_view/KeyEventDetail.vue \
        app/src/components/key_event_view/KeyEventLinkedTr.vue \
        .wolf/anatomy.md .wolf/memory.md
git commit -m "chore: 清理无用 loading 状态，记录预加载功能实施完成"
```
