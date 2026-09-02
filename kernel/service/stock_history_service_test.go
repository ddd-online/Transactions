package service_test

import (
	"testing"

	"github.com/transactions/dao"
	"github.com/transactions/models"
	"github.com/transactions/service"
	"github.com/transactions/util"
	"github.com/transactions/workspace"
)

const (
	testLedgerID = "ledger-history"
	testCode     = "600000"
	testName     = "浦发银行"
	testCodeB    = "000001"
	testNameB    = "平安银行"
)

func newStockService(t *testing.T) (service.StockService, *workspace.Workspace) {
	t.Helper()
	ws, err := workspace.NewWorkspace(t.TempDir())
	if err != nil {
		t.Fatalf("创建工作空间失败: %v", err)
	}
	t.Cleanup(func() { ws.Close() })
	return service.NewStockService(dao.NewStockDao()), ws
}

func TestCloseArchivesRoundWithAllTrades(t *testing.T) {
	svc, ws := newStockService(t)

	// 建仓 100 手 → 加仓 100 手 → 减仓 100 手 → 清仓 100 手
	if _, err := svc.CreateTrade(ws, testLedgerID, testCode, testName, models.StockTradeOpen, 1000, 100, 1700000000, ""); err != nil {
		t.Fatalf("建仓失败: %v", err)
	}
	if _, err := svc.CreateTrade(ws, testLedgerID, testCode, testName, models.StockTradeAdd, 1100, 100, 1700000100, ""); err != nil {
		t.Fatalf("加仓失败: %v", err)
	}
	if _, err := svc.CreateTrade(ws, testLedgerID, testCode, testName, models.StockTradeReduce, 1200, 100, 1700000200, ""); err != nil {
		t.Fatalf("减仓失败: %v", err)
	}
	closeTime := int64(1700000300)
	if _, err := svc.CreateTrade(ws, testLedgerID, testCode, testName, models.StockTradeClose, 1250, 100, closeTime, ""); err != nil {
		t.Fatalf("清仓失败: %v", err)
	}

	histories, err := svc.ListTradeHistories(ws, testLedgerID)
	if err != nil {
		t.Fatalf("查询交易历史失败: %v", err)
	}
	if len(histories) != 1 {
		t.Fatalf("应只有 1 个股票历史集合, 实际 %d", len(histories))
	}
	h := histories[0]
	if h.StockCode != testCode || h.StockName != testName {
		t.Fatalf("历史集合股票信息错误: %+v", h)
	}
	if h.RoundCount != 1 {
		t.Fatalf("轮次数应为 1, 实际 %d", h.RoundCount)
	}
	if h.LastClosedAt != closeTime {
		t.Fatalf("最近清仓时间错误: 期望 %d, 实际 %d", closeTime, h.LastClosedAt)
	}

	detail, err := svc.GetTradeHistoryDetail(ws, testLedgerID, testCode)
	if err != nil {
		t.Fatalf("查询历史详情失败: %v", err)
	}
	if len(detail.Rounds) != 1 {
		t.Fatalf("详情轮次数应为 1, 实际 %d", len(detail.Rounds))
	}
	round := detail.Rounds[0]
	if round.RoundNo != 1 || round.OpenedAt != 1700000000 || round.ClosedAt != closeTime {
		t.Fatalf("轮次时间信息错误: %+v", round)
	}
	if len(round.Trades) != 4 {
		t.Fatalf("本轮应包含建仓到清仓共 4 笔交易, 实际 %d", len(round.Trades))
	}
	types := []string{models.StockTradeOpen, models.StockTradeAdd, models.StockTradeReduce, models.StockTradeClose}
	for i, want := range types {
		if round.Trades[i].TradeType != want {
			t.Fatalf("第 %d 笔交易类型应为 %s, 实际 %s", i, want, round.Trades[i].TradeType)
		}
		if round.Trades[i].RoundID == "" || round.Trades[i].RoundID != round.ID {
			t.Fatalf("第 %d 笔交易未挂接到轮次", i)
		}
	}
	// 金额较大时佣金按费率而非最低佣金计算：
	// 买入成本 = (10000000+2454) + (11000000+2699) = 21005153
	// 卖出净额 = (12000000-8945) + (12500000-9318) = 24481737
	wantPnl := int64(24481737 - 21005153)
	if round.Pnl != wantPnl {
		t.Fatalf("本轮盈亏应为 %d, 实际 %d", wantPnl, round.Pnl)
	}
	if detail.TotalPnl != wantPnl {
		t.Fatalf("该股总盈亏应为 %d, 实际 %d", wantPnl, detail.TotalPnl)
	}
	if round.PnlRate <= 16 || round.PnlRate >= 17 {
		t.Fatalf("本轮盈亏率应在 16%% 到 17%% 之间, 实际 %.2f", round.PnlRate)
	}
	if detail.WinCount != 1 || detail.LossCount != 0 {
		t.Fatalf("胜负计数错误: win=%d loss=%d", detail.WinCount, detail.LossCount)
	}
}

func TestMultipleRoundsReuseOneHistory(t *testing.T) {
	svc, ws := newStockService(t)

	// 第一轮：盈利
	if _, err := svc.CreateTrade(ws, testLedgerID, testCode, testName, models.StockTradeOpen, 1000, 10, 1700001000, ""); err != nil {
		t.Fatalf("第一轮建仓失败: %v", err)
	}
	if _, err := svc.CreateTrade(ws, testLedgerID, testCode, testName, models.StockTradeClose, 1100, 10, 1700001100, ""); err != nil {
		t.Fatalf("第一轮清仓失败: %v", err)
	}
	// 第二轮：亏损
	if _, err := svc.CreateTrade(ws, testLedgerID, testCode, testName, models.StockTradeOpen, 2000, 10, 1700001200, ""); err != nil {
		t.Fatalf("第二轮建仓失败: %v", err)
	}
	if _, err := svc.CreateTrade(ws, testLedgerID, testCode, testName, models.StockTradeClose, 1900, 10, 1700001300, ""); err != nil {
		t.Fatalf("第二轮清仓失败: %v", err)
	}

	histories, err := svc.ListTradeHistories(ws, testLedgerID)
	if err != nil {
		t.Fatalf("查询交易历史失败: %v", err)
	}
	if len(histories) != 1 {
		t.Fatalf("多次交易应复用同一个历史集合, 实际 %d 个", len(histories))
	}
	if histories[0].RoundCount != 2 {
		t.Fatalf("轮次数应为 2, 实际 %d", histories[0].RoundCount)
	}
	if histories[0].LastClosedAt != 1700001300 {
		t.Fatalf("最近清仓时间应为第二轮清仓, 实际 %d", histories[0].LastClosedAt)
	}

	detail, err := svc.GetTradeHistoryDetail(ws, testLedgerID, testCode)
	if err != nil {
		t.Fatalf("查询历史详情失败: %v", err)
	}
	if len(detail.Rounds) != 2 {
		t.Fatalf("详情轮次应为 2, 实际 %d", len(detail.Rounds))
	}
	if detail.Rounds[0].RoundNo != 1 || detail.Rounds[1].RoundNo != 2 {
		t.Fatalf("轮次序号错误: %+v", detail.Rounds)
	}
	if detail.Rounds[0].Pnl <= 0 || detail.Rounds[1].Pnl >= 0 {
		t.Fatalf("胜负判定错误: 第一轮 %d, 第二轮 %d", detail.Rounds[0].Pnl, detail.Rounds[1].Pnl)
	}
	if detail.WinCount != 1 || detail.LossCount != 1 {
		t.Fatalf("胜负计数错误: win=%d loss=%d", detail.WinCount, detail.LossCount)
	}
	if detail.TotalPnl != detail.Rounds[0].Pnl+detail.Rounds[1].Pnl {
		t.Fatalf("总盈亏应等于两轮之和, 实际 %d", detail.TotalPnl)
	}
}

func TestHistoryBackfillForLegacyTrades(t *testing.T) {
	svc, ws := newStockService(t)
	stockDao := dao.NewStockDao()

	// 模拟功能上线前的存量交易：两轮完整轮次，round_id 均为空
	createLegacy := func(tradeType string, price int64, lots int64, tradeTime int64, fee int64) {
		t.Helper()
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
			Fee:       fee,
			TradeTime: tradeTime,
		}
		if err := stockDao.CreateTrade(ws, trade); err != nil {
			t.Fatalf("写入存量交易失败: %v", err)
		}
	}
	createLegacy(models.StockTradeOpen, 1000, 10, 1690000000, 500)
	createLegacy(models.StockTradeClose, 1200, 10, 1690000100, 600)
	createLegacy(models.StockTradeOpen, 900, 10, 1690000200, 500)
	createLegacy(models.StockTradeClose, 800, 10, 1690000300, 600)

	histories, err := svc.ListTradeHistories(ws, testLedgerID)
	if err != nil {
		t.Fatalf("查询交易历史失败（应触发回填）: %v", err)
	}
	if len(histories) != 1 {
		t.Fatalf("存量交易应回填出 1 个历史集合, 实际 %d", len(histories))
	}
	if histories[0].RoundCount != 2 {
		t.Fatalf("存量交易应回填出 2 个轮次, 实际 %d", histories[0].RoundCount)
	}

	detail, err := svc.GetTradeHistoryDetail(ws, testLedgerID, testCode)
	if err != nil {
		t.Fatalf("查询历史详情失败: %v", err)
	}
	if len(detail.Rounds) != 2 {
		t.Fatalf("详情轮次应为 2, 实际 %d", len(detail.Rounds))
	}
	// 第一轮盈利（买10卖12），第二轮亏损（买9卖8）
	if detail.Rounds[0].Pnl <= 0 || detail.Rounds[1].Pnl >= 0 {
		t.Fatalf("存量轮次盈亏判定错误: %+v", detail.Rounds)
	}
	for _, round := range detail.Rounds {
		if len(round.Trades) != 2 {
			t.Fatalf("每轮应包含建仓与清仓 2 笔, 实际 %d", len(round.Trades))
		}
		for _, tr := range round.Trades {
			if tr.RoundID != round.ID {
				t.Fatalf("回填后交易未挂接轮次: %+v", tr)
			}
		}
	}
	// 再次查询应幂等，不重复建轮次
	historiesAgain, err := svc.ListTradeHistories(ws, testLedgerID)
	if err != nil {
		t.Fatalf("再次查询失败: %v", err)
	}
	if historiesAgain[0].RoundCount != 2 {
		t.Fatalf("回填应幂等, 实际轮次数 %d", historiesAgain[0].RoundCount)
	}
}

func TestIncompleteRoundNotArchived(t *testing.T) {
	svc, ws := newStockService(t)

	// 只有建仓 + 加仓，未清仓：不应出现在交易历史
	if _, err := svc.CreateTrade(ws, testLedgerID, testCode, testName, models.StockTradeOpen, 1000, 10, 1690000000, ""); err != nil {
		t.Fatalf("建仓失败: %v", err)
	}
	if _, err := svc.CreateTrade(ws, testLedgerID, testCode, testName, models.StockTradeAdd, 1100, 10, 1690000100, ""); err != nil {
		t.Fatalf("加仓失败: %v", err)
	}

	histories, err := svc.ListTradeHistories(ws, testLedgerID)
	if err != nil {
		t.Fatalf("查询交易历史失败: %v", err)
	}
	if len(histories) != 0 {
		t.Fatalf("在建持仓不应进入交易历史, 实际 %d 个集合", len(histories))
	}

	// 随后清仓：本轮从第一次建仓开始完整归档
	if _, err := svc.CreateTrade(ws, testLedgerID, testCode, testName, models.StockTradeClose, 1200, 20, 1690000200, ""); err != nil {
		t.Fatalf("清仓失败: %v", err)
	}
	detail, err := svc.GetTradeHistoryDetail(ws, testLedgerID, testCode)
	if err != nil {
		t.Fatalf("查询历史详情失败: %v", err)
	}
	if len(detail.Rounds) != 1 || len(detail.Rounds[0].Trades) != 3 {
		t.Fatalf("清仓后应归档 1 轮共 3 笔交易, 实际 %+v", detail.Rounds)
	}
	if detail.Rounds[0].OpenedAt != 1690000000 {
		t.Fatalf("轮次开始时间应为首次建仓, 实际 %d", detail.Rounds[0].OpenedAt)
	}
}

func TestListTradesForHeldStockOnlyCurrentRound(t *testing.T) {
	svc, ws := newStockService(t)

	// 第一轮：建仓 → 清仓（历史轮次）
	if _, err := svc.CreateTrade(ws, testLedgerID, testCode, testName, models.StockTradeOpen, 1000, 10, 1690001000, ""); err != nil {
		t.Fatalf("第一轮建仓失败: %v", err)
	}
	if _, err := svc.CreateTrade(ws, testLedgerID, testCode, testName, models.StockTradeClose, 1200, 10, 1690001100, ""); err != nil {
		t.Fatalf("第一轮清仓失败: %v", err)
	}
	// 第二轮：再次建仓 + 加仓（当前持仓）
	if _, err := svc.CreateTrade(ws, testLedgerID, testCode, testName, models.StockTradeOpen, 1100, 10, 1690001200, ""); err != nil {
		t.Fatalf("第二轮建仓失败: %v", err)
	}
	if _, err := svc.CreateTrade(ws, testLedgerID, testCode, testName, models.StockTradeAdd, 1150, 10, 1690001300, ""); err != nil {
		t.Fatalf("第二轮加仓失败: %v", err)
	}

	// 持仓中：只返回本轮交易，历史轮次被排除
	trades, err := svc.ListTrades(ws, testLedgerID, testCode)
	if err != nil {
		t.Fatalf("查询持仓交易失败: %v", err)
	}
	if len(trades) != 2 {
		t.Fatalf("持仓中应只返回本轮 2 笔交易, 实际 %d", len(trades))
	}
	if trades[0].TradeType != models.StockTradeAdd || trades[1].TradeType != models.StockTradeOpen {
		t.Fatalf("本轮交易应按时间倒序返回加仓、建仓, 实际 %+v", trades)
	}
	for i := range trades {
		if trades[i].RoundID != "" {
			t.Fatalf("在建轮次交易不应挂接历史轮次, 实际 %+v", trades[i])
		}
	}

	// 清仓后再查：保留查看该股完整交易记录的行为
	if _, err := svc.CreateTrade(ws, testLedgerID, testCode, testName, models.StockTradeClose, 1300, 20, 1690001400, ""); err != nil {
		t.Fatalf("第二轮清仓失败: %v", err)
	}
	all, err := svc.ListTrades(ws, testLedgerID, testCode)
	if err != nil {
		t.Fatalf("查询全部交易失败: %v", err)
	}
	if len(all) != 5 {
		t.Fatalf("清仓后应返回全部 5 笔交易, 实际 %d", len(all))
	}
}

func TestTradeHistorySummaryAcrossStocks(t *testing.T) {
	svc, ws := newStockService(t)

	// 股票 A：第一轮盈利，第二轮亏损
	if _, err := svc.CreateTrade(ws, testLedgerID, testCode, testName, models.StockTradeOpen, 1000, 10, 1690002000, ""); err != nil {
		t.Fatalf("A 第一轮建仓失败: %v", err)
	}
	if _, err := svc.CreateTrade(ws, testLedgerID, testCode, testName, models.StockTradeClose, 1200, 10, 1690002100, ""); err != nil {
		t.Fatalf("A 第一轮清仓失败: %v", err)
	}
	if _, err := svc.CreateTrade(ws, testLedgerID, testCode, testName, models.StockTradeOpen, 2000, 10, 1690002200, ""); err != nil {
		t.Fatalf("A 第二轮建仓失败: %v", err)
	}
	if _, err := svc.CreateTrade(ws, testLedgerID, testCode, testName, models.StockTradeClose, 1800, 10, 1690002300, ""); err != nil {
		t.Fatalf("A 第二轮清仓失败: %v", err)
	}
	// 股票 B：一轮盈利
	if _, err := svc.CreateTrade(ws, testLedgerID, testCodeB, testNameB, models.StockTradeOpen, 500, 5, 1690002400, ""); err != nil {
		t.Fatalf("B 建仓失败: %v", err)
	}
	if _, err := svc.CreateTrade(ws, testLedgerID, testCodeB, testNameB, models.StockTradeClose, 550, 5, 1690002500, ""); err != nil {
		t.Fatalf("B 清仓失败: %v", err)
	}

	summary, err := svc.GetTradeHistorySummary(ws, testLedgerID)
	if err != nil {
		t.Fatalf("查询交易历史总览失败: %v", err)
	}
	if summary.StockCount != 2 {
		t.Fatalf("股票数应为 2, 实际 %d", summary.StockCount)
	}
	if summary.RoundCount != 3 {
		t.Fatalf("总轮次应为 3, 实际 %d", summary.RoundCount)
	}
	if summary.WinCount != 2 || summary.LossCount != 1 {
		t.Fatalf("胜负轮次应为 2 胜 1 负, 实际 %d 胜 %d 负", summary.WinCount, summary.LossCount)
	}

	// 总盈亏 = 各股票详情轮次盈亏之和
	var wantPnl int64
	for _, code := range []string{testCode, testCodeB} {
		detail, err := svc.GetTradeHistoryDetail(ws, testLedgerID, code)
		if err != nil {
			t.Fatalf("查询 %s 详情失败: %v", code, err)
		}
		for _, round := range detail.Rounds {
			wantPnl += round.Pnl
		}
	}
	if summary.TotalPnl != wantPnl {
		t.Fatalf("总盈亏应为 %d, 实际 %d", wantPnl, summary.TotalPnl)
	}
	if summary.TotalPnlRate <= 0 {
		t.Fatalf("整体盈利时总盈亏率应大于 0, 实际 %.2f", summary.TotalPnlRate)
	}
}
