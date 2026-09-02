package service_test

import (
	"math"
	"testing"

	"github.com/transactions/dao"
	"github.com/transactions/models"
	"github.com/transactions/util"
	"github.com/transactions/workspace"
)

// seedCleanRound 直接写入一轮无费用的建仓/清仓，便于按期望值精确断言统计口径。
func seedCleanRound(t *testing.T, ws *workspace.Workspace, svcStockDao dao.StockDao,
	stockCode string, stockName string, openPrice int64, closePrice int64, lots int64, tradeTime int64) {
	t.Helper()
	writeLegacy := func(tradeType string, price int64) {
		t.Helper()
		trade := &models.StockTrade{
			ID:        util.GetUUID(),
			LedgerID:  testLedgerID,
			StockCode: stockCode,
			StockName: stockName,
			TradeType: tradeType,
			Price:     price,
			Lots:      lots,
			Shares:    lots * 100,
			Amount:    price * lots * 100,
			TradeTime: tradeTime,
		}
		if err := svcStockDao.CreateTrade(ws, trade); err != nil {
			t.Fatalf("写入交易失败: %v", err)
		}
	}
	writeLegacy(models.StockTradeOpen, openPrice)
	writeLegacy(models.StockTradeClose, closePrice)
}

func TestStatisticsStartsFromSecondSettlement(t *testing.T) {
	svc, ws := newStockService(t)
	stockDao := dao.NewStockDao()
	if _, err := svc.SetPrincipal(ws, testLedgerID, 10000000); err != nil {
		t.Fatalf("设置本金失败: %v", err)
	}

	// 第 1 笔（A 盈利 +100000）→ 第 2 笔（B 盈利 +50000）→ 第 3 笔（A 亏损 -80000）
	seedCleanRound(t, ws, stockDao, testCode, testName, 1000, 1100, 10, 1690000000)
	seedCleanRound(t, ws, stockDao, testCodeB, testNameB, 800, 850, 10, 1690001000)
	seedCleanRound(t, ws, stockDao, testCode, testName, 2000, 1920, 10, 1690002000)

	stats, err := svc.GetStatistics(ws, testLedgerID)
	if err != nil {
		t.Fatalf("查询交易统计失败: %v", err)
	}
	if stats.Principal != 10000000 {
		t.Fatalf("本金应为 10000000, 实际 %d", stats.Principal)
	}
	if stats.RoundCount != 3 {
		t.Fatalf("已结算笔数应为 3, 实际 %d", stats.RoundCount)
	}
	if len(stats.Points) != 2 {
		t.Fatalf("应从第 2 笔起生成 2 个统计点, 实际 %d", len(stats.Points))
	}

	p1 := stats.Points[0]
	if p1.Sequence != 2 || p1.StockCode != testCodeB || p1.ClosedAt != 1690001000 {
		t.Fatalf("第 2 笔统计点结算信息错误: %+v", p1)
	}
	if p1.Pnl != 50000 || p1.TotalPnl != 150000 {
		t.Fatalf("第 2 笔该笔/累计盈亏错误: %+v", p1)
	}
	if p1.WinCount != 2 || p1.LossCount != 0 || p1.WinRate != 100 {
		t.Fatalf("第 2 笔胜负/胜率错误: %+v", p1)
	}
	if p1.AvgWin != 75000 || p1.AvgLoss != 0 || p1.PnlRatio != nil {
		t.Fatalf("第 2 笔平均盈亏错误: %+v", p1)
	}
	if p1.Expectancy != 75000 || p1.MaxDrawdown != 0 || p1.MaxDrawdownPct != 0 {
		t.Fatalf("第 2 笔期望值/回撤错误: %+v", p1)
	}

	p2 := stats.Points[1]
	if p2.Sequence != 3 || p2.StockCode != testCode || p2.ClosedAt != 1690002000 {
		t.Fatalf("第 3 笔统计点结算信息错误: %+v", p2)
	}
	if p2.Pnl != -80000 || p2.TotalPnl != 70000 {
		t.Fatalf("第 3 笔该笔/累计盈亏错误: %+v", p2)
	}
	if p2.WinCount != 2 || p2.LossCount != 1 {
		t.Fatalf("第 3 笔胜负计数错误: %+v", p2)
	}
	if math.Abs(p2.WinRate-66.67) > 0.01 {
		t.Fatalf("第 3 笔胜率应为 66.67%%, 实际 %.2f", p2.WinRate)
	}
	if p2.AvgWin != 75000 || p2.AvgLoss != 80000 {
		t.Fatalf("第 3 笔平均盈亏错误: avgWin=%d avgLoss=%d", p2.AvgWin, p2.AvgLoss)
	}
	if p2.PnlRatio == nil || math.Abs(*p2.PnlRatio-0.9375) > 0.0001 {
		t.Fatalf("第 3 笔实际盈亏比应为 0.9375, 实际 %v", p2.PnlRatio)
	}
	if p2.Expectancy != 23333 {
		t.Fatalf("第 3 笔期望值应为 23333, 实际 %d", p2.Expectancy)
	}
	if p2.MaxDrawdown != 80000 || math.Abs(p2.MaxDrawdownPct-0.8) > 0.001 {
		t.Fatalf("第 3 笔最大回撤错误: %+v", p2)
	}
}

func TestStatisticsCountsBreakevenInTotal(t *testing.T) {
	svc, ws := newStockService(t)
	stockDao := dao.NewStockDao()
	if _, err := svc.SetPrincipal(ws, testLedgerID, 10000000); err != nil {
		t.Fatalf("设置本金失败: %v", err)
	}

	// 盈利 +100000 → 平局 0（计入总笔数） → 亏损 -60000
	seedCleanRound(t, ws, stockDao, testCode, testName, 1000, 1100, 10, 1690000000)
	seedCleanRound(t, ws, stockDao, testCodeB, testNameB, 1000, 1000, 10, 1690001000)
	seedCleanRound(t, ws, stockDao, testCode, testName, 1000, 940, 10, 1690002000)

	stats, err := svc.GetStatistics(ws, testLedgerID)
	if err != nil {
		t.Fatalf("查询交易统计失败: %v", err)
	}
	if stats.RoundCount != 3 || len(stats.Points) != 2 {
		t.Fatalf("统计点数量错误: %+v", stats)
	}

	p1 := stats.Points[0]
	if p1.WinCount != 1 || p1.LossCount != 0 || p1.WinRate != 50 {
		t.Fatalf("平局计入总笔数后第 2 笔胜率应为 50%%, 实际 %+v", p1)
	}
	if p1.AvgWin != 100000 || p1.Expectancy != 50000 {
		t.Fatalf("第 2 笔平均盈利/期望值错误: %+v", p1)
	}

	p2 := stats.Points[1]
	if p2.TotalPnl != 40000 || p2.WinCount != 1 || p2.LossCount != 1 {
		t.Fatalf("第 3 笔累计盈亏/胜负错误: %+v", p2)
	}
	if math.Abs(p2.WinRate-33.33) > 0.01 {
		t.Fatalf("第 3 笔胜率应为 33.33%%, 实际 %.2f", p2.WinRate)
	}
	if p2.AvgLoss != 60000 || p2.PnlRatio == nil || math.Abs(*p2.PnlRatio-1.6667) > 0.001 {
		t.Fatalf("第 3 笔平均亏损/盈亏比错误: %+v", p2)
	}
	if p2.Expectancy != 13333 {
		t.Fatalf("第 3 笔期望值应为 13333, 实际 %d", p2.Expectancy)
	}
	if p2.MaxDrawdown != 60000 || math.Abs(p2.MaxDrawdownPct-0.6) > 0.001 {
		t.Fatalf("第 3 笔最大回撤错误: %+v", p2)
	}
}

func TestStatisticsNeedsAtLeastTwoSettlements(t *testing.T) {
	svc, ws := newStockService(t)
	stockDao := dao.NewStockDao()

	empty, err := svc.GetStatistics(ws, testLedgerID)
	if err != nil {
		t.Fatalf("无交易时查询统计失败: %v", err)
	}
	if empty.RoundCount != 0 || len(empty.Points) != 0 {
		t.Fatalf("无交易时应返回空统计, 实际 %+v", empty)
	}

	seedCleanRound(t, ws, stockDao, testCode, testName, 1000, 1100, 10, 1690000000)
	one, err := svc.GetStatistics(ws, testLedgerID)
	if err != nil {
		t.Fatalf("单笔结算查询统计失败: %v", err)
	}
	if one.RoundCount != 1 || len(one.Points) != 0 {
		t.Fatalf("仅 1 笔结算时不应生成统计点, 实际 %+v", one)
	}
}
