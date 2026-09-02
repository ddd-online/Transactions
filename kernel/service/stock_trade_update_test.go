package service_test

import (
	"testing"

	"github.com/transactions/models"
)

func TestUpdateTradeRebuildsDerivedState(t *testing.T) {
	svc, ws := newStockService(t)

	if _, err := svc.SetPrincipal(ws, testLedgerID, 10000000); err != nil {
		t.Fatalf("设置本金失败: %v", err)
	}
	openTime := int64(1700005000)
	closeTime := int64(1700005100)
	if _, err := svc.CreateTrade(ws, testLedgerID, testCode, testName, models.StockTradeOpen, 1000, 10, openTime, ""); err != nil {
		t.Fatalf("建仓失败: %v", err)
	}
	if _, err := svc.CreateTrade(ws, testLedgerID, testCode, testName, models.StockTradeClose, 1100, 10, closeTime, ""); err != nil {
		t.Fatalf("清仓失败: %v", err)
	}

	before, err := svc.GetTradeHistorySummary(ws, testLedgerID)
	if err != nil {
		t.Fatalf("查询历史总览失败: %v", err)
	}
	trades, err := svc.ListTrades(ws, testLedgerID, testCode)
	if err != nil {
		t.Fatalf("查询交易失败: %v", err)
	}
	openTradeID := ""
	for i := range trades {
		if trades[i].TradeType == models.StockTradeOpen {
			openTradeID = trades[i].ID
			break
		}
	}
	if openTradeID == "" {
		t.Fatal("未找到建仓交易")
	}

	// 建仓价 1000 → 1100：买入成本 +100000 + 费用差额，总盈亏相应减少
	updated, err := svc.UpdateTrade(ws, testLedgerID, openTradeID, 1100, 10, openTime)
	if err != nil {
		t.Fatalf("修改交易失败: %v", err)
	}
	if updated.Price != 1100 || updated.Lots != 10 || updated.TradeTime != openTime {
		t.Fatalf("交易字段未更新: %+v", updated)
	}

	after, err := svc.GetTradeHistorySummary(ws, testLedgerID)
	if err != nil {
		t.Fatalf("修改后查询历史总览失败: %v", err)
	}
	if after.TotalPnl >= before.TotalPnl {
		t.Fatalf("提高建仓价后总盈亏应下降: before=%d after=%d", before.TotalPnl, after.TotalPnl)
	}

	overview, err := svc.GetOverview(ws, testLedgerID)
	if err != nil {
		t.Fatalf("查询总览失败: %v", err)
	}
	if overview.RealizedPnl != after.TotalPnl {
		t.Fatalf("账户已实现盈亏应与交易历史一致: 账户 %d, 历史 %d", overview.RealizedPnl, after.TotalPnl)
	}
	if overview.AvailableCash != overview.TotalAssets {
		t.Fatalf("清仓后可用现金应等于总资产: %+v", overview)
	}
	page, err := svc.ListFundRecords(ws, testLedgerID, 1, 10)
	if err != nil {
		t.Fatalf("查询资金记录失败: %v", err)
	}
	if page.Total != 2 || page.Items[0].CashBalance != overview.AvailableCash {
		t.Fatalf("资金链重建后最新余额应与可用现金一致: %+v", overview)
	}
}

func TestUpdateTradeRollsBackWhenSellExceedsHolding(t *testing.T) {
	svc, ws := newStockService(t)

	if _, err := svc.SetPrincipal(ws, testLedgerID, 10000000); err != nil {
		t.Fatalf("设置本金失败: %v", err)
	}
	openTime := int64(1700006000)
	closeTime := int64(1700006100)
	if _, err := svc.CreateTrade(ws, testLedgerID, testCode, testName, models.StockTradeOpen, 1000, 5, openTime, ""); err != nil {
		t.Fatalf("建仓失败: %v", err)
	}
	if _, err := svc.CreateTrade(ws, testLedgerID, testCode, testName, models.StockTradeClose, 1100, 5, closeTime, ""); err != nil {
		t.Fatalf("清仓失败: %v", err)
	}
	before, err := svc.GetOverview(ws, testLedgerID)
	if err != nil {
		t.Fatalf("查询总览失败: %v", err)
	}
	trades, err := svc.ListTrades(ws, testLedgerID, testCode)
	if err != nil {
		t.Fatalf("查询交易失败: %v", err)
	}
	openTradeID := ""
	for i := range trades {
		if trades[i].TradeType == models.StockTradeOpen {
			openTradeID = trades[i].ID
			break
		}
	}
	if openTradeID == "" {
		t.Fatal("未找到建仓交易")
	}

	// 建仓手数 5 → 2，会使清仓 5 手超出持仓，整笔修改应回滚
	if _, err := svc.UpdateTrade(ws, testLedgerID, openTradeID, 1000, 2, openTime); err == nil {
		t.Fatal("卖出超过持仓的修改应报错")
	}
	after, err := svc.GetOverview(ws, testLedgerID)
	if err != nil {
		t.Fatalf("回滚后查询总览失败: %v", err)
	}
	if after.RealizedPnl != before.RealizedPnl || after.AvailableCash != before.AvailableCash {
		t.Fatalf("失败的修改不应影响账户: before=%+v after=%+v", before, after)
	}
	page, err := svc.ListFundRecords(ws, testLedgerID, 1, 10)
	if err != nil {
		t.Fatalf("查询资金记录失败: %v", err)
	}
	if page.Total != 2 {
		t.Fatalf("失败的修改不应留下资金记录, 实际 %d 条", page.Total)
	}
}

func TestUpdateTradeKeepsCurrentHoldingIntact(t *testing.T) {
	svc, ws := newStockService(t)

	if _, err := svc.SetPrincipal(ws, testLedgerID, 10000000); err != nil {
		t.Fatalf("设置本金失败: %v", err)
	}
	// 第 1 轮完成归档
	if _, err := svc.CreateTrade(ws, testLedgerID, testCode, testName, models.StockTradeOpen, 1000, 10, 1700007000, ""); err != nil {
		t.Fatalf("第一轮建仓失败: %v", err)
	}
	if _, err := svc.CreateTrade(ws, testLedgerID, testCode, testName, models.StockTradeClose, 1100, 10, 1700007100, ""); err != nil {
		t.Fatalf("第一轮清仓失败: %v", err)
	}
	firstTrades, err := svc.ListTrades(ws, testLedgerID, testCode)
	if err != nil {
		t.Fatalf("查询第一轮交易失败: %v", err)
	}
	firstOpenID := ""
	for i := range firstTrades {
		if firstTrades[i].TradeType == models.StockTradeOpen {
			firstOpenID = firstTrades[i].ID
			break
		}
	}
	if firstOpenID == "" {
		t.Fatal("未找到第一轮建仓交易")
	}
	// 第二轮在建持仓
	if _, err := svc.CreateTrade(ws, testLedgerID, testCode, testName, models.StockTradeOpen, 900, 20, 1700007200, ""); err != nil {
		t.Fatalf("第二轮建仓失败: %v", err)
	}

	positions, err := svc.ListPositions(ws, testLedgerID)
	if err != nil {
		t.Fatalf("查询持仓失败: %v", err)
	}
	if len(positions) != 1 || positions[0].Quantity != 2000 {
		t.Fatalf("持仓数量应为 2000, 实际 %+v", positions)
	}
	if _, err := svc.UpdateTrade(ws, testLedgerID, firstOpenID, 1050, 10, 1700007000); err != nil {
		t.Fatalf("修改历史轮次失败: %v", err)
	}
	positionsAfter, err := svc.ListPositions(ws, testLedgerID)
	if err != nil {
		t.Fatalf("修改后查询持仓失败: %v", err)
	}
	if len(positionsAfter) != 1 || positionsAfter[0].Quantity != 2000 {
		t.Fatalf("修改历史轮次不应影响在建持仓: %+v", positionsAfter)
	}
	history, err := svc.GetTradeHistorySummary(ws, testLedgerID)
	if err != nil {
		t.Fatalf("查询交易历史失败: %v", err)
	}
	if history.RoundCount != 1 {
		t.Fatalf("历史应保留 1 个已归档轮次, 实际 %d", history.RoundCount)
	}
}
