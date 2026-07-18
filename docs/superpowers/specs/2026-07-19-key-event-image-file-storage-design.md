# 关键事件图片文件存储改造

## Date
2026-07-19

## Overview

将关键事件图片从 SQLite Base64 存储改为文件系统存储。图片保存到 workspace 的 `data/assets/key_events/` 目录，数据库只存相对路径，通过后端静态文件端点提供给前端。

## Motivation

- 缩减 SQLite 数据库体积（Base64 图片使 DB 急剧膨胀）
- 文件系统天然适合二进制大对象存储
- 静态文件端点支持浏览器 HTTP 缓存

## Design Decisions

| 决策 | 选择 |
|------|------|
| 前端读取方式 | 后端静态文件端点 `GET /api/v1/static/*filepath` |
| 文件命名 | 日期子目录 + UUID + 原始扩展名 `{eventDate}/{uuid}.{ext}` |
| 缩略图 | 上传时后端同步生成，存为 `{eventDate}/thumb_{uuid}.jpg` |
| 数据迁移 | 打开 workspace 时自动迁移旧 Base64 数据 |
| 字段改造 | `data` 重命名为 `file_path`，新增 `thumb_path`，删除 `filename` |
| 删除行为 | 删除 DB 记录时同步删除原图和缩略图文件 |
| 上传流程 | 前端继续发 Base64，后端负责解码写文件 + 生成缩略图 |

## File System Structure

```
workspace/
├── billadm.db
└── data/
    └── assets/
        └── key_events/
            ├── 2026-05-08/
            │   ├── abc123.jpg          ← 原图（保留原始格式和尺寸）
            │   └── thumb_abc123.jpg    ← 缩略图（JPEG, 300px宽, q=0.75）
            └── 2026-07-19/
                ├── def456.png
                └── thumb_def456.jpg
```

- 原图：保留原始格式和尺寸
- 缩略图：统一 JPEG、最大宽度 300px、quality 0.75（与当前前端 `imageOptimizer.ts` 参数一致）

## Database Changes

### Table: `tbl_billadm_key_event_image`

| 字段 | 旧 | 新 |
|------|-----|-----|
| `data` (TEXT) | Base64 data URI | **重命名为 `file_path`**，存相对路径 `key_events/2026-05-08/abc123.jpg` |
| `thumb_path` (TEXT) | ❌ 不存在 | **新增**，存缩略图路径 `key_events/2026-05-08/thumb_abc123.jpg` |
| `filename` (VARCHAR) | 原始文件名 | **删除** |

GORM AutoMigrate 新增列，但不删除旧列（SQLite 限制）。旧 `data` 和 `filename` 列残留无害，后续可手动清理。

## Backend

### Model (`kernel/models/key_event.go`)

```go
type KeyEventImage struct {
    ID        string `gorm:"primaryKey;comment:图片UUID" json:"id"`
    EventDate string `gorm:"index;not null;comment:关联的关键事件日期" json:"eventDate"`
    FilePath  string `gorm:"type:varchar(500);not null;comment:原图相对路径" json:"filePath"`
    ThumbPath string `gorm:"type:varchar(500);not null;comment:缩略图相对路径" json:"thumbPath"`
    SortOrder int    `gorm:"not null;default:0;comment:排序序号" json:"sortOrder"`
    CreatedAt int64  `gorm:"autoCreateTime:unix;not null" json:"createdAt"`
}
```

### 图片写入工具 (`kernel/util/image.go` — 新文件)

```
SaveImage(workspaceDir, eventDate, imageId, ext string, base64Data []byte) (filePath, thumbPath string, error)
```

1. 从 Base64 解码二进制数据
2. 创建 `data/assets/key_events/{eventDate}/` 目录
3. 写入原图 `{imageId}.{ext}`
4. 使用 Go `image` 标准库解码 → 缩放到 300px 宽 → JPEG 编码写入 `thumb_{imageId}.jpg`
5. 返回两个相对路径（不含 `data/assets/` 前缀）

### Service (`kernel/service/key_event_image_service.go`)

**AddImage** 变更：
```
旧: AddImage(ws, date, data, filename string) (*KeyEventImage, error)
新: AddImage(ws, date, base64Data string) (*KeyEventImage, error)
```

- 生成 UUID → 从 Base64 data URI 解析 MIME type 取扩展名
- 调用 `SaveImage` 获取 `filePath` / `thumbPath`
- 创建 DB 记录（`filePath`、`thumbPath`、`sortOrder`）

**DeleteImage** / **DeleteImagesByEventDate**：
- 删除 DB 记录前，调用 `os.Remove` 删除原图和缩略图文件
- 文件删除失败记录日志但不阻断 DB 删除

### 静态文件端点 (`kernel/api/static_controller.go` — 新文件)

```
GET /api/v1/static/*filepath
```

- 从 `c.Param("filepath")` 获取路径
- 拼接 `workspaceDir + "/data/assets/" + filepath`
- 校验路径不穿越 `data/assets/` 目录（防止 `../` 攻击）
- 根据扩展名设置 `Content-Type`
- 文件不存在返回 404

路由注册在 `kernel/api/router.go`，使用 `RequireWorkspace` 中间件获取当前 workspace 目录。

### 数据迁移 (`kernel/workspace/migrate_key_event_images.go` — 新文件)

在 `NewWorkspace` 中，AutoMigrate 之后调用：

```go
func migrateKeyEventImages(db *gorm.DB, dir string) error
```

1. 查询 `WHERE file_path = '' OR file_path IS NULL` 获取所有未迁移记录
2. 对每条记录：
   - 从旧 `data` 字段解析 Base64 data URI（提取 MIME type 和二进制数据）
   - 调用 `SaveImage` 写入文件
   - `UPDATE SET file_path = ?, thumb_path = ? WHERE id = ?`
3. 单条失败不阻断整体，记录日志继续下一条
4. 迁移完成日志输出：总计 N 条，成功 M 条，失败 K 条

迁移触发时机：`POST /api/v1/workspace` 打开 workspace 后，`NewWorkspace` 内部自动执行。

## Frontend

### Types (`billadm.d.ts`)

```ts
interface KeyEventImage {
    id: string;
    eventDate: string;
    filePath: string;   // 原 data: string
    thumbPath: string;  // 新增
    sortOrder: number;
    createdAt: number;
}
```

移除 `data` 和 `filename`。

### URL 生成 (`app/src/backend/imageUrl.ts` — 新文件)

```ts
export function getImageUrl(filePath: string): string {
    return `${apiBaseUrl}/api/v1/static/${filePath}`
}
```

替换原 `imageOptimizer.ts` 中 `createImageUrls` → blob URL 的逻辑。

### API (`key-event.ts`)

`addKeyEventImage` 签名变更：
```ts
// 旧
addKeyEventImage(date: string, data: string, filename: string): Promise<string>
// 新
addKeyEventImage(date: string, data: string): Promise<KeyEventImage>
```

返回完整 `KeyEventImage`（前端需要 `filePath` 和 `thumbPath`）。

### Cache (`keyEventCache.ts`)

移除：
- `imageUrlCache: Map<string, ImageUrls>` — blob URL 不再需要
- `invalidate` 中 `revokeImageUrls` 调用
- `destroy` 中 blob URL 释放

保留：
- `imageCache: Map<string, KeyEventImage[]>` — 原始数据缓存

### Components

**KeyEventImageGallery.vue** — 显示改用静态 URL：
```html
<img :src="getImageUrl(img.thumbPath)" />
```

大图预览 `a-image` 改用 `getImageUrl(img.filePath)`。

**UploadProgressBar.vue** / **useImageUpload.ts** — 不变，仍是 `file → Base64 → addKeyEventImage`。

### 删除文件

- `app/src/backend/imageOptimizer.ts` — 不再需要

## API Changes Summary

| 端点 | 变更 |
|------|------|
| `GET /api/v1/key-events/:date/images` | 响应 `KeyEventImage` 字段变更：`data`→`filePath`，新增 `thumbPath`，移除 `filename` |
| `POST /api/v1/key-events/:date/images` | 请求体移除 `filename`；响应从 `string`(id) 改为完整 `KeyEventImage` |
| `DELETE /api/v1/key-event-images/:id` | 无变更 |
| `GET /api/v1/static/*filepath` | **新增** |

## Migration Flow

```
用户打开 workspace (POST /api/v1/workspace)
  → NewWorkspace(directory)
    → GORM AutoMigrate (新增 file_path, thumb_path 列)
    → migrateKeyEventImages(db, directory)
      → SELECT * WHERE file_path = ''
      → 逐条: Base64解码 → 写文件 → 更新file_path/thumb_path
    → 完成
```

用户无感知，自动完成。

## Error Handling

- **图片写入失败**（磁盘满、权限不足）：返回 `code: -1, msg: "failed to save image"`
- **迁移单条失败**：记录日志，继续下一条，不影响 workspace 打开
- **静态文件不存在**：返回 404
- **路径穿越攻击**：返回 403

## File Change Summary

| File | Change |
|------|--------|
| `kernel/models/key_event.go` | 修改 `KeyEventImage` struct |
| `kernel/util/database.go` | AutoMigrate 模型已包含，无需变更 |
| `kernel/util/image.go` | **New** — 图片写入 + 缩略图生成 |
| `kernel/dao/key_event_image_dao.go` | 无变更（DAO 不感知字段语义） |
| `kernel/service/key_event_image_service.go` | 修改 `AddImage` / `DeleteImage` / `DeleteImagesByEventDate` |
| `kernel/service/key_event_service.go` | 无变更（DeleteByDate 的级联删除不变） |
| `kernel/api/key_event_controller.go` | 修改 handlers（响应字段、请求参数） |
| `kernel/api/static_controller.go` | **New** — 静态文件端点 |
| `kernel/api/router.go` | 注册静态文件路由 |
| `kernel/server/wire.go` | 注入 ImageUtil 依赖 |
| `kernel/workspace/migrate_key_event_images.go` | **New** — 数据迁移 |
| `kernel/workspace/workspace.go` | 调用迁移函数 |
| `app/src/types/billadm.d.ts` | 修改 `KeyEventImage` 接口 |
| `app/src/backend/api/key-event.ts` | 修改 `addKeyEventImage` 签名 + 返回值 |
| `app/src/backend/imageOptimizer.ts` | **Delete** |
| `app/src/backend/imageUrl.ts` | **New** — URL 生成工具 |
| `app/src/backend/keyEventCache.ts` | 移除 blob URL 缓存逻辑 |
| `app/src/stores/keyEventStore.ts` | 适配新字段名 |
| `app/src/hooks/useImageUpload.ts` | 移除 `filename` 参数 |
| `app/src/components/key_event_view/KeyEventImageGallery.vue` | 改用静态 URL 显示图片 |
| `app/src/components/key_event_view/UploadProgressBar.vue` | 适配新 `addImage` 签名 |
