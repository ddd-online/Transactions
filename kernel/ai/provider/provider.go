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
	// ThinkingEnabled 是否在请求体中附加思考参数。
	// - Anthropic 端点：true 发送 thinking:{type:"enabled", budget_tokens:N}；false 省略该字段（服务端默认）。
	// - OpenAI 兼容端点：true 发送 thinking:{type:"enabled"}（DeepSeek V3.x 需要）；false 不发送（reasoner 模型仍会自动思考）。
	// 无论是否发送参数，provider 都会解析并转发返回的思考增量（reasoning_content / thinking）。
	ThinkingEnabled bool
}

type ChatEvent struct {
	Type      string     // "text_delta" | "thinking_start" | "thinking_delta" | "thinking_done" | "tool_call" | "done" | "error"
	Delta     string
	ToolCalls []ToolCall
	Error     error
}

type LLMProvider interface {
	ChatStream(ctx context.Context, req ChatRequest) (<-chan ChatEvent, error)
}
