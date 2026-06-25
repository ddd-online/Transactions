# HEIC 图片格式支持 — 设计文档

> 日期：2026-06-26 | 状态：待实现

## 背景

关键事件（Key Event）图片上传目前通过 `FileReader.readAsDataURL()` 读取文件后以 base64 存入后端。HEIC 格式（Apple 设备默认照片格式）无法被 Chromium/浏览器原生渲染，导致用户从 iPhone 导出的 `.heic` 图片上传后无法显示。

## 目标

- **必须**：支持 `.heic` / `.heif` 文件上传后可在关键事件中正常显示
- **不涉及**：Live Photo（实况照片）的视频部分，仅处理 HEIC 静态图片

## 方案

**前端转换（方案 A）** — 使用 `heic2any` 库在浏览器端将 HEIC 解码转为 JPEG，再上传。

### 选择理由

| 维度 | 前端转换 | 后端转换 |
|------|---------|---------|
| 依赖 | `heic2any` (~200KB) | Go HEIC 库（需 CGO/libheif）|
| 部署复杂度 | 前端构建自动包含 | 需在 Windows 编译环境安装 libheif |
| 后端改动 | 无 | 需修改 service + controller |
| 用户体验 | 可加转换 loading | 上传无感，加载时无区别 |

本项目 Go 后端已要求 CGO_ENABLED=1（SQLite），再加 libheif 依赖会显著增加 Windows 构建复杂度。前端方案改动最小，效果一致。

## 架构

```
用户选择文件（含 .heic）
    │
    ▼
KeyEventView.vue: handleAddImage(file)
    │
    ▼
fileToBase64(file) ── 检测扩展名
    │                    │
    │ 非 HEIC           │ HEIC
    │                    │
    ▼                    ▼
FileReader           heic2any → JPEG blob
readAsDataURL            │
    │                    ▼
    │               FileReader → base64
    │                    │
    ▼                    ▼
keyEventStore.addImage(date, base64Data, filename)
    │
    ▼
POST /api/v1/key-events/:date/images （不变）
```

## 改动细节

### 依赖

```bash
cd app && npm install heic2any
```

### 修改文件

仅 `app/src/components/key_event_view/KeyEventView.vue`

#### `fileToBase64` 函数改造

```typescript
import heic2any from 'heic2any'

const HEIC_EXTENSIONS = ['.heic', '.heif']

const fileToBase64 = async (file: File): Promise<string> => {
  const isHeic = HEIC_EXTENSIONS.some(ext =>
    file.name.toLowerCase().endsWith(ext)
  )

  // 非 HEIC：保持原有逻辑
  if (!isHeic) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('读取文件失败'))
      reader.readAsDataURL(file)
    })
  }

  // HEIC：先转 JPEG，再读 base64
  const jpegBlob = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: 0.92,
  }) as Blob

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('HEIC 转换失败'))
    reader.readAsDataURL(jpegBlob)
  })
}
```

### 不需要改动

- **后端**：无改动，仍然接收 base64 字符串
- **数据库模型**：无改动
- **API**：无改动
- **KeyEventImageGallery**：无改动，src 绑定不变
- **KeyEventDetail**：无改动
- **keyEventStore**：无改动

## 错误处理

| 场景 | 处理方式 |
|------|---------|
| HEIC 转换失败 | `reject(new Error('HEIC 转换失败'))` → store 中 catch → 通知用户 |
| 超大 HEIC 文件 | `heic2any` 内部在 worker 中处理，长时间无响应则超时（浏览器默认）|
| HEIC 无图片数据 | `heic2any` 抛异常 → 同"转换失败"处理 |

## 性能考虑

- `heic2any` 约 200KB（gzipped ~60KB），仅影响前端构建体积
- 转换在内存中完成，无需写磁盘
- HEIC 文件通常比 JPEG 小，转换性能瓶颈在 CPU 解码，单张通常在 1-3 秒内完成
- 如果需要批量上传多张 HEIC，考虑加 loading 状态提示用户

## 边界情况

- 文件名保留原始 `.heic` 后缀（`filename` 字段不修改），便于用户识别来源
- `.heif` 与 `.heic` 视为同种格式，一并处理
- 大小写不敏感（`.HEIC`、`.Heic` 均识别）
- 目前不支持 `.avif`，如需支持可后续扩展同机制
