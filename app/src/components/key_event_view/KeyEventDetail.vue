<template>
  <div class="detail-panel">
    <!-- 空状态：未选择事件 -->
    <div v-if="!event" class="panel-empty">
      <span class="panel-empty-text">选择左侧事件查看详情</span>
    </div>

    <!-- 事件详情 -->
    <template v-else>
      <!-- 颜色选择栏 -->
      <div v-if="event" class="color-toolbar">
        <div
          v-for="c in EVENT_COLORS"
          :key="c"
          class="color-swatch"
          :class="{ 'is-selected': event.color === c }"
          :style="{ backgroundColor: c }"
          :title="c"
          @click="$emit('color-change', c)"
        />
        <!-- 虚线空白圆：表示不设置颜色 / 使用软件默认颜色 -->
        <div
          class="color-swatch color-swatch-empty"
          :class="{ 'is-selected': !event.color }"
          title="使用默认颜色"
          @click="$emit('color-change', '')"
        />
      </div>

      <!-- 图片画廊 -->
      <KeyEventImageGallery
        :images="images"
        @delete-image="(id: string) => $emit('delete-image', id)"
      />

      <!-- 描述区域 -->
      <div class="detail-description">
        <!-- 查看模式 -->
        <div v-if="!isEditing" class="description-content">
          <p v-if="event.content" class="description-text">{{ event.content }}</p>
          <p v-else class="description-placeholder">暂无描述</p>
        </div>

        <!-- 编辑模式 -->
        <div v-else class="description-edit">
          <a-textarea
            v-model:value="localContent"
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

      <!-- 底部操作栏 -->
      <div class="detail-footer">
        <a-button @click="triggerFileInput">
          <template #icon><PlusOutlined /></template>
          添加图片
        </a-button>
        <a-button
          v-if="!isEditing"
          type="primary"
          @click="$emit('edit')"
        >
          <template #icon><EditOutlined /></template>
          编辑描述
        </a-button>
        <input
          ref="fileInputRef"
          type="file"
          accept="image/*"
          multiple
          style="display: none"
          @change="handleFileSelect"
        />
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

const EVENT_COLORS = [
  '#D9705A', '#C25460', '#D07048', '#D48838',
  '#C6963A', '#A09040', '#5C9858', '#4A8C6F',
  '#5C9E7C', '#3D8878', '#389098', '#4A78A0',
  '#5C8DB5', '#6070A0', '#7868A0', '#8C6B9E',
  '#A06088', '#B06078', '#8C7B6E', '#7E8890',
];

const emit = defineEmits<{
  (e: 'edit'): void;
  (e: 'save', content: string): void;
  (e: 'cancel-edit'): void;
  (e: 'add-image', file: File): void;
  (e: 'delete-image', imageId: string): void;
  (e: 'color-change', color: string): void;
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
/* ========== 颜色工具栏 ========== */
.color-toolbar {
  display: flex;
  flex-direction: row;
  gap: 6px;
  flex-wrap: wrap;
  padding-bottom: var(--billadm-space-sm);
  border-bottom: 1px solid var(--billadm-color-divider);
  margin-bottom: var(--billadm-space-sm);
  flex-shrink: 0;
}

.color-swatch {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: box-shadow var(--billadm-transition-fast),
              border-color var(--billadm-transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.color-swatch:hover {
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.3);
}

.color-swatch.is-selected {
  border-color: #000;
}

.color-swatch-empty {
  border: 2px dashed var(--billadm-color-text-disabled);
  background-color: transparent;
}

.color-swatch-empty.is-selected {
  border-style: solid;
  border-color: #000;
}

.detail-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: var(--billadm-space-md);
  background-color: var(--billadm-color-minor-background);
  border-radius: var(--billadm-radius-lg);
  overflow: hidden;
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

/* ========== 描述区域 ========== */
.detail-description {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.description-content {
  flex: 1;
  overflow-y: auto;
  border: 1px solid var(--billadm-color-window-border);
  border-radius: var(--billadm-radius-md);
  padding: var(--billadm-space-sm);
  background-color: var(--billadm-color-major-background);
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
  min-height: 0;
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
  flex-shrink: 0;
}

/* ========== 底部操作栏 ========== */
.detail-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--billadm-space-sm);
  padding: var(--billadm-space-sm);
  flex-shrink: 0;
}
</style>
