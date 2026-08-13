package service_test

import (
	"strings"
	"testing"

	"github.com/billadm/dao"
	"github.com/billadm/service"
	"github.com/billadm/workspace"
)

func newKeyEventService(t *testing.T) (service.KeyEventService, *workspace.Workspace) {
	t.Helper()
	ws, err := workspace.NewWorkspace(t.TempDir())
	if err != nil {
		t.Fatalf("创建工作空间失败: %v", err)
	}
	t.Cleanup(func() { ws.Close() })
	svc := service.NewKeyEventService(
		service.NewKeyEventImageService(dao.NewKeyEventImageDao()),
		dao.NewKeyEventDao(),
	)
	return svc, ws
}

func TestUpsertKeyEventTruncatesByRuneNotByte(t *testing.T) {
	svc, ws := newKeyEventService(t)

	// 201 个中文字符（每字 3 字节）——按字节截断会在多字节字符中间切断
	title := strings.Repeat("账", 201)
	if err := svc.UpsertKeyEvent(ws, "ledger-utf8", "2026-05-01", title, "内容", "color"); err != nil {
		t.Fatalf("保存关键事件失败: %v", err)
	}

	event, err := svc.QueryByDate(ws, "ledger-utf8", "2026-05-01")
	if err != nil {
		t.Fatalf("查询关键事件失败: %v", err)
	}
	if got := len([]rune(event.Title)); got != 200 {
		t.Fatalf("标题应按 rune 截断为 200 字, 实际 %d 字", got)
	}
	if strings.ContainsRune(event.Title, '\uFFFD') {
		t.Fatalf("标题包含替换字符 U+FFFD，说明发生了非法 UTF-8 截断")
	}
}

func TestUpsertKeyEventSameDateAcrossLedgers(t *testing.T) {
	svc, ws := newKeyEventService(t)

	for _, ledger := range []string{"ledger-a", "ledger-b"} {
		if err := svc.UpsertKeyEvent(ws, ledger, "2026-06-01", "标题", "内容", "color"); err != nil {
			t.Fatalf("账本 %s 建事件失败（应允许不同账本同日建事件）: %v", ledger, err)
		}
	}

	for _, ledger := range []string{"ledger-a", "ledger-b"} {
		event, err := svc.QueryByDate(ws, ledger, "2026-06-01")
		if err != nil {
			t.Fatalf("查询账本 %s 事件失败: %v", ledger, err)
		}
		if event.LedgerID != ledger {
			t.Fatalf("查询到错误账本的事件: 期望 %s, 实际 %s", ledger, event.LedgerID)
		}
	}
}
