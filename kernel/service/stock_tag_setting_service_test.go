package service_test

import (
	"strings"
	"testing"

	"github.com/transactions/dao"
	"github.com/transactions/models"
)

func TestTradeTagSettingDefaults(t *testing.T) {
	svc, ws := newStockService(t)

	setting, err := svc.GetTradeTags(ws, testLedgerID)
	if err != nil {
		t.Fatalf("查询标签设置失败: %v", err)
	}
	if setting.DefaultTag != models.StockTradeTagAnalysis {
		t.Fatalf("默认标签应为「分析」, 实际 %q", setting.DefaultTag)
	}
	want := models.DefaultStockTradeTags()
	if len(setting.Tags) != len(want) {
		t.Fatalf("默认标签数量应为 %d, 实际 %d", len(want), len(setting.Tags))
	}
	for i, tag := range want {
		if setting.Tags[i] != tag {
			t.Fatalf("默认标签第 %d 项应为 %s, 实际 %s", i, tag, setting.Tags[i])
		}
	}
}

func TestSaveTradeTagsValidation(t *testing.T) {
	svc, ws := newStockService(t)

	// 增删自定义标签并保留顺序
	saved, err := svc.SaveTradeTags(ws, testLedgerID, []string{
		models.StockTradeTagAnalysis,
		models.StockTradeTagDaban,
		models.StockTradeTagXuli,
		"低吸",
	})
	if err != nil {
		t.Fatalf("保存标签失败: %v", err)
	}
	want := []string{models.StockTradeTagAnalysis, models.StockTradeTagDaban, models.StockTradeTagXuli, "低吸"}
	if len(saved.Tags) != len(want) {
		t.Fatalf("保存结果错误: %+v", saved.Tags)
	}
	for i, tag := range want {
		if saved.Tags[i] != tag {
			t.Fatalf("保存后第 %d 项应为 %s, 实际 %s", i, tag, saved.Tags[i])
		}
	}
	refetched, err := svc.GetTradeTags(ws, testLedgerID)
	if err != nil {
		t.Fatalf("重新查询标签失败: %v", err)
	}
	if len(refetched.Tags) != len(want) {
		t.Fatalf("重新查询应与保存一致: %+v", refetched.Tags)
	}

	// 去首尾空白
	saved, err = svc.SaveTradeTags(ws, testLedgerID, []string{models.StockTradeTagAnalysis, " 蓄力 "})
	if err != nil {
		t.Fatalf("保存带空白标签失败: %v", err)
	}
	if saved.Tags[1] != models.StockTradeTagXuli {
		t.Fatalf("标签应去除空白: %+v", saved.Tags)
	}

	invalidCases := []struct {
		name string
		tags []string
		want string
	}{
		{"空列表", []string{}, "至少保留一个标签"},
		{"删除默认标签", []string{models.StockTradeTagDaban}, "「分析」不可删除"},
		{"重复标签", []string{models.StockTradeTagAnalysis, models.StockTradeTagAnalysis}, "标签不能重复"},
		{"超长标签", []string{models.StockTradeTagAnalysis, "涨停板接力战法九字"}, "不能超过 8 个字"},
	}
	for _, tc := range invalidCases {
		if _, err := svc.SaveTradeTags(ws, testLedgerID, tc.tags); err == nil {
			t.Fatalf("%s 应被拒绝", tc.name)
		} else if !strings.Contains(err.Error(), tc.want) {
			t.Fatalf("%s 错误文案错误: %v", tc.name, err)
		}
	}

	tooMany := []string{models.StockTradeTagAnalysis}
	for i := 0; i < 20; i++ {
		tooMany = append(tooMany, "自定义"+string(rune('A'+i)))
	}
	if _, err := svc.SaveTradeTags(ws, testLedgerID, tooMany); err == nil {
		t.Fatal("超过 20 个标签应被拒绝")
	}
}

func TestCustomTagAppliedToRoundAndStatistics(t *testing.T) {
	svc, ws := newStockService(t)
	stockDao := dao.NewStockDao()
	if _, err := svc.SetPrincipal(ws, testLedgerID, 10000000); err != nil {
		t.Fatalf("设置本金失败: %v", err)
	}
	seedCleanRound(t, ws, stockDao, testCode, testName, 1000, 1100, 10, 1700000000)
	seedCleanRound(t, ws, stockDao, testCodeB, testNameB, 800, 850, 10, 1700001000)

	// 首次统计触发历史回填生成轮次
	if _, err := svc.GetStatistics(ws, testLedgerID); err != nil {
		t.Fatalf("首次统计失败: %v", err)
	}
	detailA, err := svc.GetTradeHistoryDetail(ws, testLedgerID, testCode)
	if err != nil {
		t.Fatalf("查询 A 历史失败: %v", err)
	}
	roundID := detailA.Rounds[0].ID

	// 新增自定义标签后即可用于轮次
	defaults := models.DefaultStockTradeTags()
	customList := append(append([]string{}, defaults...), "低吸")
	if _, err := svc.SaveTradeTags(ws, testLedgerID, customList); err != nil {
		t.Fatalf("保存自定义标签失败: %v", err)
	}
	if _, err := svc.UpdateRoundTag(ws, testLedgerID, roundID, "低吸"); err != nil {
		t.Fatalf("使用自定义标签应成功: %v", err)
	}
	if _, err := svc.UpdateRoundTag(ws, testLedgerID, roundID, "不存在的标签"); err == nil {
		t.Fatal("列表外标签应被拒绝")
	}

	stats, err := svc.GetStatisticsRange(ws, testLedgerID, "", "", 0, "低吸")
	if err != nil {
		t.Fatalf("按自定义标签筛选失败: %v", err)
	}
	if stats.RoundCount != 1 || stats.Points[0].StockCode != testCode || stats.Points[0].Tag != "低吸" {
		t.Fatalf("自定义标签筛选结果错误: %+v", stats)
	}

	// 删除自定义标签后，历史轮次回退可用标签，已删除标签不可再筛选
	withoutCustom := defaults
	if _, err := svc.SaveTradeTags(ws, testLedgerID, withoutCustom); err != nil {
		t.Fatalf("删除自定义标签失败: %v", err)
	}
	if _, err := svc.UpdateRoundTag(ws, testLedgerID, roundID, models.StockTradeTagDaban); err != nil {
		t.Fatalf("删除自定义标签后改回默认标签失败: %v", err)
	}
	if _, err := svc.GetStatisticsRange(ws, testLedgerID, "", "", 0, "低吸"); err == nil {
		t.Fatal("已删除标签不应再可用于筛选")
	}
}

func TestResetDataRestoresDefaultTradeTags(t *testing.T) {
	svc, ws := newStockService(t)

	if _, err := svc.SaveTradeTags(ws, testLedgerID, []string{models.StockTradeTagAnalysis, "短线"}); err != nil {
		t.Fatalf("保存自定义标签失败: %v", err)
	}
	if err := svc.ResetData(ws, testLedgerID); err != nil {
		t.Fatalf("重置失败: %v", err)
	}
	setting, err := svc.GetTradeTags(ws, testLedgerID)
	if err != nil {
		t.Fatalf("重置后查询标签失败: %v", err)
	}
	want := models.DefaultStockTradeTags()
	if len(setting.Tags) != len(want) {
		t.Fatalf("重置后应恢复默认标签, 实际 %+v", setting.Tags)
	}
	for i, tag := range want {
		if setting.Tags[i] != tag {
			t.Fatalf("重置后标签顺序错误: %+v", setting.Tags)
		}
	}
}
