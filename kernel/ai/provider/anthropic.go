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
	Type      string          `json:"type"`
	Text      string          `json:"text,omitempty"`
	ID        string          `json:"id,omitempty"`
	Name      string          `json:"name,omitempty"`
	Input     json.RawMessage `json:"input,omitempty"`
	ToolUseID string          `json:"tool_use_id,omitempty"`
	Content   string          `json:"content,omitempty"`
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
	Model     string             `json:"model"`
	MaxTokens int                `json:"max_tokens"`
	System    string             `json:"system,omitempty"`
	Messages  []anthropicMessage `json:"messages"`
	Tools     []anthropicToolDef `json:"tools,omitempty"`
	Stream    bool               `json:"stream"`
	Thinking  *anthropicThinking `json:"thinking,omitempty"`
}

type anthropicThinking struct {
	Type         string `json:"type"`
	BudgetTokens int    `json:"budget_tokens"`
}

// anthropicStreamEvent SSE 行 JSON 结构
type anthropicStreamEvent struct {
	Type  string `json:"type"`
	Delta struct {
		Type        string `json:"type"`
		Text        string `json:"text"`
		PartialJSON string `json:"partial_json"`
		Thinking    string `json:"thinking"`
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
		if m.Role == "tool" {
			// Anthropic requires all tool_results in a SINGLE user message
			// immediately after the assistant message. Merge consecutive
			// tool results into the same user message.
			toolBlock := anthropicContentBlock{
				Type:      "tool_result",
				ToolUseID: m.ToolCallID,
				Content:   m.Content,
			}
			if len(messages) > 0 && messages[len(messages)-1].Role == "user" {
				messages[len(messages)-1].Content = append(messages[len(messages)-1].Content, toolBlock)
			} else {
				messages = append(messages, anthropicMessage{
					Role:    "user",
					Content: []anthropicContentBlock{toolBlock},
				})
			}
			continue
		}

		content := make([]anthropicContentBlock, 0)

		if len(m.ToolCalls) > 0 {
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

		messages = append(messages, anthropicMessage{
			Role:    m.Role,
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
		Thinking: &anthropicThinking{
			Type:         "enabled",
			BudgetTokens: 4000,
		},
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
		scanner.Buffer(make([]byte, 0, 1024*1024), 10*1024*1024) // 1MB initial, 10MB max
		var currentToolID string
		var currentToolName string
		var toolArgsAccum []byte
		currentlyThinking := false

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
				} else if event.ContentBlock.Type == "thinking" {
					currentlyThinking = true
					ch <- ChatEvent{Type: "thinking_start"}
				}
			case "content_block_delta":
				if event.Delta.Type == "text_delta" {
					ch <- ChatEvent{Type: "text_delta", Delta: event.Delta.Text}
				} else if event.Delta.Type == "input_json_delta" {
					toolArgsAccum = append(toolArgsAccum, event.Delta.PartialJSON...)
				} else if event.Delta.Type == "thinking_delta" {
					ch <- ChatEvent{Type: "thinking_delta", Delta: event.Delta.Thinking}
				}
			case "content_block_stop":
				// content_block_stop carries only "index" — no "content_block"
				// field. Use tracked state to know which block just ended.
				if currentlyThinking {
					currentlyThinking = false
					ch <- ChatEvent{Type: "thinking_done"}
				}
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
			case "error":
				ch <- ChatEvent{Type: "error", Error: fmt.Errorf("API error event received")}
				return
			}
		}

		if err := scanner.Err(); err != nil {
			ch <- ChatEvent{Type: "error", Error: fmt.Errorf("scanner error: %w", err)}
		}
	}()

	return ch, nil
}

func mustMarshalJSON(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}
