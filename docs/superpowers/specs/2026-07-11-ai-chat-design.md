# AI 对话功能 — 完整设计规范

> **日期**: 2026-07-11
> **状态**: 已确认（grilling + frontend-design 审查通过）

## 1. 概述

为 Transactions 桌面个人财务应用增加 AI 对话能力。用户可以在应用内与 AI 对话，AI 通过 tool calling 自动调用应用的只读 API 查询财务数据并回答。

### 1.1 核心能力

- AI 对话视图（新顶级路由 `/ai_view`）
- Go 后端代理所有 AI 请求（API Key 不暴露到前端）
- 内部闭环 tool calling（不对外暴露 MCP）
- Anthropic Messages API 和 OpenAI Chat API 双供应商支持
- 流式 SSE 响应（打字机效果 + 工具调用可视化）
- 单会话对话历史持久化（SQLite，保留最近 30 条）
- AI 设置页面（配置 Base URL、端点、API Key、模型）

### 1.2 反范围（不做）

- ❌ 对外暴露 MCP Server
- ❌ 多会话管理
- ❌ 读写工具（仅只读）
- ❌ 自定义 System Prompt
- ❌ 对话摘要压缩
- ❌ 多 Agent 协作 / Graph 工作流

## 2. 架构

```
Electron 桌面应用
 ┌─────────────────────────────────────────────────┐
 │ Vue 3 前端                                       │
 │  /ai_view          AI 对话视图                   │
 │  /settings_view    AI 设置页 (AiSetting.vue)     │
 │  fetch + ReadableStream  消费 SSE                │
 └──────────┬──────────────────────────────────────┘
            │ HTTP (127.0.0.1:28080)
 ┌──────────▼──────────────────────────────────────┐
 │ Go 后端 (Gin)                                    │
 │  api/ai_api.go           POST /api/v1/ai/chat   │
 │  api/ai_config_api.go    配置 CRUD               │
 │  ai/chat_service.go      Tool calling 循环+SSE  │
 │  ai/provider/            Anthropic/OpenAI适配    │
 │  ai/tool/                6 个只读工具            │
 │  dao/ai_*.go             SQLite 持久化           │
 └──────────┬──────────────────────────────────────┘
            │ HTTPS
 ┌──────────▼──────────────────────────────────────┐
 │ Anthropic / OpenAI API (或兼容代理)               │
 └─────────────────────────────────────────────────┘
```

### 2.1 通信路径

- 前端只发用户消息文本，后端完成 tool calling 完整循环
- 流式响应使用 SSE，浏览器原生 `fetch` + `ReadableStream` 消费
- 用户点击停止 → `AbortController.abort()` → Go `ctx.Done()` → 中断 LLM 请求

## 3. Go 后端模块

### 3.1 目录结构

```
kernel/
  ai/
    provider/
      provider.go          # LLMProvider 接口
      anthropic.go         # Anthropic Messages API adapter
      openai.go            # OpenAI Chat API adapter
    tool/
      registry.go          # Tool interface + ToolRegistry
      tools.go             # 6 个只读工具实现
    chat_service.go        # 对话编排服务
  api/
    ai_api.go              # POST /api/v1/ai/chat (SSE)
    ai_config_api.go       # GET/PUT /api/v1/ai/config + test
  dao/
    ai_config_dao.go       # tbl_billadm_ai_config
    ai_message_dao.go      # tbl_billadm_ai_message
  models/
    ai_config.go           # AiConfig 模型
    ai_message.go          # AiMessage 模型
```

### 3.2 LLMProvider 接口

```go
// 统一内部消息表示，屏蔽 Anthropic vs OpenAI 差异
type ChatMessage struct {
    Role       string
    Content    string
    ToolCalls  []ToolCall
    ToolCallID string
}

type ToolCall struct {
    ID        string
    Name      string
    Arguments map[string]any
}

type ChatRequest struct {
    Model        string
    SystemPrompt string
    Messages     []ChatMessage
    Tools        []ToolDef
}

// SSE 事件类型
type ChatEvent struct {
    Type      string      // "text_delta" | "tool_call" | "done" | "error"
    Delta     string
    ToolCalls []ToolCall
    Error     error
}

type LLMProvider interface {
    ChatStream(ctx context.Context, req ChatRequest) (<-chan ChatEvent, error)
}
```

### 3.3 Adapter 差异处理

| 差异点 | Anthropic | OpenAI |
|--------|-----------|--------|
| System prompt | 顶层 `system` 字段 | `messages[0]` role=system |
| Tool 定义 | `{name, description, input_schema}` | `{type:"function", function:{...}}` |
| Tool 结果 | `role:"user"` + `tool_result` content block | `role:"tool"` + `tool_call_id` |
| 参数 | 直接 JSON 对象 | JSON 字符串 |
| 流式 | `content_block_delta` | `choices[0].delta` |

### 3.4 Tool 接口

```go
type Tool interface {
    Name() string
    Description() string
    InputSchema() map[string]any
    Execute(ctx context.Context, args map[string]any) (string, error)
}
```

### 3.5 6 个只读工具

| # | 名称 | 参数 | 依赖接口 |
|---|------|------|---------|
| 1 | `query_transactions` | ledger_id, start_date, end_date, type, category, tags[], keyword, sort_field, sort_order, page, page_size | TransactionQueryService |
| 2 | `list_ledgers` | 无 | LedgerService |
| 3 | `list_categories` | transaction_type (可选) | CategoryService |
| 4 | `list_tags` | category (可选), transaction_type (可选) | TagService |
| 5 | `query_chart_data` | granularity, type[], category[], tags[], start_date, end_date | ChartDataService |
| 6 | `get_key_events` | year | KeyEventService |

每个工具构造时接受最小化 interface 依赖，不直接依赖具体 service 结构体，保证 `ai/` 模块的可测试性。

### 3.6 ChatService 核心逻辑

```
Chat(ctx, userMessage) → <-chan SSEEvent

1. 加载 AI 配置（model/apiKey/baseUrl/endpoint）
2. 根据 endpoint 选择 AnthropicAdapter 或 OpenAIAdapter
3. 加载最近 30 条历史消息
4. 构建 messages: [systemPrompt, ...history, userMessage]
5. 构建 tools: registry.ToDefs()
6. while (round < 10):
   a. provider.ChatStream(messages, tools) → 发送 text_delta/tool_call 事件
   b. 如果 AI 返回 tool_calls:
      - 逐个执行 tool.Execute(args)
      - 发送 tool_result 事件
      - 将 tool result 追加到 messages
      - continue
   c. 如果 AI 不再调工具 → break
7. 保存本轮消息到 DB
8. 发送 done 事件
```

System Prompt（固定预设）：

> 你是 Transactions 个人财务助手的 AI 助手。你可以访问用户的财务数据来回答问题。
>
> 你的职责：帮助用户查询和分析交易记录（支出、收入、转账）；提供账本信息；回答关于分类和标签的问题；生成图表统计数据；查询关键事件（人生里程碑）。
>
> 你的原则：所有数据来自用户自己的数据库；如果数据不足以回答问题，诚实告知用户；金额单位是人民币元（¥），保持 2 位小数；回答简洁但完整，先给出结论，再展示细节；当用户的问题模糊时，用工具搜索数据后再回答，不要猜测。

### 3.7 SSE 事件格式

```
POST /api/v1/ai/chat
Body: { "message": "我这个月花了多少钱？" }

Response: text/event-stream

data: {"type":"text_delta","delta":"好的，让我查一下。"}

data: {"type":"tool_call","tool":"query_transactions","args":{"start_date":"2026-07-01","end_date":"2026-07-11","type":"expense"}}

data: {"type":"tool_result","tool":"query_transactions","summary":"找到 23 条支出记录，合计 ¥12,580.00","detail":{...}}

data: {"type":"text_delta","delta":"你在2026年7月截至目前共有..."}

data: {"type":"done","total_tokens":1247}
```

### 3.8 API 路由

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/ai/chat` | 发送消息，返回 SSE 流 |
| GET | `/api/v1/ai/config` | 获取 AI 配置 |
| PUT | `/api/v1/ai/config` | 更新 AI 配置 |
| POST | `/api/v1/ai/config/test` | 测试连接 |
| DELETE | `/api/v1/ai/messages` | 清空对话历史 |

## 4. 数据库

### 4.1 AI 配置表

```sql
CREATE TABLE tbl_billadm_ai_config (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    base_url    TEXT NOT NULL DEFAULT '',
    endpoint    TEXT NOT NULL DEFAULT '',   -- /v1/messages 或 /chat/completions
    api_key     TEXT NOT NULL DEFAULT '',   -- 明文存储
    model       TEXT NOT NULL DEFAULT '',
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);
```

单行配置表，始终只有一行（id=1）。

### 4.2 对话消息表

```sql
CREATE TABLE tbl_billadm_ai_message (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL DEFAULT 'default',
    role            TEXT NOT NULL,           -- user / assistant / tool
    content         TEXT NOT NULL DEFAULT '',
    tool_calls      TEXT,                    -- JSON
    tool_call_id    TEXT,
    tool_name       TEXT,
    created_at      INTEGER NOT NULL
);

CREATE INDEX idx_ai_message_conv ON tbl_billadm_ai_message(conversation_id, created_at);
```

## 5. 前端设计

### 5.1 AI 对话视图 — `/ai_view`

#### 布局

```
┌──────────────────────────────────────────────────┐
│ [拖拽区域]                               [窗口按钮] │
│  AI 助手                            [清空对话]     │
├──────────────────────────────────────────────────┤
│                                                   │
│  ······· 消息列表 (flex: 1, overflow-y: auto) ····│
│                                                   │
│  ┌ AI 文本消息 ──────────────────────────┐        │
│  │ ┃ 根据你的账本记录，2026年7月截        │        │
│  │ ┃ 至目前有23笔支出，合计¥12,580。      │        │
│  │ ┃                        10:32 · 42tk │        │
│  └────────────────────────────────────────┘        │
│                                                   │
│  ┌ 工具卡片 (执行中) ────────────────────┐        │
│  │ ┃ 🔆 正在查询 2026年7月 的交易记录... │        │
│  └────────────────────────────────────────┘        │
│                                                   │
│  ┌ 工具卡片 (完成) ──────────────────────┐        │
│  │ ┃ ✅ 23 条支出记录 · ¥12,580.00      │        │
│  │ ┃ [查看详情]                          │        │
│  └────────────────────────────────────────┘        │
│                                                   │
│                   ┌ 用户消息 ──┐                   │
│                   │ 我这个月花  │                   │
│                   │ 了多少钱？  │                   │
│                   └────────────┘                   │
│                                                   │
│  ┌────── 空白状态 (首次进入时) ──────┐             │
│  │           下午好                   │             │
│  │        询问你的财务数据             │             │
│  └────────────────────────────────────┘             │
│                                                   │
├──────────────────────────────────────────────────┤
│ ─────────────── 1px divider ──────────────────── │
│                                                   │
│  ┌─────────────────────────────────────────┐      │
│  │ 输入你的问题...                          │      │
│  │                                   🔵 →   │      │
│  └─────────────────────────────────────────┘      │
│  Enter 发送 · Shift+Enter 换行                    │
└──────────────────────────────────────────────────┘
```

#### 空白状态

- 消息区域中央（`position: absolute; transform: translate(-50%, -50%)`）
- 问候语：`--billadm-font-display` (Playfair Display)，28px，`--billadm-color-text-disabled`
- 引导文字：`--billadm-font-body`，14px，`--billadm-color-text-disabled`
- 用户开始输入后自动消失

#### 消息气泡

**用户消息**（右对齐）：
- 背景：`--billadm-color-primary` (#4A8C6F)
- 文字：`--billadm-color-text-inverse` (#FFFFFF)
- 时间戳：`rgba(255,255,255,0.7)`，12px
- 圆角：`--billadm-radius-md` (8px)
- 最大宽度：70%，`margin-left: auto`

**AI 文本消息**（左对齐）：
- 背景：`--billadm-color-major-background` (#FFFFFF)
- **左边线**：3px solid `--billadm-color-primary`（这是与系统通知的区分点）
- 字体：`--billadm-font-body` (Source Serif 4) — 衬线体传达"分析"的慎重感
- 文字：`--billadm-color-text-major`
- 元数据：`--billadm-color-text-disabled`，11px（时间 + token 数）
- 圆角：`--billadm-radius-md`
- 最大宽度：80%
- 阴影：`--billadm-shadow-sm`

**流式光标**：AI 输出中，消息末尾闪烁竖线 `|`，CSS `opacity 0.6s step-end infinite alternate`，颜色 `--billadm-color-primary`。

#### 工具卡片（两阶段叙事化）

**阶段一 — 执行中**：
- 左边线：3px solid `--billadm-color-accent` (#C6963A 琥珀色)
- 图标：琥珀色圆点，CSS scale pulsating 动画
- 文字："🔆 正在查询 2026年7月 的交易记录..."
- 背景：`--billadm-color-minor-background` (#F3F1ED)
- 字体：`--billadm-font-body`，`--billadm-size-text-body-sm`

**阶段二 — 完成**（原地自动替换）：
- 左边线：3px solid `--billadm-color-success` (#3D8C5E 绿色)
- 图标：✅ 绿色对勾（静态）
- 摘要："找到 23 条支出记录 · ¥12,580.00"
- `[查看详情]` 链接：12px，点击展开 JSON 原文（JetBrains Mono 等宽字体，minor-bg 背景）
- 不默认折叠内容 — 摘要在完成时自动出现

#### 输入区域

- 左右各留 `--billadm-space-xl` (24px)
- 上方 1px `--billadm-color-divider` 分隔线
- Textarea：`min-height: 44px`，`max-height: 120px`
- 背景：默认 `--billadm-color-minor-background`，聚焦时 `--billadm-color-major-background` + `box-shadow: 0 0 0 2px rgba(74, 140, 111, 0.15)`
- 圆角：`--billadm-radius-lg` (12px)
- Placeholder："输入你的问题..."
- 发送按钮：36px 圆形 `ant-btn-primary`，`SendOutlined` 图标
- 生成中：按钮变 `--billadm-color-expense` 红色停止按钮，图标变 stop
- 提示文字："Enter 发送 · Shift+Enter 换行"，11px，`--billadm-color-text-disabled`

#### 消息滚动

- 新消息到达时，平滑滚动到底部
- 用户手动向上滚动超过底部 60px → 暂停自动滚动（尊重查看历史意图）
- 滚回 60px 以内 → 恢复自动跟随

### 5.2 AI 设置页面 — `AiSetting.vue`

#### 入口

在 `SettingsView.vue` 侧边栏新增导航项，使用 `RobotOutlined` 图标，标签 "AI 助手"。

#### 配置项

| # | 字段 | 组件 | 默认值 | 说明 |
|---|------|------|--------|------|
| 1 | Base URL | `a-input` | `""` | API 服务器地址 |
| 2 | 端点 | `a-select` | `""` | 选项：`/v1/messages` · `/chat/completions` |
| 3 | API Key | `a-input-password` | `""` | 遮罩显示 |
| 4 | 模型 | `a-input` | `""` | 用户自行输入 |

#### 联动

- 端点选中 `/v1/messages` → Base URL placeholder 自动显示 `https://api.anthropic.com`
- 端点选中 `/chat/completions` → Base URL placeholder 自动显示 `https://api.openai.com`
- placeholder 仅提示，不覆盖用户输入

#### 测试连接

- 调 `POST /api/v1/ai/config/test`
- 按钮变 loading → 成功：绿色 1.5 秒 → 恢复；失败：红色 + 具体错误提示

#### 设计规则

- 页面标题用 `<BilladmPageHeader title="AI 助手" />`
- 配置卡片使用 `.setting-card` 样式（与 `GeneralSetting.vue` 一致）
- 底部按钮：测试连接（`ant-btn-default`）+ 保存配置（`ant-btn-primary`），间距 8px，右对齐

## 6. 前端 API 客户端

```typescript
// app/src/backend/api/ai.ts

interface AiConfig {
  base_url: string
  endpoint: string
  api_key: string
  model: string
}

type ChatSSEEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_call'; tool: string; args: Record<string, any> }
  | { type: 'tool_result'; tool: string; summary: string; detail?: any }
  | { type: 'done'; total_tokens: number }
  | { type: 'error'; message: string }

function sendMessage(message: string, onEvent: (e: ChatSSEEvent) => void, signal: AbortSignal): Promise<void>
function getAiConfig(): Promise<AiConfig>
function updateAiConfig(config: AiConfig): Promise<void>
function testConnection(config: AiConfig): Promise<void>
function clearMessages(): Promise<void>
```

## 7. 错误处理

| HTTP 状态 | 场景 | 前端行为 |
|-----------|------|---------|
| 200 | 正常 SSE | 按事件类型渲染 |
| 400 | 请求错误 | `a-message` 红色提示 |
| 401 | Key 无效 | SSE error → 红色系统消息 + 链接到设置 |
| 404 | 模型不存在 | SSE error → 提示检查模型名称 |
| 429 | 额度用完 | SSE error → 提示更换 Key |
| 500 | 工具异常 | 不中断对话，错误信息回传给 AI 自行解释 |
| 504 | 超时 | SSE error → 提示检查网络 |

### 前端状态机

| 状态 | 输入框 | 发送按钮 | 消息列表 |
|------|--------|---------|---------|
| 空闲 | 可用 | 绿色发送 | 静态 |
| 生成中 | 禁用 | 红色停止 | 流式追加 |
| 错误 | 恢复 | 恢复发送 | 红色系统消息 |

## 8. 安全

| 层级 | 措施 |
|------|------|
| Key 存储 | SQLite 后端侧，前端永不持有 |
| Key 传输 | 前端不传 Key |
| Tool 权限 | 仅注册只读工具 |
| 输入长度 | 用户消息限制 4000 字符 |
| 后续迭代 | API Key 可加 AES-256-GCM，密钥存 Electron safeStorage |

## 9. 路由与导航

```typescript
// 新增路由
{ path: '/ai_view', name: 'aiView', component: () => import('@/components/ai_view/AiChatView.vue') }
```

应用主布局左侧导航栏新增 AI 助手入口。

## 10. 实施顺序

| 阶段 | 内容 |
|------|------|
| P1 | Go: `ai/provider/` + `ai/tool/` + `ai/chat_service.go` + `api/ai_api.go` |
| P1 | Go: `dao/ai_*.go` + `models/ai_*.go` + 数据库迁移 |
| P2 | Go: `api/ai_config_api.go` |
| P2 | 前端: `AiSetting.vue` + SettingsView 导航 |
| P3 | 前端: `AiChatView.vue` + SSE 消费 + 消息渲染 |
| P3 | 前端: 路由注册 + 左侧导航入口 |
