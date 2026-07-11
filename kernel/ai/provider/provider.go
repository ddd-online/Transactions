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
