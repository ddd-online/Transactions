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

      <!-- 右侧缩略图列 80px -->
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

// 默认选中第一张；若当前选中不在列表中则重置
watch(
  () => props.images,
  (imgs) => {
    if (imgs.length === 0) {
      selectedId.value = ''
      return
    }
    if (!imgs.find(i => i.id === selectedId.value)) {
      selectedId.value = imgs[0]!.id
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
  width: 100px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  overflow-x: hidden;
}

.thumb-item {
  position: relative;
  width: 100%;
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
