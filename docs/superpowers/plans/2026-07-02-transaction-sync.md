# 消费记录同步 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消费记录操作列新增同步按钮，支持单条记录同步到其他账本，并将操作列按钮改为图标+tooltip。

**Architecture:** 纯前端改动，复用现有 `createTrForLedger` API。`TransactionRecordTable.vue` 负责 UI（图标按钮+Popover），`TransactionRecordView.vue` 负责同步逻辑。

**Tech Stack:** Vue 3 + TypeScript, Ant Design Vue, @ant-design/icons-vue

## Global Constraints

- 复用现有 `POST /v1/transactions` API（`createTrForLedger`）
- 同步时 `transactionId` 置空，后端生成新 UUID
- 操作列宽度从 200 缩小到 160
- 全字段复制：类型、金额、分类、标签、描述、日期、标记

---

### Task 1: TransactionRecordTable.vue — 操作列改为图标+tooltip + 新增同步按钮

**Files:**
- Modify: `app/src/components/tr_view/TransactionRecordTable.vue`

**Interfaces:**
- Produces: `emit('sync', record: TransactionRecord, targetLedgerId: string)` — 新增 sync 事件
- Existing: `emit('edit', record)`, `emit('delete', record)`, `emit('link', record)` 保持不变
- New prop: `ledgers: Ledger[]` — 从父组件传入账本列表
- New prop: `currentLedgerId: string` — 当前账本 ID，用于过滤

- [ ] **Step 1: 添加新的 imports 和 props/emits**

在 `<script setup>` 中，修改 imports 和组件接口：

```typescript
import type {TransactionRecord, Ledger} from '@/types/billadm';
import {centsToYuan, formatTimestamp} from "@/backend/functions";
import {TransactionTypeToLabel} from "@/backend/constant";
import type {ColumnsType} from "ant-design-vue/es/table";
import {EditOutlined, DeleteOutlined, LinkOutlined, SyncOutlined} from "@ant-design/icons-vue";
import {ref} from "vue";
```

修改 Props 和 Emits：

```typescript
interface Props {
  items: TransactionRecord[]
  ledgers: Ledger[]
  currentLedgerId: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'edit', record: TransactionRecord): void;
  (e: 'delete', record: TransactionRecord): void;
  (e: 'link', record: TransactionRecord): void;
  (e: 'sync', record: TransactionRecord, targetLedgerId: string): void;
}>();

// 控制同步 Popover 的可见状态（记录当前打开的 Popover 所属的 transactionId）
const syncPopoverTarget = ref<string | null>(null);
```

修改操作列宽度从 `200` 到 `160`，并添加同步列的 colKey（或复用 action 列的 dataIndex）：

```typescript
{
  title: '操作',
  dataIndex: 'action',
  width: 160,
  align: 'center'
}
```

- [ ] **Step 2: 修改操作列模板**

将按钮改为图标+tooltip 风格，新增同步按钮（含 Popover）：

```html
<template v-else-if="column.dataIndex === 'action'">
  <div class="cell-actions">
    <!-- 编辑 -->
    <a-tooltip title="编辑">
      <a-button type="text" size="small" @click="handleEdit(record as TransactionRecord)">
        <EditOutlined />
      </a-button>
    </a-tooltip>

    <!-- 关联 -->
    <a-tooltip :title="(record as TransactionRecord).keyEventDate ? '已关联至 ' + (record as TransactionRecord).keyEventDate : '关联关键事件'">
      <a-button type="text" size="small" @click="handleLink(record as TransactionRecord)">
        <LinkOutlined />
      </a-button>
    </a-tooltip>

    <!-- 同步 -->
    <a-popover
      trigger="click"
      placement="bottom"
      :open="syncPopoverTarget === (record as TransactionRecord).transactionId"
      @openChange="(visible: boolean) => { syncPopoverTarget = visible ? (record as TransactionRecord).transactionId : null }"
    >
      <template #content>
        <div class="sync-popover-content">
          <div
            v-for="ledger in props.ledgers.filter(l => l.id !== props.currentLedgerId)"
            :key="ledger.id"
            class="sync-ledger-item"
            @click="handleSyncTarget(record as TransactionRecord, ledger.id)"
          >
            {{ ledger.name }}
          </div>
          <div v-if="props.ledgers.filter(l => l.id !== props.currentLedgerId).length === 0" class="sync-empty">
            无可用账本
          </div>
        </div>
      </template>
      <a-tooltip title="同步到其他账本">
        <a-button type="text" size="small">
          <SyncOutlined />
        </a-button>
      </a-tooltip>
    </a-popover>

    <!-- 删除 -->
    <a-popconfirm
      title="确认删除此条记录？"
      ok-text="确认"
      @confirm="handleDelete(record as TransactionRecord)"
      :showCancel="false"
    >
      <a-tooltip title="删除">
        <a-button type="text" size="small" danger>
          <DeleteOutlined />
        </a-button>
      </a-tooltip>
    </a-popconfirm>
  </div>
</template>
```

- [ ] **Step 3: 添加 handleSyncTarget 函数**

```typescript
const handleSyncTarget = (record: TransactionRecord, targetLedgerId: string) => {
  syncPopoverTarget.value = null;
  emit('sync', record, targetLedgerId);
};
```

- [ ] **Step 4: 添加 Popover 样式**

```css
.sync-popover-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 120px;
  max-height: 200px;
  overflow-y: auto;
}

.sync-ledger-item {
  padding: 6px 12px;
  border-radius: var(--billadm-radius-sm);
  cursor: pointer;
  font-size: var(--billadm-size-text-body);
  color: var(--billadm-color-text-major);
  transition: background-color var(--billadm-transition-fast);
}

.sync-ledger-item:hover {
  background-color: var(--billadm-color-minor-background);
}

.sync-empty {
  padding: 8px 12px;
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-disabled);
}
```

- [ ] **Step 5: 验证类型检查通过**

```bash
cd /d/github/Transactions/app && npx vue-tsc -b
```

- [ ] **Step 6: Commit**

```bash
git add app/src/components/tr_view/TransactionRecordTable.vue
git commit -m "feat: 操作列改为图标+tooltip，新增同步按钮及账本选择Popover"
```

---

### Task 2: TransactionRecordView.vue — 新增 handleSync 函数并传参

**Files:**
- Modify: `app/src/components/tr_view/TransactionRecordView.vue`

**Interfaces:**
- Consumes: `TransactionRecordTable` 的 `sync` emit 和 `ledgers`/`currentLedgerId` props
- Produces: `handleSync(record, targetLedgerId)` — 调用 `createTrForLedger`

- [ ] **Step 1: 模板中传参并绑定 sync 事件**

修改 `<transaction-record-table>` 调用（第 21 行）：

```html
<transaction-record-table
  :items="tableData"
  :ledgers="ledgerStore.ledgers"
  :current-ledger-id="ledgerStore.currentLedgerId ?? ''"
  @edit="updateTr"
  @delete="deleteTr"
  @link="handleLink"
  @sync="handleSync"
/>
```

- [ ] **Step 2: 添加 handleSync 函数**

在 `<script setup>` 中添加：

```typescript
import { createTrForLedger } from "@/backend/api/tr.ts";

const handleSync = async (record: TransactionRecord, targetLedgerId: string) => {
  try {
    const syncRecord = {
      ...record,
      ledgerId: targetLedgerId,
      transactionId: '', // 清空ID，让后端生成新UUID
    } as TransactionRecord;
    await createTrForLedger(syncRecord);
    message.success('同步成功');
  } catch (error) {
    message.error('同步失败');
    console.error('sync transaction failed:', error);
  }
};
```

- [ ] **Step 3: 验证类型检查通过**

```bash
cd /d/github/Transactions/app && npx vue-tsc -b
```

- [ ] **Step 4: Commit**

```bash
git add app/src/components/tr_view/TransactionRecordView.vue
git commit -m "feat: 新增消费记录同步到其他账本功能"
```

---

### Task 3: 端到端验证

- [ ] **Step 1: 启动开发环境验证功能**

启动三个终端：
1. `kernel/` → `go run main.go`
2. `app/` → `npm run dev`
3. `electron/` → `npm start`

验证步骤：
1. 进入消费记录页
2. 确认操作列按钮已改为纯图标 + tooltip
3. 点击同步图标 → 确认 Popover 弹出，列出其他账本
4. 点击目标账本 → 确认提示"同步成功"
5. 切换到目标账本 → 确认记录已创建

- [ ] **Step 2: 验证边界情况**
  - 只有一个账本时 → 同步 Popover 显示"无可用账本"
  - 标签字段正确复制到目标账本

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "verify: 消费记录同步功能端到端验证通过"
```
