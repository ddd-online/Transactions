# 关键事件切换过渡动效设计

日期: 2026-06-26
状态: 待实施

## 背景

关键事件页面切换事件时存在两个体验问题：
1. 图片切换不及时 — 旧事件图片残留到新数据加载完成
2. 数据切换无过渡 — 内容突然替换，生硬不自然

## 目标

为事件切换引入"翻阅账本"式的过渡动效——利落、有质感、不抢戏。

## 动效规格

### 核心节奏：不对称 2:1

| 阶段 | 时长 | 缓动 | 效果 |
|------|------|------|------|
| 闪出 | 150ms | `ease` (`--billadm-transition-fast`) | 旧内容快速消失 |
| 闪入 | 300ms | `cubic-bezier(0.25, 1, 0.5, 1)` (`--billadm-transition-smooth`) | 新内容从容浮现 |

### 三阶段流程

```
点击事件
  → 立即清空 images + linkedTransactions + 旧错误状态
  → [闪出 150ms] detail-panel scale(0.98) + opacity(0)
  → [数据加载] 骨架屏占位
  → [闪入 300ms] detail-panel scale(1) + opacity(1)
  → 画廊大图先出 (fade 400ms) → 缩略图跟随 (stagger 50ms)
  → 交易卡片逐张流式淡入 (每张 stagger 40ms，最多累计 300ms)
```

### 各区域细节

| 区域 | 闪出 | 闪入 | 骨架/空态 |
|------|------|------|----------|
| 详情面板 | `opacity: 1→0; transform: scale(1)→scale(0.98)` 150ms | `opacity: 0→1; transform: scale(0.98)→scale(1)` 300ms | — |
| 图片画廊 | 立即 `clearImages()` | 大图 fade 400ms，缩略图 stagger 50ms | 2 个灰色占位块 |
| 关联交易 | 立即 `linkedTransactions = []` | 卡片逐张 fadeIn，stagger 40ms | 空列表（安静） |

## 架构

### 数据流

```
onSelectEvent(date):
  1. selectedDate = date
  2. isEditing = false
  3. clearImages()              // 立即清空旧图
  4. linkedTransactions = []    // 立即清空旧交易
  5. set loading states         // 骨架屏可见
  6. await fetchEventByDate()   // 先拿事件
  7. currentEvent = event       // → 详情闪入
  8. await fetchImages()        // 再拿图片
  9. → 画廊闪入
  10. await loadLinkedTr()      // 最后拿交易
  11. → 卡片流式淡入
```

### 改动清单

| 文件 | 改动 | 概述 |
|------|------|------|
| `KeyEventView.vue` | ~15行 | `onSelectEvent` 改为 await 全部；新增 `imagesLoading`、`trsLoading` |
| `KeyEventDetail.vue` | ~25行 | `<Transition name="panel">` 包裹；骨架屏状态；`isLoading` prop |
| `KeyEventImageGallery.vue` | ~30行 | 切换立即清空 `selectedId`；骨架屏；大图优先；stagger 缩略图 |
| `KeyEventLinkedTr.vue` | ~20行 | 立即清空；卡片逐张 staggered fadeIn |

### 不在范围内

- 不改变 Go 后端
- 不改变 store 结构
- 不改变上传逻辑
- 不改变三栏布局结构

## CSS Transition 定义

```css
/* 详情面板：微缩放 + 淡入 */
.panel-enter-active {
  transition: opacity 300ms cubic-bezier(0.25, 1, 0.5, 1),
              transform 300ms cubic-bezier(0.25, 1, 0.5, 1);
}
.panel-leave-active {
  transition: opacity 150ms ease,
              transform 150ms ease;
}
.panel-enter-from,
.panel-leave-to {
  opacity: 0;
  transform: scale(0.98);
}

/* 画廊骨架 */
.gallery-skeleton {
  display: flex;
  gap: 8px;
  flex: 1;
  min-height: 0;
}
.gallery-skeleton-main {
  flex: 1;
  border-radius: var(--billadm-radius-md);
  background: var(--billadm-color-minor-background);
  animation: shimmer 1.5s infinite;
}
.gallery-skeleton-thumbs {
  width: 160px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.gallery-skeleton-thumb {
  height: 90px;
  border-radius: var(--billadm-radius-sm);
  background: var(--billadm-color-minor-background);
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* 卡片 staggered 淡入 */
.card-enter-active {
  transition: opacity 250ms ease, transform 250ms ease;
}
.card-enter-from {
  opacity: 0;
  transform: translateY(4px);
}
```

## 错误处理

- API 请求失败：保持空态（clearImages/clearTransactions 已经清空了旧数据），不显示旧内容
- 快速切换事件：新的 `onSelectEvent` 调用前取消前一个（用 AbortController 或标志位），防止重叠
- 超时：`fetchImages` 和 `loadLinkedTransactions` 各自 try/catch，一个失败不影响另一个

## 实现顺序

1. `KeyEventView.vue` — `onSelectEvent` await 改造 + loading 状态
2. `KeyEventDetail.vue` — Transition 包裹 + 骨架屏
3. `KeyEventImageGallery.vue` — 清空逻辑 + 骨架 + stagger
4. `KeyEventLinkedTr.vue` — 清空 + stagger 卡片
