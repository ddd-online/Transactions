<template>
  <div class="upload-progress-bar">
    <!-- 上传中 -->
    <div v-if="progress.status === 'uploading'" class="progress-uploading">
      <div class="progress-header">
        <span>📤 正在上传 {{ progress.completed + 1 }}/{{ progress.total }}</span>
        <span class="progress-percent">{{ progress.currentPercent }}%</span>
      </div>
      <a-progress
        :percent="progress.currentPercent"
        :show-info="false"
        size="small"
      />
      <div class="progress-file" :title="progress.currentFile">
        当前: {{ progress.currentFile }}
      </div>
    </div>

    <!-- 完成 -->
    <div v-else-if="progress.status === 'done'" class="progress-done">
      <div class="progress-header done-header">
        <CheckCircleOutlined style="color: #52c41a" />
        <span>{{ progress.total }} 张上传完成</span>
      </div>
      <a-progress :percent="100" :show-info="false" size="small" stroke-color="#52c41a" />
    </div>

    <!-- 出错 -->
    <div v-else-if="progress.status === 'error'" class="progress-error">
      <div class="progress-header error-header">
        <CloseCircleOutlined style="color: #ff4d4f" />
        <span>上传失败，已完成 {{ progress.completed }}/{{ progress.total }}</span>
      </div>
      <a-progress
        :percent="Math.round((progress.completed / progress.total) * 100)"
        :show-info="false"
        size="small"
        status="exception"
      />
      <div class="progress-file error-file">{{ progress.errorMessage }}</div>
      <div class="progress-actions">
        <a-button size="small" @click="$emit('retry')">重试</a-button>
        <a-button size="small" @click="$emit('skip')">跳过</a-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons-vue'

export interface UploadProgress {
  total: number
  completed: number
  currentFile: string
  currentPercent: number
  status: 'idle' | 'uploading' | 'done' | 'error'
  errorMessage?: string
}

defineProps<{
  progress: UploadProgress
}>()

defineEmits<{
  (e: 'retry'): void
  (e: 'skip'): void
}>()
</script>

<style scoped>
.upload-progress-bar {
  padding: 8px 0;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
  font-size: 13px;
}

.progress-percent {
  color: var(--billadm-text-secondary, #999);
  font-size: 12px;
}

.progress-file {
  margin-top: 4px;
  font-size: 12px;
  color: var(--billadm-text-secondary, #999);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.progress-actions {
  margin-top: 8px;
  display: flex;
  gap: 8px;
}

.done-header {
  color: #52c41a;
  display: flex;
  align-items: center;
  gap: 6px;
}

.error-header {
  color: #ff4d4f;
  display: flex;
  align-items: center;
  gap: 6px;
}

.error-file {
  color: #ff4d4f;
}
</style>
