# 图片上传进度条设计

日期: 2026-06-26
状态: 待实施

## 背景

用户在关键事件中上传多张图片时，当前只有 "上传中..." 的 loading 态提示，没有进度信息。上传较多图片（如旅行照片 10-20 张）时等待时间较长，用户不知道当前进度和剩余数量。

## 目标

为关键事件图片上传增加进度条，显示：
- 文件级进度：已完成数 / 总数
- 单文件百分比：当前文件的上传进度
- 当前正在处理的文件名

## 设计原则

- 最小改动：在现有串行上传流程中插入进度追踪，不改存储方式
- 串行上传：保持一张一张传，简单可靠
- 上传时进度条替代上传按钮区域，完成后自动恢复

## 架构

```
KeyEventDetail.vue              KeyEventView.vue               key-event.ts           api-client.ts
  选 N 个文件                     handleAddImage(file)           addKeyEventImage()     api.post()
  ─────────────────→            for each file:                  + onUploadProgress     + config 透传
                                  1. fileToBase64(file)          ↑ onUploadProgress
  显示 UploadProgressBar          2. store.addImage()              回调更新 currentPercent
  (替代上传按钮)                       ↑ 更新 uploadProgress
                                  3. 更新 completed++
```

### 改动清单

| 文件 | 行数估算 | 改动内容 |
|------|---------|---------|
| **新增** `app/src/components/key_event_view/UploadProgressBar.vue` | ~70 | 进度条组件 |
| `app/src/components/key_event_view/KeyEventDetail.vue` | +5 | 引入 UploadProgressBar，上传中替换按钮 |
| `app/src/components/key_event_view/KeyEventView.vue` | ~25 | imageUploading → uploadProgress，handleAddImage 改写 |
| `app/src/backend/api/key-event.ts` | +5 | addKeyEventImage 增加 onUploadProgress |
| `app/src/backend/api/api-client.ts` | +2 | post 方法支持 config 透传 |

## 进度数据模型

```typescript
interface UploadProgress {
  total: number          // 总文件数
  completed: number      // 已完成数
  currentFile: string    // 当前文件名
  currentPercent: number // 当前文件百分比 0-100
  status: 'idle' | 'uploading' | 'done' | 'error'
  errorMessage?: string
}
```

初始状态: `{ total: 0, completed: 0, currentFile: '', currentPercent: 0, status: 'idle' }`

## UI 设计

### 上传中

```
┌──────────────────────────────────────────────┐
│  📤 正在上传 3/8                              │
│  ████████████████░░░░░░░░░░░░  45%           │
│  当前: IMG_1234.HEIC                          │
└──────────────────────────────────────────────┘
```

- 进度条使用 Ant Design `<a-progress>`
- 百分比文字显示在进度条右侧
- 文件名过长时截断中间部分

### 全部完成

```
┌──────────────────────────────────────────────┐
│  ✓ 8 张上传完成                               │
│  ████████████████████████████  100%           │
└──────────────────────────────────────────────┘
```

- 绿色成功态，2 秒后自动消失
- 消失后恢复上传按钮，刷新图片列表

### 出错

```
┌──────────────────────────────────────────────┐
│  ✕ IMG_1234.HEIC 上传失败，已完成 5/8         │
│  ████████████████░░░░░░░░░░░░                │
│  [重试] [跳过]                                │
└──────────────────────────────────────────────┘
```

- 红色错误态，显示具体失败文件名
- **重试**：重新上传当前文件
- **跳过**：跳过当前文件，继续下一个
- 关闭弹窗或切换事件时自动重置状态

## 上传流程细节

每个文件分两个阶段：

| 阶段 | 操作 | 进度来源 | 百分比 |
|------|------|---------|--------|
| 处理 | FileReader / HEIC 转码 | 无原生进度事件 | 0%（显示脉冲动画） |
| 上传 | axios POST base64 | ProgressEvent.loaded / total | 0→100% |

由于 API 是 localhost 通信，POST 阶段通常很快。HEIC 转码是真正的耗时操作。
进度条会先短暂显示 "正在处理 xxx.HEIC..."（脉冲动画），然后快速跳转到上传完成。

## API 层改动

### api-client.ts

```typescript
// post 方法签名变更
async post<T = any>(
    url: string,
    data?: object,
    errorPrefix?: string,
    config?: object  // 新增：透传给 axios
): Promise<T>
```

- `config` 可选，不传时行为不变，完全向后兼容
- 大图上传场景传入 `{ timeout: 30000 }` 防止超时

### key-event.ts

```typescript
export async function addKeyEventImage(
    date: string,
    data: string,
    filename: string,
    ledgerId: string,
    onProgress?: (percent: number) => void  // 新增
): Promise<string>
```

- `onProgress` 可选，不传时行为不变
- axios `onUploadProgress` 回调中计算百分比：`Math.round((loaded / total) * 100)`
- 大图超时设置：config 中传入 `timeout: 30000`

## KeyEventView.vue 核心逻辑

```typescript
// 替代原来的 imageUploading: Ref<boolean>
const uploadProgress = ref<UploadProgress>({
    total: 0, completed: 0, currentFile: '',
    currentPercent: 0, status: 'idle'
})

const handleAddImages = async (files: File[]) => {
    uploadProgress.value = {
        total: files.length, completed: 0,
        currentFile: files[0]?.name ?? '',
        currentPercent: 0, status: 'uploading'
    }

    for (let i = 0; i < files.length; i++) {
        uploadProgress.value.currentFile = files[i].name
        uploadProgress.value.currentPercent = 0

        try {
            const data = await fileToBase64(files[i])
            await keyEventStore.addImage(
                selectedDate.value, data, files[i].name,
                (percent: number) => {
                    uploadProgress.value.currentPercent = percent
                }
            )
            uploadProgress.value.completed++
        } catch (err) {
            uploadProgress.value.status = 'error'
            uploadProgress.value.errorMessage =
                (err as Error)?.message || '上传失败'
            return // 等待用户操作：重试/跳过
        }
    }

    uploadProgress.value.status = 'done'
    setTimeout(() => {
        uploadProgress.value.status = 'idle'
    }, 2000)
}
```

注意：`KeyEventDetail` 的 `handleFileSelect` 需要改为收集所有文件后一次性传给 `KeyEventView`，而不是逐个 emit。新增 `add-images` 事件。

## 错误处理

- 单个文件失败：停止后续上传，显示错误状态，用户可选择重试或跳过
- 重试：重置 `currentPercent = 0`，重新执行 `fileToBase64` + `addImage`
- 跳过：`completed++`（或不计入 completed，由实现决定），继续下一个
- 网络断开：axios 抛出错误，进入 error 状态

## 实现顺序

1. `api-client.ts` — post 方法增加 config 参数
2. `key-event.ts` — addKeyEventImage 增加 onProgress 参数
3. `UploadProgressBar.vue` — 新组件
4. `KeyEventView.vue` — handleAddImage 改写 + uploadProgress 状态
5. `KeyEventDetail.vue` — 引入 UploadProgressBar + 事件调整

## 不在范围内

- 并行上传（保持串行）
- 图片压缩/缩放（保持现有逻辑）
- 存储方式变更（继续 base64 + SQLite）
- 上传队列管理（选择新事件时自动取消）
