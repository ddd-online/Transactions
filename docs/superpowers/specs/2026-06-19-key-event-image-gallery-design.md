# KeyEventImageGallery 图片画廊组件设计

## 概述

从 KeyEventDetail 中提取图片区域为独立组件 `KeyEventImageGallery`，实现左侧大图 + 右侧缩略图列表的双栏布局。

## 布局

```
┌──────────────────────────────┬──────┐
│                              │ 缩1  │  ← 选中高亮
│       大图显示区域           │ 缩2  │
│     (选中图片全尺寸)         │ 缩3  │
│     点击 → Image 预览        │  ...  │  ← overflow-y: auto
│                              │ 缩N  │
└──────────────────────────────┴──────┘
         flex: 1                   80px
```

- 左栏 flex:1 — 大图，object-fit: cover，点击触发 `a-image` 预览
- 右栏 80px — 缩略图垂直排列，超出滚动，gap 4px
- 选中缩略图：2px primary 色边框

## 组件接口

**Props:**
| 名称 | 类型 | 说明 |
|------|------|------|
| `images` | `KeyEventImage[]` | 图片列表 |

**Emits:**
| 名称 | 参数 | 说明 |
|------|------|------|
| `delete-image` | `imageId: string` | 点击缩略图删除按钮 |

## 行为

1. 默认选中第一张图片（`images[0]`）
2. 点击右侧缩略图 → `selectedId` 切换，大图更新
3. 点击左侧大图 → 触发 `a-image` 预览弹窗
4. 缩略图右上角删除按钮（`CloseOutlined`），hover 时显示
5. 当 `images` 变化时（如删除后），若 `selectedId` 不在列表中则自动选中第一张
6. 无图片时：空状态占位 "暂无图片"

## 与 KeyEventDetail 的关系

- `KeyEventImageGallery` 只负责图片展示 / 选中 / 删除
- 「添加图片」按钮保留在 `KeyEventDetail` 底部操作栏
- `KeyEventDetail` 传递 `images`，监听 `delete-image`，透传到父组件 `KeyEventView`

## 文件变更

| 文件 | 操作 |
|------|------|
| `app/src/components/key_event_view/KeyEventImageGallery.vue` | 新建 |
| `app/src/components/key_event_view/KeyEventDetail.vue` | 修改：替换图片网格为 `<KeyEventImageGallery>` |

## 边界情况

| 场景 | 处理 |
|------|------|
| 无图片 | 空状态 "暂无图片" |
| 删除选中图片 | 自动选中下一张（优先下一张，否则上一张，否则清空） |
| 图片列表更新 | watch images，若 selectedId 失效则重置 |
| 只有一张图 | 缩略图仅显示一张，无滚动条 |
