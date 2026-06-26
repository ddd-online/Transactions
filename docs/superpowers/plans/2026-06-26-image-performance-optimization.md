# 图片加载性能优化（Blob + Canvas 缩略图） 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** base64 图片在进入 DOM 前转为 Blob URL + Canvas 缩略图，消除 DOM 中 5MB 字符串和全尺寸缩略图解码开销。

**Architecture:** 新增 imageOptimizer.ts 工具模块（base64→Blob + Canvas 缩略图 + URL 管理），store 中新增 imageUrlCache 负责 URL 生命周期，KeyEventImageGallery 改为从 cache 读取 blob URL 渲染。

**Tech Stack:** Canvas API, URL.createObjectURL, Vue 3 + TypeScript

## Global Constraints

- 不改变 Go 后端
- 不改变 SQLite 存储格式
- 缩略图不持久化
- Canvas 失败时 fallback 到全尺寸 blob URL
- 切换事件/删除图片时必须 revoke blob URL

---

### Task 1: 新建 imageOptimizer.ts 工具模块

**Files:**
- Create: `app/src/backend/imageOptimizer.ts`

**Interfaces:**
- Produces:
  - `ImageUrls { full: string; thumb: string }`
  - `base64ToBlob(base64: string): Blob`
  - `generateThumbnail(source: Blob, maxWidth?: number): Promise<Blob>`
  - `createImageUrls(base64: string): Promise<ImageUrls>`
  - `revokeImageUrls(urls: ImageUrls): void`

- [ ] **Step 1: 创建文件并实现所有函数**

```typescript
// app/src/backend/imageOptimizer.ts

export interface ImageUrls {
  full: string    // blob:... 全尺寸
  thumb: string   // blob:... 缩略图
}

/** 将 base64 data URI 转成 Blob */
export function base64ToBlob(base64: string): Blob {
  const parts = base64.split(',')
  const mime = parts[0]!.match(/:(.*?);/)![1]!
  const raw = atob(parts[1]!)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i)
  }
  return new Blob([bytes], { type: mime })
}

/** 用 Canvas 从 Blob 生成缩略图（maxWidth 300，JPEG quality 0.75） */
export async function generateThumbnail(source: Blob, maxWidth = 300): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(source)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const ratio = Math.min(maxWidth / img.width, 1)  // 不放大
      const w = Math.round(img.width * ratio)
      const h = Math.round(img.height * ratio)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, w, h)
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob)
          else reject(new Error('Canvas toBlob failed'))
        },
        'image/jpeg',
        0.75,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Image load failed for thumbnail generation'))
    }
    img.src = url
  })
}

/** base64 → { fullUrl, thumbUrl } */
export async function createImageUrls(base64: string): Promise<ImageUrls> {
  const blob = base64ToBlob(base64)
  const fullUrl = URL.createObjectURL(blob)

  let thumbUrl = fullUrl  // fallback
  try {
    const thumbBlob = await generateThumbnail(blob)
    thumbUrl = URL.createObjectURL(thumbBlob)
  } catch {
    // 缩略图生成失败，使用全尺寸 fallback
  }

  return { full: fullUrl, thumb: thumbUrl }
}

/** 释放 blob URLs */
export function revokeImageUrls(urls: ImageUrls): void {
  if (urls.full) URL.revokeObjectURL(urls.full)
  if (urls.thumb && urls.thumb !== urls.full) URL.revokeObjectURL(urls.thumb)
}
```

- [ ] **Step 2: 验证编译通过**

```bash
cd app && npx vue-tsc --noEmit --project tsconfig.json
```

- [ ] **Step 3: Commit**

```bash
git add app/src/backend/imageOptimizer.ts
git commit -m "feat: 新增 imageOptimizer — base64→Blob + Canvas 缩略图 + URL 管理"
```

---

### Task 2: keyEventStore — 集成 imageUrlCache

**Files:**
- Modify: `app/src/stores/keyEventStore.ts`

**Interfaces:**
- Consumes: `createImageUrls`, `revokeImageUrls`, `ImageUrls` — 来自 Task 1
- Produces: `imageUrlCache: Ref<Map<string, ImageUrls>>` — 供 Task 3 使用

- [ ] **Step 1: 导入 imageOptimizer**

在文件顶部 import 中添加：

```typescript
import { createImageUrls, revokeImageUrls, type ImageUrls } from '@/backend/imageOptimizer'
```

- [ ] **Step 2: 新增 imageUrlCache ref**

在 `trCache` 声明之后添加：

```typescript
const imageUrlCache = ref(new Map<string, ImageUrls>())
```

- [ ] **Step 3: fetchImages 完成后生成 blob URLs**

修改 `fetchImages` 函数，在设置 `images.value = result` 之前插入 URL 生成：

```typescript
const fetchImages = async (date: string): Promise<void> => {
    const ledgerId = getLedgerId()
    if (!ledgerId) return
    if (imageCache.value.has(date)) {
        images.value = imageCache.value.get(date)!
        return
    }
    try {
        const result = await queryKeyEventImages(date, ledgerId);
        imageCache.value.set(date, result);
        images.value = result;
        // 异步生成 blob URLs（不阻塞渲染）
        for (const img of result) {
            if (!imageUrlCache.value.has(img.id)) {
                createImageUrls(img.data).then(urls => {
                    imageUrlCache.value.set(img.id, urls)
                }).catch(() => { /* 静默忽略，组件 fallback 到 base64 */ })
            }
        }
    } catch (error) {
        NotificationUtil.error('加载图片失败', `${error}`);
        images.value = [];
    }
};
```

- [ ] **Step 4: clearImages 时 revoke URLs**

修改 `clearImages`：

```typescript
const clearImages = (): void => {
    // revoke 所有 blob URLs
    for (const urls of imageUrlCache.value.values()) {
        revokeImageUrls(urls)
    }
    imageUrlCache.value.clear()
    images.value = [];
};
```

- [ ] **Step 5: removeImage 时 revoke 单张 URL**

在 `removeImage` 中添加（在 `images.value = images.value.filter(...)` 之后）：

```typescript
// revoke blob URL
const urls = imageUrlCache.value.get(imageId)
if (urls) {
    revokeImageUrls(urls)
    imageUrlCache.value.delete(imageId)
}
```

- [ ] **Step 6: addImage 后生成 blob URL**

在 `addImage` 的 push 之后添加：

```typescript
// 为新图片生成 blob URLs
createImageUrls(data).then(urls => {
    imageUrlCache.value.set(imageId, urls)
}).catch(() => {})
```

- [ ] **Step 7: deleteEvent 时 revoke 该日期图片 URLs**

在 `deleteEvent` 中 `imageCache.value.delete(date)` 之前，revoke 该日期的 blob URLs：

```typescript
const cachedImgs = imageCache.value.get(date)
if (cachedImgs) {
    for (const img of cachedImgs) {
        const urls = imageUrlCache.value.get(img.id)
        if (urls) {
            revokeImageUrls(urls)
            imageUrlCache.value.delete(img.id)
        }
    }
}
```

- [ ] **Step 8: preloadYearData 中 fetchImages 调用改为本地**

preloadYearData 中已调用 `queryKeyEventImages` 并将结果写入 `imageCache`。需要同时生成 blob URLs：

```typescript
// 在 preloadYearData 中，queryKeyEventImages 调用后添加：
imageCache.value.set(e.date, imgs);
// 生成 blob URLs
for (const img of imgs) {
    if (!imageUrlCache.value.has(img.id)) {
        createImageUrls(img.data).then(urls => {
            imageUrlCache.value.set(img.id, urls)
        }).catch(() => {})
    }
}
```

- [ ] **Step 9: 导出 imageUrlCache**

在 return 块中添加 `imageUrlCache`。

- [ ] **Step 10: 验证编译通过**

```bash
cd app && npx vue-tsc --noEmit --project tsconfig.json
```

- [ ] **Step 11: Commit**

```bash
git add app/src/stores/keyEventStore.ts
git commit -m "feat: keyEventStore 集成 imageUrlCache — blob URL 生成/revoke 生命周期"
```

---

### Task 3: KeyEventImageGallery — 渲染 blob URL

**Files:**
- Modify: `app/src/components/key_event_view/KeyEventImageGallery.vue`

**Interfaces:**
- Consumes: `imageUrlCache: Map<string, ImageUrls>` — 来自 Task 2

- [ ] **Step 1: 新增 urlCache prop**

在 Props 中添加：

```typescript
import type { ImageUrls } from '@/backend/imageOptimizer'

const props = defineProps<{
  images: KeyEventImage[]
  urlCache: Map<string, ImageUrls>
}>()
```

- [ ] **Step 2: 大图渲染改用 blob URL**

将第 11 行 `:src="selectedImage.data"` 改为：

```vue
<a-image
  v-if="selectedImage"
  :src="urlCache.get(selectedImage.id)?.full ?? selectedImage.data"
  :preview="true"
  width="100%"
  height="100%"
  style="object-fit: cover;"
  :preview-visible="previewVisible"
  @visible-change="onPreviewChange"
/>
```

- [ ] **Step 3: 缩略图渲染改用 blob URL**

将第 20 行 `:src="img.data"` 改为：

```vue
<img :src="urlCache.get(img.id)?.thumb ?? img.data" class="thumb-img" alt="" />
```

- [ ] **Step 4: 父组件传递 urlCache**

KeyEventDetail 需要接收并透传 `urlCache`。修改 `KeyEventDetail.vue` 的 Props 和模板：

Props 增加：
```typescript
urlCache?: Map<string, ImageUrls>
```

`KeyEventImageGallery` 增加 prop：
```vue
<KeyEventImageGallery
  :images="images"
  :url-cache="urlCache"
  @delete-image="(id: string) => $emit('delete-image', id)"
/>
```

KeyEventView 模板中传递：
```vue
<KeyEventDetail
  ...
  :url-cache="keyEventStore.imageUrlCache"
/>
```

- [ ] **Step 5: 验证编译通过**

```bash
cd app && npx vue-tsc --noEmit --project tsconfig.json
```

- [ ] **Step 6: Commit**

```bash
git add app/src/components/key_event_view/KeyEventImageGallery.vue \
        app/src/components/key_event_view/KeyEventDetail.vue \
        app/src/components/key_event_view/KeyEventView.vue
git commit -m "feat: KeyEventImageGallery 渲染 blob URL 替代 base64，透传 urlCache"
```

---

### Task 4: 整体验证

- [ ] **Step 1: 完整构建**

```bash
cd app && npm run build
```

- [ ] **Step 2: Go 测试**

```bash
cd kernel && go test ./...
```

- [ ] **Step 3: 更新文档 + Commit**

```bash
git add .wolf/anatomy.md .wolf/memory.md
git commit -m "chore: 记录图片性能优化实施完成"
```
