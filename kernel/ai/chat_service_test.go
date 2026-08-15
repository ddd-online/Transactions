package ai

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/transactions/ai/provider"
	"github.com/transactions/dao"
	"github.com/transactions/models"
	"github.com/transactions/workspace"
)

// newTestWorkspace 创建临时工作空间（ai 包测试用）。
func newTestWorkspace(t *testing.T) *workspace.Workspace {
	t.Helper()
	ws, err := workspace.NewWorkspace(t.TempDir())
	if err != nil {
		t.Fatalf("创建工作空间失败: %v", err)
	}
	t.Cleanup(func() { ws.Close() })
	return ws
}

// mockSummaryProvider 返回固定文本摘要的假 provider。
type mockSummaryProvider struct {
	text string
}

func (m *mockSummaryProvider) ChatStream(ctx context.Context, req provider.ChatRequest) (<-chan provider.ChatEvent, error) {
	ch := make(chan provider.ChatEvent, 2)
	go func() {
		defer close(ch)
		select {
		case <-ctx.Done():
			return
		default:
		}
		ch <- provider.ChatEvent{Type: "text_delta", Delta: m.text}
		ch <- provider.ChatEvent{Type: "done"}
	}()
	return ch, nil
}

func newTestChatService(ws *workspace.Workspace) *ChatService {
	return NewChatService(
		nil, // apiConfigDao 仅 Chat 用，compressHistory 不需要
		nil,
		dao.NewAiMessageDao(),
		dao.NewAiConversationDao(),
		nil, // tool registry 仅 Chat 用
		nil, // role registry 仅 Chat 用
	)
}

func TestCompressHistory(t *testing.T) {
	ws := newTestWorkspace(t)
	svc := newTestChatService(ws)
	role := "financial_assistant"
	now := time.Now().UnixMilli()

	// 少于阈值不压缩
	history := []*models.AiMessage{}
	for i := 0; i < 10; i++ {
		history = append(history, &models.AiMessage{
			ID:             "h" + string(rune('a'+i)),
			ConversationID: "conv-cmp",
			AiRole:         role,
			MsgRole:        "user",
			Content:        "old",
			CreatedAt:      now + int64(i),
		})
	}
	summary, err := svc.compressHistory(context.Background(), ws, &mockSummaryProvider{text: "S"}, "conv-cmp", role, history)
	if err != nil {
		t.Fatalf("compressHistory 失败: %v", err)
	}
	if summary != "" {
		t.Fatalf("未超窗口不应压缩, 实际返回摘要 %q", summary)
	}

	// 超过阈值（MaxHistoryMessages=50）压缩最旧一批
	big := []*models.AiMessage{}
	for i := 0; i < MaxHistoryMessages+10; i++ {
		big = append(big, &models.AiMessage{
			ID:             "b" + string(rune('a'+i%26)) + string(rune('0'+i/26)),
			ConversationID: "conv-cmp",
			AiRole:         role,
			MsgRole:        "user",
			Content:        "msg-" + string(rune('0'+i%10)),
			CreatedAt:      now + int64(i),
		})
	}
	summary2, err := svc.compressHistory(context.Background(), ws, &mockSummaryProvider{text: "压缩摘要"}, "conv-cmp", role, big)
	if err != nil {
		t.Fatalf("compressHistory 失败: %v", err)
	}
	if summary2 != "压缩摘要" {
		t.Fatalf("应返回生成摘要, 实际 %q", summary2)
	}

	// 摘要已落库，且 GetSummary 可读回
	s, _ := dao.NewAiMessageDao().GetSummary(ws, "conv-cmp", role)
	if s == nil || s.Content != "压缩摘要" {
		t.Fatalf("摘要应已写入数据库, 实际 %+v", s)
	}
}

func TestPruneToolResult(t *testing.T) {
	// 短结果不截断
	short := "ok"
	if got := pruneToolResult(short); got != short {
		t.Fatalf("短结果不应截断: %q", got)
	}

	// 超长结果截断并附提示
	long := strings.Repeat("x", maxToolResultLen+100)
	pruned := pruneToolResult(long)
	if len(pruned) >= len(long) {
		t.Fatalf("超长结果应被截断")
	}
	if !strings.Contains(pruned, "工具结果过长") {
		t.Fatalf("截断结果应包含提示")
	}
}

func TestFilterOrphanedToolResults(t *testing.T) {
	// collected IDs keyed
	asst1 := provider.ChatMessage{Role: "assistant", ToolCalls: []provider.ToolCall{
		{ID: "call_1"}, {ID: "call_2"},
	}}
	toolCall1 := provider.ChatMessage{Role: "tool", ToolCallID: "call_1", Content: "result 1"}
	toolCall2 := provider.ChatMessage{Role: "tool", ToolCallID: "call_2", Content: "result 2"}
	orphanTool := provider.ChatMessage{Role: "tool", ToolCallID: "call_orphan", Content: "orphan"}
	userMsg := provider.ChatMessage{Role: "user", Content: "hello"}
	assistantMsg := provider.ChatMessage{Role: "assistant", Content: "hi"}
	toolNoID := provider.ChatMessage{Role: "tool", Content: "no id"}

	// Scenario 1: all paired — nothing filtered
	msgs := []provider.ChatMessage{asst1, toolCall1, toolCall2, userMsg}
	filtered := filterOrphanedToolResults(msgs)
	if len(filtered) != 4 {
		t.Fatalf("Scenario 1: expected 4, got %d", len(filtered))
	}

	// Scenario 2: orphan at the beginning (simulating truncation)
	msgs2 := []provider.ChatMessage{orphanTool, userMsg, asst1, toolCall1}
	filtered2 := filterOrphanedToolResults(msgs2)
	if len(filtered2) != 3 {
		t.Fatalf("Scenario 2: expected 3, got %d", len(filtered2))
	}
	for _, m := range filtered2 {
		if m.Role == "tool" && m.ToolCallID == "call_orphan" {
			t.Fatal("Scenario 2: orphan should be filtered")
		}
	}

	// Scenario 3: mixed — some paired, some orphaned
	msgs3 := []provider.ChatMessage{orphanTool, userMsg, asst1, toolCall1, orphanTool, assistantMsg}
	filtered3 := filterOrphanedToolResults(msgs3)
	if len(filtered3) != 4 {
		t.Fatalf("Scenario 3: expected 4, got %d", len(filtered3))
	}

	// Scenario 4: tool with empty ToolCallID — should be kept (not orphaned, just no tool call)
	cut := []provider.ChatMessage{userMsg, toolNoID, asst1, toolCall1}
	filtered4 := filterOrphanedToolResults(cut)
	if len(filtered4) != 4 {
		t.Fatalf("Scenario 4: expected 4, got %d", len(filtered4))
	}
}
