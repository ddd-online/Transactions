<template>
  <div class="upload-progress-bar">
    <!-- 顶部总进度 -->
    <div class="progress-summary">
      <div class="summary-row">
        <span class="summary-text">
          <template v-if="progress.status === 'uploading'">
            上传中 {{ progress.completed }}/{{ progress.total }}
          </template>
          <template v-else-if="progress.status === 'done'">
            <CheckCircleOutlined class="summary-icon done" />
            {{ progress.total }} 张上传完成
          </template>
          <template v-else-if="progress.status === 'error'">
            <CloseCircleOutlined class="summary-icon error" />
            上传中断，已完成 {{ progress.completed }}/{{ progress.total }}
          </template>
        </span>
        <span class="summary-percent">{{ overallPercent }}%</span>
      </div>
      <div class="summary-bar-track">
        <div
          class="summary-bar-fill"
          :class="barClass"
          :style="{ width: overallPercent + '%' }"
        />
      </div>
    </div>

    <!-- 文件列表 -->
    <div class="file-list">
      <div
        v-for="(file, index) in progress.files"
        :key="index"
        class="file-row"
        :class="'file-row--' + file.status"
      >
        <!-- 状态标记 -->
        <span class="file-dot">
          <CheckCircleFilled v-if="file.status === 'done'" class="dot-icon done" />
          <LoadingOutlined v-else-if="file.status === 'uploading'" class="dot-icon uploading" spin />
          <CloseCircleFilled v-else-if="file.status === 'error'" class="dot-icon error" />
          <span v-else class="dot-icon pending" />
        </span>

        <!-- 文件名 + 进度 -->
        <div class="file-body">
          <span class="file-name" :title="file.name">{{ file.name }}</span>
          <template v-if="file.status === 'uploading'">
            <div class="file-bar-track">
              <div
                class="file-bar-fill"
                :style="{ width: file.percent + '%' }"
              />
            </div>
          </template>
        </div>

        <!-- 状态文字 / 百分比 -->
        <span class="file-status" :class="'file-status--' + file.status">
          <template v-if="file.status === 'pending'">等待中</template>
          <template v-else-if="file.status === 'uploading'">{{ file.percent }}%</template>
          <template v-else-if="file.status === 'done'">已完成</template>
          <template v-else-if="file.status === 'error'">失败</template>
        </span>
      </div>

      <!-- 失败操作按钮 -->
      <div v-if="progress.status === 'error'" class="error-actions">
        <span class="error-msg">{{ progress.errorMessage }}</span>
        <div class="error-btns">
          <a-button size="small" @click="$emit('retry')">重试</a-button>
          <a-button size="small" @click="$emit('skip')">跳过</a-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  CheckCircleOutlined,
  CheckCircleFilled,
  CloseCircleOutlined,
  CloseCircleFilled,
  LoadingOutlined,
} from '@ant-design/icons-vue'

export interface FileProgress {
  name: string
  percent: number
  status: 'pending' | 'uploading' | 'done' | 'error'
  errorMessage?: string
}

export interface UploadProgress {
  files: FileProgress[]
  total: number
  completed: number
  status: 'idle' | 'uploading' | 'done' | 'error'
  errorMessage?: string
}

const props = defineProps<{
  progress: UploadProgress
}>()

defineEmits<{
  (e: 'retry'): void
  (e: 'skip'): void
}>()

const overallPercent = computed(() => {
  if (props.progress.total === 0) return 0
  return Math.round((props.progress.completed / props.progress.total) * 100)
})

const barClass = computed(() => ({
  'summary-bar-fill--done': props.progress.status === 'done',
  'summary-bar-fill--error': props.progress.status === 'error',
}))
</script>

<style scoped>
/* ========== 容器 ========== */
.upload-progress-bar {
  width: 100%;
}

/* ========== 顶部总进度 ========== */
.progress-summary {
  margin-bottom: 10px;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.summary-text {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--billadm-size-text-body-sm, 13px);
  font-weight: var(--billadm-weight-medium, 500);
  color: var(--billadm-color-text-major, #1D1D1B);
}

.summary-icon {
  font-size: 14px;

  &.done {
    color: var(--billadm-color-success, #3D8C5E);
  }

  &.error {
    color: var(--billadm-color-expense, #D9705A);
  }
}

.summary-percent {
  font-size: var(--billadm-size-text-caption, 12px);
  color: var(--billadm-color-text-secondary, #5C5C55);
  font-variant-numeric: tabular-nums;
}

/* 总进度条轨道 */
.summary-bar-track {
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: var(--billadm-color-minor-background, #F3F1ED);
  overflow: hidden;
}

.summary-bar-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--billadm-color-primary, #4A8C6F);
  transition: width 200ms ease;

  &--done {
    background: var(--billadm-color-success, #3D8C5E);
  }

  &--error {
    background: var(--billadm-color-expense, #D9705A);
  }
}

/* ========== 文件列表 ========== */
.file-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: 280px;
  overflow-y: auto;
}

/* ========== 文件行 ========== */
.file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--billadm-radius-sm, 6px);
  transition: background 150ms ease;

  &--uploading {
    background: var(--billadm-color-hover-bg, rgba(74, 140, 111, 0.07));
  }

  &--error {
    background: var(--billadm-color-danger-hover-bg, rgba(217, 112, 90, 0.10));
  }
}

/* 状态圆点 */
.file-dot {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dot-icon {
  font-size: 14px;

  &.done {
    color: var(--billadm-color-success, #3D8C5E);
  }

  &.uploading {
    color: var(--billadm-color-primary, #4A8C6F);
  }

  &.error {
    color: var(--billadm-color-expense, #D9705A);
  }

  &.pending {
    display: block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--billadm-color-text-disabled, #9E9E96);
  }
}

/* 文件主体 */
.file-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.file-name {
  font-size: var(--billadm-size-text-body-sm, 13px);
  color: var(--billadm-color-text-major, #1D1D1B);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 单文件迷你进度条 */
.file-bar-track {
  width: 100%;
  height: 2px;
  border-radius: 1px;
  background: var(--billadm-color-minor-background, #F3F1ED);
  overflow: hidden;
}

.file-bar-fill {
  height: 100%;
  border-radius: 1px;
  background: var(--billadm-color-primary, #4A8C6F);
  transition: width 150ms ease;
}

/* 状态标签 */
.file-status {
  flex-shrink: 0;
  font-size: var(--billadm-size-text-caption, 12px);
  font-variant-numeric: tabular-nums;

  &--pending {
    color: var(--billadm-color-text-disabled, #9E9E96);
  }

  &--uploading {
    color: var(--billadm-color-primary, #4A8C6F);
    font-weight: var(--billadm-weight-medium, 500);
  }

  &--done {
    color: var(--billadm-color-success, #3D8C5E);
  }

  &--error {
    color: var(--billadm-color-expense, #D9705A);
  }
}

/* ========== 错误操作 ========== */
.error-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 8px 0;
  gap: 8px;
}

.error-msg {
  font-size: var(--billadm-size-text-caption, 12px);
  color: var(--billadm-color-expense, #D9705A);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.error-btns {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
</style>
