package service_test

import (
	"testing"

	"github.com/transactions/dao"
	"github.com/transactions/models"
	"github.com/transactions/models/dto"
	"github.com/transactions/service"
	"github.com/transactions/workspace"
)

// stubQuoteFetcher 测试用行情源：只返回预设代码，模拟部分/全部获取失败。
type stubQuoteFetcher struct {
	quotes map[string]dto.StockQuoteDto
}

func (f stubQuoteFetcher) FetchQuotes(stockCodes []string) map[string]dto.StockQuoteDto {
	result := make(map[string]dto.StockQuoteDto)
	for _, code := range stockCodes {
		if quote, ok := f.quotes[code]; ok {
			result[code] = quote
		}
	}
	return result
}

func newStockServiceWithQuotes(t *testing.T, fetcher service.StockQuoteFetcher) (service.StockService, *workspace.Workspace) {
	t.Helper()
	ws, err := workspace.NewWorkspace(t.TempDir())
	if err != nil {
		t.Fatalf("创建工作空间失败: %v", err)
	}
	t.Cleanup(func() { ws.Close() })
	return service.NewStockService(dao.NewStockDao(), fetcher), ws
}

func openPosition(t *testing.T, svc service.StockService, ws *workspace.Workspace, code string, name string, priceCents int64, lots int64) {
	t.Helper()
	if _, err := svc.CreateTrade(ws, testLedgerID, code, name, models.StockTradeOpen, priceCents, lots, 1700004000, ""); err != nil {
		t.Fatalf("建仓 %s 失败: %v", code, err)
	}
}

func TestListPositionsAttachesQuotes(t *testing.T) {
	svc, ws := newStockServiceWithQuotes(t, stubQuoteFetcher{
		quotes: map[string]dto.StockQuoteDto{
			"600000": {StockCode: "600000", LatestPrice: 1100, PrevClose: 1050, QuoteTime: 12345},
		},
	})
	if _, err := svc.SetPrincipal(ws, testLedgerID, 10000000); err != nil {
		t.Fatalf("设置本金失败: %v", err)
	}
	openPosition(t, svc, ws, testCode, testName, 1000, 10)

	items, err := svc.ListPositions(ws, testLedgerID)
	if err != nil {
		t.Fatalf("查询持仓失败: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("应返回 1 条持仓, 实际 %d", len(items))
	}
	item := items[0]
	if item.LatestPrice == nil || *item.LatestPrice != 1100 {
		t.Fatalf("最新价未附加: %+v", item)
	}
	if item.PrevClose == nil || *item.PrevClose != 1050 {
		t.Fatalf("昨收价未附加: %+v", item)
	}
	if item.QuoteTime == nil || *item.QuoteTime != 12345 {
		t.Fatalf("行情时间未附加: %+v", item)
	}
}

func TestGetOverviewIncludesMarketValueAndUnrealized(t *testing.T) {
	svc, ws := newStockServiceWithQuotes(t, stubQuoteFetcher{
		quotes: map[string]dto.StockQuoteDto{
			"600000": {StockCode: "600000", LatestPrice: 1100, PrevClose: 1050, QuoteTime: 12345},
		},
	})
	if _, err := svc.SetPrincipal(ws, testLedgerID, 10000000); err != nil {
		t.Fatalf("设置本金失败: %v", err)
	}
	// 建仓 10 手 @ 10.00：成本 = 1000000 + 佣金 500 + 过户费 10 = 1000510
	openPosition(t, svc, ws, testCode, testName, 1000, 10)

	overview, err := svc.GetOverview(ws, testLedgerID)
	if err != nil {
		t.Fatalf("查询总览失败: %v", err)
	}
	if overview.AvailableCash != 10000000-1000510 {
		t.Fatalf("可用现金错误: %d", overview.AvailableCash)
	}
	if overview.PositionMarketValue != 1100*1000 {
		t.Fatalf("持仓市值错误: %d", overview.PositionMarketValue)
	}
	if overview.UnrealizedPnl != 1100*1000-1000510 {
		t.Fatalf("浮动盈亏错误: %d", overview.UnrealizedPnl)
	}
	if overview.TotalAssets != overview.AvailableCash+overview.PositionMarketValue {
		t.Fatalf("总资产应等于现金+市值: %d", overview.TotalAssets)
	}
	if overview.QuoteFailedCount != 0 {
		t.Fatalf("不应有失败持仓: %d", overview.QuoteFailedCount)
	}
}

func TestGetOverviewFallsBackToCostWhenQuoteMissing(t *testing.T) {
	svc, ws := newStockServiceWithQuotes(t, stubQuoteFetcher{})
	if _, err := svc.SetPrincipal(ws, testLedgerID, 10000000); err != nil {
		t.Fatalf("设置本金失败: %v", err)
	}
	openPosition(t, svc, ws, testCode, testName, 1000, 10)

	overview, err := svc.GetOverview(ws, testLedgerID)
	if err != nil {
		t.Fatalf("查询总览失败: %v", err)
	}
	if overview.QuoteFailedCount != 1 {
		t.Fatalf("应记录 1 只行情失败, 实际 %d", overview.QuoteFailedCount)
	}
	if overview.PositionMarketValue != 1000510 {
		t.Fatalf("行情缺失应按成本计入市值: %d", overview.PositionMarketValue)
	}
	if overview.UnrealizedPnl != 0 {
		t.Fatalf("行情缺失时浮动盈亏应为 0: %d", overview.UnrealizedPnl)
	}
	if overview.TotalAssets != 10000000 {
		t.Fatalf("全部缺失时总资产应保持原口径 10000000, 实际 %d", overview.TotalAssets)
	}
}

func TestGetOverviewPartialQuoteFailure(t *testing.T) {
	svc, ws := newStockServiceWithQuotes(t, stubQuoteFetcher{
		quotes: map[string]dto.StockQuoteDto{
			"600000": {StockCode: "600000", LatestPrice: 1100, PrevClose: 1050, QuoteTime: 12345},
		},
	})
	if _, err := svc.SetPrincipal(ws, testLedgerID, 10000000); err != nil {
		t.Fatalf("设置本金失败: %v", err)
	}
	openPosition(t, svc, ws, testCode, testName, 1000, 10)  // 600000
	openPosition(t, svc, ws, testCodeB, testNameB, 2000, 5) // 000001 无行情

	positions, err := svc.ListPositions(ws, testLedgerID)
	if err != nil {
		t.Fatalf("查询持仓失败: %v", err)
	}
	var cost600, cost000, qty600 int64
	for _, p := range positions {
		if p.StockCode == testCode {
			cost600 = p.TotalCost
			qty600 = p.Quantity
		} else {
			cost000 = p.TotalCost
		}
	}

	overview, err := svc.GetOverview(ws, testLedgerID)
	if err != nil {
		t.Fatalf("查询总览失败: %v", err)
	}
	if overview.QuoteFailedCount != 1 {
		t.Fatalf("应记录 1 只行情失败, 实际 %d", overview.QuoteFailedCount)
	}
	wantMarket := 1100*qty600 + cost000
	if overview.PositionMarketValue != wantMarket {
		t.Fatalf("持仓市值错误: 期望 %d, 实际 %d", wantMarket, overview.PositionMarketValue)
	}
	if overview.UnrealizedPnl != 1100*qty600-cost600 {
		t.Fatalf("浮动盈亏错误: %d", overview.UnrealizedPnl)
	}
	if overview.TotalAssets != overview.AvailableCash+overview.PositionMarketValue {
		t.Fatalf("总资产应等于现金+市值: %d", overview.TotalAssets)
	}
}
