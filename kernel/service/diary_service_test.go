package service_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/transactions/dao"
	"github.com/transactions/service"
	"github.com/transactions/workspace"
)

func newDiaryService(t *testing.T) (service.DiaryService, *workspace.Workspace) {
	t.Helper()
	ws, err := workspace.NewWorkspace(t.TempDir())
	if err != nil {
		t.Fatalf("创建工作空间失败: %v", err)
	}
	t.Cleanup(func() { ws.Close() })

	return service.NewDiaryService(dao.NewDiaryDao()), ws
}

func TestScanDirectoryAcceptsTxtAndMd(t *testing.T) {
	svc, _ := newDiaryService(t)

	dir := t.TempDir()
	files := []string{
		"2026-08-01.txt",
		"2026-08-02.md",
		"2026-08-03.md",
		"notes.txt",      // 非日期文件名，跳过
		"2026-13-01.md",  // 非法日期，跳过
		"2026-08-04.TXT", // 大小写不匹配，跳过
	}
	for _, name := range files {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("x"), 0o644); err != nil {
			t.Fatalf("创建文件失败: %v", err)
		}
	}

	list, err := svc.ScanDirectory(dir)
	if err != nil {
		t.Fatalf("扫描目录失败: %v", err)
	}
	if len(list) != 3 {
		t.Fatalf("应识别 3 个文件, 实际 %d: %+v", len(list), list)
	}
	wantDates := []string{"2026-08-01", "2026-08-02", "2026-08-03"}
	for i, item := range list {
		if item.Date != wantDates[i] {
			t.Fatalf("第 %d 项日期应为 %s, 实际 %s", i, wantDates[i], item.Date)
		}
	}
}

func TestExportToDirectory(t *testing.T) {
	svc, ws := newDiaryService(t)

	seeds := []struct {
		date    string
		content string
		mood    string
	}{
		{date: "2026-08-01", content: "第一篇\n正文内容", mood: "😊"},
		{date: "2026-08-02", content: "# 第二篇\n\n- 列表项", mood: ""},
	}
	for _, s := range seeds {
		if _, err := svc.Upsert(ws, s.date, s.content, s.mood); err != nil {
			t.Fatalf("写入日记 %s 失败: %v", s.date, err)
		}
	}

	// 目标目录尚不存在，验证自动创建
	target := filepath.Join(t.TempDir(), "nested", "diary-export")
	result, err := svc.ExportToDirectory(ws, target, 0, 0)
	if err != nil {
		t.Fatalf("导出失败: %v", err)
	}
	if result.Total != 2 || result.Success != 2 || len(result.Failed) != 0 {
		t.Fatalf("导出结果异常: %+v", result)
	}

	for _, s := range seeds {
		raw, err := os.ReadFile(filepath.Join(target, s.date+".md"))
		if err != nil {
			t.Fatalf("读取导出文件 %s 失败: %v", s.date, err)
		}
		if string(raw) != s.content {
			t.Fatalf("文件 %s 内容不一致:\n期望: %q\n实际: %q", s.date, s.content, string(raw))
		}
	}
}

func TestExportToDirectoryEmpty(t *testing.T) {
	svc, ws := newDiaryService(t)

	target := filepath.Join(t.TempDir(), "empty-export")
	result, err := svc.ExportToDirectory(ws, target, 0, 0)
	if err != nil {
		t.Fatalf("导出失败: %v", err)
	}
	if result.Total != 0 || result.Success != 0 {
		t.Fatalf("空库导出结果异常: %+v", result)
	}
	if _, err := os.Stat(target); err != nil {
		t.Fatalf("空导出也应创建目录: %v", err)
	}
}

func TestExportToDirectoryByYearAndMonth(t *testing.T) {
	svc, ws := newDiaryService(t)

	seeds := []struct {
		date    string
		content string
	}{
		{date: "2025-12-31", content: "跨年"},
		{date: "2026-01-15", content: "一月"},
		{date: "2026-02-10", content: "二月"},
		{date: "2026-08-01", content: "八月"},
	}
	for _, s := range seeds {
		if _, err := svc.Upsert(ws, s.date, s.content, ""); err != nil {
			t.Fatalf("写入日记 %s 失败: %v", s.date, err)
		}
	}

	// 按年：2026 年应有 3 篇
	yearDir := t.TempDir()
	yearResult, err := svc.ExportToDirectory(ws, yearDir, 2026, 0)
	if err != nil {
		t.Fatalf("按年导出失败: %v", err)
	}
	if yearResult.Total != 3 || yearResult.Success != 3 {
		t.Fatalf("按年导出结果异常: %+v", yearResult)
	}
	for _, date := range []string{"2026-01-15", "2026-02-10", "2026-08-01"} {
		if _, err := os.Stat(filepath.Join(yearDir, date+".md")); err != nil {
			t.Fatalf("按年导出缺少 %s: %v", date, err)
		}
	}
	if _, err := os.Stat(filepath.Join(yearDir, "2025-12-31.md")); err == nil {
		t.Fatal("按年导出不应包含 2025-12-31")
	}

	// 按年月：2026-02 应只有 1 篇
	monthDir := t.TempDir()
	monthResult, err := svc.ExportToDirectory(ws, monthDir, 2026, 2)
	if err != nil {
		t.Fatalf("按月导出失败: %v", err)
	}
	if monthResult.Total != 1 || monthResult.Success != 1 {
		t.Fatalf("按月导出结果异常: %+v", monthResult)
	}
	if _, err := os.Stat(filepath.Join(monthDir, "2026-02-10.md")); err != nil {
		t.Fatalf("按月导出缺少 2026-02-10: %v", err)
	}
}
