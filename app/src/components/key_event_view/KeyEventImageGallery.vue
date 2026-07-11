<template>
  <div class="image-gallery">
    <!-- 空状态 -->
    <div v-if="images.length === 0" class="gallery-empty">
      <span>暂无图片</span>
    </div>

    <template v-else>
      <!-- 左侧大图 -->
      <div class="gallery-main" @click="triggerPreview">
        <a-image v-if="selectedImage" :src="props.urlCache?.get(selectedImage.id)?.full ?? selectedImage.data" :preview="true" width="100%" height="100%"
          style="object-fit: cover;" :preview-visible="previewVisible" @visible-change="onPreviewChange" loading="lazy" />
      </div>

      <!-- 右侧缩略图列 -->
      <div class="gallery-thumbs-wrap">
        <div ref="thumbsRef" class="gallery-thumbs" @scroll="onScroll">
          <div v-for="(img, index) in images" :key="img.id" class="thumb-item"
            :class="{ 'is-selected': selectedId === img.id, 'thumb-enter': true }"
            :style="{ animationDelay: `${Math.min(index * 50, 300)}ms` }" @click="selectedId = img.id">
            <img :src="props.urlCache?.get(img.id)?.thumb ?? img.data" class="thumb-img" alt="" loading="lazy" decoding="async" />
            <button class="thumb-delete-btn" @click.stop="$emit('delete-image', img.id)" aria-label="删除图片">
              <CloseOutlined />
            </button>
          </div>
        </div>

        <!-- 滚动指示箭头（在滚动容器外，不跟随滚动） -->
        <Transition name="scroll-hint">
          <div v-if="showScrollHint" class="scroll-hint-arrow">
            <DownOutlined />
          </div>
        </Transition>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { DownOutlined, CloseOutlined } from '@ant-design/icons-vue'
import type { KeyEventImage } from '@/types/billadm'
import type { ImageUrls } from '@/backend/imageOptimizer'

const props = defineProps<{
  images: KeyEventImage[]
  urlCache?: Map<string, ImageUrls>
}>()

defineEmits<{
  (e: 'delete-image', imageId: string): void
}>()

const selectedId = ref<string>('')
const previewVisible = ref(false)

const selectedImage = computed(() =>
  props.images.find(img => img.id === selectedId.value) ?? null
)

// 默认选中第一张；若当前选中不在列表中则重置
watch(
  () => props.images,
  (imgs) => {
    if (imgs.length === 0) {
      selectedId.value = ''
      previewVisible.value = false
      return
    }
    if (!imgs.find(i => i.id === selectedId.value)) {
      selectedId.value = imgs[0]!.id
    }
  },
  { immediate: true, deep: true }
)

// 滚动指示
const thumbsRef = ref<HTMLElement | null>(null)
const showScrollHint = ref(false)

const checkOverflow = () => {
  const el = thumbsRef.value
  if (!el) return
  showScrollHint.value = el.scrollHeight > el.clientHeight + 2 && el.scrollTop + el.clientHeight < el.scrollHeight - 4
}

const onScroll = () => {
  checkOverflow()
}

watch(
  () => props.images,
  () => {
    nextTick(() => checkOverflow())
  }
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
  gap: var(--billadm-space-sm);
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
  background-color: var(--billadm-color-major-warm);
  border: 1px dashed var(--billadm-color-window-border);
}

.gallery-main :deep(.ant-image) {
  display: block;
  width: 100%;
  height: 100%;
}

.gallery-main :deep(.ant-image-img) {
  object-fit: cover;
  animation: main-fade-in 400ms cubic-bezier(0.25, 1, 0.5, 1) both;
}

@keyframes main-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* 右侧缩略图列 */
.gallery-thumbs-wrap {
  width: 160px;
  flex-shrink: 0;
  position: relative;
}

.gallery-thumbs {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--billadm-space-xs);
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
  contain: strict;
}

.gallery-thumbs::-webkit-scrollbar {
  display: none;
}

.thumb-item {
  position: relative;
  width: 100%;
  height: 90px;
  flex-shrink: 0;
  border-radius: var(--billadm-radius-sm);
  overflow: hidden;
  cursor: pointer;
  border: 2px solid transparent;
  transition: border-color var(--billadm-transition-smooth),
              box-shadow var(--billadm-transition-smooth),
              transform var(--billadm-transition-fast),
              opacity 300ms cubic-bezier(0.25, 1, 0.5, 1);
}

/* 入场初始态 */
.thumb-enter {
  animation: thumb-fade-in 350ms cubic-bezier(0.25, 1, 0.5, 1) both;
}

@keyframes thumb-fade-in {
  from {
    opacity: 0;
    transform: translateX(8px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.thumb-item.is-selected {
  border-color: var(--billadm-color-primary);
  box-shadow: var(--billadm-shadow-md);
}

.thumb-item:hover {
  border-color: var(--billadm-color-primary-light);
  transform: scale(1.03);
}

.thumb-item:hover .thumb-delete-btn {
  opacity: 1;
}

.thumb-item.is-selected:hover {
  border-color: var(--billadm-color-primary);
  transform: none;
}

.thumb-item:focus-visible {
  outline: 2px solid var(--billadm-color-primary);
  outline-offset: 2px;
}

.thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumb-delete-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  padding: 0;
  background: rgba(255, 255, 255, 0.88);
  border-radius: 50%;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--billadm-transition-fast),
              transform var(--billadm-transition-fast);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.06),
              0 1px 3px rgba(0, 0, 0, 0.12);
  line-height: 1;
  z-index: 1;
}

.thumb-delete-btn:hover {
  background: #fff;
  transform: scale(1.1);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08),
              0 2px 6px rgba(0, 0, 0, 0.18);
}

.thumb-delete-btn :deep(.anticon) {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--billadm-size-text-caption);
  color: rgba(0, 0, 0, 0.65);
}

.thumb-delete-btn:hover :deep(.anticon) {
  color: rgba(0, 0, 0, 0.85);
}

/* ========== 滚动指示箭头 ========== */
.scroll-hint-arrow {
  position: absolute;
  bottom: var(--billadm-space-xs);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--billadm-color-major-background);
  box-shadow: var(--billadm-shadow-md);
  color: var(--billadm-color-primary);
  font-size: var(--billadm-size-text-body);
  pointer-events: none;
}

.scroll-hint-enter-active,
.scroll-hint-leave-active {
  transition: opacity var(--billadm-transition-smooth);
}

.scroll-hint-enter-from,
.scroll-hint-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .thumb-item {
    transition: none;
  }
  .thumb-item:hover {
    transform: none;
  }
  .thumb-enter {
    animation: none;
  }
  .gallery-main :deep(.ant-image-img) {
    animation: none;
  }
  .thumb-delete-btn {
    transition: none;
  }
  .thumb-delete-btn:hover {
    transform: none;
  }
  .scroll-hint-enter-active,
  .scroll-hint-leave-active {
    transition: none;
  }
}
</style>
