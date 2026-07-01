# 消费记录同步 — 设计规格

## 概述

在消费记录页面的操作列中新增"同步"按钮，支持将单条消费记录复制到其他账本。同时将操作列所有按钮改为纯图标 + tooltip 风格。

## 功能范围

- 操作列新增同步按钮（SyncOutlined 图标 + tooltip）
- 点击弹出 Popover，列出所有账本（排除当前），点击目标账本即同步
- 同步时全字段复制：交易类型、金额、分类、标签、描述、日期、标记
- 操作列所有按钮改为图标 + tooltip，移除文字标签

## 不涉及

- 批量同步
- 后端新接口（复用现有 `POST /v1/transactions`）
- 同步状态追踪或回滚

## UI 设计

### 操作列改动

操作列宽度从 `200` 缩小到 `160`。

| 按钮 | 图标 | tooltip | 行为 |
|------|------|---------|------|
| 编辑 | `EditOutlined` | "编辑" | 打开编辑弹窗 |
| 关联 | `LinkOutlined` | "关联关键事件" / "已关联至 xxx" | 打开关联弹窗 |
| 同步 | `SyncOutlined` | "同步到其他账本" | 弹出 Popover 选目标账本 |
| 删除 | `DeleteOutlined` | "删除" | Popconfirm 确认删除 |

### 同步 Popover

- 触发：点击同步图标
- 内容：账本列表（`a-list` 或按钮组），排除当前账本
- 点击目标账本：立即执行同步，关闭 Popover
- 成功：`message.success('同步成功')`
- 失败：`message.error('同步失败')`

## 数据流

```
TransactionRecordTable (sync emit)
  → TransactionRecordView.handleSync(record, targetLedgerId)
    → createTrForLedger({...record, ledgerId: targetLedgerId, transactionId: ''})
      → POST /v1/transactions
```

同步时将 `transactionId` 置空，让后端生成新的 UUID。其余字段原样传递。

## 涉及文件

| 文件 | 改动 |
|------|------|
| `app/src/components/tr_view/TransactionRecordTable.vue` | 操作列改为图标+tooltip；新增同步按钮+Popover；新增 `sync` emit |
| `app/src/components/tr_view/TransactionRecordView.vue` | 新增 `handleSync` 函数；传递 ledgerStore.ledgers 给表格组件 |

## 边界情况

- **当前账本只有一个**：列出所有其他账本（可能有 0 个），空时显示"无可用账本"
- **同步失败**：显示错误提示，不关闭 Popover
- **loading 状态**：同步过程中按钮显示 loading 或 Popover 内显示加载
