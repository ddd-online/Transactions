# KeyEventImageGallery 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 KeyEventDetail 中的图片网格替换为左侧大图+右侧缩略图画廊组件

**Architecture:** 新建 KeyEventImageGallery.vue，双栏布局（左 flex:1 大图 + 右 80px 缩略图列），选中状态内部管理，emit delete-image 事件。KeyEventDetail 替换旧的图片网格为 `<KeyEventImageGallery>`。

**Tech Stack:** Vue 3 + TypeScript + Ant Design Vue (a-image)

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `app/src/components/key_event_view/KeyEventImageGallery.vue` | 新建 | 图片画廊：左大图+右缩略图 |
| `app/src/components/key_event_view/KeyEventDetail.vue` | 修改 | 替换图片网格为 `<KeyEventImageGallery>`，清理旧 CSS |

---

### Task 1: 创建 KeyEventImageGallery.vue

**Files:**
- Create: `app/src/components/key_event_view/KeyEventImageGallery.vue`

- [ ] **Step 1: 编写组件**

```vue
<template>
  <div class="image-gallery">
    <!-- 空状态 -->
    <div v-if="images.length === 0" class="gallery-empty">
      <span>暂无图片</span>
    </div>

    <template v-else>
      <!-- 左侧大图 -->
      <div class="gallery-main" @click="triggerPreview">
        <a-image
          v-if="selectedImage"
          :src="selectedImage.data"
          :preview="true"
          width="100%"
          height="100%"
          style="object-fit: cover;"
          :preview-visible="previewVisible"
          @visible-change="onPreviewChange"
        />
      </div>

      <!-- 右侧缩略图列 -->
      <div class="gallery-thumbs">
        <div
          v-for="img in images"
          :key="img.id"
          class="thumb-item"
          :class="{ 'is-selected': selectedId === img.id }"
          @click="selectedId = img.id"
        >
          <img :src="img.data" class="thumb-img" alt="" />
          <a-button
            type="text"
            size="small"
            class="thumb-delete-btn"
            @click.stop="$emit('delete-image', img.id)"
          >
            <template #icon><CloseOutlined /></template>
          </a-button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { KeyEventImage } from '@/types/billadm'

const props = defineProps<{
  images: KeyEventImage[]
}>()

defineEmits<{
  (e: 'delete-image', imageId: string): void
}>()

const selectedId = ref<string>('')
const previewVisible = ref(false)

const selectedImage = computed(() =>
  props.images.find(img => img.id === selectedId.value) ?? null
)

// 默认选中第一张
watch(
  () => props.images,
  (imgs) => {
    if (imgs.length === 0) {
      selectedId.value = ''
      return
    }
    // 当前选中不在列表中则重置为首张
    if (!imgs.find(i => i.id === selectedId.value)) {
      selectedId.value = imgs[0].id
    }
  },
  { immediate: true }
)

const triggerPreview = () => {
  if (selectedImage.value) {
    previewVisible.value = true
  }
}

const onPreviewChange = (visible: boolean) => {
  previewVisible.value = visible
}
</script>

<style scoped>
.image-gallery {
  display: flex;
  gap: 8px;
  flex: 1;
  min-height: 0;
  margin-bottom: var(--billadm-space-md);
}

/* 空状态 */
.gallery-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--billadm-color-text-disabled);
  font-size: var(--billadm-size-text-body-sm);
}

/* 左侧大图 */
.gallery-main {
  flex: 1;
  min-width: 0;
  border-radius: var(--billadm-radius-md);
  overflow: hidden;
  cursor: pointer;
  background-color: var(--billadm-color-minor-background);
}

.gallery-main :deep(.ant-image) {
  display: block;
  width: 100%;
  height: 100%;
}

/* 右侧缩略图列 */
.gallery-thumbs {
  width: 80px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
}

.thumb-item {
  position: relative;
  width: 80px;
  height: 60px;
  flex-shrink: 0;
  border-radius: var(--billadm-radius-sm);
  overflow: hidden;
  cursor: pointer;
  border: 2px solid transparent;
  transition: border-color var(--billadm-transition-fast);
}

.thumb-item.is-selected {
  border-color: var(--billadm-color-primary);
}

.thumb-item:hover {
  border-color: var(--billadm-color-primary-light);
}

.thumb-item.is-selected:hover {
  border-color: var(--billadm-color-primary);
}

.thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumb-delete-btn {
  position: absolute;
  top: 1px;
  right: 1px;
  width: 16px;
  height: 16px;
  padding: 0;
  min-width: 0;
  background: rgba(0, 0, 0, 0.55);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity var(--billadm-transition-fast);
  border: none;
}

.thumb-item:hover .thumb-delete-btn {
  opacity: 1;
}

.thumb-delete-btn :deep(.anticon) {
  color: #fff;
  font-size: 9px;
}
</style>
```

- [ ] **Step 2: 类型检查**

```bash
cd app && npx vue-tsc --noEmit --pretty false 2>&1 | tail -10
```

- [ ] **Step 3: Commit**

```bash
git add app/src/components/key_event_view/KeyEventImageGallery.vue
git commit -m "feat: 新增 KeyEventImageGallery 左大图右缩略图画廊组件"
```

---

### Task 2: 修改 KeyEventDetail.vue

**Files:**
- Modify: `app/src/components/key_event_view/KeyEventDetail.vue`

- [ ] **Step 1: 替换图片网格为 KeyEventImageGallery**

替换模板中第 10-35 行（旧的 `detail-images` 块）：

```html
      <!-- 图片画廊 -->
      <KeyEventImageGallery
        :images="images"
        @delete-image="(id: string) => $emit('delete-image', id)"
      />
```

- [ ] **Step 2: 删除旧的图片相关 CSS（第 167-219 行）**

删除 `.detail-images`, `.image-grid`, `.image-thumb`, `.image-thumb :deep(.ant-image)`, `.image-delete-btn`, `.image-thumb:hover .image-delete-btn`, `.image-delete-btn :deep(.anticon)` 这些样式规则。

- [ ] **Step 3: 构建验证**

```bash
cd app && npm run build 2>&1 | tail -5
```
预期：`✓ built in XXs`

- [ ] **Step 4: Commit**

```bash
git add app/src/components/key_event_view/KeyEventDetail.vue
git commit -m "refactor: KeyEventDetail 图片区替换为 KeyEventImageGallery 组件"
```
