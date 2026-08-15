package dao

import (
	"testing"
	"time"

	"github.com/transactions/models"
	"github.com/transactions/workspace"
)

func seedAiMsg(t *testing.T, ws *workspace.Workspace, convID, role string, msgRole, content string, at int64) {
	t.Helper()
	msg := &models.AiMessage{
		ID:             convID + "_" + msgRole + "_" + content + "_" + itoa(at),
		ConversationID: convID,
		AiRole:         role,
		MsgRole:        msgRole,
		Content:        content,
		CreatedAt:      at,
	}
	if err := NewAiMessageDao().Save(ws, msg); err != nil {
		t.Fatalf("保存 AI 消息失败: %v", err)
	}
}

func itoa(v int64) string {
	if v == 0 {
		return "0"
	}
	neg := v < 0
	if neg {
		v = -v
	}
	var b [20]byte
	i := len(b)
	for v > 0 {
		i--
		b[i] = byte('0' + v%10)
		v /= 10
	}
	if neg {
		i--
		b[i] = '-'
	}
	return string(b[i:])
}

func TestAiMessageDaoListRecentFiltered(t *testing.T) {
	ws := newTestWorkspace(t)
	dao := NewAiMessageDao()
	role := "financial_assistant"

	now := time.Now().UnixMilli()
	// 写入 5 条历史（无摘要）
	for i := 0; i < 5; i++ {
		seedAiMsg(t, ws, "conv-1", role, "user", "msg", now+int64(i))
	}

	// 无摘要时等价于 ListRecent（升序返回全部）
	msgs, err := dao.ListRecentFiltered(ws, "conv-1", role, 10)
	if err != nil {
		t.Fatalf("ListRecentFiltered 失败: %v", err)
	}
	if len(msgs) != 5 {
		t.Fatalf("无摘要时应返回 5 条, 实际 %d", len(msgs))
	}

	// 写入一条摘要（role=summary），再写入 3 条新消息
	seedAiMsg(t, ws, "conv-1", role, AiSummaryRole, "SUMMARY", now+100)
	for i := 0; i < 3; i++ {
		seedAiMsg(t, ws, "conv-1", role, "user", "new", now+200+int64(i))
	}

	msgs2, err := dao.ListRecentFiltered(ws, "conv-1", role, 10)
	if err != nil {
		t.Fatalf("ListRecentFiltered 失败: %v", err)
	}
	// 应从摘要起取：summary + 3 条新消息 = 4 条（摘要之前的 5 条历史被过滤）
	if len(msgs2) != 4 {
		t.Fatalf("有摘要时应返回 4 条（摘要+3新消息）, 实际 %d", len(msgs2))
	}
	if msgs2[0].MsgRole != AiSummaryRole {
		t.Fatalf("第一条应为摘要消息, 实际 role=%s", msgs2[0].MsgRole)
	}
}

func TestAiMessageDaoSummaryCRUD(t *testing.T) {
	ws := newTestWorkspace(t)
	dao := NewAiMessageDao()
	role := "diary_assistant"
	now := time.Now().UnixMilli()

	// 无摘要时返回 nil
	s, err := dao.GetSummary(ws, "conv-x", role)
	if err != nil {
		t.Fatalf("GetSummary 失败: %v", err)
	}
	if s != nil {
		t.Fatalf("不应存在摘要, 实际 %+v", s)
	}

	// 写入摘要
	seedAiMsg(t, ws, "conv-x", role, AiSummaryRole, "SUMMARY-1", now)
	s1, _ := dao.GetSummary(ws, "conv-x", role)
	if s1 == nil || s1.Content != "SUMMARY-1" {
		t.Fatalf("GetSummary 应返回 SUMMARY-1, 实际 %+v", s1)
	}

	// 删除摘要
	if err := dao.DeleteSummary(ws, "conv-x", role); err != nil {
		t.Fatalf("DeleteSummary 失败: %v", err)
	}
	s2, _ := dao.GetSummary(ws, "conv-x", role)
	if s2 != nil {
		t.Fatalf("删除后摘要应为空, 实际 %+v", s2)
	}
}

func TestAiMessageDaoDeleteByConversation(t *testing.T) {
	ws := newTestWorkspace(t)
	dao := NewAiMessageDao()
	role := "financial_assistant"
	now := time.Now().UnixMilli()

	for i := 0; i < 3; i++ {
		seedAiMsg(t, ws, "conv-del", role, "user", "m", now+int64(i))
		seedAiMsg(t, ws, "conv-keep", role, "user", "k", now+int64(i))
	}

	if err := dao.DeleteByConversation(ws, "conv-del"); err != nil {
		t.Fatalf("DeleteByConversation 失败: %v", err)
	}

	kept, err := dao.ListRecent(ws, "conv-keep", role, 10)
	if err != nil {
		t.Fatalf("ListRecent 失败: %v", err)
	}
	if len(kept) != 3 {
		t.Fatalf("conv-keep 应保留 3 条, 实际 %d", len(kept))
	}
	deleted, _ := dao.ListRecent(ws, "conv-del", role, 10)
	if len(deleted) != 0 {
		t.Fatalf("conv-del 应清空, 实际 %d", len(deleted))
	}
}
