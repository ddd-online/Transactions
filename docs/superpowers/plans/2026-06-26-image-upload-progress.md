# 图片上传进度条 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为关键事件图片上传增加进度条，显示文件级进度（已完成数/总数）和单文件上传百分比。

**Architecture:** 在现有串行上传链路中插入进度追踪。UploadProgress 对象在 KeyEventView 中管理，通过 props 传入 KeyEventDetail → UploadProgressBar 组件。axios onUploadProgress 提供单文件百分比。

**Tech Stack:** Vue 3 + TypeScript, Ant Design Vue (a-progress), axios

## Global Constraints

- 保持串行上传，不做并行
- 进度条上传中替代"添加图片"按钮区域，完成后自动恢复
- 上传失败时显示重试/跳过按钮
- 不改变图片存储方式（继续 base64 + SQLite）
- 不改变 Go 后端代码

---

### Task 1: api-client.ts — post 方法支持 config 透传

**Files:**
- Modify: `app/src/backend/api/api-client.ts:57-69`

**Interfaces:**
- Produces: `api.post<T>(url, data, errorPrefix, config)` — config 为可选参数，透传给 axios

- [ ] **Step 1: 修改 post 方法签名和实现**

```typescript
// app/src/backend/api/api-client.ts，替换第 57-69 行的 post 方法
async post<T = any>(url: string, data: object = {}, errorPrefix?: string, config?: Record<string, unknown>): Promise<T> {
    try {
        const client = await getApiClient();
        const response: AxiosResponse<Result<T>> = await client.post(url, data, config);
        checkSuccess(response.data, errorPrefix);
        return response.data.data;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            throw new Error(`${errorPrefix || '请求失败'}: ${error.message}`);
        }
        throw error;
    }
},
```

- [ ] **Step 2: 验证编译通过**

```bash
cd app && npx vue-tsc --noEmit --project tsconfig.json 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add app/src/backend/api/api-client.ts
git commit -m "feat: api-client post 方法增加 config 参数透传"
```

---

### Task 2: key-event.ts — addKeyEventImage 增加上传进度回调

**Files:**
- Modify: `app/src/backend/api/key-event.ts:24-26`

**Interfaces:**
- Consumes: `api.post<T>(url, data, errorPrefix, config)` — 来自 Task 1
- Produces: `addKeyEventImage(date, data, filename, ledgerId, onProgress?)` — onProgress 为可选回调 `(percent: number) => void`

- [ ] **Step 1: 增加 onProgress 参数**

```typescript
// app/src/backend/api/key-event.ts，替换第 24-26 行
export async function addKeyEventImage(
    date: string,
    data: string,
    filename: string,
    ledgerId: string,
    onProgress?: (percent: number) => void
): Promise<string> {
    return api.post<string>(
        `/v1/key-events/${date}/images`,
        { data, filename, ledger_id: ledgerId },
        '添加关键事件图片',
        {
            timeout: 30000,
            onUploadProgress: (e: { loaded: number; total?: number }) => {
                if (e.total && e.total > 0) {
                    onProgress?.(Math.round((e.loaded / e.total) * 100))
                }
            },
        }
    )
}
```

- [ ] **Step 2: 验证编译通过**

```bash
cd app && npx vue-tsc --noEmit --project tsconfig.json 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add app/src/backend/api/key-event.ts
git commit -m "feat: addKeyEventImage 增加 onProgress 回调支持"
```

---

### Task 3: 定义 UploadProgress 类型 + UploadProgressBar 组件

**Files:**
- Create: `app/src/components/key_event_view/UploadProgressBar.vue`

**Interfaces:**
- Consumes: `UploadProgress` 接口（组件内部定义）
- Produces: `<UploadProgressBar :progress="uploadProgress" @retry @skip />`

- [ ] **Step 1: 创建 UploadProgressBar.vue**

```vue
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
```

- [ ] **Step 2: 验证编译通过**

```bash
cd app && npx vue-tsc --noEmit --project tsconfig.json 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add app/src/components/key_event_view/UploadProgressBar.vue
git commit -m "feat: 新增 UploadProgressBar 上传进度条组件"
```

---

### Task 4: KeyEventDetail.vue — 引入进度条 + 事件调整

**Files:**
- Modify: `app/src/components/key_event_view/KeyEventDetail.vue`

**Interfaces:**
- Consumes: `UploadProgressBar` 组件（Task 3），`UploadProgress` 类型
- Produces: 新增 `add-images` 事件（批量），保留 `delete-image`、`color-change` 等

- [ ] **Step 1: 修改 Props 和 Emits**

将第 90-114 行的 props 和 emits 替换为：

```typescript
import type { UploadProgress } from './UploadProgressBar.vue'

interface Props {
  event: KeyEvent | null
  images: KeyEventImage[]
  isEditing: boolean
  progress?: UploadProgress  // 替换原来的 uploading?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'edit'): void
  (e: 'save', content: string): void
  (e: 'cancel-edit'): void
  (e: 'add-images', files: File[]): void  // 批量事件，替代 add-image
  (e: 'delete-image', imageId: string): void
  (e: 'color-change', color: string): void
  (e: 'retry-upload'): void
  (e: 'skip-upload'): void
}>()
```

- [ ] **Step 2: 修改 handleFileSelect**

将第 133-141 行替换为：

```typescript
const handleFileSelect = (e: Event) => {
  const input = e.target as HTMLInputElement
  const files = input.files
  if (!files || files.length === 0) return
  emit('add-images', Array.from(files))
  input.value = ''
}
```

- [ ] **Step 3: 修改底部操作栏模板**

将第 59-81 行（detail-footer）替换为：

```vue
<!-- 底部操作栏 -->
<div class="detail-footer">
  <!-- 上传中/完成/出错：显示进度条 -->
  <UploadProgressBar
    v-if="progress && progress.status !== 'idle'"
    :progress="progress"
    @retry="$emit('retry-upload')"
    @skip="$emit('skip-upload')"
  />
  <!-- 空闲：显示添加图片按钮 -->
  <template v-else>
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
  </template>
  <input
    ref="fileInputRef"
    type="file"
    accept="image/*"
    multiple
    style="display: none"
    @change="handleFileSelect"
  />
</div>
```

- [ ] **Step 4: 更新 import**

第 87 行 import 增加：

```typescript
import UploadProgressBar from './UploadProgressBar.vue'
```

- [ ] **Step 5: 验证编译通过**

```bash
cd app && npx vue-tsc --noEmit --project tsconfig.json 2>&1 | head -30
```

- [ ] **Step 6: Commit**

```bash
git add app/src/components/key_event_view/KeyEventDetail.vue
git commit -m "feat: KeyEventDetail 引入 UploadProgressBar，改为批量文件事件"
```

---

### Task 5: KeyEventView.vue — 批量上传 + 进度状态管理

**Files:**
- Modify: `app/src/components/key_event_view/KeyEventView.vue`

**Interfaces:**
- Consumes: `UploadProgress` 类型（Task 3），`addKeyEventImage` onProgress（Task 2）
- Produces: `handleAddImages`、`handleRetryUpload`、`handleSkipUpload`，通过 props 传给 KeyEventDetail

- [ ] **Step 1: 替换 imageUploading 为 uploadProgress**

将第 154 行：

```typescript
const imageUploading = ref(false)
```

替换为：

```typescript
import type { UploadProgress } from './UploadProgressBar.vue'

const uploadProgress = ref<UploadProgress>({
  total: 0,
  completed: 0,
  currentFile: '',
  currentPercent: 0,
  status: 'idle',
})

// 暂存待上传文件列表，供重试/跳过使用
const pendingFiles = ref<File[]>([])
let currentFileIndex = 0
```

- [ ] **Step 2: 编写 handleAddImages**

将第 192-202 行的 `handleAddImage` 替换为：

```typescript
const handleAddImages = async (files: File[]) => {
  if (files.length === 0) return

  pendingFiles.value = files
  currentFileIndex = 0

  uploadProgress.value = {
    total: files.length,
    completed: 0,
    currentFile: files[0]!.name,
    currentPercent: 0,
    status: 'uploading',
  }

  await uploadCurrentFile()
}

// 上传 currentFileIndex 指向的文件
const uploadCurrentFile = async () => {
  const files = pendingFiles.value
  if (currentFileIndex >= files.length) {
    // 全部完成
    uploadProgress.value.status = 'done'
    setTimeout(() => {
      uploadProgress.value.status = 'idle'
      pendingFiles.value = []
    }, 2000)
    return
  }

  const file = files[currentFileIndex]!
  uploadProgress.value.currentFile = file.name
  uploadProgress.value.currentPercent = 0

  try {
    const data = await fileToBase64(file)
    await keyEventStore.addImage(
      selectedDate.value,
      data,
      file.name,
      (percent: number) => {
        uploadProgress.value.currentPercent = percent
      }
    )
    uploadProgress.value.completed = currentFileIndex + 1
    currentFileIndex++
    await uploadCurrentFile()
  } catch (err) {
    uploadProgress.value.status = 'error'
    uploadProgress.value.errorMessage =
      (err as Error)?.message || '图片上传失败'
  }
}
```

- [ ] **Step 3: 编写重试和跳过**

```typescript
const handleRetryUpload = async () => {
  uploadProgress.value.status = 'uploading'
  uploadProgress.value.currentPercent = 0
  await uploadCurrentFile()
}

const handleSkipUpload = async () => {
  currentFileIndex++
  uploadProgress.value.status = 'uploading'
  await uploadCurrentFile()
}
```

- [ ] **Step 4: 修改 KeyEventDetail 的 props 绑定**

将模板中第 28-34 行的 KeyEventDetail 标签：

```vue
<KeyEventDetail
  class="panel-center"
  :event="currentEvent"
  :images="keyEventStore.images"
  :isEditing="isEditing"
  :uploading="imageUploading"
  @edit="isEditing = true"
  @save="handleSaveContent"
  @cancel-edit="isEditing = false"
  @add-image="handleAddImage"
  @delete-image="handleDeleteImage"
  @color-change="handleColorChange"
/>
```

替换为：

```vue
<KeyEventDetail
  class="panel-center"
  :event="currentEvent"
  :images="keyEventStore.images"
  :isEditing="isEditing"
  :progress="uploadProgress"
  @edit="isEditing = true"
  @save="handleSaveContent"
  @cancel-edit="isEditing = false"
  @add-images="handleAddImages"
  @delete-image="handleDeleteImage"
  @color-change="handleColorChange"
  @retry-upload="handleRetryUpload"
  @skip-upload="handleSkipUpload"
/>
```

- [ ] **Step 5: 验证编译通过**

```bash
cd app && npx vue-tsc --noEmit --project tsconfig.json 2>&1 | head -30
```

- [ ] **Step 6: Commit**

```bash
git add app/src/components/key_event_view/KeyEventView.vue
git commit -m "feat: KeyEventView 批量上传 + UploadProgress 状态管理"
```

---

### Task 6: 整体验证 + 更新记录

- [ ] **Step 1: 完整编译检查**

```bash
cd app && npx vue-tsc --noEmit --project tsconfig.json
```

- [ ] **Step 2: Vite 构建检查**

```bash
cd app && npm run build 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: 记录图片上传进度条实施完成"
```
