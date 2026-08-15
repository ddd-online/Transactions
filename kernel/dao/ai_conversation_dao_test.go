package dao

import (
	"testing"
	"time"

	"github.com/transactions/models"
)

func TestAiConversationDaoCRUD(t *testing.T) {
	ws := newTestWorkspace(t)
	dao := NewAiConversationDao()
	role := "financial_assistant"

	// Create
	conv := &models.AiConversation{
		ID:    "conv-c1",
		Role:  role,
		Title: "会话一",
	}
	if err := dao.Create(ws, conv); err != nil {
		t.Fatalf("创建会话失败: %v", err)
	}
	conv2 := &models.AiConversation{
		ID:    "conv-c2",
		Role:  role,
		Title: "会话二",
	}
	if err := dao.Create(ws, conv2); err != nil {
		t.Fatalf("创建会话失败: %v", err)
	}

	// List 按 updated_at 倒序
	list, err := dao.List(ws, role)
	if err != nil {
		t.Fatalf("列出会话失败: %v", err)
	}
	if len(list) != 2 {
		t.Fatalf("应有 2 个会话, 实际 %d", len(list))
	}

	// 不同角色隔离
	other, err := dao.List(ws, "diary_assistant")
	if err != nil {
		t.Fatalf("列出会话失败: %v", err)
	}
	if len(other) != 0 {
		t.Fatalf("diary 角色不应有会话, 实际 %d", len(other))
	}

	// Get
	got, err := dao.Get(ws, "conv-c1")
	if err != nil {
		t.Fatalf("获取会话失败: %v", err)
	}
	if got.Title != "会话一" {
		t.Fatalf("标题不符: %s", got.Title)
	}

	// Touch 更新 updated_at（Unix 秒级精度，需等待跨秒）
	oldUpdated := got.UpdatedAt
	time.Sleep(1100 * time.Millisecond)
	if err := dao.Touch(ws, "conv-c1"); err != nil {
		t.Fatalf("Touch 失败: %v", err)
	}
	got2, _ := dao.Get(ws, "conv-c1")
	if got2.UpdatedAt <= oldUpdated {
		t.Fatalf("Touch 后 updated_at 应增大: old=%d new=%d", oldUpdated, got2.UpdatedAt)
	}

	// Delete
	if err := dao.Delete(ws, "conv-c1"); err != nil {
		t.Fatalf("删除会话失败: %v", err)
	}
	after, _ := dao.List(ws, role)
	if len(after) != 1 {
		t.Fatalf("删除后应剩 1 个会话, 实际 %d", len(after))
	}
}
