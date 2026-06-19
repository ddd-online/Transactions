# 关键记录页面三栏布局重构设计

## 概述

将 KeyEventView 从「全年日历 + 弹窗编辑」模式重构为「三栏面板」模式，事件列表、详情、关联交易同屏可见，无需弹窗即可浏览。

## 组件架构

```
KeyEventView.vue              # 三栏容器 + 年份导航
├── KeyEventList.vue          # 左栏：事件列表（按日期倒序）
├── KeyEventDetail.vue        # 中栏：事件详情（图片宫格 + 文字描述）
└── KeyEventLinkedTr.vue      # 右栏：关联交易列表（仅查看 + 删除）
```

保留弹窗用于「添加事件」（设置日期、名称、颜色）。

## 布局结构

```
┌──────────────────────────────────────────────────────────┐
│ Toolbar: [<] 2026 [>]                                    │
├────────────┬────────────────────────┬────────────────────┤
│ 左栏 280px │ 中栏 flex:1           │ 右栏 320px         │
│            │                       │                    │
│ 事件卡片   │ 图片宫格 (含添加按钮) │ 关联交易卡片       │
│ ·名称      │ ┌───┐ ┌───┐ ┌───┐    │ ·账本 ·分类        │
│ ·日期      │ │   │ │   │ │ + │    │ ·标签 ·金额        │
│ ·颜色条    │ └───┘ └───┘ └───┘    │ ·删除按钮          │
│            │                       │                    │
│ 事件卡片   │ 文字描述              │ 交易卡片           │
│ ...        │ [编辑] 按钮           │ ...                │
│            │                       │                    │
│ [+添加]    │                       │                    │
└────────────┴────────────────────────┴────────────────────┘
```

### 三栏宽度策略
- **左栏**：固定 280px，内容溢出时内部滚动
- **中栏**：flex:1，填充剩余宽度
- **右栏**：固定 320px，内容溢出时内部滚动

## 数据流

```
KeyEventView (持有 selectedYear, selectedDate, isEditing)
  │
  ├── KeyEventList
  │   props: events (datesByYear 按日期倒序), selectedDate
  │   emit: select(date)
  │   emit: add-event → 打开添加弹窗
  │
  ├── KeyEventDetail
  │   props: event (当前选中事件详情), images, isEditing
  │   emit: edit → isEditing = true
  │   emit: save(data) → 保存描述
  │   emit: cancel-edit → isEditing = false
  │   emit: add-image(file) → 上传图片
  │   emit: delete-image(id) → 删除图片
  │
  └── KeyEventLinkedTr
      props: transactions (关联交易列表), loading
      emit: delete(transactionId) → 删除关联
```

### 状态管理
- `selectedYear` — 当前年份
- `selectedDate` — 当前选中事件日期（用于中栏和右栏的数据加载）
- `isEditing` — 中栏是否处于编辑模式
- 事件列表、事件详情、图片数据沿用 `keyEventStore`
- 关联交易沿用 `getLinkedTransactions` API

## 各面板详细设计

### 左栏 — KeyEventList

**数据源**：`keyEventStore.fetchDatesByYear(year)` → 获取该年有事件的日期列表，按日期倒序排列。

**卡片内容**：
- 左侧颜色条（4px 宽，取自 keyEventStore 存储的颜色）
- 事件名称（title，若为空则显示日期）
- 事件日期（MM-DD 格式）
- 描述摘要（前 30 字，灰色文字）

**交互**：
- 点击卡片 → `emit('select', date)`，中栏和右栏加载该日期数据
- 选中卡片高亮（active 状态）
- 「+ 添加事件」按钮在列表底部 → 打开添加弹窗

**空状态**：
- 该年无事件时显示「暂无事件记录」

### 中栏 — KeyEventDetail

**数据源**：选中事件后调用 `keyEventStore.fetchEventByDate(date)` 获取详情，`keyEventStore.fetchImages(date)` 获取图片。

**未选中状态**：
- 显示占位提示：「选择左侧事件查看详情」

**查看模式**：
- 图片宫格（网格布局，3 列），每张图可预览和删除
- 宫格最后一个位置是「+」添加按钮 → 触发文件选择
- 文字描述（只读显示，支持多行）
- 「编辑」按钮（右上角）

**编辑模式**：
- 文字描述变为 textarea
- 「保存」「取消」按钮替换「编辑」按钮
- 图片管理不变（始终可添加/删除）

**图片上传**：
- 点击「+」触发 file input
- 支持粘贴图片
- 沿用现有 `keyEventStore.addImage`

**空状态**：
- 事件无图片时，宫格仅显示「+」添加按钮
- 事件无描述时，描述区显示「暂无描述」

### 右栏 — KeyEventLinkedTr

**数据源**：选中事件后调用 `getLinkedTransactions(date)` 获取关联交易列表。

**卡片内容**（每条交易）：
- 账本名称
- 分类名称
- 标签（tag 列表）
- 描述
- 金额（带颜色：支出红色、收入绿色、转账蓝色）
- 删除按钮

**交互**：
- 点击删除 → `unlinkTransactionFromKeyEvent` → 刷新列表

**空状态**：
- 无关联交易时显示「暂无关联交易」
- 未选中事件时显示「选择事件查看关联交易」

## 弹窗设计

### 添加事件弹窗

触发：左栏「+ 添加事件」按钮。

| 字段 | 组件 | 说明 |
|------|------|------|
| 日期 | DatePicker | 选择事件日期 |
| 名称 | Input | 事件名称（可选，为空则取描述首行） |
| 颜色 | ColorPicker | 20 色选择器 |

确认后调用 `keyEventStore.saveEvent`，关闭弹窗，刷新左栏列表并选中新事件。

## 状态转换

```
┌──────────┐  点击事件卡片   ┌──────────┐
│ 未选中    │ ─────────────→ │ 查看模式  │
│ (初始)    │                │          │
└──────────┘                └────┬─────┘
                                │
                    点击「编辑」  │
                                ↓
                           ┌──────────┐
                           │ 编辑模式  │
                           │          │
                           └────┬─────┘
                                │
                    保存 / 取消  │
                                ↓
                           ┌──────────┐
                           │ 查看模式  │
                           └──────────┘
```

## 与现有代码的关系

- **保留**：`keyEventStore`（fetchDatesByYear, fetchEventByDate, saveEvent, deleteEvent, fetchImages, addImage, removeImage 等）
- **保留**：`getLinkedTransactions`, `unlinkTransactionFromKeyEvent` API
- **保留**：年份导航逻辑、颜色选择器、图片粘贴上传
- **移除**：日历网格（`.calendar-container`, `.month-grid`, `.day-cell` 等）
- **移除**：事件详情弹窗（`a-modal` 中的 detail tab 内容移至中栏）
- **调整**：关联交易从弹窗 tab 移至右栏独立面板

## 边界情况

| 场景 | 处理 |
|------|------|
| 切换年份后无选中 | 清空中/右栏，显示占位提示 |
| 删除当前选中事件 | 清空中/右栏，列表移除该项，自动选中下一个（若存在） |
| 添加图片失败 | 沿用现有错误处理（store 内部提示） |
| 关联交易加载中 | 右栏显示 loading 状态 |
| 窗口过窄（<900px） | 左栏缩为图标，或改为上下布局 |

## 测试要点

1. 年份切换 → 左栏刷新，选中清空
2. 点击事件 → 中栏+右栏加载对应数据
3. 添加事件弹窗 → 保存后列表刷新并选中
4. 编辑模式 → 保存/取消正确切换
5. 图片添加/删除
6. 关联交易删除
7. 空状态各场景
