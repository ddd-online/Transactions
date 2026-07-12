# 日记导入功能 — 设计规格

> **日期**: 2026-07-12
> **状态**: 已确认，待实现

## 概述

在设置中新增"日记"标签页，提供从本地目录批量导入日记的功能。用户选择一个目录，系统递归扫描所有子目录中符合 `YYYY-MM-DD.txt` 命名格式的文件，逐文件导入为日记条目。

## 架构

### 后端（Go）

**Service 层** — `kernel/service/diary_service.go`，DiaryService 接口新增两个方法：

| 方法 | 签名 | 说明 |
|---|---|---|
| `ScanDirectory` | `(dir string) ([]FileItem, error)` | 递归遍历目录，匹配 `YYYY-MM-DD.txt`，解析日期做合法性校验，返回文件列表 |
| `ImportFile` | `(ws, path, date string) (*DiaryEntry, error)` | 读取文件内容，调用已有 `Upsert`（自动覆盖已存在日记），心情留空 |

`FileItem` 结构：
```go
type FileItem struct {
    Date string `json:"date"` // YYYY-MM-DD
    Path string `json:"path"` // 文件绝对路径
}
```

**API 层** — `kernel/api/diary_controller.go`，新增两个 handler：

| 方法 | 路由 | 请求体 | 响应 |
|---|---|---|---|
| `importScanDiary` | `POST /api/v1/diary/import/scan` | `{ "directory": string }` | `{ "files": [{ "date": "2026-07-12", "path": "/abs/path" }] }` |
| `importOneDiary` | `POST /api/v1/diary/import/file` | `{ "path": string, "date": string }` | `{ "date": "2026-07-12", "wordCount": 150 }` |

**路由** — `kernel/api/router.go`，在 `/diary` 路由组下新增：
```go
importGroup := diary.Group("/import")
{
    importGroup.POST("/scan", Handle(h.importScanDiary))
    importGroup.POST("/file", Handle(h.importOneDiary))
}
```

### 前端（Vue 3）

**文件变更**：

| 文件 | 操作 | 说明 |
|---|---|---|
| `app/src/backend/api/diary.ts` | 修改 | 新增 `scanDirectory(dir)` 和 `importFile(path, date)` API 函数 |
| `app/src/components/settings_view/DiarySetting.vue` | 新建 | 日记设置页：导入按钮 + tooltip + 进度条 + 结果汇总 |
| `app/src/components/settings_view/SettingsView.vue` | 修改 | 侧边栏在"消费模板"和"AI 助手"之间加入"日记"标签 |

## 数据流

```
[点击"选择目录导入"]
  → Electron openDialog 选择目录
    → POST /import/scan { directory }
      → 返回 [{ date, path }] 列表（可能为空）
        → 为空：提示"未找到符合格式的日记文件（YYYY-MM-DD.txt）"
        → 非空：初始化进度状态，渲染进度条
          → 逐文件 POST /import/file { path, date }
            → 每完成一个：completed++，对应行 → 'done'
            → 失败：对应行 → 'error'，记录错误信息，继续下一个
          → 全部完成：
            → message.success("成功导入 N 篇日记")
            → 刷新 diaryStore.dates
            → 恢复按钮
```

## 状态模型

```typescript
interface ImportState {
  status: 'idle' | 'scanning' | 'importing' | 'done' | 'error'
  files: ImportFileItem[]
  total: number
  completed: number
}

interface ImportFileItem {
  date: string        // YYYY-MM-DD
  status: 'pending' | 'importing' | 'done' | 'error'
  errorMessage?: string
}
```

## UI 设计

### DiarySetting.vue 布局

标题"日记管理"使用 `--billadm-size-text-section`，与其他设置页标题一致。

**导入区域**（页面唯一功能区块）：

- 按钮：`<a-button>` + `FolderOpenOutlined` 图标，文案"选择目录导入"
- Tooltip：`<a-tooltip>` 包裹按钮，`mouseEnterDelay: 0.5s`，内容为"从本地目录批量导入日记，文件名需为 YYYY-MM-DD.txt 格式"
- 导入中：按钮区域替换为进度条组件（对齐 `UploadProgressBar` 风格）：
  - 顶部总进度：文字 "导入中 3/15" + 百分比 + 进度条
  - 文件列表：每行显示日期、状态圆点（pending/importing/done/error）、状态文字
  - 最大高度 280px，超出滚动
- 完成：进度条显示 "15 篇导入完成"，1.5s 后自动恢复为按钮
- 错误：单文件失败不中断整体，失败行标红；点击可查看错误信息

**空状态**：
- 暂无其他设置项（预留导出等功能扩展空间），页面仅显示导入区块

### SettingsView.vue 侧边栏

在 `navItems` 中，"消费模板"和"AI 助手"之间插入"日记"：

```
通用 → 消费模板 → 日记 → AI 助手 → 关于
```

图标使用 `BookOutlined`。

## 错误处理

| 场景 | 处理 |
|---|---|
| 目录无匹配文件 | scan 返回空列表，`message.info("未找到符合格式的日记文件（YYYY-MM-DD.txt）")` |
| 文件名格式不合法（非 YYYY-MM-DD.txt） | scan 阶段静默跳过 |
| 日期不合法（如 2026-13-01.txt） | scan 阶段静默跳过 |
| 单文件读取失败 | 该文件标记 error，记录 `errorMessage`，继续下一个 |
| 单文件导入失败（API 返回错误） | 同上 |
| 扫描 API 调用失败 | `message.error` 提示，终止导入流程 |
| 导入过程中服务中断 | 已完成的保留，显示中断状态，提示用户"导入中断" |

## 目录选择

使用 `window.electronAPI.openDialog({ properties: ['openDirectory'] })` 获取目录路径。该 API 仅在 Electron 环境可用。

**浏览器 dev 模式降级**：当 `window.electronAPI` 不存在时，按钮旁边显示一个文本输入框，允许手动输入目录路径。输入框仅在 dev 模式出现，不影响 Electron 用户体验。

## 完成后的行为

- 导入成功：显示汇总 `message.success("成功导入 N 篇日记")`
- 刷新 `diaryStore.dates`，用户切换到日记视图时左侧树自动反映新数据
