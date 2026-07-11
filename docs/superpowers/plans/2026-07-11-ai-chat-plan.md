# AI 对话功能 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Transactions 桌面应用增加 AI 对话能力——Go 后端代理 AI 请求，6 个只读 tool calling，流式 SSE，Anthropic/OpenAI 双供应商支持。

**Architecture:** Go 侧新增 `ai/` 模块（provider adapter + tool registry + chat service），`api/ai_api.go` 提供 SSE 端点。前端新增 `/ai_view` 聊天视图 + AiSetting 设置组件。SQLite 存入配置和对话历史。

**Tech Stack:** Go 1.24 + Gin + GORM · Vue 3 + TypeScript + Ant Design Vue · SSE · Anthropic Messages API / OpenAI Chat API

## Global Constraints

- Go module: `github.com/billadm`，Go 1.24
- API handlers 使用直接 gin.HandlerFunc 模式（非 Handle wrapper）
- AI chat SSE 端点走独立 handler，不使用 `models.Result` 信封
- 前端路由使用 `createMemoryHistory()`，Layout 组件为父路由
- API Key 永不进入前端渲染进程
- 工具仅注册只读
- 代理目标：`go build` 编译，`go test ./...` 通过

---

### Task 1: Go 后端 — AI 模型与数据库迁移

**Files:**
- Create: `kernel/models/ai_config.go`
- Create: `kernel/models/ai_message.go`
- Modify: `kernel/workspace/workspace.go` (添加 auto-migrate)

**Interfaces:**
- Consumes: `gorm.io/gorm` (现有依赖)
- Produces:
  - `AiConfig{ID, BaseURL, Endpoint, APIKey, Model, CreatedAt, UpdatedAt}`
  - `AiMessage{ID, ConversationID, Role, Content, ToolCalls, ToolCallID, ToolName, CreatedAt}`
  - `tableName()` 返回 `"tbl_billadm_ai_config"` / `"tbl_billadm_ai_message"`

- [ ] **Step 1: 创建 AiConfig 模型**

```go
// kernel/models/ai_config.go
package models

import "time"

type AiConfig struct {
	ID        int64  `gorm:"primaryKey;autoIncrement" json:"id"`
	BaseURL   string `gorm:"type:text;not null;default:''" json:"base_url"`
	Endpoint  string `gorm:"type:text;not null;default:''" json:"endpoint"`
	APIKey    string `gorm:"type:text;not null;default:''" json:"api_key"`
	Model     string `gorm:"type:text;not null;default:''" json:"model"`
	CreatedAt int64  `gorm:"autoCreateTime:milli" json:"created_at"`
	UpdatedAt int64  `gorm:"autoUpdateTime:milli" json:"updated_at"`
}

func (AiConfig) TableName() string {
	return "tbl_billadm_ai_config"
}
```

- [ ] **Step 2: 创建 AiMessage 模型**

```go
// kernel/models/ai_message.go
package models

type AiMessage struct {
	ID             string `gorm:"primaryKey;type:text" json:"id"`
	ConversationID string `gorm:"type:text;not null;default:'default';index:idx_conv_created,priority:1" json:"conversation_id"`
	Role           string `gorm:"type:text;not null" json:"role"`
	Content        string `gorm:"type:text;not null;default:''" json:"content"`
	ToolCalls      string `gorm:"type:text" json:"tool_calls,omitempty"`
	ToolCallID     string `gorm:"type:text" json:"tool_call_id,omitempty"`
	ToolName       string `gorm:"type:text" json:"tool_name,omitempty"`
	CreatedAt      int64  `gorm:"autoCreateTime:milli;index:idx_conv_created,priority:2" json:"created_at"`
}

func (AiMessage) TableName() string {
	return "tbl_billadm_ai_message"
}
```

- [ ] **Step 3: 在 Workspace.NewWorkspace 中添加 auto-migrate**

读取 `kernel/workspace/workspace.go` 中 `NewWorkspace` 函数，找到现有的 `db, err := util.NewDbInstance(dbFile)` 之后、`return` 之前的位置，添加：

```go
// Auto-migrate AI tables
if err := db.AutoMigrate(&models.AiConfig{}); err != nil {
	return nil, err
}
if err := db.AutoMigrate(&models.AiMessage{}); err != nil {
	return nil, err
}
```

需要在 imports 中添加 `"github.com/billadm/models"`。

- [ ] **Step 4: 编译验证**

```bash
cd kernel && go build ./...
```

Expected: 编译成功，无错误。

- [ ] **Step 5: Commit**

```bash
git add kernel/models/ai_config.go kernel/models/ai_message.go kernel/workspace/workspace.go
git commit -m "feat: add AI config and message models with DB migration"
```

---

### Task 2: Go 后端 — AI 配置 DAO

**Files:**
- Create: `kernel/dao/ai_config_dao.go`

**Interfaces:**
- Consumes: `*workspace.Workspace` (通过 `ws.GetDb()`)
- Produces:
  - `AiConfigDao interface { Get(ws) (*models.AiConfig, error); Save(ws, *models.AiConfig) error }`
  - `func NewAiConfigDao() AiConfigDao`

- [ ] **Step 1: 创建 AiConfigDao**

```go
// kernel/dao/ai_config_dao.go
package dao

import (
	"github.com/billadm/models"
	"github.com/billadm/workspace"
)

func NewAiConfigDao() AiConfigDao {
	return &aiConfigDaoImpl{}
}

type AiConfigDao interface {
	Get(ws *workspace.Workspace) (*models.AiConfig, error)
	Save(ws *workspace.Workspace, config *models.AiConfig) error
}

var _ AiConfigDao = &aiConfigDaoImpl{}

type aiConfigDaoImpl struct{}

func (d *aiConfigDaoImpl) Get(ws *workspace.Workspace) (*models.AiConfig, error) {
	var config models.AiConfig
	err := ws.GetDb().First(&config).Error
	if err != nil {
		return nil, err
	}
	return &config, nil
}

func (d *aiConfigDaoImpl) Save(ws *workspace.Workspace, config *models.AiConfig) error {
	// 单行配置表：先查是否存在，存在则更新，不存在则创建
	var existing models.AiConfig
	err := ws.GetDb().First(&existing).Error
	if err != nil {
		// 不存在，创建
		config.ID = 1
		return ws.GetDb().Create(config).Error
	}
	// 存在，更新
	config.ID = existing.ID
	return ws.GetDb().Model(&existing).Select("base_url", "endpoint", "api_key", "model").Updates(config).Error
}
```

- [ ] **Step 2: 编译验证**

```bash
cd kernel && go build ./...
```

- [ ] **Step 3: Commit**

```bash
git add kernel/dao/ai_config_dao.go
git commit -m "feat: add AI config DAO"
```

---

### Task 3: Go 后端 — AI 消息 DAO

**Files:**
- Create: `kernel/dao/ai_message_dao.go`

**Interfaces:**
- Consumes: `*workspace.Workspace`
- Produces:
  - `AiMessageDao interface { Save(ws, *models.AiMessage) error; ListRecent(ws, conversationID, limit) ([]*models.AiMessage, error); DeleteAll(ws, conversationID) error }`
  - `func NewAiMessageDao() AiMessageDao`

- [ ] **Step 1: 创建 AiMessageDao**

```go
// kernel/dao/ai_message_dao.go
package dao

import (
	"github.com/billadm/models"
	"github.com/billadm/workspace"
)

func NewAiMessageDao() AiMessageDao {
	return &aiMessageDaoImpl{}
}

type AiMessageDao interface {
	Save(ws *workspace.Workspace, msg *models.AiMessage) error
	ListRecent(ws *workspace.Workspace, conversationID string, limit int) ([]*models.AiMessage, error)
	DeleteAll(ws *workspace.Workspace, conversationID string) error
}

var _ AiMessageDao = &aiMessageDaoImpl{}

type aiMessageDaoImpl struct{}

func (d *aiMessageDaoImpl) Save(ws *workspace.Workspace, msg *models.AiMessage) error {
	return ws.GetDb().Create(msg).Error
}

func (d *aiMessageDaoImpl) ListRecent(ws *workspace.Workspace, conversationID string, limit int) ([]*models.AiMessage, error) {
	var msgs []*models.AiMessage
	err := ws.GetDb().
		Where("conversation_id = ?", conversationID).
		Order("created_at DESC").
		Limit(limit).
		Find(&msgs).Error
	if err != nil {
		return nil, err
	}
	// 反转顺序（DB 返回 DESC，需要 ASC 给 LLM）
	for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
		msgs[i], msgs[j] = msgs[j], msgs[i]
	}
	return msgs, nil
}

func (d *aiMessageDaoImpl) DeleteAll(ws *workspace.Workspace, conversationID string) error {
	return ws.GetDb().
		Where("conversation_id = ?", conversationID).
		Delete(&models.AiMessage{}).Error
}
```

- [ ] **Step 2: 编译验证**

```bash
cd kernel && go build ./...
```

- [ ] **Step 3: Commit**

```bash
git add kernel/dao/ai_message_dao.go
git commit -m "feat: add AI message DAO"
```

---

### Task 4: Go 后端 — LLM Provider 接口与 Anthropic Adapter

**Files:**
- Create: `kernel/ai/provider/provider.go`
- Create: `kernel/ai/provider/anthropic.go`

**Interfaces:**
- Consumes: 无外部依赖（仅 `net/http`, `encoding/json`, `bufio`）
- Produces:
  - `ChatMessage`, `ToolCall`, `ToolDef`, `ChatRequest`, `ChatEvent` 类型
  - `LLMProvider interface { ChatStream(ctx, ChatRequest) (<-chan ChatEvent, error) }`
  - `func NewAnthropicProvider(baseURL, apiKey, model string) LLMProvider`

**设计说明（Anthropic adapter）：**
- System prompt 放顶层 `system` 字段
- Tool 定义格式：`{name, description, input_schema}`
- Tool 结果回传：`role:"user"` + `content: [{type:"tool_result", tool_use_id, content}]`
- 流式：SSE 行解析，事件类型 `content_block_delta` / `message_delta` / `message_stop`
- 参数：直接 JSON 对象

- [ ] **Step 1: 创建 provider.go 公共类型**

```go
// kernel/ai/provider/provider.go
package provider

import "context"

type ChatMessage struct {
	Role       string     `json:"role"`
	Content    string     `json:"content,omitempty"`
	ToolCalls  []ToolCall `json:"tool_calls,omitempty"`
	ToolCallID string     `json:"tool_call_id,omitempty"`
}

type ToolCall struct {
	ID        string         `json:"id"`
	Name      string         `json:"name"`
	Arguments map[string]any `json:"arguments"`
}

type ToolDef struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  map[string]any `json:"parameters"`
}

type ChatRequest struct {
	SystemPrompt string
	Messages     []ChatMessage
	Tools        []ToolDef
}

type ChatEvent struct {
	Type      string     // "text_delta" | "tool_call" | "done" | "error"
	Delta     string
	ToolCalls []ToolCall
	Error     error
}

type LLMProvider interface {
	ChatStream(ctx context.Context, req ChatRequest) (<-chan ChatEvent, error)
}
```

- [ ] **Step 2: 创建 anthropic.go**

```go
// kernel/ai/provider/anthropic.go
package provider

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

type anthropicProvider struct {
	baseURL string
	apiKey  string
	model   string
	client  *http.Client
}

func NewAnthropicProvider(baseURL, apiKey, model string) LLMProvider {
	return &anthropicProvider{
		baseURL: baseURL,
		apiKey:  apiKey,
		model:   model,
		client:  &http.Client{},
	}
}

// ---- 请求/响应结构体（Anthropic 私有） ----

type anthropicContentBlock struct {
	Type       string     `json:"type"`
	Text       string     `json:"text,omitempty"`
	ID         string     `json:"id,omitempty"`
	Name       string     `json:"name,omitempty"`
	Input      json.RawMessage `json:"input,omitempty"`
}

type anthropicMessage struct {
	Role    string                  `json:"role"`
	Content []anthropicContentBlock `json:"content"`
}

type anthropicToolDef struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"input_schema"`
}

type anthropicRequest struct {
	Model       string              `json:"model"`
	MaxTokens   int                 `json:"max_tokens"`
	System      string              `json:"system,omitempty"`
	Messages    []anthropicMessage  `json:"messages"`
	Tools       []anthropicToolDef  `json:"tools,omitempty"`
	Stream      bool                `json:"stream"`
}

// anthropicStreamEvent SSE 行 JSON 结构
type anthropicStreamEvent struct {
	Type  string `json:"type"`
	Delta struct {
		Type string          `json:"type"`
		Text string          `json:"text"`
	} `json:"delta,omitempty"`
	ContentBlock struct {
		Type  string          `json:"type"`
		ID    string          `json:"id"`
		Name  string          `json:"name"`
		Input json.RawMessage `json:"input"`
	} `json:"content_block,omitempty"`
	Message struct {
		StopReason string `json:"stop_reason"`
	} `json:"message,omitempty"`
}

func (p *anthropicProvider) ChatStream(ctx context.Context, req ChatRequest) (<-chan ChatEvent, error) {
	// 构建 Anthropic 消息
	messages := make([]anthropicMessage, 0)
	for _, m := range req.Messages {
		content := make([]anthropicContentBlock, 0)

		if m.Role == "tool" {
			// tool result 回传
			content = append(content, anthropicContentBlock{
				Type:      "tool_result",
				ToolUseID: m.ToolCallID,
				Content:   m.Content,
			})
		} else if len(m.ToolCalls) > 0 {
			// assistant 消息带 tool_calls
			for _, tc := range m.ToolCalls {
				content = append(content, anthropicContentBlock{
					Type:  "tool_use",
					ID:    tc.ID,
					Name:  tc.Name,
					Input: mustMarshalJSON(tc.Arguments),
				})
			}
		} else if m.Content != "" {
			content = append(content, anthropicContentBlock{
				Type: "text",
				Text: m.Content,
			})
		}

		role := m.Role
		if role == "tool" {
			role = "user" // Anthropic 要求 tool result 的 role 必须是 user
		}
		messages = append(messages, anthropicMessage{
			Role:    role,
			Content: content,
		})
	}

	// 构建工具定义
	tools := make([]anthropicToolDef, 0)
	for _, t := range req.Tools {
		tools = append(tools, anthropicToolDef{
			Name:        t.Name,
			Description: t.Description,
			InputSchema: t.Parameters,
		})
	}

	body := anthropicRequest{
		Model:     p.model,
		MaxTokens: 4096,
		System:    req.SystemPrompt,
		Messages:  messages,
		Tools:     tools,
		Stream:    true,
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	url := strings.TrimRight(p.baseURL, "/") + "/v1/messages"
	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", p.apiKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("do request: %w", err)
	}

	ch := make(chan ChatEvent, 32)

	go func() {
		defer resp.Body.Close()
		defer close(ch)

		if resp.StatusCode != 200 {
			bodyBytes, _ := io.ReadAll(resp.Body)
			ch <- ChatEvent{Type: "error", Error: fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(bodyBytes))}
			return
		}

		scanner := bufio.NewScanner(resp.Body)
		var currentToolID string
		var currentToolName string
		var toolArgsAccum []byte

		for scanner.Scan() {
			select {
			case <-ctx.Done():
				return
			default:
			}

			line := scanner.Text()
			if !strings.HasPrefix(line, "data: ") {
				continue
			}
			data := strings.TrimPrefix(line, "data: ")

			var event anthropicStreamEvent
			if err := json.Unmarshal([]byte(data), &event); err != nil {
				continue
			}

			switch event.Type {
			case "content_block_start":
				if event.ContentBlock.Type == "tool_use" {
					currentToolID = event.ContentBlock.ID
					currentToolName = event.ContentBlock.Name
					toolArgsAccum = nil
				}
			case "content_block_delta":
				if event.Delta.Type == "text_delta" {
					ch <- ChatEvent{Type: "text_delta", Delta: event.Delta.Text}
				} else if event.Delta.Type == "input_json_delta" {
					toolArgsAccum = append(toolArgsAccum, event.Delta.Text...)
				}
			case "content_block_stop":
				if currentToolID != "" {
					var args map[string]any
					json.Unmarshal(toolArgsAccum, &args)
					ch <- ChatEvent{
						Type: "tool_call",
						ToolCalls: []ToolCall{{
							ID:        currentToolID,
							Name:      currentToolName,
							Arguments: args,
						}},
					}
					currentToolID = ""
					currentToolName = ""
					toolArgsAccum = nil
				}
			case "message_delta":
				// stop_reason 在 message_delta 中
			case "message_stop":
				ch <- ChatEvent{Type: "done"}
			}
		}
	}()

	return ch, nil
}

func mustMarshalJSON(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}
```

- [ ] **Step 3: 编译验证**

```bash
cd kernel && go build ./...
```

- [ ] **Step 4: Commit**

```bash
git add kernel/ai/provider/provider.go kernel/ai/provider/anthropic.go
git commit -m "feat: add LLM provider interface and Anthropic adapter"
```

---

### Task 5: Go 后端 — OpenAI Adapter

**Files:**
- Create: `kernel/ai/provider/openai.go`

**Interfaces:**
- Consumes: `provider.go` 类型
- Produces: `func NewOpenAIProvider(baseURL, apiKey, model string) LLMProvider`

**设计说明（OpenAI adapter）：**
- System prompt：`messages[0]` with `role: "system"`
- Tool 定义格式：`{type:"function", function:{name, description, parameters}}`
- Tool 结果回传：`role: "tool"` + `tool_call_id`
- 流式：SSE 行解析，事件 `choices[0].delta.tool_calls` 增量拼接
- 参数：JSON 字符串（需 marshal/unmarshal）

- [ ] **Step 1: 创建 openai.go**

```go
// kernel/ai/provider/openai.go
package provider

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

type openaiProvider struct {
	baseURL string
	apiKey  string
	model   string
	client  *http.Client
}

func NewOpenAIProvider(baseURL, apiKey, model string) LLMProvider {
	return &openaiProvider{
		baseURL: baseURL,
		apiKey:  apiKey,
		model:   model,
		client:  &http.Client{},
	}
}

// ---- OpenAI 私有结构体 ----

type openaiMessage struct {
	Role       string          `json:"role"`
	Content    string          `json:"content,omitempty"`
	ToolCalls  []openaiToolCall `json:"tool_calls,omitempty"`
	ToolCallID string          `json:"tool_call_id,omitempty"`
}

type openaiToolCall struct {
	ID       string              `json:"id"`
	Type     string              `json:"type"`
	Function openaiToolCallFunc  `json:"function"`
}

type openaiToolCallFunc struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

type openaiToolDef struct {
	Type     string                   `json:"type"`
	Function openaiToolDefFunction    `json:"function"`
}

type openaiToolDefFunction struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  map[string]any `json:"parameters"`
}

type openaiRequest struct {
	Model    string          `json:"model"`
	Messages []openaiMessage `json:"messages"`
	Tools    []openaiToolDef `json:"tools,omitempty"`
	Stream   bool            `json:"stream"`
}

type openaiStreamChunk struct {
	Choices []struct {
		Delta struct {
			Role      string          `json:"role,omitempty"`
			Content   string          `json:"content,omitempty"`
			ToolCalls []openaiToolCall `json:"tool_calls,omitempty"`
		} `json:"delta"`
		FinishReason string `json:"finish_reason,omitempty"`
	} `json:"choices"`
}

func (p *openaiProvider) ChatStream(ctx context.Context, req ChatRequest) (<-chan ChatEvent, error) {
	// 构建 OpenAI 消息
	messages := make([]openaiMessage, 0)

	// System prompt 作为第一条消息（role=system）
	if req.SystemPrompt != "" {
		messages = append(messages, openaiMessage{
			Role:    "system",
			Content: req.SystemPrompt,
		})
	}

	for _, m := range req.Messages {
		msg := openaiMessage{
			Role:       m.Role,
			Content:    m.Content,
			ToolCallID: m.ToolCallID,
		}

		if len(m.ToolCalls) > 0 {
			tcs := make([]openaiToolCall, 0)
			for _, tc := range m.ToolCalls {
				argsJSON, _ := json.Marshal(tc.Arguments)
				tcs = append(tcs, openaiToolCall{
					ID:   tc.ID,
					Type: "function",
					Function: openaiToolCallFunc{
						Name:      tc.Name,
						Arguments: string(argsJSON),
					},
				})
			}
			msg.ToolCalls = tcs
		}

		messages = append(messages, msg)
	}

	// 构建工具定义
	tools := make([]openaiToolDef, 0)
	for _, t := range req.Tools {
		tools = append(tools, openaiToolDef{
			Type: "function",
			Function: openaiToolDefFunction{
				Name:        t.Name,
				Description: t.Description,
				Parameters:  t.Parameters,
			},
		})
	}

	body := openaiRequest{
		Model:    p.model,
		Messages: messages,
		Tools:    tools,
		Stream:   true,
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	url := strings.TrimRight(p.baseURL, "/") + "/chat/completions"
	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+p.apiKey)

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("do request: %w", err)
	}

	ch := make(chan ChatEvent, 32)

	go func() {
		defer resp.Body.Close()
		defer close(ch)

		if resp.StatusCode != 200 {
			bodyBytes, _ := io.ReadAll(resp.Body)
			ch <- ChatEvent{Type: "error", Error: fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(bodyBytes))}
			return
		}

		scanner := bufio.NewScanner(resp.Body)
		// 跟踪 tool calls 增量拼接
		toolCallsAccum := make(map[int]*ToolCall)

		for scanner.Scan() {
			select {
			case <-ctx.Done():
				return
			default:
			}

			line := scanner.Text()
			if !strings.HasPrefix(line, "data: ") {
				continue
			}
			data := strings.TrimPrefix(line, "data: ")
			if data == "[DONE]" {
				// 发送挂起的 tool calls
				if len(toolCallsAccum) > 0 {
					tcs := make([]ToolCall, 0, len(toolCallsAccum))
					for i := 0; i < len(toolCallsAccum); i++ {
						if tc, ok := toolCallsAccum[i]; ok {
							tcs = append(tcs, *tc)
						}
					}
					ch <- ChatEvent{Type: "tool_call", ToolCalls: tcs}
					toolCallsAccum = make(map[int]*ToolCall)
				}
				ch <- ChatEvent{Type: "done"}
				continue
			}

			var chunk openaiStreamChunk
			if err := json.Unmarshal([]byte(data), &chunk); err != nil {
				continue
			}

			for _, choice := range chunk.Choices {
				delta := choice.Delta

				// 文本 delta
				if delta.Content != "" {
					ch <- ChatEvent{Type: "text_delta", Delta: delta.Content}
				}

				// tool calls delta（增量拼接）
				for _, tc := range delta.ToolCalls {
					idx := tc.Index
					if _, ok := toolCallsAccum[idx]; !ok {
						toolCallsAccum[idx] = &ToolCall{
							ID:   tc.ID,
							Name: tc.Function.Name,
						}
					}
					if tc.ID != "" {
						toolCallsAccum[idx].ID = tc.ID
					}
					if tc.Function.Name != "" {
						toolCallsAccum[idx].Name = tc.Function.Name
					}
					// 拼接 arguments JSON 字符串，最后一起解析
					_ = tc.Function.Arguments // OpenAI tool call delta 中 arguments 是分别传的
				}

				// finish_reason
				if choice.FinishReason == "stop" {
					// done 由 [DONE] 处理
				}
			}
		}
	}()

	return ch, nil
}
```

- [ ] **Step 2: 编译验证**

```bash
cd kernel && go build ./...
```

Expected: 编译成功，openai.go 中 `tc.Index` 字段需要在 openaiStreamChunk 和 openaiToolCall 中添加 `Index int` 字段。检查并更正 openaiStreamChunk.Choices[].Delta.ToolCalls 的类型为带 Index 的变体。

- [ ] **Step 3: 修正 openai.go 结构体**

OpenAI streaming tool_calls 中需要 `Index` 字段来追踪增量：

```go
type openaiToolCallDelta struct {
	Index    int                `json:"index"`
	ID       string             `json:"id,omitempty"`
	Type     string             `json:"type,omitempty"`
	Function openaiToolCallFunc `json:"function,omitempty"`
}

type openaiStreamChunk struct {
	Choices []struct {
		Index int `json:"index"`
		Delta struct {
			Role      string                 `json:"role,omitempty"`
			Content   string                 `json:"content,omitempty"`
			ToolCalls []openaiToolCallDelta  `json:"tool_calls,omitempty"`
		} `json:"delta"`
		FinishReason string `json:"finish_reason,omitempty"`
	} `json:"choices"`
}
```

- [ ] **Step 4: 编译验证**

```bash
cd kernel && go build ./...
```

Expected: 编译成功。

- [ ] **Step 5: Commit**

```bash
git add kernel/ai/provider/openai.go && git add -u kernel/ai/provider/
git commit -m "feat: add OpenAI Chat API adapter"
```

---

### Task 6: Go 后端 — Tool Registry 与 6 个工具实现

**Files:**
- Create: `kernel/ai/tool/registry.go`
- Create: `kernel/ai/tool/tools.go`

**Interfaces:**
- Consumes: `service.GetTrService()`, `service.GetLedgerService()`, `service.GetCategoryService()`, `service.GetTagService()`, `service.GetKeyEventService()`
- Produces:
  - `Tool interface { Name(), Description(), InputSchema(), Execute(ctx, args) (string, error) }`
  - `ToolRegistry struct { Register(Tool); Get(name) (Tool, bool); List() []Tool; ToDefs() []ToolDef }`
  - `func NewToolRegistry() *ToolRegistry`
  - 6 个具体工具实现：`NewQueryTransactionsTool`, `NewListLedgersTool`, ...

- [ ] **Step 1: 创建 registry.go**

```go
// kernel/ai/tool/registry.go
package tool

import (
	"context"
	"sync"

	"github.com/billadm/ai/provider"
)

type Tool interface {
	Name() string
	Description() string
	InputSchema() map[string]any
	Execute(ctx context.Context, args map[string]any) (string, error)
}

type ToolRegistry struct {
	mu    sync.RWMutex
	tools map[string]Tool
}

func NewToolRegistry() *ToolRegistry {
	return &ToolRegistry{tools: make(map[string]Tool)}
}

func (r *ToolRegistry) Register(t Tool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.tools[t.Name()] = t
}

func (r *ToolRegistry) Get(name string) (Tool, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	t, ok := r.tools[name]
	return t, ok
}

func (r *ToolRegistry) List() []Tool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	list := make([]Tool, 0, len(r.tools))
	for _, t := range r.tools {
		list = append(list, t)
	}
	return list
}

func (r *ToolRegistry) ToDefs() []provider.ToolDef {
	r.mu.RLock()
	defer r.mu.RUnlock()
	defs := make([]provider.ToolDef, 0, len(r.tools))
	for _, t := range r.tools {
		defs = append(defs, provider.ToolDef{
			Name:        t.Name(),
			Description: t.Description(),
			Parameters:  t.InputSchema(),
		})
	}
	return defs
}
```

- [ ] **Step 2: 创建 tools.go — 6 个只读工具**

```go
// kernel/ai/tool/tools.go
package tool

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/billadm/models/dto"
	"github.com/billadm/service"
	"github.com/billadm/workspace"
)

// 辅助：从 context 获取 workspace
type wsKey struct{}

func WithWorkspace(ctx context.Context, ws *workspace.Workspace) context.Context {
	return context.WithValue(ctx, wsKey{}, ws)
}

func getWS(ctx context.Context) *workspace.Workspace {
	return ctx.Value(wsKey{}).(*workspace.Workspace)
}

// ---- 1. query_transactions ----

type queryTransactionsTool struct{}

func NewQueryTransactionsTool() Tool { return &queryTransactionsTool{} }

func (t *queryTransactionsTool) Name() string        { return "query_transactions" }
func (t *queryTransactionsTool) Description() string { return "查询交易记录。可按日期范围、交易类型(expense/income/transfer)、分类、标签、关键词筛选，支持排序和分页。" }

func (t *queryTransactionsTool) InputSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"start_date":  map[string]any{"type": "string", "description": "开始日期，格式 YYYY-MM-DD"},
			"end_date":    map[string]any{"type": "string", "description": "结束日期，格式 YYYY-MM-DD"},
			"type":        map[string]any{"type": "string", "description": "交易类型: expense/income/transfer"},
			"category":    map[string]any{"type": "string", "description": "分类名称"},
			"keyword":     map[string]any{"type": "string", "description": "关键词搜索（匹配描述）"},
			"sort_field":  map[string]any{"type": "string", "description": "排序字段，默认 transaction_at"},
			"sort_order":  map[string]any{"type": "string", "description": "排序方向: asc/desc"},
			"page":        map[string]any{"type": "integer", "description": "页码，从 1 开始，默认 1"},
			"page_size":   map[string]any{"type": "integer", "description": "每页条数，默认 20，最大 50"},
		},
		"required": []string{"start_date", "end_date"},
	}
}

func (t *queryTransactionsTool) Execute(ctx context.Context, args map[string]any) (string, error) {
	ws := getWS(ctx)
	ledgerID := getLedgerID(ws)

	condition := &dto.TrQueryCondition{
		LedgerID: ledgerID,
		Pagination: dto.TrQueryConditionPagination{
			Page:     getIntArg(args, "page", 1),
			PageSize: getIntArg(args, "page_size", 20),
		},
	}

	if sd, ok := args["start_date"].(string); ok && sd != "" {
		if ed, ok := args["end_date"].(string); ok && ed != "" {
			condition.TsRange = []string{sd, ed}
		}
	}

	if typ, ok := args["type"].(string); ok && typ != "" {
		condition.Items = append(condition.Items, dto.TrQueryConditionItem{
			TransactionType: typ,
			Category:        getStringArg(args, "category"),
			Description:     getStringArg(args, "keyword"),
		})
	}

	result, err := service.GetTrService().QueryTrsOnCondition(ws, condition)
	if err != nil {
		return "", err
	}

	b, _ := json.Marshal(result)
	return string(b), nil
}

// ---- 2. list_ledgers ----

type listLedgersTool struct{}

func NewListLedgersTool() Tool { return &listLedgersTool{} }

func (t *listLedgersTool) Name() string        { return "list_ledgers" }
func (t *listLedgersTool) Description() string { return "列出当前工作空间的所有账本" }

func (t *listLedgersTool) InputSchema() map[string]any {
	return map[string]any{
		"type":       "object",
		"properties": map[string]any{},
	}
}

func (t *listLedgersTool) Execute(ctx context.Context, args map[string]any) (string, error) {
	ws := getWS(ctx)
	ledgers, err := service.GetLedgerService().ListLedgers(ws)
	if err != nil {
		return "", err
	}
	// 只返回 id、name、currency
	type simple struct {
		ID       string `json:"id"`
		Name     string `json:"name"`
		Currency string `json:"currency"`
	}
	list := make([]simple, 0, len(ledgers))
	for _, l := range ledgers {
		list = append(list, simple{ID: l.ID, Name: l.Name, Currency: l.Currency})
	}
	b, _ := json.Marshal(list)
	return string(b), nil
}

// ---- 3. list_categories ----

type listCategoriesTool struct{}

func NewListCategoriesTool() Tool { return &listCategoriesTool{} }

func (t *listCategoriesTool) Name() string        { return "list_categories" }
func (t *listCategoriesTool) Description() string { return "列出分类。可按交易类型筛选。" }

func (t *listCategoriesTool) InputSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"transaction_type": map[string]any{"type": "string", "description": "交易类型: expense/income/transfer，不传返回全部"},
		},
	}
}

func (t *listCategoriesTool) Execute(ctx context.Context, args map[string]any) (string, error) {
	ws := getWS(ctx)
	cats, err := service.GetCategoryService().ListCategories(ws, getStringArg(args, "transaction_type"))
	if err != nil {
		return "", err
	}
	b, _ := json.Marshal(cats)
	return string(b), nil
}

// ---- 4. list_tags ----

type listTagsTool struct{}

func NewListTagsTool() Tool { return &listTagsTool{} }

func (t *listTagsTool) Name() string        { return "list_tags" }
func (t *listTagsTool) Description() string { return "列出标签。可按分类和交易类型筛选。" }

func (t *listTagsTool) InputSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"category":         map[string]any{"type": "string", "description": "分类名称"},
			"transaction_type": map[string]any{"type": "string", "description": "交易类型"},
		},
	}
}

func (t *listTagsTool) Execute(ctx context.Context, args map[string]any) (string, error) {
	ws := getWS(ctx)
	tags, err := service.GetTagService().ListTags(ws, getStringArg(args, "category"), getStringArg(args, "transaction_type"))
	if err != nil {
		return "", err
	}
	b, _ := json.Marshal(tags)
	return string(b), nil
}

// ---- 5. query_chart_data ----

type queryChartDataTool struct{}

func NewQueryChartDataTool() Tool { return &queryChartDataTool{} }

func (t *queryChartDataTool) Name() string        { return "query_chart_data" }
func (t *queryChartDataTool) Description() string { return "查询图表统计数据。返回按时间聚合的交易金额。支持年/月粒度。" }

func (t *queryChartDataTool) InputSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"granularity":  map[string]any{"type": "string", "description": "时间粒度: year 或 month，默认 month"},
			"start_date":   map[string]any{"type": "string", "description": "开始日期 YYYY-MM-DD"},
			"end_date":     map[string]any{"type": "string", "description": "结束日期 YYYY-MM-DD"},
			"types":        map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "description": "交易类型列表"},
		},
		"required": []string{"start_date", "end_date"},
	}
}

func (t *queryChartDataTool) Execute(ctx context.Context, args map[string]any) (string, error) {
	ws := getWS(ctx)
	ledgerID := getLedgerID(ws)

	req := &dto.ChartQuery{
		LedgerID:    ledgerID,
		Granularity: getStringArg(args, "granularity"),
		TsRange:     []string{getStringArg(args, "start_date"), getStringArg(args, "end_date")},
	}
	if req.Granularity == "" {
		req.Granularity = "month"
	}
	if typesRaw, ok := args["types"].([]any); ok {
		for _, t := range typesRaw {
			if s, ok := t.(string); ok {
				req.Types = append(req.Types, s)
			}
		}
	}

	result, err := service.GetTrService().QueryTrsForChart(ws, req)
	if err != nil {
		return "", err
	}
	b, _ := json.Marshal(result)
	return string(b), nil
}

// ---- 6. get_key_events ----

type getKeyEventsTool struct{}

func NewGetKeyEventsTool() Tool { return &getKeyEventsTool{} }

func (t *getKeyEventsTool) Name() string        { return "get_key_events" }
func (t *getKeyEventsTool) Description() string { return "查询指定年份的关键事件（人生里程碑）。" }

func (t *getKeyEventsTool) InputSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"year": map[string]any{"type": "integer", "description": "年份，如 2026"},
		},
		"required": []string{"year"},
	}
}

func (t *getKeyEventsTool) Execute(ctx context.Context, args map[string]any) (string, error) {
	ws := getWS(ctx)
	year := fmt.Sprintf("%d", int(getFloatArg(args, "year")))
	events, err := service.GetKeyEventService().ListKeyEventsByYear(ws, year)
	if err != nil {
		return "", err
	}
	b, _ := json.Marshal(events)
	return string(b), nil
}

// ---- 辅助函数 ----

func getStringArg(args map[string]any, key string) string {
	if v, ok := args[key].(string); ok {
		return v
	}
	return ""
}

func getIntArg(args map[string]any, key string, defaultVal int) int {
	switch v := args[key].(type) {
	case float64:
		return int(v)
	case int:
		return v
	}
	return defaultVal
}

func getFloatArg(args map[string]any, key string) float64 {
	if v, ok := args[key].(float64); ok {
		return v
	}
	return 0
}

func getLedgerID(ws *workspace.Workspace) string {
	// 从 workspace 关联的当前账本获取
	// 注意: 需要导入 ledger store 或使用 workspace metadata
	// 如果工具需要当前账本 ID，由 chat_service 在调用前注入
	return ""
}
```

- [ ] **Step 3: 查看当前账本 ID 的获取方式**

需要确认如何在 Go 侧获取当前选中的账本 ID。查看 `service` 层是否有访问当前 ledger 的方法：

```bash
cd kernel && grep -r "currentLedgerId\|CurrentLedgerId\|current.*ledger" --include="*.go" | head -20
```

如果没有 Go 侧维护的 current ledger，需要在 `ChatService` 层接收 `ledger_id` 参数，或在 context 中注入。记录结果并调整 `getLedgerID` 实现。

- [ ] **Step 4: 编译验证**

```bash
cd kernel && go build ./...
```

Expected: 如编译失败，根据实际 service 层方法签名调整 tool 实现中的调用。

- [ ] **Step 5: Commit**

```bash
git add kernel/ai/tool/registry.go kernel/ai/tool/tools.go
git commit -m "feat: add tool registry and 6 read-only tools"
```

---

### Task 7: Go 后端 — ChatService（Tool Calling 循环 + SSE）

**Files:**
- Create: `kernel/ai/chat_service.go`

**Interfaces:**
- Consumes: `ai/provider`, `ai/tool`, `dao` (AiConfigDao, AiMessageDao)
- Produces:
  - `ChatService struct`
  - `func NewChatService(configDao, messageDao, registry) *ChatService`
  - `func (s *ChatService) Chat(ctx, ws, userMessage) (<-chan SSEEvent, error)`
  - `SSEEvent struct` (带 JSON tags)

- [ ] **Step 1: 创建 chat_service.go**

```go
// kernel/ai/chat_service.go
package ai

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/sirupsen/logrus"

	"github.com/billadm/ai/provider"
	"github.com/billadm/ai/tool"
	"github.com/billadm/dao"
	"github.com/billadm/models"
	"github.com/billadm/workspace"
)

const (
	DefaultSystemPrompt = `你是 Transactions 个人财务助手的 AI 助手。你可以访问用户的财务数据来回答问题。

你的职责：
- 帮助用户查询和分析交易记录（支出、收入、转账）
- 提供账本信息
- 回答关于分类和标签的问题
- 生成图表统计数据
- 查询关键事件（人生里程碑）

你的原则：
- 所有数据来自用户自己的数据库，你看到的都是真实数据
- 如果数据不足以回答问题，诚实告知用户
- 金额单位是人民币元（¥），回答时保持 2 位小数
- 回答简洁但完整。先给出结论，再展示细节
- 当用户的问题模糊时，用工具搜索数据后再回答，不要猜测`

	MaxToolCallRounds = 10
	MaxHistoryMessages = 30
)

type SSEEvent struct {
	Type      string         `json:"type"`
	Delta     string         `json:"delta,omitempty"`
	Tool      string         `json:"tool,omitempty"`
	Args      map[string]any `json:"args,omitempty"`
	Summary   string         `json:"summary,omitempty"`
	Detail    any            `json:"detail,omitempty"`
	TokenUsed int            `json:"total_tokens,omitempty"`
	Message   string         `json:"message,omitempty"`
}

type ChatService struct {
	configDao  dao.AiConfigDao
	messageDao dao.AiMessageDao
	registry   *tool.ToolRegistry
}

func NewChatService(configDao dao.AiConfigDao, messageDao dao.AiMessageDao, registry *tool.ToolRegistry) *ChatService {
	return &ChatService{
		configDao:  configDao,
		messageDao: messageDao,
		registry:   registry,
	}
}

// Chat 执行一次对话，返回 SSE 事件 channel。
// ws 用于工具执行（传入 context）。
func (s *ChatService) Chat(ctx context.Context, ws *workspace.Workspace, userMessage string) (<-chan SSEEvent, error) {
	// 带工具执行 workspace 的 context
	toolCtx := tool.WithWorkspace(ctx, ws)

	// 加载配置
	config, err := s.configDao.Get(ws)
	if err != nil {
		return nil, fmt.Errorf("AI 配置未找到，请先在设置中配置: %w", err)
	}
	if config.BaseURL == "" || config.APIKey == "" || config.Model == "" || config.Endpoint == "" {
		return nil, fmt.Errorf("AI 配置不完整，请先在设置中配置 Base URL、端点、API Key 和模型")
	}

	// 选择 provider
	var llmProvider provider.LLMProvider
	switch config.Endpoint {
	case "/v1/messages":
		llmProvider = provider.NewAnthropicProvider(config.BaseURL, config.APIKey, config.Model)
	case "/chat/completions":
		llmProvider = provider.NewOpenAIProvider(config.BaseURL, config.APIKey, config.Model)
	default:
		return nil, fmt.Errorf("不支持的端点: %s", config.Endpoint)
	}

	// 加载历史
	history, err := s.messageDao.ListRecent(ws, "default", MaxHistoryMessages)
	if err != nil {
		return nil, fmt.Errorf("加载对话历史失败: %w", err)
	}

	// 构建消息
	messages := make([]provider.ChatMessage, 0, len(history)+1)
	for _, h := range history {
		msg := provider.ChatMessage{
			Role:       h.Role,
			Content:    h.Content,
			ToolCallID: h.ToolCallID,
		}
		if h.ToolCalls != "" {
			var tcs []provider.ToolCall
			json.Unmarshal([]byte(h.ToolCalls), &tcs)
			msg.ToolCalls = tcs
		}
		messages = append(messages, msg)
	}
	messages = append(messages, provider.ChatMessage{Role: "user", Content: userMessage})

	// 保存用户消息
	userMsg := &models.AiMessage{
		ID:             uuid.NewString(),
		ConversationID: "default",
		Role:           "user",
		Content:        userMessage,
	}
	_ = s.messageDao.Save(ws, userMsg) // 忽略保存错误，不中断对话

	ch := make(chan SSEEvent, 64)

	go func() {
		defer close(ch)

		round := 0
		for round < MaxToolCallRounds {
			round++
			select {
			case <-ctx.Done():
				return
			default:
			}

			req := provider.ChatRequest{
				SystemPrompt: DefaultSystemPrompt,
				Messages:     messages,
				Tools:        s.registry.ToDefs(),
			}

			eventCh, err := llmProvider.ChatStream(ctx, req)
			if err != nil {
				ch <- SSEEvent{Type: "error", Message: fmt.Sprintf("调用 AI 失败: %v", err)}
				return
			}

			var assistantContent string
			var toolCalls []provider.ToolCall
			gotToolCalls := false

			for event := range eventCh {
				switch event.Type {
				case "text_delta":
					assistantContent += event.Delta
					ch <- SSEEvent{Type: "text_delta", Delta: event.Delta}
				case "tool_call":
					gotToolCalls = true
					toolCalls = append(toolCalls, event.ToolCalls...)
					for _, tc := range event.ToolCalls {
						ch <- SSEEvent{Type: "tool_call", Tool: tc.Name, Args: tc.Arguments}
					}
				case "error":
					ch <- SSEEvent{Type: "error", Message: event.Error.Error()}
					return
				case "done":
					// fall through
				}
			}

			// 如果 AI 没有调用工具，结束循环
			if !gotToolCalls || len(toolCalls) == 0 {
				// 保存 assistant 消息
				if assistantContent != "" {
					s.saveMessage(ws, &models.AiMessage{
						ID:             uuid.NewString(),
						ConversationID: "default",
						Role:           "assistant",
						Content:        assistantContent,
					})
				}
				ch <- SSEEvent{Type: "done"}
				return
			}

			// 保存 assistant 消息（带 tool_calls）
			tcsJSON, _ := json.Marshal(toolCalls)
			s.saveMessage(ws, &models.AiMessage{
				ID:             uuid.NewString(),
				ConversationID: "default",
				Role:           "assistant",
				Content:        assistantContent,
				ToolCalls:      string(tcsJSON),
			})

			// 追加 assistant 消息到 messages
			messages = append(messages, provider.ChatMessage{
				Role:      "assistant",
				Content:   assistantContent,
				ToolCalls: toolCalls,
			})

			// 执行工具
			for _, tc := range toolCalls {
				t, ok := s.registry.Get(tc.Name)
				if !ok {
					errMsg := fmt.Sprintf("工具 %s 不存在", tc.Name)
					ch <- SSEEvent{Type: "tool_result", Tool: tc.Name, Summary: errMsg}
					messages = append(messages, provider.ChatMessage{
						Role:       "tool",
						Content:    errMsg,
						ToolCallID: tc.ID,
					})
					s.saveMessage(ws, &models.AiMessage{
						ID:             uuid.NewString(),
						ConversationID: "default",
						Role:           "tool",
						Content:        errMsg,
						ToolCallID:     tc.ID,
						ToolName:       tc.Name,
					})
					continue
				}

				result, err := t.Execute(toolCtx, tc.Arguments)
				if err != nil {
					logrus.Errorf("tool %s execute error: %v", tc.Name, err)
					result = fmt.Sprintf("工具执行出错: %v", err)
				}

				// 生成摘要
				summary := summarizeResult(tc.Name, result)

				ch <- SSEEvent{Type: "tool_result", Tool: tc.Name, Summary: summary, Detail: json.RawMessage(result)}

				messages = append(messages, provider.ChatMessage{
					Role:       "tool",
					Content:    result,
					ToolCallID: tc.ID,
				})

				s.saveMessage(ws, &models.AiMessage{
					ID:             uuid.NewString(),
					ConversationID: "default",
					Role:           "tool",
					Content:        result,
					ToolCallID:     tc.ID,
					ToolName:       tc.Name,
				})
			}
		}

		// 超过最大轮次
		ch <- SSEEvent{Type: "done"}
	}()

	return ch, nil
}

func (s *ChatService) saveMessage(ws *workspace.Workspace, msg *models.AiMessage) {
	if err := s.messageDao.Save(ws, msg); err != nil {
		logrus.Errorf("save AI message: %v", err)
	}
}

// summarizeResult 根据工具名称生成结果摘要
func summarizeResult(toolName, result string) string {
	var data map[string]any
	if err := json.Unmarshal([]byte(result), &data); err != nil {
		// 不是 JSON，返回截断的文本
		if len(result) > 100 {
			return result[:100] + "..."
		}
		return result
	}

	switch toolName {
	case "query_transactions":
		if total, ok := data["total"].(float64); ok {
			count := int64(total)
			summary := fmt.Sprintf("找到 %d 条交易记录", count)
			if stats, ok := data["trStatistics"].(map[string]any); ok {
				for k, v := range stats {
					if vf, ok := v.(float64); ok {
						summary += fmt.Sprintf(" · %s: ¥%.2f", k, vf/100)
					}
				}
			}
			return summary
		}
	case "list_ledgers":
		if arr, ok := data.([]any); ok {
			return fmt.Sprintf("共 %d 个账本", len(arr))
		}
	case "list_categories":
		if arr, ok := data.([]any); ok {
			return fmt.Sprintf("共 %d 个分类", len(arr))
		}
	case "list_tags":
		if arr, ok := data.([]any); ok {
			return fmt.Sprintf("共 %d 个标签", len(arr))
		}
	case "query_chart_data":
		if arr, ok := data.([]any); ok {
			return fmt.Sprintf("共 %d 条统计数据", len(arr))
		}
	case "get_key_events":
		if arr, ok := data.([]any); ok {
			return fmt.Sprintf("共 %d 个关键事件", len(arr))
		}
	}
	return "查询完成"
}
```

- [ ] **Step 2: 编译验证**

```bash
cd kernel && go build ./...
```

Expected: 编译成功。如果有未使用的 import 或类型不匹配，根据错误修正。

- [ ] **Step 3: Commit**

```bash
git add kernel/ai/chat_service.go
git commit -m "feat: add chat service with tool calling loop and SSE streaming"
```

---

### Task 8: Go 后端 — AI API 端点

**Files:**
- Create: `kernel/api/ai_api.go`
- Create: `kernel/api/ai_config_api.go`
- Modify: `kernel/api/router.go`
- Modify: `kernel/server/wire.go`

**Interfaces:**
- Consumes: `ai.ChatService`, `dao.AiConfigDao`, `ai/tool.ToolRegistry`
- Produces:
  - POST `/api/v1/ai/chat` (SSE 流)
  - GET/PUT `/api/v1/ai/config`
  - POST `/api/v1/ai/config/test`
  - DELETE `/api/v1/ai/messages`

- [ ] **Step 1: 创建 ai_api.go（SSE chat 端点）**

```go
// kernel/api/ai_api.go
package api

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"

	"github.com/billadm/ai"
)

var chatService *ai.ChatService

// SetChatService 由 wire.go 在初始化时调用
func SetChatService(svc *ai.ChatService) {
	chatService = svc
}

// POST /api/v1/ai/chat
func aiChat(c *gin.Context) {
	if chatService == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "chat service not initialized"})
		return
	}

	var req struct {
		Message string `json:"message"`
	}
	if err := c.BindJSON(&req); err != nil || req.Message == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "message is required"})
		return
	}
	if len(req.Message) > 4000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "消息过长，最多 4000 字符"})
		return
	}

	ws := ws(c)

	// SSE
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.WriteHeader(http.StatusOK)

	eventCh, err := chatService.Chat(c.Request.Context(), ws, req.Message)
	if err != nil {
		data, _ := json.Marshal(ai.SSEEvent{Type: "error", Message: err.Error()})
		c.Writer.Write([]byte("data: " + string(data) + "\n\n"))
		c.Writer.Flush()
		return
	}

	for event := range eventCh {
		data, _ := json.Marshal(event)
		if _, err := io.WriteString(c.Writer, "data: "+string(data)+"\n\n"); err != nil {
			logrus.Warnf("SSE write error: %v", err)
			return
		}
		c.Writer.Flush()
	}
}
```

- [ ] **Step 2: 创建 ai_config_api.go（配置 CRUD + 测试连接）**

```go
// kernel/api/ai_config_api.go
package api

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/billadm/ai/provider"
	"github.com/billadm/dao"
	"github.com/billadm/models"
)

var aiConfigDao dao.AiConfigDao

// SetAiConfigDao 由 wire.go 调用
func SetAiConfigDao(d dao.AiConfigDao) {
	aiConfigDao = d
}

// GET /api/v1/ai/config
func getAiConfig(c *gin.Context) {
	config, err := aiConfigDao.Get(ws(c))
	if err != nil {
		// 返回空配置
		config = &models.AiConfig{}
	}
	// 不返回 api_key 到前端
	c.JSON(http.StatusOK, gin.H{
		"base_url": config.BaseURL,
		"endpoint": config.Endpoint,
		"model":    config.Model,
		"has_key":  config.APIKey != "",
	})
}

// PUT /api/v1/ai/config
func updateAiConfig(c *gin.Context) {
	var req struct {
		BaseURL  string `json:"base_url"`
		Endpoint string `json:"endpoint"`
		APIKey   string `json:"api_key"`
		Model    string `json:"model"`
	}
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	config := &models.AiConfig{
		BaseURL:  req.BaseURL,
		Endpoint: req.Endpoint,
		APIKey:   req.APIKey,
		Model:    req.Model,
	}

	if err := aiConfigDao.Save(ws(c), config); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}

// POST /api/v1/ai/config/test
func testAiConnection(c *gin.Context) {
	var req struct {
		BaseURL  string `json:"base_url"`
		Endpoint string `json:"endpoint"`
		APIKey   string `json:"api_key"`
		Model    string `json:"model"`
	}
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	var p provider.LLMProvider
	switch req.Endpoint {
	case "/v1/messages":
		p = provider.NewAnthropicProvider(req.BaseURL, req.APIKey, req.Model)
	case "/chat/completions":
		p = provider.NewOpenAIProvider(req.BaseURL, req.APIKey, req.Model)
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "不支持的端点"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	eventCh, err := p.ChatStream(ctx, provider.ChatRequest{
		Messages: []provider.ChatMessage{
			{Role: "user", Content: "hi"},
		},
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "连接失败: " + err.Error()})
		return
	}

	// 消费第一个事件验证连接
	for event := range eventCh {
		if event.Type == "error" {
			c.JSON(http.StatusBadRequest, gin.H{"error": event.Error.Error()})
			return
		}
		if event.Type == "text_delta" || event.Type == "done" {
			c.JSON(http.StatusOK, gin.H{"message": "连接成功"})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "连接成功"})
}

// DELETE /api/v1/ai/messages
func clearAiMessages(c *gin.Context) {
	messageDao := dao.NewAiMessageDao()
	if err := messageDao.DeleteAll(ws(c), "default"); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已清空"})
}
```

- [ ] **Step 3: 修改 router.go — 注册 AI 路由**

在 `kernel/api/router.go` 的 `ServeAPI` 函数中，在 `keyEvents` group 之后添加：

```go
// AI Chat（需要 workspace）
ai := v1.Group("/ai")
{
	ai.POST("/chat", aiChat)
	ai.GET("/config", getAiConfig)
	ai.PUT("/config", updateAiConfig)
	ai.POST("/config/test", testAiConnection)
	ai.DELETE("/messages", clearAiMessages)
}
```

- [ ] **Step 4: 修改 server/wire.go — 初始化 AI 模块**

在 `InitServices` 函数末尾添加：

```go
// ---- AI module ----
aiConfigDao := dao.NewAiConfigDao()
aiMessageDao := dao.NewAiMessageDao()
aiToolRegistry := tool.NewToolRegistry()

// 注册 6 个只读工具
aiToolRegistry.Register(tool.NewQueryTransactionsTool())
aiToolRegistry.Register(tool.NewListLedgersTool())
aiToolRegistry.Register(tool.NewListCategoriesTool())
aiToolRegistry.Register(tool.NewListTagsTool())
aiToolRegistry.Register(tool.NewQueryChartDataTool())
aiToolRegistry.Register(tool.NewGetKeyEventsTool())

aiChatService := ai.NewChatService(aiConfigDao, aiMessageDao, aiToolRegistry)

// Wire into API package
api.SetChatService(aiChatService)
api.SetAiConfigDao(aiConfigDao)
```

需要在 import 中添加：
```go
"github.com/billadm/ai"
"github.com/billadm/ai/tool"
```

- [ ] **Step 5: 编译验证**

```bash
cd kernel && go build ./...
```

Expected: 编译成功。根据实际 service 方法签名和 compile errors 修正。

- [ ] **Step 6: 运行测试**

```bash
cd kernel && go test ./...
```

- [ ] **Step 7: Commit**

```bash
git add kernel/api/ai_api.go kernel/api/ai_config_api.go kernel/api/router.go kernel/server/wire.go
git commit -m "feat: add AI API endpoints (chat SSE, config, test)"
```

---

### Task 9: 前端 — AI 设置页面

**Files:**
- Create: `app/src/components/settings_view/AiSetting.vue`
- Create: `app/src/backend/api/ai.ts` (API 模块)
- Modify: `app/src/components/settings_view/SettingsView.vue`

**Interfaces:**
- Consumes: `@/backend/api/ai.ts` 的 `getAiConfig`, `updateAiConfig`, `testConnection`
- Produces: `AiSetting` Vue 组件，4 个配置项 + 测试连接按钮 + 保存按钮

- [ ] **Step 1: 创建前端 AI API 模块**

```typescript
// app/src/backend/api/ai.ts
import api from './api-client';

export interface AiConfig {
  base_url: string;
  endpoint: string;
  api_key: string;
  model: string;
}

export const aiApi = {
  async getConfig(): Promise<{ base_url: string; endpoint: string; model: string; has_key: boolean }> {
    return api.get('/v1/ai/config', '获取AI配置');
  },

  async updateConfig(config: AiConfig): Promise<void> {
    return api.put('/v1/ai/config', config, '保存AI配置');
  },

  async testConnection(config: AiConfig): Promise<void> {
    return api.post('/v1/ai/config/test', config, '测试连接');
  },

  async clearMessages(): Promise<void> {
    return api.delete('/v1/ai/messages', '清空对话');
  },
};
```

检查 `api-client.ts` 是否支持 `put` 方法。如没有，需要添加：

```typescript
// 在 api 对象中添加
async put<T = any>(url: string, data: object = {}, errorPrefix?: string): Promise<T> {
    try {
        const client = await getApiClient();
        const response: AxiosResponse<Result<T>> = await client.put(url, data);
        checkSuccess(response.data, errorPrefix);
        return response.data.data;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            throw new Error(`${errorPrefix || '请求失败'}: ${error.message}`);
        }
        throw error;
    }
},
```

- [ ] **Step 2: 创建 AiSetting.vue**

基于 `GeneralSetting.vue` 的 `.setting-card` 模式。使用 `BilladmPageHeader`, `a-input`, `a-select`, `a-input-password`, `a-button`。

关键点：
- 端点 a-select 变更时联动 Base URL placeholder
- 测试连接按钮独立发送，不依赖保存
- 保存成功后 message 提示

写入完整 Vue 组件代码到 `app/src/components/settings_view/AiSetting.vue`。

- [ ] **Step 3: 修改 SettingsView.vue**

在 `SettingsView.vue` 中：
1. 在 `<script setup>` 中导入 `RobotOutlined` 和 `AiSetting` 组件
2. 在侧边栏 `<nav>` 中添加 AI 助手按钮
3. 在 `componentMap` 中添加 `'ai': AiSetting`

- [ ] **Step 4: 前端检查**

```bash
cd app && npx vue-tsc -b
```

Expected: 无类型错误。

- [ ] **Step 5: Commit**

```bash
git add app/src/components/settings_view/AiSetting.vue app/src/components/settings_view/SettingsView.vue app/src/backend/api/ai.ts app/src/backend/api/api-client.ts
git commit -m "feat: add AI settings page with config form and test connection"
```

---

### Task 10: 前端 — AI 对话视图

**Files:**
- Create: `app/src/components/ai_view/AiChatView.vue`
- Modify: `app/src/router/router.ts`
- Modify: `app/src/components/AppLeftBar.vue`

**Interfaces:**
- Consumes: `aiApi` (发送 SSE 请求), `Router`, Ant Design Vue 组件
- Produces: `AiChatView` 组件 — 完整聊天 UI

- [ ] **Step 1: 创建 AiChatView.vue**

这是一个大组件。按以下结构实现：

**Template:**
```
.ai-chat-view
  .chat-header          ← "AI 助手" 标题 + 清空对话按钮（DeleteOutlined）
  .chat-messages        ← 消息列表 (ref="messageListRef", scroll)
    .chat-empty (v-if="messages.length === 0 && !streaming")
      p.chat-empty-greeting  ← 问候语
      p.chat-empty-hint      ← "询问你的财务数据"
    .chat-message (v-for, v-bind:class)
      .msg-user           ← 用户消息（右对齐，主色背景）
      .msg-assistant      ← AI 消息（左对齐，白底+左边线）
      .msg-tool           ← 工具卡片（左边线+状态图标）
  .chat-input-area
    .chat-divider         ← 1px 分隔线
    textarea (v-model="inputText")  ← 输入框
    .chat-input-hint      ← "Enter 发送 · Shift+Enter 换行"
    button (send/stop)    ← 发送/停止按钮
```

**Script (关键逻辑):**
- `sendMessage()`: 创建 AbortController, 调用 fetch SSE, 解析事件流
- `handleSSEEvent(event)`: 根据 type 更新 messages 数组
- `stopGeneration()`: controller.abort()
- 工具卡片状态切换：琥珀色（执行中）→ 绿色（完成）
- 自动滚动：`nextTick` 后滚动到底部（检查用户是否在查看历史）
- 流式光标：AI 文本末尾添加闪烁光标 class

**Style:**
- 使用 `--billadm-*` CSS 变量保持一致性
- AI 消息左边线：`border-left: 3px solid var(--billadm-color-primary)`
- 工具执行中左边线：`border-left: 3px solid var(--billadm-color-accent)`
- 工具完成左边线：`border-left: 3px solid var(--billadm-color-success)`
- 输入框聚焦光晕：`box-shadow: 0 0 0 2px rgba(74, 140, 111, 0.15)`

- [ ] **Step 2: 修改 router.ts**

在 `routes[0].children` 中添加：

```typescript
{
  name: 'AI 助手',
  path: 'ai_view',
  component: () => import('@/components/ai_view/AiChatView.vue'),
},
```

- [ ] **Step 3: 修改 AppLeftBar.vue**

在 `navItems` 数组中添加：

```typescript
{ path: '/ai_view', label: 'AI 助手', icon: RobotOutlined },
```

需要导入 `RobotOutlined` from `@ant-design/icons-vue`。

- [ ] **Step 4: 前端检查**

```bash
cd app && npx vue-tsc -b
```

Expected: 无类型错误。

- [ ] **Step 5: 运行 lint 检查并提交**

```bash
git add app/src/components/ai_view/AiChatView.vue app/src/router/router.ts app/src/components/AppLeftBar.vue
git commit -m "feat: add AI chat view with SSE streaming, tool visualization, and navigation"
```

---

### Task 11: 端到端验证

**Files:** 无新增文件

- [ ] **Step 1: 后端编译与测试**

```bash
cd kernel && go build ./... && go test ./...
```

- [ ] **Step 2: 前端类型检查**

```bash
cd app && npx vue-tsc -b
```

- [ ] **Step 3: 功能验证清单**

在确保后端和前端都编译成功后，启动应用并验证：
1. 左侧导航出现 "AI 助手" 入口，点击跳转到 `/ai_view`
2. 设置页 "AI 助手" tab，填写配置后点"测试连接"能成功
3. 保存配置后，在 AI 视图发消息能收到流式回复
4. AI 能调用工具（如查询交易记录），工具卡片正确展示
5. 点击停止按钮能中断生成
6. 对话刷新页面后仍然存在（持久化）
7. 清空对话后历史删除

- [ ] **Step 4: 最终 Commit**

```bash
git add -A
git commit -m "feat: complete AI chat feature with tool calling and SSE streaming"
```
