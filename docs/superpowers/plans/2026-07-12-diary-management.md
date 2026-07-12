# 日记管理功能 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Transactions 应用新增日记管理功能——工作空间级别的 Markdown 日记，带心情标记，左侧年月日三级树 + 右侧编辑/预览区。

**Architecture:** 后端遵循现有 `api → service → DB` 模式（不引入独立 DAO，与 key_event 一致）。前端遵循 Pinia store + Vue 3 Composition API 模式，三布局用 `BilladmPageLayout` 容器。日记不绑定账本，属于工作空间级别数据。

**Tech Stack:** Go 1.24 (Gin + GORM + SQLite), Vue 3 + TypeScript + Ant Design Vue + Pinia, Markdown (marked + DOMPurify + highlight.js)

## Global Constraints

- 日记不绑定账本（LedgerID），属于工作空间级别
- 每天最多一条日记（date 唯一索引）
- 日记内容使用 Markdown 格式
- 表名: `tbl_billadm_diary_entry`
- 路由: `/diary_view`，导航标签"日记管理"，图标 `ReadOutlined`
- 导航位置: 关键事件与 AI 助手之间
- 日记视图不显示底部状态栏
- 全部倒序排列（最新在上）
- 只在有日记的日期节点存在于树中

---

## 文件结构

```
新建:
  kernel/models/diary_entry.go           # DiaryEntry model + TableName
  kernel/service/diary_service.go        # DiaryService interface + impl (直接操作 DB，无独立 DAO)
  kernel/api/diary_controller.go         # Handler methods: listDates, getDiary, upsertDiary, deleteDiary

  app/src/types/billadm.d.ts             # 追加 DiaryEntry, DiaryDateItem 接口
  app/src/backend/api/diary.ts           # API client: fetchDates, fetchDiary, saveDiary, deleteDiary
  app/src/stores/diaryStore.ts           # Pinia store: dates cache, current entry, save/delete actions
  app/src/components/diary_view/DiaryView.vue    # 主视图: 工具栏 + 左树 + 右编辑器
  app/src/components/diary_view/DiaryTree.vue    # 左侧年月日三级递归树
  app/src/components/diary_view/DiaryEditor.vue  # 右侧 Markdown 编辑/预览

修改:
  kernel/workspace/workspace.go          # AutoMigrate 追加 &models.DiaryEntry{}
  kernel/api/handlers.go                 # 添加 DiarySvc 字段
  kernel/api/router.go                   # 注册 /diary 路由组
  kernel/server/wire.go                  # 创建并注入 DiaryService

  app/src/router/router.ts               # 添加 /diary_view 路由
  app/src/components/AppLeftBar.vue      # navItems 插入"日记管理"
  app/src/components/Layout.vue          # showBottomBar 排除 /diary_view
  app/src/types/components.d.ts          # (自动生成，无需手动编辑)
```

---

### Task 1: Go 后端 — 数据模型与 Service

**Files:**
- Create: `kernel/models/diary_entry.go`
- Create: `kernel/service/diary_service.go`
- Modify: `kernel/workspace/workspace.go`

**Interfaces:**
- Produces: `models.DiaryEntry` struct, `service.DiaryService` interface with methods `ListDates`, `GetByDate`, `Upsert`, `DeleteByDate`

- [ ] **Step 1: 创建 DiaryEntry 数据模型**

```go
// kernel/models/diary_entry.go
package models

type DiaryEntry struct {
	ID        string `gorm:"primaryKey;comment:日记UUID" json:"id"`
	Date      string `gorm:"uniqueIndex;not null;comment:日期 YYYY-MM-DD" json:"date"`
	Content   string `gorm:"type:text;comment:日记正文(Markdown)" json:"content"`
	Mood      string `gorm:"type:varchar(20);default:'';comment:心情标记" json:"mood"`
	CreatedAt int64  `gorm:"autoCreateTime:unix;not null;comment:创建时间" json:"createdAt"`
	UpdatedAt int64  `gorm:"autoUpdateTime:unix;not null;comment:更新时间" json:"updatedAt"`
}

func (d *DiaryEntry) TableName() string {
	return "tbl_billadm_diary_entry"
}

// DiaryDateItem is the DTO returned by ListDates — one per date with word count.
type DiaryDateItem struct {
	Date      string `json:"date"`
	WordCount int    `json:"wordCount"`
	Mood      string `json:"mood"`
}
```

- [ ] **Step 2: 创建 DiaryService**

```go
// kernel/service/diary_service.go
package service

import (
	"fmt"
	"unicode/utf8"

	"github.com/billadm/models"
	"github.com/billadm/util"
	"github.com/billadm/workspace"
	"github.com/sirupsen/logrus"
	"gorm.io/gorm"
)

func NewDiaryService() DiaryService {
	return &diaryServiceImpl{}
}

type DiaryService interface {
	ListDates(ws *workspace.Workspace) ([]models.DiaryDateItem, error)
	GetByDate(ws *workspace.Workspace, date string) (*models.DiaryEntry, error)
	Upsert(ws *workspace.Workspace, date string, content string, mood string) (*models.DiaryEntry, error)
	DeleteByDate(ws *workspace.Workspace, date string) error
}

var _ DiaryService = &diaryServiceImpl{}

type diaryServiceImpl struct{}

// wordCount returns the number of Unicode characters (not bytes) in s.
// We use rune count because Chinese characters are one "word" each.
func wordCount(s string) int {
	return utf8.RuneCountInString(s)
}

func (s *diaryServiceImpl) ListDates(ws *workspace.Workspace) ([]models.DiaryDateItem, error) {
	var entries []models.DiaryEntry
	err := ws.GetDb().Model(&models.DiaryEntry{}).
		Select("date, content, mood").
		Order("date DESC").
		Find(&entries).Error
	if err != nil {
		return nil, err
	}
	items := make([]models.DiaryDateItem, len(entries))
	for i, e := range entries {
		items[i] = models.DiaryDateItem{
			Date:      e.Date,
			WordCount: wordCount(e.Content),
			Mood:      e.Mood,
		}
	}
	return items, nil
}

func (s *diaryServiceImpl) GetByDate(ws *workspace.Workspace, date string) (*models.DiaryEntry, error) {
	var entry models.DiaryEntry
	err := ws.GetDb().Where("date = ?", date).First(&entry).Error
	if err != nil {
		return nil, err
	}
	return &entry, nil
}

func (s *diaryServiceImpl) Upsert(ws *workspace.Workspace, date string, content string, mood string) (*models.DiaryEntry, error) {
	var existing models.DiaryEntry
	err := ws.GetDb().Where("date = ?", date).First(&existing).Error
	if err != nil && err != gorm.ErrRecordNotFound {
		return nil, err
	}

	if err == nil {
		// Update existing
		existing.Content = content
		existing.Mood = mood
		if saveErr := ws.GetDb().Save(&existing).Error; saveErr != nil {
			return nil, saveErr
		}
		return &existing, nil
	}

	// Create new
	entry := &models.DiaryEntry{
		ID:      util.GetUUID(),
		Date:    date,
		Content: content,
		Mood:    mood,
	}
	if createErr := ws.GetDb().Create(entry).Error; createErr != nil {
		return nil, createErr
	}
	logrus.Infof("创建日记, 日期: %s, 字数: %d", date, wordCount(content))
	return entry, nil
}

func (s *diaryServiceImpl) DeleteByDate(ws *workspace.Workspace, date string) error {
	logrus.Infof("删除日记, 日期: %s", date)
	result := ws.GetDb().Where("date = ?", date).Delete(&models.DiaryEntry{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return fmt.Errorf("日记不存在: %s", date)
	}
	return nil
}
```

- [ ] **Step 3: 在 workspace 中添加 AutoMigrate**

在 `kernel/workspace/workspace.go` 的 `NewWorkspace` 函数中，在现有 AI 表迁移后添加:

```go
// 在 db.AutoMigrate(&models.AiMessage{}) 之后添加:
if err := db.AutoMigrate(&models.DiaryEntry{}); err != nil {
    return nil, err
}
```

- [ ] **Step 4: 编译验证**

```bash
cd kernel && go build -o nul.exe
```

Expected: 编译成功，无错误。

- [ ] **Step 5: Commit**

```bash
git add kernel/models/diary_entry.go kernel/service/diary_service.go kernel/workspace/workspace.go
git commit -m "feat: add DiaryEntry model and DiaryService"
```

---

### Task 2: Go 后端 — API 处理器与路由注册

**Files:**
- Create: `kernel/api/diary_controller.go`
- Modify: `kernel/api/handlers.go`
- Modify: `kernel/api/router.go`
- Modify: `kernel/server/wire.go`

**Interfaces:**
- Consumes: `DiaryService` (from Task 1)
- Produces: Handler methods on `*Handlers`, registered routes under `/api/v1/diary`

- [ ] **Step 1: 创建 diary_controller.go**

```go
// kernel/api/diary_controller.go
package api

import (
	"fmt"

	"github.com/gin-gonic/gin"
)

// GET /api/v1/diary/dates
func (h *Handlers) listDiaryDates(c *gin.Context) (any, error) {
	ws := ws(c)
	return h.DiarySvc.ListDates(ws)
}

// GET /api/v1/diary/:date
func (h *Handlers) getDiary(c *gin.Context) (any, error) {
	ws := ws(c)

	date := c.Param("date")
	if date == "" {
		return nil, fmt.Errorf("missing date parameter")
	}

	return h.DiarySvc.GetByDate(ws, date)
}

// PUT /api/v1/diary/:date  body: { content, mood }
func (h *Handlers) upsertDiary(c *gin.Context) (any, error) {
	ws := ws(c)

	date := c.Param("date")
	if date == "" {
		return nil, fmt.Errorf("missing date parameter")
	}

	arg, ok := JsonArg(c)
	if !ok {
		return nil, fmt.Errorf("parses request failed")
	}

	content, _ := arg["content"].(string)
	mood, _ := arg["mood"].(string)

	return h.DiarySvc.Upsert(ws, date, content, mood)
}

// DELETE /api/v1/diary/:date
func (h *Handlers) deleteDiary(c *gin.Context) (any, error) {
	ws := ws(c)

	date := c.Param("date")
	if date == "" {
		return nil, fmt.Errorf("missing date parameter")
	}

	if err := h.DiarySvc.DeleteByDate(ws, date); err != nil {
		return nil, err
	}
	return nil, nil
}
```

- [ ] **Step 2: 在 handlers.go 中添加 DiarySvc 字段**

在 `kernel/api/handlers.go` 的 `Handlers` struct 中添加:

```go
// 在 KeyEventImgSvc 行之后添加:
DiarySvc     service.DiaryService
```

- [ ] **Step 3: 在 router.go 中注册日记路由**

在 `kernel/api/router.go` 的 `ServeAPI` 函数中，在 AI 路由组之前添加:

```go
// Diary
diary := v1.Group("/diary")
{
	diary.GET("/dates", Handle(h.listDiaryDates))
	diary.GET("/:date", Handle(h.getDiary))
	diary.PUT("/:date", Handle(h.upsertDiary))
	diary.DELETE("/:date", Handle(h.deleteDiary))
}
```

- [ ] **Step 4: 在 wire.go 中注入 DiaryService**

在 `kernel/server/wire.go` 的 `InitServices` 函数中:

```go
// 在 "Services with no dependencies" 区域添加:
diarySvc := service.NewDiaryService()

// 在 return &api.Handlers{...} 中添加:
DiarySvc:     diarySvc,
```

- [ ] **Step 5: 编译验证**

```bash
cd kernel && go build -o nul.exe
```

Expected: 编译成功。

- [ ] **Step 6: Commit**

```bash
git add kernel/api/diary_controller.go kernel/api/handlers.go kernel/api/router.go kernel/server/wire.go
git commit -m "feat: add diary API endpoints and wire up DiaryService"
```

---

### Task 3: 前端 — 类型定义、API 客户端与 Store

**Files:**
- Create: `app/src/backend/api/diary.ts`
- Create: `app/src/stores/diaryStore.ts`
- Modify: `app/src/types/billadm.d.ts`

**Interfaces:**
- Consumes: 后端 API `/api/v1/diary/*`
- Produces: `DiaryEntry`, `DiaryDateItem` TypeScript 类型; `fetchDates`, `fetchDiary`, `saveDiary`, `deleteDiary` API 函数; `useDiaryStore` Pinia store

- [ ] **Step 1: 在 billadm.d.ts 中添加类型声明**

在 `app/src/types/billadm.d.ts` 末尾追加:

```typescript
/**
 * 日记条目
 */
export interface DiaryEntry {
    id: string;           // UUID
    date: string;         // YYYY-MM-DD
    content: string;      // Markdown 正文
    mood: string;         // 心情 emoji（可为空）
    createdAt: number;    // Unix 时间戳
    updatedAt: number;    // Unix 时间戳
}

/**
 * 日记日期列表项（用于构建左侧树）
 */
export interface DiaryDateItem {
    date: string;         // YYYY-MM-DD
    wordCount: number;    // 字数（Unicode 字符数）
    mood: string;         // 心情 emoji
}
```

- [ ] **Step 2: 创建 diary.ts API 客户端**

```typescript
// app/src/backend/api/diary.ts
import api from "@/backend/api/api-client";
import type { DiaryEntry, DiaryDateItem } from "@/types/billadm";

/** 获取所有有日记的日期列表（含字数、心情） */
export async function fetchDates(): Promise<DiaryDateItem[]> {
    return api.get<DiaryDateItem[]>('/v1/diary/dates', '查询日记日期列表');
}

/** 获取某天的日记详情 */
export async function fetchDiary(date: string): Promise<DiaryEntry> {
    return api.get<DiaryEntry>(`/v1/diary/${date}`, '查询日记详情');
}

/** 创建或更新某天的日记 */
export async function saveDiary(date: string, content: string, mood: string): Promise<DiaryEntry> {
    return api.put<DiaryEntry>(`/v1/diary/${date}`, { content, mood }, '保存日记');
}

/** 删除某天的日记 */
export async function deleteDiary(date: string): Promise<void> {
    return api.delete<void>(`/v1/diary/${date}`, '删除日记');
}
```

- [ ] **Step 3: 创建 diaryStore.ts**

```typescript
// app/src/stores/diaryStore.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fetchDates, fetchDiary, saveDiary as apiSaveDiary, deleteDiary as apiDeleteDiary } from '@/backend/api/diary'
import NotificationUtil from '@/backend/notification'
import type { DiaryEntry, DiaryDateItem } from '@/types/billadm'

export const useDiaryStore = defineStore('diary', () => {
    // ---- Reactive state ----
    const dates = ref<DiaryDateItem[]>([])            // 所有有日记的日期列表
    const currentEntry = ref<DiaryEntry | null>(null)  // 当前查看/编辑的日记
    const loading = ref(false)
    const saving = ref(false)
    const saveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')

    // ---- Actions ----

    /** 加载所有日记日期列表（用于构建左侧树） */
    const loadDates = async () => {
        try {
            dates.value = await fetchDates()
        } catch {
            dates.value = []
        }
    }

    /** 加载某天的日记到 currentEntry */
    const loadEntry = async (date: string) => {
        loading.value = true
        try {
            currentEntry.value = await fetchDiary(date)
        } catch {
            // 该日期没有日记 — 创建空占位
            currentEntry.value = {
                id: '',
                date,
                content: '',
                mood: '',
                createdAt: 0,
                updatedAt: 0,
            }
        } finally {
            loading.value = false
        }
    }

    /** 保存当前日记 */
    const saveEntry = async (date: string, content: string, mood: string) => {
        saving.value = true
        saveStatus.value = 'saving'
        try {
            const saved = await apiSaveDiary(date, content, mood)
            currentEntry.value = saved
            saveStatus.value = 'saved'
            // 更新 dates 列表（可能新增日期或更新字数/心情）
            const idx = dates.value.findIndex(d => d.date === date)
            const item: DiaryDateItem = {
                date,
                wordCount: [...content].length, // Unicode 字符数
                mood,
            }
            // 只有 content 非空才保留在列表里
            if (content.trim()) {
                if (idx >= 0) {
                    dates.value[idx] = item
                } else {
                    dates.value.push(item)
                    // 保持倒序
                    dates.value.sort((a, b) => b.date.localeCompare(a.date))
                }
            } else {
                // 空内容 = 等效删除
                if (idx >= 0) {
                    dates.value.splice(idx, 1)
                }
            }
        } catch {
            saveStatus.value = 'error'
            throw new Error('保存失败')
        } finally {
            saving.value = false
        }
    }

    /** 删除某天的日记 */
    const removeEntry = async (date: string) => {
        try {
            await apiDeleteDiary(date)
            dates.value = dates.value.filter(d => d.date !== date)
            if (currentEntry.value?.date === date) {
                currentEntry.value = null
            }
            NotificationUtil.success('日记已删除')
        } catch (e: any) {
            NotificationUtil.error('删除失败', e.message)
            throw e
        }
    }

    /** 清除当前日记（切换到空白编辑区） */
    const clearCurrent = (date?: string) => {
        currentEntry.value = date ? {
            id: '',
            date,
            content: '',
            mood: '',
            createdAt: 0,
            updatedAt: 0,
        } : null
    }

    /** 根据年月获取有日记的日期集合 */
    const getDatesByYearMonth = (year: string, month: string): DiaryDateItem[] => {
        const prefix = `${year}-${month.padStart(2, '0')}`
        return dates.value.filter(d => d.date.startsWith(prefix))
    }

    return {
        dates,
        currentEntry,
        loading,
        saving,
        saveStatus,
        loadDates,
        loadEntry,
        saveEntry,
        removeEntry,
        clearCurrent,
        getDatesByYearMonth,
    }
})
```

- [ ] **Step 4: TypeScript 类型检查**

```bash
cd app && npx vue-tsc -b --noEmit
```

Expected: 无类型错误。

- [ ] **Step 5: Commit**

```bash
git add app/src/types/billadm.d.ts app/src/backend/api/diary.ts app/src/stores/diaryStore.ts
git commit -m "feat: add diary types, API client, and Pinia store"
```

---

### Task 4: 前端 — 路由注册与侧边栏导航

**Files:**
- Modify: `app/src/router/router.ts`
- Modify: `app/src/components/AppLeftBar.vue`
- Modify: `app/src/components/Layout.vue`

**Interfaces:**
- Consumes: `DiaryView.vue` (将在 Task 5 创建)
- Produces: `/diary_view` 路由可用，侧边栏显示"日记管理"入口，日记视图不显示底部栏

- [ ] **Step 1: 在 router.ts 中添加日记路由**

在 `app/src/router/router.ts` 的 routes 数组中，在 AI 助手路由之前添加:

```typescript
{
  name: '日记管理',
  path: 'diary_view',
  component: () => import('@/components/diary_view/DiaryView.vue')
},
```

完整 routes 数组应变为:

```typescript
const routes = [
  {
    path: '/',
    component: Layout,
    children: [
      {path: '', redirect: '/tr_view'},
      {
        name: '分类标签',
        path: 'category_tag_view',
        component: () => import('@/components/settings_view/BilladmCategoryTagSetting.vue')
      },
      {
        name: '消费记录',
        path: 'tr_view',
        component: () => import('@/components/tr_view/TransactionRecordView.vue')
      },
      {
        name: '数据分析',
        path: 'da_view',
        component: () => import('@/components/da_view/DataAnalysisView.vue')
      },
      {
        name: '关键事件',
        path: 'key_event_view',
        component: () => import('@/components/key_event_view/KeyEventView.vue')
      },
      {
        name: '日记管理',
        path: 'diary_view',
        component: () => import('@/components/diary_view/DiaryView.vue')
      },
      {
        name: 'AI 助手',
        path: 'ai_view',
        component: () => import('@/components/ai_view/AiChatView.vue'),
      },
      {
        name: '应用设置',
        path: 'settings_view',
        component: () => import('@/components/settings_view/SettingsView.vue')
      },
    ]
  }
];
```

- [ ] **Step 2: 在 AppLeftBar.vue 中添加导航项**

2a. 在 `<script setup>` 顶部 import 区添加 `ReadOutlined`:

```typescript
import {
  BookOutlined,
  DownOutlined,
  PlusOutlined,
  DeleteOutlined,
  TagOutlined,
  TransactionOutlined,
  LineChartOutlined,
  StarOutlined,
  SettingOutlined,
  RobotOutlined,
  ReadOutlined,   // <-- 新增
} from '@ant-design/icons-vue'
```

2b. 在 `navItems` 数组中，在 AI 助手条目之前插入:

```typescript
const navItems = [
  { path: '/category_tag_view', label: '分类标签', icon: TagOutlined },
  { path: '/tr_view', label: '消费记录', icon: TransactionOutlined },
  { path: '/da_view', label: '数据分析', icon: LineChartOutlined },
  { path: '/key_event_view', label: '关键事件', icon: StarOutlined },
  { path: '/diary_view', label: '日记管理', icon: ReadOutlined },  // <-- 新增
  { path: '/ai_view', label: 'AI 助手', icon: RobotOutlined },
]
```

- [ ] **Step 3: 在 Layout.vue 中排除日记视图的底部栏**

`showBottomBar` computed 无需修改——当前逻辑为白名单模式，`/diary_view` 不在其中，默认不显示。确认现有逻辑无需改动。

- [ ] **Step 4: 编译验证**

```bash
cd app && npx vue-tsc -b --noEmit
```

Expected: 类型错误 —— `DiaryView.vue` 尚不存在，这是预期的。确认只有这个文件缺失的错误，没有其他类型问题。

- [ ] **Step 5: Commit**

```bash
git add app/src/router/router.ts app/src/components/AppLeftBar.vue
git commit -m "feat: add diary route and sidebar navigation entry"
```

---

### Task 5: 前端 — DiaryTree 组件（左侧年月日树）

**Files:**
- Create: `app/src/components/diary_view/DiaryTree.vue`

**Interfaces:**
- Consumes: `DiaryDateItem[]` from diaryStore
- Produces: Emits `select` event with date string when a day node is clicked

- [ ] **Step 1: 创建 DiaryTree.vue**

```vue
<!-- app/src/components/diary_view/DiaryTree.vue -->
<template>
  <div class="diary-tree">
    <div v-if="yearNodes.length === 0" class="tree-empty">
      <span class="tree-empty-text">暂无日记</span>
    </div>
    <div v-else class="tree-scroll">
      <div v-for="year in yearNodes" :key="year.year">
        <!-- 年份节点 -->
        <button
          class="tree-node tree-node-year"
          :class="{ expanded: year.expanded }"
          @click="year.expanded = !year.expanded"
        >
          <CaretRightOutlined class="tree-caret" :class="{ rotated: year.expanded }" />
          <span class="tree-label">{{ year.year }}年</span>
          <span class="tree-count">{{ year.count }}篇</span>
        </button>

        <!-- 月份节点 -->
        <template v-if="year.expanded">
          <div v-for="month in year.months" :key="`${year.year}-${month.month}`">
            <button
              class="tree-node tree-node-month"
              :class="{ expanded: month.expanded }"
              @click="month.expanded = !month.expanded"
            >
              <CaretRightOutlined class="tree-caret tree-caret-sm" :class="{ rotated: month.expanded }" />
              <span class="tree-label">{{ month.month }}月</span>
              <span class="tree-count">{{ month.days.length }}篇</span>
            </button>

            <!-- 日期节点 -->
            <template v-if="month.expanded">
              <button
                v-for="day in month.days"
                :key="day.date"
                class="tree-node tree-node-day"
                :class="{ active: selectedDate === day.date }"
                @click="$emit('select', day.date)"
              >
                <span class="tree-label">{{ day.dayOfMonth }}日</span>
                <span v-if="day.mood" class="tree-mood">{{ day.mood }}</span>
                <span class="tree-word-count">{{ day.wordCount }}字</span>
              </button>
            </template>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CaretRightOutlined } from '@ant-design/icons-vue'
import type { DiaryDateItem } from '@/types/billadm'

const props = defineProps<{
  dates: DiaryDateItem[]
  selectedDate: string
}>()

defineEmits<{
  select: [date: string]
}>()

interface DayNode {
  date: string
  dayOfMonth: number
  wordCount: number
  mood: string
}

interface MonthNode {
  month: number
  expanded: boolean
  days: DayNode[]
}

interface YearNode {
  year: number
  expanded: boolean
  count: number
  months: MonthNode[]
}

const now = new Date()
const currentYear = now.getFullYear()
const currentMonth = now.getMonth() + 1

// 跟踪年份展开状态（用 ref map 保存用户手动折叠的节点）
const collapsedYears = ref<Set<number>>(new Set())
const collapsedMonths = ref<Set<string>>(new Set()) // "2026-7" format

const yearNodes = computed<YearNode[]>(() => {
  // 按年月日分组
  const yearMap = new Map<number, Map<number, DayNode[]>>()

  for (const d of props.dates) {
    const parts = d.date.split('-')
    const y = parseInt(parts[0]!, 10)
    const m = parseInt(parts[1]!, 10)
    const dayNum = parseInt(parts[2]!, 10)

    if (!yearMap.has(y)) yearMap.set(y, new Map())
    const monthMap = yearMap.get(y)!
    if (!monthMap.has(m)) monthMap.set(m, [])
    monthMap.get(m)!.push({
      date: d.date,
      dayOfMonth: dayNum,
      wordCount: d.wordCount,
      mood: d.mood,
    })
  }

  // 构建 YearNode 树（年份倒序）
  const years: YearNode[] = []
  const sortedYears = [...yearMap.keys()].sort((a, b) => b - a)

  for (const y of sortedYears) {
    const monthMap = yearMap.get(y)!
    const sortedMonths = [...monthMap.keys()].sort((a, b) => b - a)

    let totalCount = 0
    const months: MonthNode[] = []

    for (const m of sortedMonths) {
      const days = monthMap.get(m)!
      // 日期倒序
      days.sort((a, b) => b.date.localeCompare(a.date))
      totalCount += days.length
      months.push({
        month: m,
        expanded: !collapsedMonths.value.has(`${y}-${m}`),
        days,
      })
    }

    years.push({
      year: y,
      expanded: !collapsedYears.value.has(y),
      count: totalCount,
      months,
    })
  }

  return years
})

// 初始化：展开当前年月
watch(() => props.dates.length, () => {
  // 只在首次加载时自动展开当前年月
  if (props.dates.length > 0 && collapsedYears.value.size === 0) {
    // 不折叠当前年
    for (const y of yearNodes.value) {
      if (y.year !== currentYear) {
        collapsedYears.value.add(y.year)
      }
    }
    // 当前年下，不折叠当前月
    for (const y of yearNodes.value) {
      if (y.year === currentYear) {
        for (const m of y.months) {
          if (m.month !== currentMonth) {
            collapsedMonths.value.add(`${currentYear}-${m.month}`)
          }
        }
      }
    }
  }
})
</script>

<style scoped>
.diary-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.tree-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.tree-empty-text {
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-disabled);
}

.tree-scroll {
  flex: 1;
  overflow-y: auto;
  padding: var(--billadm-space-xs) 0;
}

/* 树节点基础 */
.tree-node {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-2xs);
  width: 100%;
  padding: var(--billadm-space-xs) var(--billadm-space-sm);
  border: none;
  background: none;
  cursor: pointer;
  font-family: inherit;
  font-size: var(--billadm-size-text-body-sm);
  color: var(--billadm-color-text-secondary);
  text-align: left;
  transition: background var(--billadm-transition-fast);
  border-radius: var(--billadm-radius-sm);
}

.tree-node:hover {
  background: var(--billadm-color-hover-bg);
}

/* 年份节点 */
.tree-node-year {
  font-weight: 600;
  color: var(--billadm-color-text-major);
  padding-left: var(--billadm-space-sm);
}

/* 月份节点 */
.tree-node-month {
  padding-left: calc(var(--billadm-space-lg) + var(--billadm-space-sm));
}

/* 日期节点 */
.tree-node-day {
  padding-left: calc(var(--billadm-space-lg) + var(--billadm-space-lg));
}

.tree-node-day.active {
  background: var(--billadm-color-active-bg);
  color: var(--billadm-color-primary);
  font-weight: 500;
}

/* 展开箭头 */
.tree-caret {
  font-size: 10px;
  flex-shrink: 0;
  transition: transform var(--billadm-transition-fast);
  color: var(--billadm-color-text-disabled);
}

.tree-caret.rotated {
  transform: rotate(90deg);
}

.tree-caret-sm {
  font-size: 8px;
}

/* 标签 */
.tree-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 数量 */
.tree-count {
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-disabled);
  flex-shrink: 0;
}

/* 心情 emoji */
.tree-mood {
  font-size: 13px;
  flex-shrink: 0;
}

/* 字数 */
.tree-word-count {
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-disabled);
  flex-shrink: 0;
}
</style>
```

- [ ] **Step 2: 编译验证**

```bash
cd app && npx vue-tsc -b --noEmit
```

Expected: 类型错误 —— `DiaryView.vue` 尚不存在。确认只有这个文件缺失的错误。

- [ ] **Step 3: Commit**

```bash
git add app/src/components/diary_view/DiaryTree.vue
git commit -m "feat: add DiaryTree component with year/month/day hierarchy"
```

---

### Task 6: 前端 — DiaryEditor 组件（右侧编辑区）

**Files:**
- Create: `app/src/components/diary_view/DiaryEditor.vue`

**Interfaces:**
- Consumes: `DiaryEntry | null` (current diary entry)
- Produces: Emits `save` event with `{ date, content, mood }`, `delete` event
- Uses: `renderMarkdown` from `@/utils/markdown`

- [ ] **Step 1: 创建 DiaryEditor.vue**

```vue
<!-- app/src/components/diary_view/DiaryEditor.vue -->
<template>
  <div class="diary-editor">
    <!-- 空状态 — 未选择日期 -->
    <div v-if="!entry" class="editor-empty">
      <span class="empty-text">选择左侧日期开始写作</span>
    </div>

    <!-- 编辑器 -->
    <template v-else>
      <!-- 头部：日期 + 心情 + 字数 -->
      <div class="editor-header">
        <div class="editor-date">
          <span class="date-text">{{ formattedDate }}</span>
          <span class="date-weekday">{{ weekday }}</span>
        </div>
        <div class="editor-meta">
          <!-- 心情选择器 -->
          <div class="mood-picker">
            <button
              v-for="m in moods"
              :key="m.emoji"
              class="mood-btn"
              :class="{ active: localMood === m.emoji, 'mood-none': m.emoji === '' }"
              :title="m.label"
              @click="onMoodChange(m.emoji)"
            >
              {{ m.emoji || '—' }}
            </button>
          </div>
          <span class="word-count">{{ wordCount }}字</span>
        </div>
      </div>

      <!-- 编辑/预览区 -->
      <div class="editor-body">
        <div v-if="mode === 'edit'" class="editor-textarea-wrap">
          <textarea
            ref="textareaRef"
            class="editor-textarea"
            :value="localContent"
            placeholder="写下今天的日记..."
            @input="onInput"
          />
        </div>
        <div v-else class="editor-preview" v-html="renderedHtml" />
      </div>

      <!-- 底部：模式切换 + 保存状态 -->
      <div class="editor-footer">
        <div class="footer-left">
          <a-button
            type="text"
            size="small"
            @click="mode = mode === 'edit' ? 'preview' : 'edit'"
          >
            <template #icon>
              <EyeOutlined v-if="mode === 'edit'" />
              <EditOutlined v-else />
            </template>
            {{ mode === 'edit' ? '预览' : '编辑' }}
          </a-button>
        </div>
        <div class="footer-right">
          <span v-if="saveStatus === 'saving'" class="save-status saving">保存中...</span>
          <span v-else-if="saveStatus === 'saved'" class="save-status saved">已保存</span>
          <span v-else-if="saveStatus === 'error'" class="save-status error">保存失败</span>
          <a-button
            type="text"
            size="small"
            danger
            @click="$emit('delete', entry.date)"
          >
            <template #icon><DeleteOutlined /></template>
            删除
          </a-button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { EyeOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import { Modal } from 'ant-design-vue'
import { renderMarkdown } from '@/utils/markdown'
import type { DiaryEntry } from '@/types/billadm'

const props = defineProps<{
  entry: DiaryEntry | null
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
}>()

const emit = defineEmits<{
  save: [data: { date: string; content: string; mood: string }]
  delete: [date: string]
}>()

// 心情选项
const moods = [
  { emoji: '', label: '无' },
  { emoji: '😊', label: '开心' },
  { emoji: '😐', label: '平静' },
  { emoji: '😢', label: '难过' },
  { emoji: '😤', label: '生气' },
  { emoji: '😰', label: '焦虑' },
]

// 编辑模式
const mode = ref<'edit' | 'preview'>('edit')
const localContent = ref('')
const localMood = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)

// 自动保存定时器
let saveTimer: ReturnType<typeof setTimeout> | null = null

// 同步外部 entry 到本地
watch(() => props.entry, (newEntry) => {
  if (newEntry) {
    localContent.value = newEntry.content
    localMood.value = newEntry.mood
    mode.value = 'edit'
    // 聚焦到编辑区末尾
    nextTick(() => {
      const ta = textareaRef.value
      if (ta) {
        ta.focus()
        ta.setSelectionRange(ta.value.length, ta.value.length)
      }
    })
  } else {
    localContent.value = ''
    localMood.value = ''
    mode.value = 'edit'
  }
}, { immediate: true })

// 输入处理（防抖自动保存）
const onInput = (e: Event) => {
  const target = e.target as HTMLTextAreaElement
  localContent.value = target.value
  scheduleSave()
}

const onMoodChange = (emoji: string) => {
  localMood.value = emoji
  scheduleSave()
}

const scheduleSave = () => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    doSave()
  }, 1500)
}

const doSave = () => {
  if (!props.entry) return
  emit('save', {
    date: props.entry.date,
    content: localContent.value,
    mood: localMood.value,
  })
}

// Ctrl+S 手动保存
const onKeydown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    if (saveTimer) clearTimeout(saveTimer)
    doSave()
  }
}

// 生命周期
watch(textareaRef, (ta) => {
  ta?.addEventListener('keydown', onKeydown)
})

// 格式化日期
const formattedDate = computed(() => {
  if (!props.entry) return ''
  const [y, m, d] = props.entry.date.split('-')
  return `${y}年${parseInt(m!, 10)}月${parseInt(d!, 10)}日`
})

const weekday = computed(() => {
  if (!props.entry) return ''
  const w = new Date(props.entry.date).getDay()
  return ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][w]
})

const wordCount = computed(() => [...localContent.value].length)

const renderedHtml = computed(() => renderMarkdown(localContent.value))
</script>

<style scoped>
.diary-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* 空状态 */
.editor-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.empty-text {
  font-size: var(--billadm-size-text-body);
  color: var(--billadm-color-text-disabled);
}

/* 头部 */
.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: var(--billadm-space-md);
  border-bottom: 1px solid var(--billadm-color-divider);
  flex-shrink: 0;
}

.editor-date {
  display: flex;
  align-items: baseline;
  gap: var(--billadm-space-sm);
}

.date-text {
  font-size: var(--billadm-size-text-display-sm);
  font-weight: 600;
  color: var(--billadm-color-text-major);
}

.date-weekday {
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-secondary);
}

.editor-meta {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-md);
}

/* 心情选择器 */
.mood-picker {
  display: flex;
  gap: 2px;
  background: var(--billadm-color-minor-background);
  border-radius: var(--billadm-radius-md);
  padding: 2px;
}

.mood-btn {
  width: 30px;
  height: 30px;
  border: none;
  background: none;
  border-radius: var(--billadm-radius-sm);
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--billadm-transition-fast);
  opacity: 0.4;
}

.mood-btn:hover {
  opacity: 0.7;
  background: var(--billadm-color-hover-bg);
}

.mood-btn.active {
  opacity: 1;
  background: var(--billadm-color-active-bg);
}

.mood-btn.mood-none {
  font-size: 11px;
  font-weight: 600;
  color: var(--billadm-color-text-disabled);
}

.word-count {
  font-family: var(--billadm-font-mono);
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-disabled);
  font-variant-numeric: tabular-nums;
}

/* 编辑区 */
.editor-body {
  flex: 1;
  overflow: hidden;
  padding: var(--billadm-space-md) 0;
}

.editor-textarea-wrap {
  height: 100%;
}

.editor-textarea {
  width: 100%;
  height: 100%;
  border: none;
  outline: none;
  resize: none;
  background: none;
  font-family: var(--billadm-font-mono);
  font-size: var(--billadm-size-text-body);
  color: var(--billadm-color-text-major);
  line-height: 1.8;
  padding: var(--billadm-space-xs);
}

.editor-textarea::placeholder {
  color: var(--billadm-color-text-disabled);
  font-style: italic;
}

.editor-preview {
  height: 100%;
  overflow-y: auto;
  padding: var(--billadm-space-xs);
  line-height: 1.8;
}

/* 底部 */
.editor-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: var(--billadm-space-sm);
  border-top: 1px solid var(--billadm-color-divider);
  flex-shrink: 0;
}

.footer-left,
.footer-right {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-sm);
}

.save-status {
  font-size: var(--billadm-size-text-caption);
}

.save-status.saving {
  color: var(--billadm-color-text-disabled);
}

.save-status.saved {
  color: var(--billadm-color-primary);
}

.save-status.error {
  color: var(--billadm-color-danger, #e74c3c);
}

/* Markdown 预览样式继承 — 复用 _typography.scss 中的全局样式 */
.editor-preview :deep(h1),
.editor-preview :deep(h2),
.editor-preview :deep(h3) {
  margin-top: 1.2em;
  margin-bottom: 0.6em;
}

.editor-preview :deep(p) {
  margin: 0.6em 0;
}

.editor-preview :deep(ul),
.editor-preview :deep(ol) {
  padding-left: 1.5em;
}

.editor-preview :deep(blockquote) {
  border-left: 3px solid var(--billadm-color-primary);
  padding-left: var(--billadm-space-md);
  color: var(--billadm-color-text-secondary);
  margin: 0.8em 0;
}

.editor-preview :deep(code) {
  font-family: var(--billadm-font-mono);
  background: var(--billadm-color-minor-background);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 0.9em;
}

.editor-preview :deep(pre) {
  background: var(--billadm-color-minor-background);
  padding: var(--billadm-space-md);
  border-radius: var(--billadm-radius-md);
  overflow-x: auto;
  margin: 0.8em 0;
}

.editor-preview :deep(pre code) {
  background: none;
  padding: 0;
}

.editor-preview :deep(img) {
  max-width: 100%;
  border-radius: var(--billadm-radius-md);
}
</style>
```

- [ ] **Step 2: 编译验证**

```bash
cd app && npx vue-tsc -b --noEmit
```

Expected: 类型错误 —— `DiaryView.vue` 尚不存在。确认只有这个文件缺失的错误。

- [ ] **Step 3: Commit**

```bash
git add app/src/components/diary_view/DiaryEditor.vue
git commit -m "feat: add DiaryEditor component with markdown edit/preview and mood picker"
```

---

### Task 7: 前端 — DiaryView 主视图（组装三布局）

**Files:**
- Create: `app/src/components/diary_view/DiaryView.vue`

**Interfaces:**
- Consumes: `DiaryTree`, `DiaryEditor`, `useDiaryStore`
- Produces: 完整日记管理页面

- [ ] **Step 1: 创建 DiaryView.vue**

```vue
<!-- app/src/components/diary_view/DiaryView.vue -->
<template>
  <BilladmPageLayout>
    <template #toolbar>
      <div class="diary-toolbar-left">
        <a-button size="small" @click="goToToday">
          今天
        </a-button>
        <a-date-picker
          v-model:value="jumpDate"
          size="small"
          placeholder="跳转到日期"
          format="YYYY-MM-DD"
          value-format="YYYY-MM-DD"
          :allow-clear="false"
          @change="onJumpToDate"
        />
      </div>
    </template>

    <!-- 两栏主体：左侧树 + 右侧编辑器 -->
    <div class="diary-body">
      <DiaryTree
        class="panel-left"
        :dates="store.dates"
        :selected-date="selectedDate"
        @select="onSelectDate"
      />
      <DiaryEditor
        class="panel-right"
        :entry="store.currentEntry"
        :save-status="store.saveStatus"
        @save="onSave"
        @delete="onDelete"
      />
    </div>
  </BilladmPageLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import dayjs, { type Dayjs } from 'dayjs'
import { Modal } from 'ant-design-vue'
import { useDiaryStore } from '@/stores/diaryStore'
import DiaryTree from './DiaryTree.vue'
import DiaryEditor from './DiaryEditor.vue'

const store = useDiaryStore()

const selectedDate = ref('')
const jumpDate = ref<Dayjs | null>(null)

// 初始化
onMounted(async () => {
  await store.loadDates()
  // 默认选中今天
  const today = dayjs().format('YYYY-MM-DD')
  goToDate(today)
})

/** 跳转到指定日期（树中可能没有该日期，仍然可以编辑） */
const goToDate = async (date: string) => {
  selectedDate.value = date
  await store.loadEntry(date)
}

const goToToday = () => {
  const today = dayjs().format('YYYY-MM-DD')
  jumpDate.value = null
  goToDate(today)
}

const onJumpToDate = (date: string) => {
  if (date) {
    goToDate(date)
  }
}

const onSelectDate = (date: string) => {
  selectedDate.value = date
  store.loadEntry(date)
}

const onSave = async (data: { date: string; content: string; mood: string }) => {
  try {
    await store.saveEntry(data.date, data.content, data.mood)
  } catch {
    // error handled in store
  }
}

const onDelete = (date: string) => {
  Modal.confirm({
    title: '确认删除',
    content: `确定要删除 ${date} 的日记吗？此操作不可撤销。`,
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      await store.removeEntry(date)
      selectedDate.value = ''
    },
  })
}
</script>

<style scoped>
.diary-toolbar-left {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-md);
}

.diary-body {
  flex: 1;
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: var(--billadm-space-lg);
  min-height: 0;
  overflow: hidden;
}

.panel-left {
  height: 100%;
  overflow: hidden;
  border-right: 1px solid var(--billadm-color-divider);
}

.panel-right {
  height: 100%;
  overflow: hidden;
}
</style>
```

- [ ] **Step 2: 完整编译验证**

```bash
cd app && npx vue-tsc -b --noEmit
```

Expected: 所有类型错误消失，编译通过。

- [ ] **Step 3: Commit**

```bash
git add app/src/components/diary_view/DiaryView.vue
git commit -m "feat: add DiaryView main page with toolbar, tree, and editor layout"
```

---

### Task 8: 集成验证

**Files:**
- (无新建文件)

**Interfaces:**
- (无新增接口)

- [ ] **Step 1: Go 后端编译 + 运行测试**

```bash
cd kernel && go build -o nul.exe && echo "BUILD OK"
cd kernel && go vet ./... && echo "VET OK"
cd kernel && go test ./... 2>&1 | tail -5
```

Expected: 编译成功，vet 无警告，已有测试通过。

- [ ] **Step 2: 前端类型检查**

```bash
cd app && npx vue-tsc -b --noEmit && echo "TYPECHECK OK"
```

Expected: 无类型错误。

- [ ] **Step 3: 前端构建验证**

```bash
cd app && npm run build && echo "BUILD OK"
```

Expected: Vite 构建成功，无错误。

- [ ] **Step 4: 手动验证检查清单**

启动三个终端（dev 模式）并验证:
1. 侧边栏显示"日记管理"按钮，位于"关键事件"和"AI 助手"之间
2. 点击进入日记视图，左侧显示树状时间表
3. 树节点按年月日倒序排列，只显示有日记的日期
4. 点击"今天"按钮，右侧显示今日编辑区
5. 输入文字后自动保存（1.5 秒后显示"已保存"）
6. Ctrl+S 手动保存
7. 切换心情 emoji 后自动保存
8. 编辑/预览模式切换
9. Markdown 内容预览正确渲染
10. 删除日记弹出确认框
11. 无日记的日期显示空白编辑区
12. 底部状态栏不显示

- [ ] **Step 5: Commit (如有修正)**

```bash
git add -A
git commit -m "chore: integration verification and fixes for diary feature"
```
