# AI 多角色系统设计

**日期**: 2026-07-12
**状态**: 已确认

---

## 1. 概述

当前 AI 助手硬编码为单一的"财务助手"角色。本次改造引入多角色系统：新增"日记助手"角色，支持角色切换，每个角色拥有独立的系统提示词、工具集和对话历史。

### 1.1 设计决策

| 决策 | 结论 |
|------|------|
| 角色切换粒度 | 全局切换，每个角色独立对话历史和工具集 |
| 角色定义方式 | 系统预定义（财务助手 + 日记助手），用户不可创建新角色 |
| 系统提示词 | 每个角色独立配置，有默认提示词，用户可在设置中覆盖 |
| 日记助手工具 | 查询日记（`query_diary`）+ 写日记（`write_diary`） |

---

## 2. 架构方案

采用**角色注册表架构**（方案 B）。

新增 `kernel/ai/role/` 包，每个角色自描述（名称、默认提示词、工具工厂列表）。ChatService 从角色注册表获取对应角色的配置和工具。配置表和消息表均加 `role` 字段实现角色级隔离。

---

## 3. 数据模型

### 3.1 ai_config 表改造

当前单行（主键 `id`）改为每角色一行（复合逻辑约束）：

```sql
-- 新增 role 字段，默认值 financial_assistant 兼容旧数据
ALTER TABLE tbl_billadm_ai_config ADD COLUMN role TEXT NOT NULL DEFAULT 'financial_assistant';

-- 逻辑上 (id, role) 联合唯一（SQLite 不支持 ADD CONSTRAINT，在代码层保证）
```

字段说明：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 保留 |
| role | TEXT | 新增。`financial_assistant` 或 `diary_assistant` |
| provider | TEXT | LLM 供应商 (openai / anthropic) |
| base_url | TEXT | API 地址 |
| endpoint | TEXT | 端点路径 |
| api_key | TEXT | API 密钥 |
| model | TEXT | 模型名称 |
| system_prompt | TEXT | 该角色的自定义系统提示词（空则用默认） |

**兼容性**：旧数据无 role 字段，SQLite 默认值自动填充为 `financial_assistant`，行为和现有完全一致。

### 3.2 ai_message 表改造

```sql
ALTER TABLE tbl_billadm_ai_message ADD COLUMN role TEXT NOT NULL DEFAULT 'financial_assistant';
```

| 字段 | 类型 | 说明 |
|------|------|------|
| role | TEXT | 新增。消息所属角色，用于按角色过滤对话历史 |
| message_role | TEXT | 保持不变：user / assistant / tool |

---

## 4. 后端架构

### 4.1 角色注册表 (`kernel/ai/role/`)

```
kernel/ai/role/
  role.go           # Role 接口定义 + Registry
  finance_role.go   # 财务助手角色实现
  diary_role.go     # 日记助手角色实现
```

**Role 接口**：

```go
type Role interface {
    Name() string                    // 内部标识，如 "financial_assistant"
    DisplayName() string             // 前端显示，如 "财务助手"
    DefaultSystemPrompt() string     // 默认系统提示词
    ToolFactories() []tool.ToolFactory // 工具工厂函数列表
}

type ToolFactory func(deps *ToolDependencies) tool.Tool
```

**Registry**：

```go
type Registry struct {
    roles map[string]Role
}

func (r *Registry) Register(role Role)
func (r *Registry) Get(name string) (Role, bool)
func (r *Registry) List() []Role
```

### 4.2 财务助手 (`finance_role.go`)

- **Name**: `financial_assistant`
- **DisplayName**: `财务助手`
- **默认提示词**：保持现有 `DefaultSystemPrompt` 常量内容
- **工具**（7个）：`query_transactions`, `list_ledgers`, `list_categories`, `list_tags`, `get_key_events`, `get_time`, `calculate`

### 4.3 日记助手 (`diary_role.go`)

- **Name**: `diary_assistant`
- **DisplayName**: `日记助手`
- **默认提示词**：

```
你是 Transactions 个人日记助手的 AI 助手。你可以访问用户的日记数据。

你的职责：
- 帮助用户查询和回顾过往日记
- 帮助用户撰写、润色或补写日记
- 根据用户的日记内容提供生活洞察

你的原则：
- 尊重用户隐私，日记是非常私人的内容
- 回答简洁但完整，先给出结论再展示细节
- 当用户想要写日记时，先确认内容再保存
- 如果数据不足以回答问题，诚实告知用户
- 避免使用 Emoji
```

- **工具**（2个）：

| 工具 | 参数 | 说明 |
|------|------|------|
| `query_diary` | `date`(可选), `keyword`(可选), `year`(可选), `mood`(可选) | 查询日记；不传参数返回最近日记列表，传 date 查询指定日期，传 keyword 全文搜索，传 year 查询年份内日记 |
| `write_diary` | `date`(必填), `content`(必填), `mood`(可选) | 创建或更新指定日期的日记 |

### 4.4 ChatService 改造 (`kernel/ai/chat_service.go`)

```go
func (s *ChatService) Chat(
    ctx context.Context,
    ws *workspace.Workspace,
    roleName string,          // 新增
    ledgerName string,
    userMessage string,
) (<-chan SSEEvent, error)
```

处理流程：

1. 从 `RoleRegistry` 获取 `Role` 定义
2. 从 `ai_config` 按 `role` 读取用户自定义系统提示词（若不为空则覆盖默认）
3. 构建该角色的工具列表，注册到 `ToolRegistry`
4. 从 `ai_message` 按 `workspace_id + role` 加载历史（最近 50 条）
5. 调用 LLM，工具调用循环最多 50 轮
6. 持久化消息时写入 `role` 字段

### 4.5 依赖注入 (`wire.go`)

```go
// 创建角色注册表
roleRegistry := role.NewRegistry()
roleRegistry.Register(role.NewFinanceRole())
roleRegistry.Register(role.NewDiaryRole(diarySvc))

// 注册所有工具到统一 ToolRegistry
aiToolRegistry := tool.NewRegistry()
for _, r := range roleRegistry.List() {
    for _, factory := range r.ToolFactories() {
        aiToolRegistry.Register(factory(toolDeps))
    }
}

// ChatService 持有 roleRegistry
chatSvc := ai.NewChatService(configDao, msgDao, llmProviderSelector, aiToolRegistry, roleRegistry, ledgerSvc)
```

**注意**：`ToolRegistry` 保持全局（所有工具注册在一个池子里）。ChatService 按角色从 Registry 获取工具名称列表，仅向 LLM 发送该角色的工具定义。这样 `write_diary` 工具在池子里但财务助手不可见。

---

## 5. API 层

### 5.1 聊天端点

`POST /api/v1/ai/chat`

请求体新增 `role` 字段：

```json
{
  "ledger_name": "默认账本",
  "message": "帮我查一下本月的支出",
  "role": "financial_assistant"
}
```

**向后兼容**：`role` 为空时默认 `"financial_assistant"`。

### 5.2 角色列表

`GET /api/v1/ai/roles`

响应：

```json
[
  { "name": "financial_assistant", "display_name": "财务助手" },
  { "name": "diary_assistant", "display_name": "日记助手" }
]
```

### 5.3 AI 配置 API 改造

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/ai/config?role=financial_assistant` | 读取指定角色配置（无 role 参数则默认 financial_assistant） |
| PUT | `/api/v1/ai/config` | body 含 `role` 字段，保存指定角色配置 |
| POST | `/api/v1/ai/config/test` | body 含 `role` 字段，测试指定角色的连接 |

### 5.4 消息历史 API 改造

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/ai/messages?role=financial_assistant` | 加载指定角色的最近消息 |
| DELETE | `/api/v1/ai/messages?role=financial_assistant` | 清空指定角色的消息 |

---

## 6. 前端

### 6.1 页面改造 (`AiChatView.vue`)

顶部新增角色选择器，替换固定标题：

```
┌─────────────────────────────────────────────┐
│ [财务助手 ▾]                        清空对话  │
│─────────────────────────────────────────────│
│  欢迎语（随角色切换变化）                      │
│  示例问题（随角色切换变化）                      │
│  聊天消息区域                                  │
│  ...                                         │
│─────────────────────────────────────────────│
│ [输入框___________________________] [发送]    │
└─────────────────────────────────────────────┘
```

角色选择器行为：

- 下拉选项来自 `GET /api/v1/ai/roles`
- 切换角色时：清空当前消息列表 → 调用 `GET /api/v1/ai/messages?role=xxx` 加载新角色历史
- 欢迎语 + 示例问题 + placeholder 随角色切换
- 切换不刷新页面

**财务助手示例问题**：本月支出汇总、环比支出变化、餐饮消费趋势

**日记助手示例问题**：今天写一篇日记、帮我回顾这几天的心情、上周日的日记写了什么

### 6.2 设置页改造 (`AiSetting.vue`)

按角色拆分标签页：

```
┌─────────────────────────────────────────────┐
│ [财务助手] [日记助手]                          │
│─────────────────────────────────────────────│
│  供应商: [openai ▾]                           │
│  Base URL: [_____________]                   │
│  ...                                         │
│  系统提示词: [__________________________]     │
│  默认提示词预览（只读）                         │
│─────────────────────────────────────────────│
│  [测试连接] [保存配置]                         │
└─────────────────────────────────────────────┘
```

- 每个标签页独立加载该角色的完整配置（供应商 + 系统提示词）
- 每个标签页显示该角色的默认提示词预览（只读），用户输入的自定义提示词覆盖默认
- 切换标签页时重新加载对应角色的配置（不自动同步）

### 6.3 状态管理 (`useAiChat.ts`)

新增：

```ts
const currentRole = ref<string>('financial_assistant')

// 切换角色时：
// 1. 清空 messages
// 2. 请求 GET /api/v1/ai/roles 确认可用角色
// 3. 请求 GET /api/v1/ai/messages?role=xxx 加载历史
// 4. 更新欢迎语和示例问题
```

### 6.4 前端 API (`app/src/backend/api/ai.ts`)

新增/改造：

```ts
// 获取角色列表
export function fetchRoles(): Promise<AiRole[]>

// chat 接口加 role 参数
export function chat(params: { message: string; ledger_name?: string; role: string; signal?: AbortSignal }): Promise<void>

// 配置接口加 role 参数
export function fetchConfig(role: string): Promise<AiConfig>
export function saveConfig(config: AiConfig & { role: string }): Promise<void>

// 消息接口加 role 参数
export function fetchMessages(role: string): Promise<AiMessage[]>
export function clearMessages(role: string): Promise<void>
```

---

## 7. 兼容性

| 场景 | 处理 |
|------|------|
| 旧 ai_config 无 role 字段 | 自动填充 `financial_assistant`（SQLite DEFAULT） |
| 旧 ai_message 无 role 字段 | 自动填充 `financial_assistant`（SQLite DEFAULT） |
| 前端 chat 请求不传 role | 默认 `financial_assistant`（向后兼容） |
| 旧设置页面访问 | 配置 API 无 role 参数时默认 `financial_assistant` |

---

## 8. 测试要点

| 测试项 | 场景 |
|--------|------|
| 角色切换 | 切换后消息历史正确加载，欢迎语变化 |
| 独立对话历史 | 不同角色的消息互不干扰 |
| 工具可见性 | 财务助手看不到日记工具，日记助手看不到财务工具 |
| 配置独立 | 两个角色可设置不同的 system_prompt |
| 向后兼容 | 不传 role 的旧请求正常工作 |
| 数据库迁移 | SQLite ALTER TABLE 在已有数据上正常执行 |
| 日记工具 | query_diary 和 write_diary 正确调用 DiaryService |

---

## 9. 不在范围内

- 用户自定义创建新角色
- 角色间共享对话历史
- 付费/用量限额控制
- 更复杂的日记分析工具（情绪趋势、写作统计等）
- 日记助手的导入扫描工具
