package service_test

import (
	"math"
	"testing"
	"time"

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

func TestStatisticsStartsFromFirstSettlement(t *testing.T) {
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
	if len(stats.Points) != 3 {
		t.Fatalf("应自第 1 笔起生成 3 个统计点, 实际 %d", len(stats.Points))
	}

	p1 := stats.Points[0]
	if p1.Sequence != 1 || p1.StockCode != testCode || p1.ClosedAt != 1690000000 {
		t.Fatalf("第 1 笔统计点结算信息错误: %+v", p1)
	}
	if p1.Pnl != 100000 || p1.TotalPnl != 100000 {
		t.Fatalf("第 1 笔该笔/累计盈亏错误: %+v", p1)
	}
	if p1.WinCount != 1 || p1.LossCount != 0 || p1.WinRate != 100 {
		t.Fatalf("第 1 笔胜负/胜率错误: %+v", p1)
	}
	if p1.AvgWin != 100000 || p1.AvgLoss != 0 || p1.PnlRatio != nil {
		t.Fatalf("第 1 笔平均盈亏错误: %+v", p1)
	}
	if p1.Expectancy != 100000 || p1.MaxDrawdown != 0 || p1.MaxDrawdownPct != 0 {
		t.Fatalf("第 1 笔期望值/回撤错误: %+v", p1)
	}

	p2 := stats.Points[1]
	if p2.Sequence != 2 || p2.StockCode != testCodeB || p2.ClosedAt != 1690001000 {
		t.Fatalf("第 2 笔统计点结算信息错误: %+v", p2)
	}
	if p2.Pnl != 50000 || p2.TotalPnl != 150000 {
		t.Fatalf("第 2 笔该笔/累计盈亏错误: %+v", p2)
	}
	if p2.WinCount != 2 || p2.LossCount != 0 || p2.WinRate != 100 {
		t.Fatalf("第 2 笔胜负/胜率错误: %+v", p2)
	}
	if p2.AvgWin != 75000 || p2.AvgLoss != 0 || p2.PnlRatio != nil {
		t.Fatalf("第 2 笔平均盈亏错误: %+v", p2)
	}
	if p2.Expectancy != 75000 || p2.MaxDrawdown != 0 || p2.MaxDrawdownPct != 0 {
		t.Fatalf("第 2 笔期望值/回撤错误: %+v", p2)
	}

	p3 := stats.Points[2]
	if p3.Sequence != 3 || p3.StockCode != testCode || p3.ClosedAt != 1690002000 {
		t.Fatalf("第 3 笔统计点结算信息错误: %+v", p3)
	}
	if p3.Pnl != -80000 || p3.TotalPnl != 70000 {
		t.Fatalf("第 3 笔该笔/累计盈亏错误: %+v", p3)
	}
	if p3.WinCount != 2 || p3.LossCount != 1 {
		t.Fatalf("第 3 笔胜负计数错误: %+v", p3)
	}
	if math.Abs(p3.WinRate-66.67) > 0.01 {
		t.Fatalf("第 3 笔胜率应为 66.67%%, 实际 %.2f", p3.WinRate)
	}
	if p3.AvgWin != 75000 || p3.AvgLoss != 80000 {
		t.Fatalf("第 3 笔平均盈亏错误: avgWin=%d avgLoss=%d", p3.AvgWin, p3.AvgLoss)
	}
	if p3.PnlRatio == nil || math.Abs(*p3.PnlRatio-0.9375) > 0.0001 {
		t.Fatalf("第 3 笔实际盈亏比应为 0.9375, 实际 %v", p3.PnlRatio)
	}
	if p3.Expectancy != 23333 {
		t.Fatalf("第 3 笔期望值应为 23333, 实际 %d", p3.Expectancy)
	}
	if p3.MaxDrawdown != 80000 || math.Abs(p3.MaxDrawdownPct-0.8) > 0.001 {
		t.Fatalf("第 3 笔最大回撤错误: %+v", p3)
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
	if stats.RoundCount != 3 || len(stats.Points) != 3 {
		t.Fatalf("统计点数量错误: %+v", stats)
	}

	p1 := stats.Points[0]
	if p1.WinCount != 1 || p1.LossCount != 0 || p1.WinRate != 100 {
		t.Fatalf("第 1 笔胜率应为 100%%, 实际 %+v", p1)
	}
	if p1.AvgWin != 100000 || p1.Expectancy != 100000 {
		t.Fatalf("第 1 笔平均盈利/期望值错误: %+v", p1)
	}

	p2 := stats.Points[1]
	if p2.Sequence != 2 || p2.TotalPnl != 100000 || p2.WinCount != 1 || p2.LossCount != 0 {
		t.Fatalf("平局计入总笔数后第 2 笔累计盈亏/胜负错误: %+v", p2)
	}
	if math.Abs(p2.WinRate-50) > 0.01 {
		t.Fatalf("第 2 笔胜率应为 50%%, 实际 %.2f", p2.WinRate)
	}
	if p2.AvgWin != 100000 || p2.Expectancy != 50000 {
		t.Fatalf("第 2 笔平均盈利/期望值错误: %+v", p2)
	}

	p3 := stats.Points[2]
	if p3.TotalPnl != 40000 || p3.WinCount != 1 || p3.LossCount != 1 {
		t.Fatalf("第 3 笔累计盈亏/胜负错误: %+v", p3)
	}
	if math.Abs(p3.WinRate-33.33) > 0.01 {
		t.Fatalf("第 3 笔胜率应为 33.33%%, 实际 %.2f", p3.WinRate)
	}
	if p3.AvgLoss != 60000 || p3.PnlRatio == nil || math.Abs(*p3.PnlRatio-1.6667) > 0.001 {
		t.Fatalf("第 3 笔平均亏损/盈亏比错误: %+v", p3)
	}
	if p3.Expectancy != 13333 {
		t.Fatalf("第 3 笔期望值应为 13333, 实际 %d", p3.Expectancy)
	}
	if p3.MaxDrawdown != 60000 || math.Abs(p3.MaxDrawdownPct-0.6) > 0.001 {
		t.Fatalf("第 3 笔最大回撤错误: %+v", p3)
	}
}

func TestStatisticsNeedsAtLeastOneSettlement(t *testing.T) {
	svc, ws := newStockService(t)
	stockDao := dao.NewStockDao()

	empty, err := svc.GetStatistics(ws, testLedgerID)
	if err != nil {
		t.Fatalf("无交易时查询统计失败: %v", err)
	}
	if empty.RoundCount != 0 || len(empty.Points) != 0 {
		t.Fatalf("无交易时应返回空统计, 实际 %+v", empty)
	}

	if _, err := svc.SetPrincipal(ws, testLedgerID, 10000000); err != nil {
		t.Fatalf("设置本金失败: %v", err)
	}
	seedCleanRound(t, ws, stockDao, testCode, testName, 1000, 1100, 10, 1690000000)
	one, err := svc.GetStatistics(ws, testLedgerID)
	if err != nil {
		t.Fatalf("单笔结算查询统计失败: %v", err)
	}
	if one.RoundCount != 1 || len(one.Points) != 1 {
		t.Fatalf("仅 1 笔结算时应生成 1 个统计点, 实际 %+v", one)
	}
	p := one.Points[0]
	if p.Sequence != 1 || p.TotalPnl != 100000 || p.WinRate != 100 || p.AvgWin != 100000 {
		t.Fatalf("第 1 笔统计点数值错误: %+v", p)
	}
}

func TestStatisticsDrawdownUsesPrincipalAtSettlement(t *testing.T) {
	svc, ws := newStockService(t)
	stockDao := dao.NewStockDao()
	if _, err := svc.SetPrincipal(ws, testLedgerID, 10000000); err != nil {
		t.Fatalf("设置本金失败: %v", err)
	}

	writeRound := func(openPrice int64, closePrice int64, lots int64, closeAt time.Time) {
		t.Helper()
		openAt := closeAt.Add(-time.Minute)
		writeTrade := func(tradeType string, price int64, ts time.Time) {
			trade := &models.StockTrade{
				ID:        util.GetUUID(),
				LedgerID:  testLedgerID,
				StockCode: testCode,
				StockName: testName,
				TradeType: tradeType,
				Price:     price,
				Lots:      lots,
				Shares:    lots * 100,
				Amount:    price * lots * 100,
				TradeTime: ts.Unix(),
			}
			if err := stockDao.CreateTrade(ws, trade); err != nil {
				t.Fatalf("写入交易失败: %v", err)
			}
		}
		writeTrade(models.StockTradeOpen, openPrice, openAt)
		writeTrade(models.StockTradeClose, closePrice, closeAt)
	}

	// 第 1 笔盈利 +100000（2023-07-22）
	writeRound(1000, 1100, 10, time.Date(2023, 7, 22, 12, 0, 0, 0, time.UTC))
	// 第 2 笔前追加本金 5,000,000（本金 10,000,000 → 15,000,000）
	if err := stockDao.UpdateAccountPrincipal(ws, testLedgerID, 15000000); err != nil {
		t.Fatalf("更新本金失败: %v", err)
	}
	addRecord := &models.StockFundRecord{
		ID:           util.GetUUID(),
		LedgerID:     testLedgerID,
		RecordDate:   "2023-07-25",
		EventType:    models.StockEventAddPrincipal,
		EventText:    "追加本金",
		AmountChange: 5000000,
		CashBalance:  15000000,
	}
	if err := stockDao.CreateFundRecord(ws, addRecord); err != nil {
		t.Fatalf("写入追加本金记录失败: %v", err)
	}
	// 第 2 笔亏损 -200000（2023-07-28）
	writeRound(2000, 1800, 10, time.Date(2023, 7, 28, 12, 0, 0, 0, time.UTC))
	// 第 3 笔前支取 1,000,000（2023-07-29，本金不变）
	withdrawRecord := &models.StockFundRecord{
		ID:           util.GetUUID(),
		LedgerID:     testLedgerID,
		RecordDate:   "2023-07-29",
		EventType:    models.StockEventWithdraw,
		EventText:    "支取",
		AmountChange: -1000000,
		CashBalance:  0,
	}
	if err := stockDao.CreateFundRecord(ws, withdrawRecord); err != nil {
		t.Fatalf("写入支取记录失败: %v", err)
	}
	// 第 3 笔盈利 +300000（2023-08-01）
	writeRound(1000, 1300, 10, time.Date(2023, 8, 1, 12, 0, 0, 0, time.UTC))

	stats, err := svc.GetStatistics(ws, testLedgerID)
	if err != nil {
		t.Fatalf("查询交易统计失败: %v", err)
	}
	if len(stats.Points) != 3 {
		t.Fatalf("统计点数量应为 3, 实际 %d", len(stats.Points))
	}
	if stats.Principal != 15000000 {
		t.Fatalf("当前本金应为 15000000, 实际 %d", stats.Principal)
	}

	p1 := stats.Points[0]
	if p1.MaxDrawdown != 0 || p1.MaxDrawdownPct != 0 {
		t.Fatalf("第 1 笔不应有回撤: %+v", p1)
	}
	p2 := stats.Points[1]
	// 追加后当时本金 15,000,000；峰值总资产 15,100,000，回撤 200,000 → 1.33%
	if p2.MaxDrawdown != 200000 {
		t.Fatalf("第 2 笔最大回撤应为 200000, 实际 %d", p2.MaxDrawdown)
	}
	if math.Abs(p2.MaxDrawdownPct-1.33) > 0.01 {
		t.Fatalf("第 2 笔占当时本金回撤应为 1.33%%, 实际 %.2f", p2.MaxDrawdownPct)
	}
	p3 := stats.Points[2]
	// 支取 1,000,000 计入总资产曲线：峰值 15,100,000 → 支取后 13,900,000 回撤 1,200,000，
	// 第 3 笔盈利后回升到 14,200,000，历史最大回撤仍为 1,200,000 → 占当时本金 15,000,000 的 8%
	if p3.MaxDrawdown != 1200000 {
		t.Fatalf("第 3 笔最大回撤应为 1200000, 实际 %d", p3.MaxDrawdown)
	}
	if math.Abs(p3.MaxDrawdownPct-8) > 0.01 {
		t.Fatalf("第 3 笔占当时本金回撤应为 8%%, 实际 %.2f", p3.MaxDrawdownPct)
	}
}
