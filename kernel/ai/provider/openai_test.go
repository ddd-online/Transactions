package provider

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// runOpenAIStream 启动一个返回给定 SSE 响应体的 httptest 服务器，
// 用 OpenAI provider 请求它并收集全部 ChatEvent。可选捕获请求体。
func runOpenAIStream(t *testing.T, body string, captureReqBody *string, thinkingEnabled bool) []ChatEvent {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if captureReqBody != nil {
			buf := new(strings.Builder)
			_, _ = io.Copy(buf, r.Body)
			*captureReqBody = buf.String()
		}
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte(body))
	}))
	defer srv.Close()

	p := NewOpenAIProvider(srv.URL, "test-key", "deepseek-reasoner")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	ch, err := p.ChatStream(ctx, ChatRequest{
		Messages:        []ChatMessage{{Role: "user", Content: "hi"}},
		ThinkingEnabled: thinkingEnabled,
	})
	if err != nil {
		t.Fatalf("ChatStream 失败: %v", err)
	}
	var events []ChatEvent
	for ev := range ch {
		events = append(events, ev)
	}
	return events
}

func eventTypes(events []ChatEvent) string {
	types := make([]string, 0, len(events))
	for _, ev := range events {
		types = append(types, ev.Type)
	}
	return strings.Join(types, ",")
}

func eventDeltas(events []ChatEvent, evType string) []string {
	var deltas []string
	for _, ev := range events {
		if ev.Type == evType {
			deltas = append(deltas, ev.Delta)
		}
	}
	return deltas
}

// 场景 A：reasoner 流（DeepSeek 形状）——思考增量在 content 之前，
// 首包带空的 reasoning_content 标记应被容忍。
func TestOpenAIStreamReasoningContent(t *testing.T) {
	body := "" +
		"data: {\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\",\"content\":\"\"},\"finish_reason\":null}]}\n\n" +
		"data: {\"choices\":[{\"index\":0,\"delta\":{\"reasoning_content\":\"先分析\"},\"finish_reason\":null}]}\n\n" +
		"data: {\"choices\":[{\"index\":0,\"delta\":{\"reasoning_content\":\"，再回答\"},\"finish_reason\":null}]}\n\n" +
		"data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"最终答案\"},\"finish_reason\":null}]}\n\n" +
		"data: {\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n" +
		"data: [DONE]\n\n"

	events := runOpenAIStream(t, body, nil, false)

	want := "thinking_start,thinking_delta,thinking_delta,thinking_done,text_delta,done"
	if got := eventTypes(events); got != want {
		t.Fatalf("事件序列不符\n  期望: %s\n  实际: %s", want, got)
	}
	if got := strings.Join(eventDeltas(events, "thinking_delta"), ""); got != "先分析，再回答" {
		t.Fatalf("思考增量拼接不符: %q", got)
	}
	if got := strings.Join(eventDeltas(events, "text_delta"), ""); got != "最终答案" {
		t.Fatalf("文本增量拼接不符: %q", got)
	}
}

// 场景 B：部分 OpenAI 兼容网关用 reasoning 字段承载思考增量。
func TestOpenAIStreamReasoningField(t *testing.T) {
	body := "" +
		"data: {\"choices\":[{\"index\":0,\"delta\":{\"reasoning\":\"step 1\"},\"finish_reason\":null}]}\n\n" +
		"data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"answer\"},\"finish_reason\":null}]}\n\n" +
		"data: {\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n" +
		"data: [DONE]\n\n"

	events := runOpenAIStream(t, body, nil, false)

	want := "thinking_start,thinking_delta,thinking_done,text_delta,done"
	if got := eventTypes(events); got != want {
		t.Fatalf("事件序列不符\n  期望: %s\n  实际: %s", want, got)
	}
	if got := strings.Join(eventDeltas(events, "thinking_delta"), ""); got != "step 1" {
		t.Fatalf("思考增量拼接不符: %q", got)
	}
}

// 场景 C：思考后无 content 直接调工具——thinking_done 应在 finish_reason 处发出，
// 工具调用增量拼接不受影响。
func TestOpenAIStreamThinkingThenToolCall(t *testing.T) {
	body := "" +
		"data: {\"choices\":[{\"index\":0,\"delta\":{\"reasoning_content\":\"查询账本\"},\"finish_reason\":null}]}\n\n" +
		"data: {\"choices\":[{\"index\":0,\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_1\",\"type\":\"function\",\"function\":{\"name\":\"list_ledgers\",\"arguments\":\"\"}}]},\"finish_reason\":null}]}\n\n" +
		"data: {\"choices\":[{\"index\":0,\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"{}\"}}]},\"finish_reason\":null}]}\n\n" +
		"data: {\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"tool_calls\"}]}\n\n" +
		"data: [DONE]\n\n"

	events := runOpenAIStream(t, body, nil, false)

	want := "thinking_start,thinking_delta,thinking_done,tool_call,done"
	if got := eventTypes(events); got != want {
		t.Fatalf("事件序列不符\n  期望: %s\n  实际: %s", want, got)
	}
	if len(events) < 4 || len(events[3].ToolCalls) != 1 {
		t.Fatalf("应解析出 1 个工具调用, 实际 %d", len(events[3].ToolCalls))
	}
	tc := events[3].ToolCalls[0]
	if tc.Name != "list_ledgers" || tc.ID != "call_1" {
		t.Fatalf("工具调用字段不符: %+v", tc)
	}
}

// 场景 D：普通模型（无思考字段）——不应产生任何 thinking 事件（回归）。
func TestOpenAIStreamPlainModelNoThinking(t *testing.T) {
	body := "" +
		"data: {\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\",\"content\":\"你好\"},\"finish_reason\":null}]}\n\n" +
		"data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"！\"},\"finish_reason\":null}]}\n\n" +
		"data: {\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n" +
		"data: [DONE]\n\n"

	events := runOpenAIStream(t, body, nil, false)

	want := "text_delta,text_delta,done"
	if got := eventTypes(events); got != want {
		t.Fatalf("事件序列不符\n  期望: %s\n  实际: %s", want, got)
	}
	if got := strings.Join(eventDeltas(events, "text_delta"), ""); got != "你好！" {
		t.Fatalf("文本增量拼接不符: %q", got)
	}
}

// 场景 E：ThinkingEnabled=true 时请求体应携带 thinking:{type:"enabled"}。
func TestOpenAIRequestThinkingParam(t *testing.T) {
	body := "" +
		"data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"ok\"},\"finish_reason\":null}]}\n\n" +
		"data: {\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n" +
		"data: [DONE]\n\n"

	var reqBody string
	runOpenAIStream(t, body, &reqBody, true)

	var parsed map[string]any
	if err := json.Unmarshal([]byte(reqBody), &parsed); err != nil {
		t.Fatalf("解析请求体失败: %v", err)
	}
	thinking, ok := parsed["thinking"].(map[string]any)
	if !ok {
		t.Fatalf("请求体应包含 thinking 字段: %s", reqBody)
	}
	if thinking["type"] != "enabled" {
		t.Fatalf("thinking.type 应为 enabled, 实际: %v", thinking["type"])
	}

	// 未开启时不应携带
	var reqBody2 string
	runOpenAIStream(t, body, &reqBody2, false)
	if strings.Contains(reqBody2, "\"thinking\"") {
		t.Fatalf("未开启思考时请求体不应包含 thinking 字段: %s", reqBody2)
	}
}
