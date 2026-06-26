# 关键事件图片加载性能优化设计

日期: 2026-06-26
状态: 待实施

## 背景

4MB 左右的图片以 base64 字符串形式存储在 SQLite 中。切换事件时即使数据已从 memory cache 读取，浏览器仍需做 base64 解码 + JPEG 解析，大图缩略图使用原图 CSS 缩放——浏览器解码 4000×3000 像素只为渲染 160×90 的缩略图。DOM 中每张图片的 `src` 属性都是 5MB+ 的 base64 字符串，Vue 响应式系统对如此大的字符串做 Proxy 包裹也带来额外开销。

## 目标

1. 将 base64 字符串转为 Blob URL 后再渲染，DOM 中 `src` 从 5MB 字符串缩减为 ~40 字节
2. 缩略图用 Canvas 生成真实小图（300px 宽），而非 CSS 缩放原图
3. 切换事件/删除图片时 revoke Blob URL，防止内存泄漏

## 架构

### 新增工具模块

`app/src/backend/imageOptimizer.ts` — 纯工具函数，无 Vue/组件依赖：

```typescript
// base64 字符串 → Blob
function base64ToBlob(base64: string): Blob

// 图片文件/Blob → 缩略图 Blob（maxWidth=300, JPEG quality=0.75）
async function generateThumbnail(source: Blob, maxWidth?: number): Promise<Blob>

// base64 → { fullUrl, thumbUrl } 两个 blob URL
async function createImageUrls(base64: string): Promise<ImageUrls>

// 释放 blob URL
function revokeImageUrls(urls: ImageUrls): void
```

### 运行时 URL 缓存

Store 中新增：

```typescript
const imageUrlCache = ref(new Map<string, ImageUrls>())
```

- `fetchImages` 完成后：遍历结果，对每个未缓存的 image 调用 `createImageUrls`
- `clearImages` / `removeImage`：`revokeImageUrls` + 从 cache 删除
- 切换事件时：旧事件的 URLs 被 revoke（通过 `clearImages`）

### 组件改动

`KeyEventImageGallery.vue` 接收新的 prop `urlCache: Map<string, ImageUrls>`，渲染时：

```vue
<!-- 大图 -->
<a-image :src="urlCache.get(selectedImage.id)?.full" />

<!-- 缩略图 -->
<img :src="urlCache.get(img.id)?.thumb" />
```

### 数据流

```
preloadYearData → fetchImages
  → queryKeyEventImages()          // API 返回 base64[]
  → result.forEach(img =>
       createImageUrls(img.data)    // base64 → Blob → Canvas → Blob
         .then(urls => imageUrlCache.set(img.id, urls))
     )
  → images.value = result           // 保持原有逻辑
  → 组件从 urlCache 读取 blob URL 渲染
```

### 改动清单

| 文件 | 操作 | 概述 |
|------|------|------|
| **新增** `app/src/backend/imageOptimizer.ts` | ~70行 | base64→Blob, Canvas 缩略图, URL 管理 |
| `app/src/stores/keyEventStore.ts` | ~20行 | 新增 imageUrlCache；fetchImages 后生成 URL；clearImages/removeImage 时 revoke |
| `app/src/components/key_event_view/KeyEventImageGallery.vue` | ~15行 | 新增 urlCache prop；src 改为 blob URL；缩略图使用 thumb URL |

### 不在范围内

- 不改 Go 后端
- 不改 SQLite 存储格式
- 缩略图不持久化
- 不改变 KeyEventDetail/KeyEventView 其他逻辑

## 内存管理

| 时机 | 操作 |
|------|------|
| 预加载完成 | 全年图片的 blob URLs 常驻内存（全年估计 < 20 张，每张缩略图 ~15KB + 全图 blob 引用，总 < 100MB） |
| 切换年份 | 旧年份所有 URLs 被 revoke |
| 删除图片 | 单张 URL 被 revoke |
| 删除事件 | 该事件所有图片 URLs 被 revoke |
| 应用退出 | 浏览器自动回收所有 blob URLs |

## 错误处理

- Canvas 生成缩略图失败：fallback 到全尺寸 blob URL
- 单个图片转换失败：不影响其他图片，该图片的 urlCache 为空，组件 fallback 到原始 base64
- 预加载中转换失败：静默忽略，切换事件时重试转换
