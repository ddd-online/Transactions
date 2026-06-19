# 关键事件关联账本 — 设计文档

## 概述

每个关键事件关联到一个账本（Ledger），关键事件页面仅显示当前选中账本的事件。实现账本级别的事件隔离。

## 变更清单

### 1. 数据模型

**Go Model** — `kernel/models/key_event.go`
- `KeyEvent` 结构体新增字段：`LedgerID string gorm:"index;type:varchar(36);comment:所属账本ID" json:"ledgerId"`

**TypeScript 类型** — `app/src/types/billadm.d.ts`
- `KeyEvent` 接口新增：`ledgerId: string`

### 2. 后端 DAO

**文件**：`kernel/dao/key_event_dao.go`

所有查询方法增加 `ledgerID` 参数，添加 `WHERE ledger_id = ?` 过滤：
- `QueryByYear(ws, ledgerID, year)` → `WHERE ledger_id = ? AND date LIKE ?`
- `QueryByDate(ws, ledgerID, date)` → `WHERE ledger_id = ? AND date = ?`
- `QueryDatesByYear(ws, ledgerID, year)` → `WHERE ledger_id = ? AND date LIKE ?`

### 3. 后端 Service

**文件**：`kernel/service/key_event_service.go`

接口方法增加 `ledgerID string` 参数：
- `UpsertKeyEvent(ws, ledgerID, date, title, content, color)`
- `QueryByDate(ws, ledgerID, date)`
- `QueryByYear(ws, ledgerID, year)`
- `QueryDatesByYear(ws, ledgerID, year)`

`UpsertKeyEvent` 中新建事件时设置 `LedgerID`。

### 4. 后端 API

**文件**：`kernel/api/key_event_controller.go`

- `POST /api/v1/key-events`：body 增加 `ledger_id` 字段，传递给 Service
- `GET /api/v1/key-events/year/:year`：query 参数获取 `ledger_id`
- `GET /api/v1/key-events/dates/:year`：query 参数获取 `ledger_id`
- `GET /api/v1/key-events/:date`：query 参数获取 `ledger_id`

### 5. 前端 API 层

**文件**：`app/src/backend/api/key-event.ts`

所有 API 函数增加 `ledgerId: string` 参数，拼接到请求 URL 或 body。

### 6. 前端 Store

**文件**：`app/src/stores/keyEventStore.ts`

所有方法从 `useLedgerStore().currentLedgerId` 获取当前账本，传递给 API。

### 7. 旧数据兼容

启动时，`LedgerID` 为空的旧事件在首次查询时不会出现（因为 `WHERE ledger_id = ''` 匹配不到）。不做自动迁移——用户需要在有 ledger_id 的账本中重新创建事件。

## 边界情况

| 场景 | 处理 |
|------|------|
| 无选中账本 | Store 检查 `currentLedgerId`，为空时跳过 API 调用 |
| 切换账本 | watch `currentLedgerId`，重新 `fetchDatesByYear` |
| 旧事件无 LedgerID | 旧数据不可见，用户需手动重建 |

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
