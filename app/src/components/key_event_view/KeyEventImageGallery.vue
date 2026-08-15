<template>
  <div class="image-gallery">
    <!-- 空状态 -->
    <div v-if="images.length === 0" class="gallery-empty">
      <span>暂无图片</span>
    </div>

    <template v-else>
      <!-- 左侧大图 -->
      <div class="gallery-main" @click="triggerPreview">
        <a-image v-if="selectedImage" :src="getImageUrl(selectedImage.filePath)" :preview="true" width="100%" height="100%"
          style="object-fit: cover;" :preview-visible="previewVisible" @visible-change="onPreviewChange" loading="lazy" />
        <button class="download-btn" @click.stop="handleDownload" aria-label="下载图片">
          <DownloadOutlined />
        </button>
      </div>

      <!-- 右侧缩略图列 -->
      <div class="gallery-thumbs-wrap">
        <div class="gallery-thumbs">
          <div v-for="(img, index) in images" :key="img.id" class="thumb-item"
            :class="{ 'is-selected': selectedId === img.id, 'thumb-enter': true }"
            :style="{ animationDelay: `${Math.min(index * 50, 300)}ms` }" @click="selectedId = img.id">
            <img :src="getImageUrl(img.thumbPath)" class="thumb-img" alt="" loading="lazy" decoding="async" />
            <button class="thumb-delete-btn" @click.stop="$emit('delete-image', img.id)" aria-label="删除图片">
              <CloseOutlined />
            </button>
          </div>
        </div>

      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { CloseOutlined, DownloadOutlined } from '@ant-design/icons-vue'
import type { KeyEventImage } from '@/types/transactions'
import { getImageUrl } from '@/backend/imageUrl'
import { getErrorMessage } from '@/backend/errorHandler'
import { message } from 'ant-design-vue'

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



const handleDownload = async () => {
  if (!selectedImage.value) return
  try {
    const result = await window.electronAPI.saveFile(selectedImage.value.filePath)
    if (result.canceled) return
    if (result.success) {
      message.success('图片已保存')
    } else {
      message.error(result.error || '保存失败')
    }
  } catch (e) {
    message.error(getErrorMessage(e) || '保存失败')
  }
}

const triggerPreview = () => {
  if (selectedImage.value) {
    previewVisible.value = true
  }
}

const onPreviewChange = (visible: boolean) => {
  previewVisible.value = visible
}
</script>

<style scoped lang="scss">
@use '@/styles/mixins' as *;
.image-gallery {
  display: flex;
  gap: var(--transactions-space-sm);
  flex: 1;
  min-height: 0;
  margin-bottom: var(--transactions-space-md);
}

/* 空状态 */
.gallery-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--transactions-color-text-disabled);
  font-size: var(--transactions-size-text-body-sm);
}

/* 左侧大图 */
.gallery-main {
  position: relative;
  flex: 1;
  min-width: 0;
  border-radius: var(--transactions-radius-md);
  overflow: hidden;
  cursor: pointer;
  background-color: var(--transactions-color-major-warm);
  border: 1px dashed var(--transactions-color-window-border);
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

.download-btn {
  position: absolute;
  bottom: 8px;
  right: 8px;
  width: 32px;
  height: 32px;
  padding: 0;
  background: rgba(255, 255, 255, 0.88);
  border-radius: var(--transactions-radius-sm);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.06),
              0 1px 3px rgba(0, 0, 0, 0.12);
  line-height: 1;
  z-index: 1;
  transition: background var(--transactions-transition-fast),
              transform var(--transactions-transition-fast),
              box-shadow var(--transactions-transition-fast);
}

.download-btn:hover {
  background: #fff;
  transform: scale(1.1);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08),
              0 2px 6px rgba(0, 0, 0, 0.18);
}

.download-btn:focus-visible {
  outline: 2px solid var(--transactions-color-primary);
  outline-offset: 2px;
}

.download-btn:active {
  transform: scale(0.95);
  background: var(--transactions-color-minor-background);
}

.download-btn :deep(.anticon) {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--transactions-size-text-body);
  color: rgba(0, 0, 0, 0.65);
}

.download-btn:hover :deep(.anticon) {
  color: var(--transactions-color-primary);
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
  gap: var(--transactions-space-xs);
  overflow-y: auto;
  overflow-x: hidden;
  contain: strict;

  @include custom-scrollbar;
}

.thumb-item {
  position: relative;
  width: 100%;
  height: 90px;
  flex-shrink: 0;
  border-radius: var(--transactions-radius-sm);
  overflow: hidden;
  cursor: pointer;
  border: 2px solid transparent;
  transition: border-color var(--transactions-transition-smooth),
              box-shadow var(--transactions-transition-smooth),
              transform var(--transactions-transition-fast),
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
  border-color: var(--transactions-color-primary);
  box-shadow: var(--transactions-shadow-md);
}

.thumb-item:hover {
  border-color: var(--transactions-color-primary-light);
  transform: scale(1.03);
}

.thumb-item:hover .thumb-delete-btn {
  opacity: 1;
}

.thumb-item.is-selected:hover {
  border-color: var(--transactions-color-primary);
  transform: none;
}

.thumb-item:focus-visible {
  outline: 2px solid var(--transactions-color-primary);
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
  transition: opacity var(--transactions-transition-fast),
              transform var(--transactions-transition-fast);
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
  font-size: var(--transactions-size-text-caption);
  color: rgba(0, 0, 0, 0.65);
}

.thumb-delete-btn:hover :deep(.anticon) {
  color: rgba(0, 0, 0, 0.85);
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
  .download-btn {
    transition: none;
  }
  .download-btn:hover {
    transform: none;
  }
  .download-btn:active {
    transform: none;
  }
  .thumb-delete-btn {
    transition: none;
  }
  .thumb-delete-btn:hover {
    transform: none;
  }
}
</style>
