# 日记导入功能 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在设置中新增"日记"标签页，支持从本地目录批量导入 `YYYY-MM-DD.txt` 格式的日记文件。

**Architecture:** 后端新增两个 API（scan 扫描目录 + file 逐文件导入），前端新增 DiarySetting.vue 组件，在 SettingsView 侧边栏插入"日记"导航项。导入进度 UI 对齐 UploadProgressBar 模式。

**Tech Stack:** Go 1.24 (Gin + GORM + SQLite), Vue 3 + TypeScript + Ant Design Vue

## Global Constraints

- 导入时心情留空（mood = ""）
- 使用已有 `Upsert` 方法，已存在的日记自动覆盖
- 单文件失败不中断整体流程，继续导入其余文件
- 文件内容使用 UTF-8 编码读取
- 导入完成后刷新 diaryStore.dates

---

## 文件结构

```
新建:
  app/src/components/settings_view/DiarySetting.vue

修改:
  kernel/service/diary_service.go     # 新增 FileItem struct、ScanDirectory、ImportFile
  kernel/api/diary_controller.go      # 新增 importScanDiary、importOneDiary handler
  kernel/api/router.go                # 注册 /diary/import 子路由组
  app/src/backend/api/diary.ts        # 新增 scanDirectory、importFile API 函数
  app/src/components/settings_view/SettingsView.vue  # 侧边栏新增"日记"标签
```

---

### Task 1: 后端 — Service 层（ScanDirectory + ImportFile）

**Files:**
- Modify: `kernel/service/diary_service.go`

**Interfaces:**
- Produces:
  - `FileItem` struct — `{ Date string, Path string }` with json tags
  - `DiaryService.ScanDirectory(dir string) ([]FileItem, error)`
  - `DiaryService.ImportFile(ws *workspace.Workspace, path string, date string) (*models.DiaryEntry, error)`

- [ ] **Step 1: 在 diary_service.go 顶部添加 FileItem struct 和 import**

在 `package service` 声明之后、`func NewDiaryService()` 之前插入：

```go
import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"time"
	"unicode/utf8"

	"github.com/billadm/models"
	"github.com/billadm/util"
	"github.com/billadm/workspace"
	"github.com/sirupsen/logrus"
	"gorm.io/gorm/clause"
)

// FileItem 表示一个待导入的日记文件
type FileItem struct {
	Date string `json:"date"` // YYYY-MM-DD
	Path string `json:"path"` // 文件绝对路径
}
```

然后将原有 import 块替换为上述内容（合并已有和新增的包）。

- [ ] **Step 2: 在 DiaryService 接口中添加两个方法签名**

在 `DiaryService interface` 的 `DeleteByDate` 之后添加：

```go
	// Import 导入
	ScanDirectory(dir string) ([]FileItem, error)
	ImportFile(ws *workspace.Workspace, path string, date string) (*models.DiaryEntry, error)
```

- [ ] **Step 3: 实现 ScanDirectory**

在 `diaryServiceImpl` 的方法集中，`DeleteByDate` 之后添加：

```go
// fileNameRe 匹配 YYYY-MM-DD.txt 文件名
var fileNameRe = regexp.MustCompile(`^(\d{4}-\d{2}-\d{2})\.txt$`)

func (s *diaryServiceImpl) ScanDirectory(dir string) ([]FileItem, error) {
	var files []FileItem

	err := filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		name := d.Name()
		matches := fileNameRe.FindStringSubmatch(name)
		if len(matches) != 2 {
			return nil
		}
		dateStr := matches[1]
		// 校验日期合法性（排除 2026-13-01 这类非法日期）
		if _, parseErr := time.Parse("2006-01-02", dateStr); parseErr != nil {
			return nil
		}
		files = append(files, FileItem{Date: dateStr, Path: path})
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("扫描目录失败: %w", err)
	}

	// 按日期升序（旧→新），导入顺序自然
	sort.Slice(files, func(i, j int) bool {
		return files[i].Date < files[j].Date
	})

	return files, nil
}
```

- [ ] **Step 4: 实现 ImportFile**

紧接 ScanDirectory 之后添加：

```go
func (s *diaryServiceImpl) ImportFile(ws *workspace.Workspace, path string, date string) (*models.DiaryEntry, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("读取文件失败 %s: %w", path, err)
	}
	return s.Upsert(ws, date, string(content), "")
}
```

- [ ] **Step 5: 编译验证**

```bash
cd kernel && go build -o nul.exe && echo "BUILD OK"
```

Expected: 编译成功，无错误。

- [ ] **Step 6: Commit**

```bash
git add kernel/service/diary_service.go
git commit -m "feat: add ScanDirectory and ImportFile to DiaryService"
```

---

### Task 2: 后端 — API 处理器与路由

**Files:**
- Modify: `kernel/api/diary_controller.go`
- Modify: `kernel/api/router.go`

**Interfaces:**
- Consumes: `DiaryService.ScanDirectory`, `DiaryService.ImportFile` (from Task 1)
- Produces: `POST /api/v1/diary/import/scan`, `POST /api/v1/diary/import/file`

- [ ] **Step 1: 在 diary_controller.go 末尾添加两个 handler**

```go
// POST /api/v1/diary/import/scan  body: { directory }
func (h *Handlers) importScanDiary(c *gin.Context) (any, error) {
	arg, ok := JsonArg(c)
	if !ok {
		return nil, fmt.Errorf("parses request failed")
	}

	directory, _ := arg["directory"].(string)
	if directory == "" {
		return nil, fmt.Errorf("directory is required")
	}

	return h.DiarySvc.ScanDirectory(directory)
}

// POST /api/v1/diary/import/file  body: { path, date }
func (h *Handlers) importOneDiary(c *gin.Context) (any, error) {
	ws := ws(c)

	arg, ok := JsonArg(c)
	if !ok {
		return nil, fmt.Errorf("parses request failed")
	}

	path, _ := arg["path"].(string)
	date, _ := arg["date"].(string)
	if path == "" || date == "" {
		return nil, fmt.Errorf("path and date are required")
	}

	return h.DiarySvc.ImportFile(ws, path, date)
}
```

- [ ] **Step 2: 在 router.go 中注册导入路由**

在 `/diary` 路由组内、`diary.DELETE("/:date", ...)` 之后添加：

```go
		// Diary import
		importGroup := diary.Group("/import")
		{
			importGroup.POST("/scan", Handle(h.importScanDiary))
			importGroup.POST("/file", Handle(h.importOneDiary))
		}
```

- [ ] **Step 3: 编译验证**

```bash
cd kernel && go build -o nul.exe && echo "BUILD OK"
```

Expected: 编译成功。

- [ ] **Step 4: Commit**

```bash
git add kernel/api/diary_controller.go kernel/api/router.go
git commit -m "feat: add diary import API endpoints"
```

---

### Task 3: 前端 — API 客户端

**Files:**
- Modify: `app/src/backend/api/diary.ts`

**Interfaces:**
- Consumes: `POST /api/v1/diary/import/scan`, `POST /api/v1/diary/import/file`
- Produces: `scanDirectory(directory: string)`, `importFile(path: string, date: string)`

- [ ] **Step 1: 在 diary.ts 末尾添加两个 API 函数**

```typescript
/** 扫描目录，返回符合 YYYY-MM-DD.txt 格式的文件列表 */
export async function scanDirectory(directory: string): Promise<{ files: { date: string; path: string }[] }> {
    return api.post('/v1/diary/import/scan', { directory }, '扫描日记目录');
}

/** 导入单个日记文件 */
export async function importFile(path: string, date: string): Promise<{ date: string; wordCount: number }> {
    return api.post('/v1/diary/import/file', { path, date }, '导入日记文件');
}
```

- [ ] **Step 2: TypeScript 类型检查**

```bash
cd app && npx vue-tsc --noEmit 2>&1 | head -20
```

Expected: 无新增类型错误（DiarySetting.vue 尚不存在，可能出现一个缺失模块错误，忽略）。

- [ ] **Step 3: Commit**

```bash
git add app/src/backend/api/diary.ts
git commit -m "feat: add scanDirectory and importFile API client functions"
```

---

### Task 4: 前端 — DiarySetting.vue 组件

**Files:**
- Create: `app/src/components/settings_view/DiarySetting.vue`

**Interfaces:**
- Consumes: `scanDirectory`, `importFile` from `@/backend/api/diary`; `useDiaryStore` from `@/stores/diaryStore`
- Produces: 完整的日记设置页（导入按钮 + tooltip + 进度条 + 结果汇总）

- [ ] **Step 1: 创建 DiarySetting.vue 模板**

```vue
<template>
  <div class="diary-setting">
    <h2 class="setting-title">日记管理</h2>

    <div class="setting-section">
      <h3 class="section-title">导入日记</h3>

      <!-- 空闲态：导入按钮 -->
      <div v-if="importState.status === 'idle'" class="import-action">
        <a-tooltip
          title="从本地目录批量导入日记，文件名需为 YYYY-MM-DD.txt 格式"
          :mouse-enter-delay="0.5"
        >
          <a-button
            type="default"
            :disabled="!isElectron && !manualPath"
            @click="handleImportClick"
          >
            <template #icon><FolderOpenOutlined /></template>
            选择目录导入
          </a-button>
        </a-tooltip>
        <!-- 浏览器 dev 模式降级：手动输入路径 -->
        <div v-if="!isElectron" class="dev-path-row">
          <span class="dev-path-hint">浏览器模式请输入目录路径：</span>
          <a-input
            v-model:value="manualPath"
            placeholder="例如 /Users/me/diary-export"
            size="small"
            style="width: 260px"
          />
        </div>
      </div>

      <!-- 非空闲态：进度条 -->
      <div v-else class="import-progress-card">
        <div class="progress-summary">
          <div class="summary-row">
            <span class="summary-text">
              <LoadingOutlined v-if="importState.status === 'scanning'" spin />
              <template v-if="importState.status === 'scanning'">
                正在扫描目录…
              </template>
              <template v-else-if="importState.status === 'importing'">
                导入中 {{ importState.completed }}/{{ importState.total }}
              </template>
              <template v-else-if="importState.status === 'done'">
                <CheckCircleOutlined class="status-icon done" />
                {{ importState.total }} 篇导入完成
              </template>
              <template v-else-if="importState.status === 'error'">
                <CloseCircleOutlined class="status-icon error" />
                导入中断，已完成 {{ importState.completed }}/{{ importState.total }}
              </template>
            </span>
            <span class="summary-percent">{{ percent }}%</span>
          </div>
          <div class="summary-bar-track">
            <div
              class="summary-bar-fill"
              :class="barClass"
              :style="{ transform: `scaleX(${percent / 100})` }"
            />
          </div>
        </div>

        <!-- 文件列表 -->
        <div class="file-list" v-if="importState.files.length > 0">
          <div
            v-for="(f, i) in importState.files"
            :key="i"
            class="file-row"
            :class="'file-row--' + f.status"
            :title="f.errorMessage || undefined"
          >
            <span class="file-dot">
              <CheckCircleFilled v-if="f.status === 'done'" class="dot-icon done" />
              <LoadingOutlined v-else-if="f.status === 'importing'" class="dot-icon importing" spin />
              <CloseCircleFilled v-else-if="f.status === 'error'" class="dot-icon error" />
              <span v-else class="dot-dot" />
            </span>
            <span class="file-date">{{ f.date }}</span>
            <span class="file-status-text" :class="'status--' + f.status">
              <template v-if="f.status === 'pending'">等待中</template>
              <template v-else-if="f.status === 'importing'">导入中</template>
              <template v-else-if="f.status === 'done'">已完成</template>
              <template v-else-if="f.status === 'error'">{{ f.errorMessage || '失败' }}</template>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 创建 DiarySetting.vue 脚本**

```vue
<script setup lang="ts">
import { reactive, computed, ref } from 'vue'
import { FolderOpenOutlined, CheckCircleOutlined, CheckCircleFilled, CloseCircleOutlined, CloseCircleFilled, LoadingOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import { scanDirectory, importFile } from '@/backend/api/diary'
import { useDiaryStore } from '@/stores/diaryStore'

// ---- Electron 检测 ----
const isElectron = computed(() => typeof window !== 'undefined' && !!(window as any).electronAPI)

// ---- 手动路径（浏览器 dev 降级） ----
const manualPath = ref('')

// ---- 进度状态 ----

interface ImportFileItem {
  date: string
  status: 'pending' | 'importing' | 'done' | 'error'
  errorMessage?: string
}

interface ImportState {
  status: 'idle' | 'scanning' | 'importing' | 'done' | 'error'
  files: ImportFileItem[]
  total: number
  completed: number
}

const importState = reactive<ImportState>({
  status: 'idle',
  files: [],
  total: 0,
  completed: 0,
})

const percent = computed(() => {
  if (importState.total === 0) return 0
  return Math.round((importState.completed / importState.total) * 100)
})

const barClass = computed(() => ({
  'summary-bar-fill--done': importState.status === 'done',
  'summary-bar-fill--error': importState.status === 'error',
}))

// ---- 导入流程 ----

const diaryStore = useDiaryStore()

async function handleImportClick() {
  let directory: string

  if (isElectron.value) {
    const result = await (window as any).electronAPI.openDialog({
      properties: ['openDirectory'],
    })
    if (result.canceled || !result.filePaths?.length) return
    directory = result.filePaths[0]
  } else {
    if (!manualPath.value.trim()) return
    directory = manualPath.value.trim()
  }

  await doImport(directory)
}

async function doImport(directory: string) {
  // ---- 1. 扫描 ----
  importState.status = 'scanning'
  importState.files = []
  importState.total = 0
  importState.completed = 0

  let fileList: { date: string; path: string }[]
  try {
    const res = await scanDirectory(directory)
    fileList = res.files || []
  } catch (e: any) {
    message.error('扫描目录失败: ' + (e?.message || e))
    importState.status = 'idle'
    return
  }

  if (fileList.length === 0) {
    message.info('未找到符合格式的日记文件（YYYY-MM-DD.txt）')
    importState.status = 'idle'
    return
  }

  importState.files = fileList.map(f => ({
    date: f.date,
    status: 'pending' as const,
  }))
  importState.total = fileList.length

  // ---- 2. 逐文件导入 ----
  importState.status = 'importing'
  let hasError = false

  for (let i = 0; i < fileList.length; i++) {
    const item = fileList[i]!
    importState.files[i]!.status = 'importing'

    try {
      await importFile(item.path, item.date)
      importState.files[i]!.status = 'done'
      importState.completed++
    } catch (e: any) {
      importState.files[i]!.status = 'error'
      importState.files[i]!.errorMessage = e?.message || '未知错误'
      hasError = true
    }
  }

  // ---- 3. 完成 ----
  importState.status = hasError ? 'error' : 'done'

  // 刷新日记日期列表
  await diaryStore.loadDates()

  if (importState.status === 'done') {
    message.success(`成功导入 ${importState.completed} 篇日记`)
    // 1.5s 后自动恢复按钮
    setTimeout(() => {
      importState.status = 'idle'
      importState.files = []
      importState.total = 0
      importState.completed = 0
    }, 1500)
  }
}
</script>
```

- [ ] **Step 3: 创建 DiarySetting.vue 样式**

```vue
<style scoped>
.diary-setting {
  max-width: 560px;
}

.setting-title {
  font-size: var(--billadm-size-text-section);
  font-weight: var(--billadm-weight-semibold);
  color: var(--billadm-color-text-major);
  margin: 0 0 var(--billadm-space-xl) 0;
}

.setting-section {
  margin-bottom: var(--billadm-space-xl);
}

.section-title {
  font-size: var(--billadm-size-text-body);
  font-weight: var(--billadm-weight-medium);
  color: var(--billadm-color-text-major);
  margin: 0 0 var(--billadm-space-md) 0;
}

/* ---- 导入按钮区 ---- */
.import-action {
  display: flex;
  flex-direction: column;
  gap: var(--billadm-space-sm);
}

.dev-path-row {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-sm);
}

.dev-path-hint {
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-disabled);
}

/* ---- 进度卡片 ---- */
.import-progress-card {
  background: var(--billadm-color-major-background);
  border: 1px solid var(--billadm-color-divider);
  border-radius: var(--billadm-radius-md);
  padding: var(--billadm-space-md);
}

/* 总进度 */
.progress-summary {
  margin-bottom: var(--billadm-space-sm);
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
  font-size: var(--billadm-size-text-body-sm);
  font-weight: var(--billadm-weight-medium);
  color: var(--billadm-color-text-major);
}

.status-icon.done { color: var(--billadm-color-success); }
.status-icon.error { color: var(--billadm-color-expense); }

.summary-percent {
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-secondary);
  font-variant-numeric: tabular-nums;
}

.summary-bar-track {
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: var(--billadm-color-minor-background);
  overflow: hidden;
}

.summary-bar-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--billadm-color-primary);
  transform-origin: left;
  transition: transform 200ms ease;
}

.summary-bar-fill--done { background: var(--billadm-color-success); }
.summary-bar-fill--error { background: var(--billadm-color-expense); }

/* 文件列表 */
.file-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: 280px;
  overflow-y: auto;
}

.file-row {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-sm);
  padding: 5px var(--billadm-space-xs);
  border-radius: var(--billadm-radius-sm);
  font-size: var(--billadm-size-text-body-sm);
}

.file-row--importing {
  background: var(--billadm-color-hover-bg);
}

.file-row--error {
  background: var(--billadm-color-danger-hover-bg);
}

.file-dot {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dot-icon {
  font-size: var(--billadm-size-text-body);
}
.dot-icon.done { color: var(--billadm-color-success); }
.dot-icon.importing { color: var(--billadm-color-primary); }
.dot-icon.error { color: var(--billadm-color-expense); }

.dot-dot {
  display: block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--billadm-color-text-disabled);
}

.file-date {
  flex: 1;
  font-variant-numeric: tabular-nums;
  color: var(--billadm-color-text-major);
}

.file-status-text {
  flex-shrink: 0;
  font-size: var(--billadm-size-text-caption);
}

.status--pending,
.status--importing { color: var(--billadm-color-text-disabled); }
.status--done { color: var(--billadm-color-success); }
.status--error { color: var(--billadm-color-expense); }

@media (prefers-reduced-motion: reduce) {
  .summary-bar-fill { transition: none; }
}
</style>
```

- [ ] **Step 4: 类型检查**

```bash
cd app && npx vue-tsc --noEmit 2>&1 | head -20
```

Expected: 无新增错误（SettingsView.vue 尚未引用 DiarySetting，暂时无错误）。

- [ ] **Step 5: Commit**

```bash
git add app/src/components/settings_view/DiarySetting.vue
git commit -m "feat: add DiarySetting page with import button and progress UI"
```

---

### Task 5: 前端 — SettingsView 侧边栏集成

**Files:**
- Modify: `app/src/components/settings_view/SettingsView.vue`

- [ ] **Step 1: 在模板中插入"日记"导航按钮**

在"消费模板"按钮和"AI 助手"按钮之间插入：

```vue
        <button
          class="nav-item"
          :class="{ active: activeComponent === 'diary' }"
          @click="activeComponent = 'diary'"
          aria-label="日记"
        >
          <BookOutlined class="nav-icon"/>
          <span class="nav-text">日记</span>
        </button>
```

- [ ] **Step 2: 在 script 中 import BookOutlined 和 DiarySetting**

在 `@ant-design/icons-vue` 的 import 中添加 `BookOutlined`：

```typescript
import {
  FileTextOutlined,
  SettingOutlined,
  InfoCircleOutlined,
  RobotOutlined,
  BookOutlined,
} from "@ant-design/icons-vue";
```

在组件 import 区域添加 DiarySetting：

```typescript
import DiarySetting from './DiarySetting.vue';
```

在 componentMap 中，`'template'` 和 `'ai'` 之间添加：

```typescript
  'diary': DiarySetting,
```

- [ ] **Step 3: 完整类型检查**

```bash
cd app && npx vue-tsc --noEmit && echo "TYPECHECK OK"
```

Expected: 无类型错误。

- [ ] **Step 4: Commit**

```bash
git add app/src/components/settings_view/SettingsView.vue
git commit -m "feat: add diary nav item to settings sidebar"
```

---

### Task 6: 集成验证

**Files:**
- (无新建文件)

- [ ] **Step 1: Go 后端编译 + vet**

```bash
cd kernel && go build -o nul.exe && echo "BUILD OK"
cd kernel && go vet ./... && echo "VET OK"
```

Expected: 编译成功，vet 无警告。

- [ ] **Step 2: 前端类型检查 + 构建**

```bash
cd app && npx vue-tsc --noEmit && echo "TYPECHECK OK"
cd app && npm run build && echo "BUILD OK"
```

Expected: 类型检查和 Vite 构建均成功。

- [ ] **Step 3: 手动验证检查清单**

准备测试数据：
```bash
mkdir -p /tmp/diary-test/2026
echo "测试日记内容" > /tmp/diary-test/2026/2026-07-12.txt
echo "# 标题\n正文内容" > /tmp/diary-test/2026/2026-07-11.txt
# 放入一个非法文件名验证跳过逻辑
echo "skip" > /tmp/diary-test/2026/not-a-diary.md
# 放入一个非法日期验证跳过逻辑
echo "bad" > /tmp/diary-test/2026/2026-13-01.txt
```

启动应用（三个终端 dev 模式），验证:
1. 设置侧边栏显示"日记"按钮，位于"消费模板"和"AI 助手"之间
2. 点击"日记"显示 DiarySetting 页面
3. 标题"日记管理"显示正确
4. "选择目录导入"按钮上有 tooltip，hover 0.5s 后显示说明文字
5. 点击按钮弹出目录选择对话框
6. 选择测试目录后，进度条显示扫描 → 逐文件导入
7. 文件列表中每行显示日期和状态（pending → importing → done）
8. 非法文件名和非法日期被静默跳过
9. 全部完成后显示"2 篇导入完成"，1.5s 后恢复按钮
10. `message.success("成功导入 2 篇日记")` 弹出
11. 切换到日记视图，左侧树显示刚导入的两篇日记
12. 再次导入同一目录，日记被覆盖（无重复）

- [ ] **Step 4: Commit（如有修正）**

```bash
git add -A
git commit -m "chore: integration verification and fixes for diary import"
```
