# 关键事件关联账本 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 关键事件关联账本，实现账本级别的事件隔离

**Architecture:** 自底向上：Go Model → DAO → Service → API → TS Types → TS API → TS Store，每层增加 `ledgerID` 字段/参数

**Tech Stack:** Go (Gin + GORM) + TypeScript (Vue 3 + Pinia)

---

## 文件变更总览

| 操作 | 文件 |
|------|------|
| 修改 | `kernel/models/key_event.go` |
| 修改 | `kernel/dao/key_event_dao.go` |
| 修改 | `kernel/service/key_event_service.go` |
| 修改 | `kernel/api/key_event_controller.go` |
| 修改 | `app/src/types/billadm.d.ts` |
| 修改 | `app/src/backend/api/key-event.ts` |
| 修改 | `app/src/stores/keyEventStore.ts` |

---

### Task 1: Go Model — KeyEvent 增加 LedgerID

**Files:** Modify `kernel/models/key_event.go`

- [ ] **Step 1: 添加字段**

在 `UpdatedAt` 行之后添加：

```go
LedgerID string `gorm:"index;type:varchar(36);default:'';comment:所属账本ID" json:"ledgerId"`
```

- [ ] **Step 2: 验证编译**

```bash
cd kernel && go build ./...
```
预期：成功

- [ ] **Step 3: Commit**

```bash
git add kernel/models/key_event.go
git commit -m "feat: KeyEvent 模型增加 LedgerID 字段"
```

---

### Task 2: Go DAO — 查询增加 LedgerID 过滤

**Files:** Modify `kernel/dao/key_event_dao.go`

- [ ] **Step 1: 更新接口和实现**

```go
type KeyEventDao interface {
    UpsertKeyEvent(ws *workspace.Workspace, event *models.KeyEvent) error
    QueryByDate(ws *workspace.Workspace, ledgerID string, date string) (*models.KeyEvent, error)
    QueryByYear(ws *workspace.Workspace, ledgerID string, year string) ([]models.KeyEvent, error)
    DeleteByDate(ws *workspace.Workspace, ledgerID string, date string) error
}
```

```go
func (k *keyEventDaoImpl) QueryByDate(ws *workspace.Workspace, ledgerID string, date string) (*models.KeyEvent, error) {
    var event models.KeyEvent
    err := ws.GetDb().Where("ledger_id = ? AND date = ?", ledgerID, date).First(&event).Error
    if err != nil {
        return nil, err
    }
    return &event, nil
}

func (k *keyEventDaoImpl) QueryByYear(ws *workspace.Workspace, ledgerID string, year string) ([]models.KeyEvent, error) {
    events := make([]models.KeyEvent, 0)
    err := ws.GetDb().Where("ledger_id = ? AND date LIKE ?", ledgerID, year+"-%").Find(&events).Error
    return events, err
}

func (k *keyEventDaoImpl) DeleteByDate(ws *workspace.Workspace, ledgerID string, date string) error {
    return ws.GetDb().Where("ledger_id = ? AND date = ?", ledgerID, date).Delete(&models.KeyEvent{}).Error
}
```

- [ ] **Step 2: 验证编译**

```bash
cd kernel && go build ./...
```
预期：Service 层调用不匹配，需 Task 3 修复

- [ ] **Step 3: Commit**

```bash
git add kernel/dao/key_event_dao.go
git commit -m "feat: KeyEvent DAO 查询增加 ledgerID 过滤"
```

---

### Task 3: Go Service — 接口增加 ledgerID 参数

**Files:** Modify `kernel/service/key_event_service.go`

- [ ] **Step 1: 更新接口和实现**

```go
type KeyEventService interface {
    UpsertKeyEvent(ws *workspace.Workspace, ledgerID string, date string, title string, content string, color string) error
    QueryByDate(ws *workspace.Workspace, ledgerID string, date string) (*models.KeyEvent, error)
    QueryByYear(ws *workspace.Workspace, ledgerID string, year string) ([]models.KeyEvent, error)
    QueryDatesByYear(ws *workspace.Workspace, ledgerID string, year string) ([]string, error)
    DeleteByDate(ws *workspace.Workspace, ledgerID string, date string) error
}
```

在 `UpsertKeyEvent` 中，创建新事件时设置 LedgerID：

```go
event := &models.KeyEvent{
    ID:       util.GetUUID(),
    Date:     date,
    Title:    title,
    Content:  content,
    Color:    color,
    LedgerID: ledgerID,
}
```

所有对 DAO 的调用传入 `ledgerID`：

```go
func (s *keyEventServiceImpl) QueryByDate(ws *workspace.Workspace, ledgerID string, date string) (*models.KeyEvent, error) {
    return s.keyEventDao.QueryByDate(ws, ledgerID, date)
}

func (s *keyEventServiceImpl) QueryByYear(ws *workspace.Workspace, ledgerID string, year string) ([]models.KeyEvent, error) {
    return s.keyEventDao.QueryByYear(ws, ledgerID, year)
}

func (s *keyEventServiceImpl) QueryDatesByYear(ws *workspace.Workspace, ledgerID string, year string) ([]string, error) {
    events, err := s.keyEventDao.QueryByYear(ws, ledgerID, year)
    // ... same logic
}

func (s *keyEventServiceImpl) DeleteByDate(ws *workspace.Workspace, ledgerID string, date string) error {
    // ... same logic, pass ledgerID to DAO
}
```

- [ ] **Step 2: 验证编译**

```bash
cd kernel && go build ./...
```

- [ ] **Step 3: Commit**

```bash
git add kernel/service/key_event_service.go
git commit -m "feat: KeyEvent Service 接口增加 ledgerID 参数"
```

---

### Task 4: Go API — 接收 ledger_id

**Files:** Modify `kernel/api/key_event_controller.go`

- [ ] **Step 1: 更新所有 handler**

从 query string 获取 `ledger_id`：

```go
func listKeyEventsByYear(c *gin.Context) {
    // ... existing ws check ...
    ledgerID := c.Query("ledger_id")
    if ledgerID == "" {
        ret.Code = -1
        ret.Msg = "ledger_id is required"
        return
    }
    // ...
    events, err := service.GetKeyEventService().QueryByYear(ws, ledgerID, year)
}
```

类似地更新 `listKeyEventDates`、`getKeyEvent`、`deleteKeyEvent`、`listKeyEventImages`、`addKeyEventImage`。

`upsertKeyEvent` 从 body 获取 `ledger_id`。

- [ ] **Step 2: 验证编译**

```bash
cd kernel && go build ./...
```

- [ ] **Step 3: Commit**

```bash
git add kernel/api/key_event_controller.go
git commit -m "feat: KeyEvent API 接收 ledger_id 参数"
```

---

### Task 5: TS Types + API + Store

**Files:** Modify `app/src/types/billadm.d.ts`, `app/src/backend/api/key-event.ts`, `app/src/stores/keyEventStore.ts`

- [ ] **Step 1: 更新类型**

在 `billadm.d.ts` 中 `KeyEvent` 接口添加：
```ts
ledgerId: string;
```

- [ ] **Step 2: 更新 API 层**

所有函数增加 `ledgerId: string` 参数，拼接到 URL query 或 body：

```ts
export async function queryKeyEventsByYear(year: number, ledgerId: string): Promise<KeyEvent[]> {
    return api.get<KeyEvent[]>(`/v1/key-events/year/${year}?ledger_id=${ledgerId}`, '查询关键事件列表');
}

export async function queryKeyEventByDate(date: string, ledgerId: string): Promise<KeyEvent> {
    return api.get<KeyEvent>(`/v1/key-events/${date}?ledger_id=${ledgerId}`, '查询关键事件详情');
}

export async function saveKeyEvent(date: string, title: string, content: string, color: string, ledgerId: string): Promise<string> {
    return api.post<string>('/v1/key-events', { date, title, content, color, ledger_id: ledgerId }, '保存关键事件');
}
```

其他函数类似处理。

- [ ] **Step 3: 更新 Store**

导入 `useLedgerStore`，所有方法获取 `currentLedgerId` 传给 API：

```ts
import { useLedgerStore } from '@/stores/ledgerStore'

const fetchDatesByYear = async (year: number) => {
    const ledgerId = useLedgerStore().currentLedgerId
    if (!ledgerId) return
    const eventList = await queryKeyEventsByYear(year, ledgerId);
    // ...
}

const fetchEventByDate = async (date: string): Promise<KeyEvent | null> => {
    const ledgerId = useLedgerStore().currentLedgerId
    if (!ledgerId) return null
    // ...
}

const saveEvent = async (date: string, title: string, content: string, color: string): Promise<void> => {
    const ledgerId = useLedgerStore().currentLedgerId
    if (!ledgerId) return
    // ...
}
```

`fetchImages`、`addImage`、`removeImage` 也需要 `ledgerId` 参数。

- [ ] **Step 4: 构建验证**

```bash
cd app && npm run build 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add app/src/types/billadm.d.ts app/src/backend/api/key-event.ts app/src/stores/keyEventStore.ts
git commit -m "feat: 前端关键事件 API/Store 增加 ledgerId 参数"
```

---

### Task 6: 端到端验证

- [ ] **Step 1: 全量构建**

```bash
cd kernel && go build ./... && cd ../app && npm run build 2>&1 | tail -3
```

- [ ] **Step 2: 手动验证**

1. 选择账本 → 关键事件页只显示该账本事件
2. 切换账本 → 事件列表刷新为新账本数据
3. 添加事件 → 自动关联当前账本
4. 旧事件（无 ledgerId）不可见
