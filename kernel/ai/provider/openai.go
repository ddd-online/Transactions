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
	ID       string             `json:"id"`
	Type     string             `json:"type"`
	Function openaiToolCallFunc `json:"function"`
}

type openaiToolCallFunc struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

type openaiToolDef struct {
	Type     string                `json:"type"`
	Function openaiToolDefFunction `json:"function"`
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

// openaiToolCallDelta 用于流式增量拼接（带 Index 字段追踪）
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
			Role      string                `json:"role,omitempty"`
			Content   string                `json:"content,omitempty"`
			ToolCalls []openaiToolCallDelta `json:"tool_calls,omitempty"`
		} `json:"delta"`
		FinishReason string `json:"finish_reason,omitempty"`
	} `json:"choices"`
}

// toolCallAccum 用于增量拼接单个 tool call 的参数
type toolCallAccum struct {
	id          string
	name        string
	argsBuilder strings.Builder
}

func (p *openaiProvider) ChatStream(ctx context.Context, req ChatRequest) (<-chan ChatEvent, error) {
	// 构建 OpenAI 消息
	messages := make([]openaiMessage, 0)

	// System prompt 作为第一条消息（role=system），而非顶层字段
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
				// OpenAI 要求 tool call arguments 是 JSON 编码的字符串
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
		// 跟踪 tool calls 增量拼接：key = Index
		toolCallsAccum := make(map[int]*toolCallAccum)

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
				// 发送挂起的 tool calls（参数片段已完全接收）
				flushToolCalls(toolCallsAccum, ch)
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

				// tool calls delta（增量拼接：Index 追踪 + arguments 片段拼接）
				for _, tc := range delta.ToolCalls {
					idx := tc.Index
					if _, ok := toolCallsAccum[idx]; !ok {
						toolCallsAccum[idx] = &toolCallAccum{}
					}
					acc := toolCallsAccum[idx]
					if tc.ID != "" {
						acc.id = tc.ID
					}
					if tc.Function.Name != "" {
						acc.name = tc.Function.Name
					}
					// 拼接 arguments JSON 字符串片段
					acc.argsBuilder.WriteString(tc.Function.Arguments)
				}

				// finish_reason 表示本轮工具调用完成
				if choice.FinishReason == "stop" || choice.FinishReason == "tool_calls" {
					flushToolCalls(toolCallsAccum, ch)
				}
			}
		}
	}()

	return ch, nil
}

// flushToolCalls 将缓冲区中的 tool calls 转换为 ChatEvent 并清空缓冲区
func flushToolCalls(acc map[int]*toolCallAccum, ch chan<- ChatEvent) {
	if len(acc) == 0 {
		return
	}
	tcs := make([]ToolCall, 0, len(acc))
	// 按 Index 顺序遍历，确保 tool calls 顺序正确
	for i := 0; i < len(acc); i++ {
		a, ok := acc[i]
		if !ok {
			continue
		}
		var args map[string]any
		argsStr := a.argsBuilder.String()
		if argsStr != "" {
			if err := json.Unmarshal([]byte(argsStr), &args); err != nil {
				args = make(map[string]any)
			}
		} else {
			args = make(map[string]any)
		}
		tcs = append(tcs, ToolCall{
			ID:        a.id,
			Name:      a.name,
			Arguments: args,
		})
	}
	if len(tcs) > 0 {
		ch <- ChatEvent{Type: "tool_call", ToolCalls: tcs}
	}
	// 清空 map
	for k := range acc {
		delete(acc, k)
	}
}
