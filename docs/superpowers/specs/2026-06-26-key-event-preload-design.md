# 关键事件数据预加载与缓存设计

日期: 2026-06-26
状态: 待实施

## 背景

当前关键事件页面每次切换事件都发起 3 次 API 请求（事件详情、图片、关联交易），即使刚切换回之前看过的事件也要重新请求。`fetchDatesByYear` 已返回包含 `content` 的完整事件对象，但 `onSelectEvent` 又重复请求 `fetchEventByDate`。

## 目标

1. 启动时预加载全年事件数据（含图片和关联交易），切换事件时零 API 调用
2. 事件内容直接从已缓存的 `events` 数组读取，消除 `fetchEventByDate` 请求
3. 增量更新缓存（编辑、上传、删除等操作后局部刷新）

## 架构

### 缓存层

在 `keyEventStore` 中新增：

| 缓存 | 类型 | 何时填充 | 何时失效 |
|------|------|---------|---------|
| `events`（已有） | `ref<KeyEvent[]>` | `preloadYearData` | 切换年份、保存/删除事件 |
| `imageCache` | `ref<Map<string, KeyEventImage[]>>` | `preloadYearData` / 首次 `fetchImages` | 切换年份、增删图片 |
| `trCache` | `ref<Map<string, TransactionRecord[]>>` | `preloadYearData` / 首次 `loadLinkedTr` | 切换年份、关联/取消关联交易 |

### 数据流

```
启动时:
  onMounted → preloadYearData(year)
    → fetchDatesByYear(year)                    // events + datesWithRecords + titles + colors
    → Promise.all(                               // 并行预加载
        events.map(e => fetchImages(e.date)),
        events.map(e => loadLinkedTr(e.date))
      )
    → 缓存全部就绪

切换事件:
  onSelectEvent(date)
    → event = events.find(e => e.date === date)  // 0 API
    → images = imageCache.get(date)              // 0 API
    → trs = trCache.get(date)                    // 0 API
    → 触发 Transition 闪入（跳过骨架屏，内容即显）

增量更新:
  保存事件 → 更新 events 中条目
  上传图片 → 更新 imageCache
  关联交易 → 更新 trCache
  删除事件 → 清除三个缓存中该日期
```

### API 调用次数对比

| 操作 | 优化前 | 优化后 |
|------|--------|--------|
| 启动 | 0 | 1 + 2N（N=事件数，并发） |
| 切换事件 | 3 | 0 |
| 快速浏览 10 个事件 | 30 | 0 |
| 编辑保存 | 2（fetchDatesByYear + fetchEventByDate） | 1（fetchDatesByYear）+ 本地更新 |

### 改动清单

| 文件 | 改动 | 概述 |
|------|------|------|
| `keyEventStore.ts` | ~40行 | 新增 imageCache/trCache；新增 preloadYearData、getEventByDate；fetchEventByDate 改为从 events 读取并缓存 |
| `KeyEventView.vue` | ~25行 | onMounted 调用 preloadYearData；onSelectEvent 改从缓存读取；handleAddImages/handleUnlinkTr 更新缓存 |

### 不在范围内

- 不改 Go 后端（不新增批量接口）
- 不改交易页面
- 不改图片组件本身

## 预加载 UI

首次进入关键事件页面时，中栏和右栏显示骨架屏（复用 Transition 动效中已有的骨架屏），预加载完成后自动显示内容。预加载期间用户仍可操作左栏事件列表。

## 缓存失效规则

| 操作 | events | imageCache | trCache | datesWithRecords/titles/colors |
|------|--------|------------|---------|-------------------------------|
| preloadYearData | 全量替换 | 全量替换 | 全量替换 | 全量替换 |
| saveEvent | 更新对应条目 | — | — | add date / set title+color |
| deleteEvent | 移除对应条目 | 移除对应日期 | 移除对应日期 | delete date / delete title+color |
| addImage | — | push 到对应日期 | — | — |
| removeImage | — | filter 对应日期 | — | — |
| link/unlink 交易 | — | — | 清除对应日期(重新请求) | — |

## 错误处理

- 预加载中单个 API 失败：静默忽略，该日期缓存为空，首次点击时重试
- 预加载整体失败：不做 fallback，用户切换事件时走旧的按需加载
- 快速切换年份：用 callId 竞态保护，旧年份的预加载结果不覆盖新年份
