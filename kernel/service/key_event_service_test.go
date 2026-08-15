package service_test

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/png"
	"strings"
	"testing"

	"github.com/transactions/dao"
	"github.com/transactions/service"
	"github.com/transactions/workspace"
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

func TestKeyEventImageIsLedgerScoped(t *testing.T) {
	ws, err := workspace.NewWorkspace(t.TempDir())
	if err != nil {
		t.Fatalf("创建工作空间失败: %v", err)
	}
	t.Cleanup(func() { ws.Close() })

	imgSvc := service.NewKeyEventImageService(dao.NewKeyEventImageDao())

	// 生成一张合法的 1x1 PNG 作为图片数据
	img := image.NewRGBA(image.Rect(0, 0, 1, 1))
	img.Set(0, 0, color.RGBA{R: 255, G: 0, B: 0, A: 255})
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("生成测试图片失败: %v", err)
	}
	raw := "data:image/png;base64," + base64.StdEncoding.EncodeToString(buf.Bytes())

	// 两个账本在同一天各添加一张图片
	if _, err := imgSvc.AddImage(ws, "ledger-a", "2026-05-01", raw); err != nil {
		t.Fatalf("账本 A 添加图片失败: %v", err)
	}
	if _, err := imgSvc.AddImage(ws, "ledger-b", "2026-05-01", raw); err != nil {
		t.Fatalf("账本 B 添加图片失败: %v", err)
	}

	a, err := imgSvc.GetImagesByEventDate(ws, "ledger-a", "2026-05-01")
	if err != nil {
		t.Fatalf("查询账本 A 图片失败: %v", err)
	}
	if len(a) != 1 || a[0].LedgerID != "ledger-a" {
		t.Fatalf("账本 A 应只返回自己的 1 张图片, 实际 %d 条", len(a))
	}

	b, err := imgSvc.GetImagesByEventDate(ws, "ledger-b", "2026-05-01")
	if err != nil {
		t.Fatalf("查询账本 B 图片失败: %v", err)
	}
	if len(b) != 1 || b[0].LedgerID != "ledger-b" {
		t.Fatalf("账本 B 应只返回自己的 1 张图片, 实际 %d 条", len(b))
	}
}
