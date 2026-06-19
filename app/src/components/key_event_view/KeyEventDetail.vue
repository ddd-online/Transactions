<template>
  <div class="detail-panel">
    <!-- 空状态：未选择事件 -->
    <div v-if="!event" class="panel-empty">
      <span class="panel-empty-text">选择左侧事件查看详情</span>
    </div>

    <!-- 事件详情 -->
    <template v-else>
      <!-- 图片网格 -->
      <div v-if="images.length > 0 || true" class="detail-images">
        <div class="image-grid">
          <div
            v-for="img in images"
            :key="img.id"
            class="image-thumb"
          >
            <a-image
              :src="img.data"
              :preview="true"
              width="100%"
              height="100%"
              style="object-fit: cover;"
            />
            <a-button
              type="text"
              size="small"
              class="image-delete-btn"
              @click="$emit('delete-image', img.id)"
            >
              <template #icon><CloseOutlined /></template>
            </a-button>
          </div>
          <div
            class="image-add"
            tabindex="0"
            role="button"
            aria-label="添加图片"
            @click="triggerFileInput"
            @paste="handlePaste"
          >
            <PlusOutlined />
            <input
              ref="fileInputRef"
              type="file"
              accept="image/*"
              multiple
              style="display: none"
              @change="handleFileSelect"
            />
          </div>
        </div>
      </div>

      <!-- 描述区域 -->
      <div class="detail-description">
        <div class="description-header">
          <span class="description-label">描述</span>
          <a-button
            v-if="!isEditing"
            type="text"
            size="small"
            @click="$emit('edit')"
          >
            <template #icon><EditOutlined /></template>
            编辑
          </a-button>
        </div>

        <!-- 查看模式 -->
        <div v-if="!isEditing" class="description-content">
          <p v-if="event.content" class="description-text">{{ event.content }}</p>
          <p v-else class="description-placeholder">暂无描述</p>
        </div>

        <!-- 编辑模式 -->
        <div v-else class="description-edit">
          <a-textarea
            v-model:value="localContent"
            :rows="5"
            :maxlength="5000"
            show-count
            placeholder="输入描述内容..."
          />
          <div class="description-actions">
            <a-button size="small" @click="handleCancel">取消</a-button>
            <a-button type="primary" size="small" @click="handleSave">保存</a-button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { KeyEvent, KeyEventImage } from '@/types/billadm';

interface Props {
  event: KeyEvent | null;
  images: KeyEventImage[];
  isEditing: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'edit'): void;
  (e: 'save', content: string): void;
  (e: 'cancel-edit'): void;
  (e: 'add-image', file: File): void;
  (e: 'delete-image', imageId: string): void;
}>();

// 本地编辑内容，与 event.content 同步
const localContent = ref(props.event?.content ?? '');

watch(
  () => props.event,
  (newEvent) => {
    localContent.value = newEvent?.content ?? '';
  },
);

// 文件选择
const fileInputRef = ref<HTMLInputElement | null>(null);

const triggerFileInput = () => {
  fileInputRef.value?.click();
};

const handleFileSelect = (e: Event) => {
  const input = e.target as HTMLInputElement;
  const files = input.files;
  if (!files || files.length === 0) return;
  for (const file of files) {
    emit('add-image', file);
  }
  input.value = '';
};

// 粘贴处理
const handlePaste = (e: ClipboardEvent) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) {
        emit('add-image', file);
      }
    }
  }
};

// 保存/取消
const handleSave = () => {
  emit('save', localContent.value);
};

const handleCancel = () => {
  localContent.value = props.event?.content ?? '';
  emit('cancel-edit');
};
</script>

<style scoped>
.detail-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  padding: var(--billadm-space-md);
  background-color: var(--billadm-color-major-background);
}

/* ========== 空状态 ========== */
.panel-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.panel-empty-text {
  font-size: var(--billadm-size-text-body-sm);
  color: var(--billadm-color-text-disabled);
}

/* ========== 图片网格 ========== */
.detail-images {
  margin-bottom: var(--billadm-space-md);
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.image-thumb {
  position: relative;
  border-radius: var(--billadm-radius-sm);
  overflow: hidden;
  aspect-ratio: 4 / 3;
}

.image-thumb :deep(.ant-image) {
  display: block;
  width: 100%;
  height: 100%;
}

.image-delete-btn {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 20px;
  height: 20px;
  padding: 0;
  min-width: 0;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity var(--billadm-transition-fast);
  border: none;
}

.image-thumb:hover .image-delete-btn {
  opacity: 1;
}

.image-delete-btn :deep(.anticon) {
  color: #fff;
  font-size: 10px;
}

.image-add {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 4 / 3;
  border: 1px dashed var(--billadm-color-window-border);
  border-radius: var(--billadm-radius-sm);
  color: var(--billadm-color-text-secondary);
  cursor: pointer;
  transition: border-color var(--billadm-transition-fast),
              color var(--billadm-transition-fast);
}

.image-add:hover {
  border-color: var(--billadm-color-primary);
  color: var(--billadm-color-primary);
}

/* ========== 描述区域 ========== */
.detail-description {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.description-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--billadm-space-sm);
}

.description-label {
  font-size: var(--billadm-size-text-body-sm);
  font-weight: var(--billadm-weight-medium);
  color: var(--billadm-color-text-major);
}

.description-content {
  flex: 1;
}

.description-text {
  margin: 0;
  font-size: var(--billadm-size-text-body-sm);
  color: var(--billadm-color-text-major);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.description-placeholder {
  margin: 0;
  font-size: var(--billadm-size-text-body-sm);
  color: var(--billadm-color-text-disabled);
}

.description-edit {
  display: flex;
  flex-direction: column;
  gap: var(--billadm-space-sm);
  flex: 1;
}

.description-edit :deep(.ant-input-textarea) {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.description-edit :deep(.ant-input-textarea textarea) {
  flex: 1;
  resize: none;
}

.description-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--billadm-space-xs);
}
</style>
