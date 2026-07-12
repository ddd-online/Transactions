package ai

import (
	"testing"

	"github.com/billadm/ai/provider"
)

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
