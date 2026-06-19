# 关键事件颜色设置重构

日期: 2026-06-19 | 状态: 设计中

## 背景

当前关键事件的颜色设置在 **添加事件弹窗** 中进行选择。用户需要在添加事件时就确定颜色，后续修改颜色需要在编辑详情时重新保存。此次重构将颜色设置从弹窗中移出，放到中栏详情顶部作为独立工具栏，同时增加"不设置颜色"选项。

## 目标

1. 从添加事件弹窗中移除颜色选择功能
2. 在中栏（KeyEventDetail）顶部增加颜色设置栏，仅选中事件时显示
3. 候选颜色末尾增加虚线空白圆圈，表示"不设置颜色/使用默认颜色"
4. 颜色切换即时自动保存（无需额外操作）

## 涉及文件

| 文件 | 改动类型 |
|------|----------|
| `app/src/components/key_event_view/KeyEventAddModal.vue` | 移除颜色选择 UI 和相关逻辑 |
| `app/src/components/key_event_view/KeyEventDetail.vue` | 新增颜色设置栏 |
| `app/src/components/key_event_view/KeyEventView.vue` | 新增 handleColorChange 方法，适配 handleAddEvent |

## 详细设计

### 1. KeyEventAddModal.vue — 精简弹窗

**移除内容：**
- `<label class="form-label">颜色</label>` 标签
- `.color-picker` 区域（包含所有 color-swatch）
- `EVENT_COLORS` 常量
- `DEFAULT_COLOR` 常量
- `formColor` ref
- `emit('confirm', ...)` 中的 `color` 参数 → 改传空字符串 `''`

**保留内容：**
- 日期选择器
- 名称输入框
- `CheckOutlined` 图标（若不再使用可移除 import）

**emit 签名变更：**
```
旧: (e: 'confirm', date: string, title: string, color: string)
新: (e: 'confirm', date: string, title: string)
```

### 2. KeyEventDetail.vue — 新增颜色设置栏

**位置：** 组件最顶部，详情内容之上

**显示条件：** `v-if="event"`（有选中事件时才渲染）

**颜色列表定义（20 色 + 虚线圆圈）：**
```typescript
const EVENT_COLORS = [
  '#D9705A', '#E89280', '#4A8C6F', '#6BAA8C',
  '#5C8DB5', '#7EABCC', '#C6963A', '#8C7B6E',
  '#9E8C7E', '#6B9E7E',
  '#8C6B9E', '#A88CC0', '#C68E30', '#D4A84B',
  '#5C9EA8', '#7EB8C2', '#B89A80', '#CCB098',
  '#7E8C94', '#9EAAB0',
]
```

**布局：**
```
┌─────────────────────────────────────────────┐
│ ● ● ● ● ● ● ● ● ● ● ● ... ○（虚线空心）   │
├─────────────────────────────────────────────┤
│ [标题显示区]                                 │
│ [内容编辑/预览区]                            │
│ [图片管理区]                                 │
└─────────────────────────────────────────────┘
```

**颜色块样式：**
- 实心圆：`width: 22px; height: 22px; border-radius: 50%`，背景色为对应颜色值
- 选中态实心圆：`border: 2px solid #000`
- 虚线空白圆：`width: 22px; height: 22px; border-radius: 50%`，`border: 2px dashed var(--billadm-color-text-disabled)`，无背景色
- 虚线圆选中态：`border-color: #000; border-style: solid`

**交互行为：**
- 点击实心颜色块 → `emit('color-change', colorValue)` → 即时保存
- 点击虚线圆 → `emit('color-change', '')` → 传空字符串，表示使用默认颜色
- 当前事件颜色与某色块匹配时，该色块显示选中态
- 当前事件颜色为空时，虚线圆显示选中态

**Props 新增：**
```typescript
event: KeyEvent | null  // 已有，用于判断颜色值和显示条件
```

**Emits 新增：**
```typescript
(e: 'color-change', color: string): void
```

### 3. KeyEventView.vue — 适配调整

**handleAddEvent 修改：**
```typescript
// 旧
const handleAddEvent = async (date: string, title: string, color: string) => {
  await keyEventStore.saveEvent(date, title, '', color)
}

// 新
const handleAddEvent = async (date: string, title: string) => {
  await keyEventStore.saveEvent(date, title, '', '')
}
```

**新增 handleColorChange：**
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
  } catch { /* error handled in store */ }
}
```

**KeyEventDetail 模板绑定更新：**
```html
<KeyEventDetail
  :event="currentEvent"
  ...
  @color-change="handleColorChange"
/>
```

### 4. 数据流

```
用户点击颜色块
  → KeyEventDetail emits 'color-change' with color string
    → KeyEventView.handleColorChange(color)
      → keyEventStore.saveEvent(date, title, content, color)
        → API POST /api/v1/key-events/:date
          → SQLite upsert with color field
        → 更新本地缓存 (datesWithRecords, colors map, events list)
      → 更新 currentEvent.color
        → KeyEventDetail 响应式更新选中态
```

### 5. 边界情况

| 场景 | 行为 |
|------|------|
| 未选中事件 | 颜色栏不显示 |
| 事件颜色为空字符串 | 虚线圆呈选中态 |
| 事件颜色不在 20 色列表中 | 无实心圆选中，虚线圆也不选中（容错） |
| 保存失败 | store 内部处理错误提示，UI 不回退（保持乐观更新后的状态……或 store 拒绝更新） |
| 快速点击多个颜色 | 每次点击独立调用 saveEvent（非乐观更新，等待 API 返回），最后一次生效 |

## 非目标

- 不改变后端 API 接口（颜色字段已存在）
- 不改变数据库 schema
- 不改变 KeyEventList 的颜色显示逻辑（已有 `--event-color` CSS 变量回退机制）
- 不改变颜色值的存储格式
