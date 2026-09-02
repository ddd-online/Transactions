package service_test

import (
	"strings"
	"testing"

	"github.com/transactions/models"
)

func TestWithdrawFollowsTotalAssetsFormula(t *testing.T) {
	svc, ws := newStockService(t)

	// 本金 ¥100,000（10000000 分），完成一轮盈利交易后支取
	if _, err := svc.SetPrincipal(ws, testLedgerID, 10000000); err != nil {
		t.Fatalf("设置本金失败: %v", err)
	}
	if _, err := svc.CreateTrade(ws, testLedgerID, testCode, testName, models.StockTradeOpen, 1000, 10, 1700003000, ""); err != nil {
		t.Fatalf("建仓失败: %v", err)
	}
	if _, err := svc.CreateTrade(ws, testLedgerID, testCode, testName, models.StockTradeClose, 1200, 10, 1700003100, ""); err != nil {
		t.Fatalf("清仓失败: %v", err)
	}

	before, err := svc.GetOverview(ws, testLedgerID)
	if err != nil {
		t.Fatalf("查询总览失败: %v", err)
	}
	// 买入成本 1000510，卖出净额 1198888 → 已实现盈亏 198378
	if before.RealizedPnl != 198378 {
		t.Fatalf("已实现盈亏应为 198378, 实际 %d", before.RealizedPnl)
	}
	if before.AvailableCash != before.Principal+before.RealizedPnl {
		t.Fatalf("无持仓支取时可用现金应等于本金+总盈亏, 可用现金 %d", before.AvailableCash)
	}
	if before.TotalAssets != before.AvailableCash {
		t.Fatalf("无支取时总资产应等于可用现金, 总资产 %d", before.TotalAssets)
	}

	// 支取 ¥2,000（200000 分）
	after, err := svc.AddWithdraw(ws, testLedgerID, 200000)
	if err != nil {
		t.Fatalf("支取失败: %v", err)
	}
	if after.Principal != before.Principal {
		t.Fatalf("支取不应改变本金, 期望 %d, 实际 %d", before.Principal, after.Principal)
	}
	if after.WithdrawnTotal != 200000 {
		t.Fatalf("累计支取应为 200000, 实际 %d", after.WithdrawnTotal)
	}
	if after.AvailableCash != before.AvailableCash-200000 {
		t.Fatalf("支取后可用现金应为 %d, 实际 %d", before.AvailableCash-200000, after.AvailableCash)
	}
	wantAssets := after.Principal + after.RealizedPnl - after.WithdrawnTotal
	if after.TotalAssets != wantAssets {
		t.Fatalf("总资产应等于 本金+总盈亏−累计支取 = %d, 实际 %d", wantAssets, after.TotalAssets)
	}

	// 资金记录链完整：设置本金不计记录，建仓 + 清仓 + 支取 = 3 条
	page, err := svc.ListFundRecords(ws, testLedgerID, 1, 10)
	if err != nil {
		t.Fatalf("查询资金记录失败: %v", err)
	}
	if page.Total != 3 {
		t.Fatalf("资金记录应为 3 条, 实际 %d", page.Total)
	}
	if page.Items[0].EventType != models.StockEventWithdraw {
		t.Fatalf("最新记录应为支取事件, 实际 %+v", page.Items[0])
	}
	if page.Items[0].AmountChange != -200000 {
		t.Fatalf("支取金额变化应为 -200000, 实际 %d", page.Items[0].AmountChange)
	}
}

func TestWithdrawRejectedWhenExceedsCash(t *testing.T) {
	svc, ws := newStockService(t)

	if _, err := svc.SetPrincipal(ws, testLedgerID, 5000000); err != nil {
		t.Fatalf("设置本金失败: %v", err)
	}
	if _, err := svc.AddWithdraw(ws, testLedgerID, 100000); err != nil {
		t.Fatalf("首次支取失败: %v", err)
	}

	// 支取超过当前现金（4900000 分）应被拒绝，且不产生新记录
	_, err := svc.AddWithdraw(ws, testLedgerID, 4900001)
	if err == nil {
		t.Fatalf("支取超过当前现金应报错")
	}
	if !strings.Contains(err.Error(), "不能超过可用现金") {
		t.Fatalf("错误信息应说明现金限制, 实际: %v", err)
	}
	if _, err := svc.AddWithdraw(ws, testLedgerID, 0); err == nil {
		t.Fatalf("支取 0 应报错")
	}
	if _, err := svc.AddWithdraw(ws, testLedgerID, -100); err == nil {
		t.Fatalf("负金额支取应报错")
	}

	overview, err := svc.GetOverview(ws, testLedgerID)
	if err != nil {
		t.Fatalf("查询总览失败: %v", err)
	}
	if overview.WithdrawnTotal != 100000 || overview.AvailableCash != 4900000 {
		t.Fatalf("失败支取不应影响账户, 累计支取 %d, 可用现金 %d", overview.WithdrawnTotal, overview.AvailableCash)
	}
	page, err := svc.ListFundRecords(ws, testLedgerID, 1, 10)
	if err != nil {
		t.Fatalf("查询资金记录失败: %v", err)
	}
	if page.Total != 1 {
		t.Fatalf("资金记录应仍为 1 条, 实际 %d", page.Total)
	}
}

func TestWithdrawAccumulatesWithoutChangingPrincipal(t *testing.T) {
	svc, ws := newStockService(t)

	if _, err := svc.SetPrincipal(ws, testLedgerID, 5000000); err != nil {
		t.Fatalf("设置本金失败: %v", err)
	}
	if _, err := svc.AddWithdraw(ws, testLedgerID, 100000); err != nil {
		t.Fatalf("第一次支取失败: %v", err)
	}
	if _, err := svc.AddWithdraw(ws, testLedgerID, 200000); err != nil {
		t.Fatalf("第二次支取失败: %v", err)
	}
	// 追加本金后再支取，本金始终是累计投入
	if _, err := svc.AddPrincipal(ws, testLedgerID, 1000000); err != nil {
		t.Fatalf("追加本金失败: %v", err)
	}
	if _, err := svc.AddWithdraw(ws, testLedgerID, 500000); err != nil {
		t.Fatalf("第三次支取失败: %v", err)
	}

	overview, err := svc.GetOverview(ws, testLedgerID)
	if err != nil {
		t.Fatalf("查询总览失败: %v", err)
	}
	// 本金 = 5000000 + 1000000，支取累计 = 100000+200000+500000
	if overview.Principal != 6000000 {
		t.Fatalf("本金应为 6000000（含追加，不受支取影响）, 实际 %d", overview.Principal)
	}
	if overview.WithdrawnTotal != 800000 {
		t.Fatalf("累计支取应为 800000, 实际 %d", overview.WithdrawnTotal)
	}
	if overview.AvailableCash != 6000000-800000 {
		t.Fatalf("可用现金应为 %d, 实际 %d", 6000000-800000, overview.AvailableCash)
	}
	if overview.TotalAssets != overview.Principal-overview.WithdrawnTotal {
		t.Fatalf("总资产计算错误: %d", overview.TotalAssets)
	}
}

func TestAvailableCashSubtractsPositionCost(t *testing.T) {
	svc, ws := newStockService(t)

	if _, err := svc.SetPrincipal(ws, testLedgerID, 10000000); err != nil {
		t.Fatalf("设置本金失败: %v", err)
	}
	// 建仓 10 手 @ 10.00，买入成本 1000510 分，持仓成本计入可用现金扣除
	if _, err := svc.CreateTrade(ws, testLedgerID, testCode, testName, models.StockTradeOpen, 1000, 10, 1700004000, ""); err != nil {
		t.Fatalf("建仓失败: %v", err)
	}

	overview, err := svc.GetOverview(ws, testLedgerID)
	if err != nil {
		t.Fatalf("查询总览失败: %v", err)
	}
	if overview.TotalAssets != 10000000 {
		t.Fatalf("有持仓时总资产仍应为本金 10000000, 实际 %d", overview.TotalAssets)
	}
	if overview.AvailableCash != 10000000-1000510 {
		t.Fatalf("可用现金应等于总资产−持仓成本 %d, 实际 %d", 10000000-1000510, overview.AvailableCash)
	}

	// 清仓后持仓成本归零，可用现金 = 总资产
	if _, err := svc.CreateTrade(ws, testLedgerID, testCode, testName, models.StockTradeClose, 1100, 10, 1700004100, ""); err != nil {
		t.Fatalf("清仓失败: %v", err)
	}
	after, err := svc.GetOverview(ws, testLedgerID)
	if err != nil {
		t.Fatalf("查询总览失败: %v", err)
	}
	if after.AvailableCash != after.TotalAssets {
		t.Fatalf("清仓后可用现金应等于总资产, 可用现金 %d, 总资产 %d", after.AvailableCash, after.TotalAssets)
	}
}
