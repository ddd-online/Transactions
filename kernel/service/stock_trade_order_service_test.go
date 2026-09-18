package service_test

import (
	"testing"

	"github.com/transactions/models"
	"github.com/transactions/models/dto"
	"github.com/transactions/service"
	"github.com/transactions/workspace"
)

const (
	testOrderCode = "605258"
	testOrderName = "协和电子"
)

// createXieheOrder 建仓 200 股 @38.06，并用同一委托卖出 100@36.67 + 100@36.61。
func createXieheOrder(t *testing.T, svc service.StockService, ws *workspace.Workspace) []dto.StockTradeDto {
	t.Helper()
	if _, err := svc.SetPrincipal(ws, testLedgerID, 10000000); err != nil {
		t.Fatalf("设置本金失败: %v", err)
	}
	if _, err := svc.CreateTradeOrder(ws, testLedgerID, testOrderCode, testOrderName, models.StockTradeOpen,
		[]service.TradeFill{{PriceCents: 3806, Lots: 2}}, 1700000000, "", ""); err != nil {
		t.Fatalf("建仓失败: %v", err)
	}
	items, err := svc.CreateTradeOrder(ws, testLedgerID, testOrderCode, testOrderName, models.StockTradeClose,
		[]service.TradeFill{{PriceCents: 3667, Lots: 1}, {PriceCents: 3661, Lots: 1}}, 1700000100, "", "")
	if err != nil {
		t.Fatalf("卖出委托失败: %v", err)
	}
	return items
}

// 一笔委托两笔成交：费用按委托成交总额计算一次后分摊到明细，合计等于委托费用。
// 案例：买入 200@38.06 + 同一委托卖出 100@36.67 / 100@36.61 → 费用 13.81、盈亏 -297.81。
func TestCreateTradeOrderChargesFeeOncePerOrder(t *testing.T) {
	svc, ws := newStockService(t)
	items := createXieheOrder(t, svc, ws)

	if len(items) != 2 {
		t.Fatalf("应返回 2 笔成交明细, 实际 %d", len(items))
	}
	if items[0].OrderID == "" || items[0].OrderID != items[1].OrderID {
		t.Fatalf("同一委托的成交应共用 orderId: %+v", items)
	}
	if items[0].OrderSeq != 1 || items[1].OrderSeq != 2 {
		t.Fatalf("成交序号应为 1/2, 实际 %d/%d", items[0].OrderSeq, items[1].OrderSeq)
	}
	if items[0].Price != 3667 || items[1].Price != 3661 {
		t.Fatalf("成交明细应保留各自成交价: %d/%d", items[0].Price, items[1].Price)
	}

	var fee, commission, stampDuty, transferFee, realized int64
	for i := range items {
		fee += items[i].Fee
		commission += items[i].Commission
		stampDuty += items[i].StampDuty
		transferFee += items[i].TransferFee
		if items[i].RealizedPnl != nil {
			realized += *items[i].RealizedPnl
		}
	}
	// 卖出委托按委托总额收取：7328 元 → 佣金 5.00、印花税 3.66、沪市过户费 0.07（买入委托另计）
	if commission != 500 || stampDuty != 366 || transferFee != 7 {
		t.Fatalf("委托费用分摊错误: 佣金=%d 印花税=%d 过户费=%d", commission, stampDuty, transferFee)
	}
	if fee != 873 {
		t.Fatalf("卖出委托费用应为 873 分, 实际 %d", fee)
	}
	if realized != -29781 {
		t.Fatalf("已实现盈亏应为 -29781 分, 实际 %d", realized)
	}

	if round, err := svc.GetTradeHistoryDetail(ws, testLedgerID, testOrderCode); err != nil {
		t.Fatalf("查询交易历史失败: %v", err)
	} else if round.TotalPnl != -29781 {
		t.Fatalf("该股总盈亏应为 -29781 分, 实际 %d", round.TotalPnl)
	}

	// 一笔委托只产生一条资金记录
	page, err := svc.ListFundRecords(ws, testLedgerID, 1, 20)
	if err != nil {
		t.Fatalf("查询资金记录失败: %v", err)
	}
	sellCount := 0
	for i := range page.Items {
		if page.Items[i].EventType == models.StockEventSell {
			sellCount++
		}
	}
	if sellCount != 1 {
		t.Fatalf("一笔卖出委托应只产生 1 条资金记录, 实际 %d", sellCount)
	}
}

// 单笔成交的委托与改造前完全一致（佣金按成交金额最低 5 元收取）。
func TestCreateTradeSingleFillUnchanged(t *testing.T) {
	svc, ws := newStockService(t)
	if _, err := svc.SetPrincipal(ws, testLedgerID, 10000000); err != nil {
		t.Fatalf("设置本金失败: %v", err)
	}
	trade, err := svc.CreateTrade(ws, testLedgerID, testCode, testName, models.StockTradeOpen, 1000, 10, 1700000000, "", "")
	if err != nil {
		t.Fatalf("建仓失败: %v", err)
	}
	if trade.OrderID == "" {
		t.Fatalf("单笔委托也应有 orderId: %+v", trade)
	}
	if trade.OrderSeq != 1 {
		t.Fatalf("单笔委托序号应为 1, 实际 %d", trade.OrderSeq)
	}
	if trade.Fee != 510 || trade.Commission != 500 || trade.TransferFee != 10 {
		t.Fatalf("单笔买入费用错误: %+v", trade)
	}
}

// 编辑一笔成交：按当前费用设置重算该委托费用，持仓与盈亏同步重算。
func TestUpdateTradeFillRecalculatesOrder(t *testing.T) {
	svc, ws := newStockService(t)
	items := createXieheOrder(t, svc, ws)

	// 把第二笔成交价从 36.61 改为 36.91（卖出金额增加 30 元）
	updated, err := svc.UpdateTradeFill(ws, testLedgerID, items[1].ID, 3691, 1, 1700000100)
	if err != nil {
		t.Fatalf("编辑成交失败: %v", err)
	}
	if updated.Price != 3691 {
		t.Fatalf("成交价未更新: %d", updated.Price)
	}

	trades, err := svc.ListTrades(ws, testLedgerID, testOrderCode)
	if err != nil {
		t.Fatalf("查询交易失败: %v", err)
	}
	var realized int64
	var amount int64
	for i := range trades {
		if trades[i].TradeType == models.StockTradeClose {
			amount += trades[i].Amount
			if trades[i].RealizedPnl != nil {
				realized += *trades[i].RealizedPnl
			}
		}
	}
	if amount != 732800+3000 {
		t.Fatalf("卖出总额应为 %d, 实际 %d", 732800+3000, amount)
	}
	// 盈亏 = 原 -297.81 + 多卖 30 元 − 印花税多收 0.02（3000 分 × 0.05% 进位到 2 分）
	if realized != -29781+3000-2 {
		t.Fatalf("编辑后盈亏应为 %d 分, 实际 %d", -29781+3000, realized)
	}
}

// 删除整笔委托：持仓回滚、卖出资金记录移除、轮次归档同步重建。
func TestDeleteTradeOrderRestoresPosition(t *testing.T) {
	svc, ws := newStockService(t)
	items := createXieheOrder(t, svc, ws)

	if err := svc.DeleteTradeOrder(ws, testLedgerID, items[0].OrderID); err != nil {
		t.Fatalf("删除委托失败: %v", err)
	}

	positions, err := svc.ListPositions(ws, testLedgerID)
	if err != nil {
		t.Fatalf("查询持仓失败: %v", err)
	}
	if len(positions) != 1 || positions[0].Quantity != 200 {
		t.Fatalf("删除卖出委托后应回到 200 股持仓, 实际 %+v", positions)
	}

	trades, err := svc.ListTrades(ws, testLedgerID, testOrderCode)
	if err != nil {
		t.Fatalf("查询交易失败: %v", err)
	}
	for i := range trades {
		if trades[i].TradeType == models.StockTradeClose {
			t.Fatalf("卖出成交应已删除: %+v", trades[i])
		}
	}

	page, err := svc.ListFundRecords(ws, testLedgerID, 1, 20)
	if err != nil {
		t.Fatalf("查询资金记录失败: %v", err)
	}
	for i := range page.Items {
		if page.Items[i].EventType == models.StockEventSell {
			t.Fatalf("卖出资金记录应已移除: %+v", page.Items[i])
		}
	}
}

// 影响预演：不落库，且能提示会失效的轮次。
func TestPreviewTradeChangeRollsBack(t *testing.T) {
	svc, ws := newStockService(t)
	items := createXieheOrder(t, svc, ws)

	impact, err := svc.PreviewTradeChange(ws, testLedgerID, "delete_order", "", items[0].OrderID, 0, 0, 0)
	if err != nil {
		t.Fatalf("预演失败: %v", err)
	}
	if impact.PositionAfter != 200 {
		t.Fatalf("预演应显示回滚到 200 股, 实际 %d", impact.PositionAfter)
	}
	if len(impact.RemovedRounds) != 1 || impact.RemovedRounds[0].RoundNo != 1 {
		t.Fatalf("预演应提示第 1 轮失效, 实际 %+v", impact.RemovedRounds)
	}

	// 预演必须回滚：持仓与交易保持原样
	positions, err := svc.ListPositions(ws, testLedgerID)
	if err != nil {
		t.Fatalf("查询持仓失败: %v", err)
	}
	if len(positions) != 0 {
		t.Fatalf("预演不应改变持仓, 实际 %+v", positions)
	}
	trades, err := svc.ListTrades(ws, testLedgerID, testOrderCode)
	if err != nil {
		t.Fatalf("查询交易失败: %v", err)
	}
	if len(trades) != 3 {
		t.Fatalf("预演不应删除成交, 实际 %d 笔", len(trades))
	}
}

// 重放幂等：连续两次编辑不影响最终结果。
func TestRebuildIsIdempotent(t *testing.T) {
	svc, ws := newStockService(t)
	items := createXieheOrder(t, svc, ws)

	if _, err := svc.UpdateTradeFill(ws, testLedgerID, items[0].ID, items[0].Price, items[0].Lots, items[0].TradeTime); err != nil {
		t.Fatalf("第一次编辑失败: %v", err)
	}
	first, err := svc.ListTrades(ws, testLedgerID, testOrderCode)
	if err != nil {
		t.Fatalf("查询交易失败: %v", err)
	}
	if _, err := svc.UpdateTradeFill(ws, testLedgerID, items[0].ID, items[0].Price, items[0].Lots, items[0].TradeTime); err != nil {
		t.Fatalf("第二次编辑失败: %v", err)
	}
	second, err := svc.ListTrades(ws, testLedgerID, testOrderCode)
	if err != nil {
		t.Fatalf("查询交易失败: %v", err)
	}
	if len(first) != len(second) {
		t.Fatalf("重放后成交笔数应一致: %d vs %d", len(first), len(second))
	}
	for i := range first {
		if first[i].ID != second[i].ID || first[i].Fee != second[i].Fee ||
			first[i].RoundID != second[i].RoundID {
			t.Fatalf("重放结果不一致: %+v vs %+v", first[i], second[i])
		}
	}

	detail, err := svc.GetTradeHistoryDetail(ws, testLedgerID, testOrderCode)
	if err != nil {
		t.Fatalf("查询交易历史失败: %v", err)
	}
	if detail.TotalPnl != -29781 {
		t.Fatalf("重放后盈亏应保持 -29781 分, 实际 %d", detail.TotalPnl)
	}
}

// 轮次标签与复盘按轮次序号继承，删除导致轮次失效时同步提示。
func TestRebuildKeepsRoundTagAndReview(t *testing.T) {
	svc, ws := newStockService(t)
	items := createXieheOrder(t, svc, ws)

	detail, err := svc.GetTradeHistoryDetail(ws, testLedgerID, testOrderCode)
	if err != nil {
		t.Fatalf("查询交易历史失败: %v", err)
	}
	roundID := detail.Rounds[0].ID
	if _, err := svc.UpdateRoundTag(ws, testLedgerID, roundID, "打板"); err != nil {
		t.Fatalf("保存标签失败: %v", err)
	}
	if _, err := svc.UpdateRoundReview(ws, testLedgerID, roundID, "本次拆单卖出"); err != nil {
		t.Fatalf("保存复盘失败: %v", err)
	}

	// 编辑成交（不改轮次结构）后，标签与复盘应保留
	if _, err := svc.UpdateTradeFill(ws, testLedgerID, items[1].ID, 3661, 1, 1700000100); err != nil {
		t.Fatalf("编辑成交失败: %v", err)
	}
	after, err := svc.GetTradeHistoryDetail(ws, testLedgerID, testOrderCode)
	if err != nil {
		t.Fatalf("查询交易历史失败: %v", err)
	}
	if len(after.Rounds) != 1 {
		t.Fatalf("轮次数应为 1, 实际 %d", len(after.Rounds))
	}
	if after.Rounds[0].Tag != "打板" || after.Rounds[0].Review != "本次拆单卖出" {
		t.Fatalf("重放后轮次标签/复盘应保留: %+v", after.Rounds[0])
	}
}

// 资金链条：补录历史日期的交易后，重放必须复刻「取当时日期最大一条的余额」这一既有规则，
// 不能按日期重排（否则追加本金等记录的余额会被改写）。
func TestRebuildKeepsCashChainForBackdatedTrade(t *testing.T) {
	svc, ws := newStockService(t)
	if _, err := svc.SetPrincipal(ws, testLedgerID, 10000000); err != nil {
		t.Fatalf("设置本金失败: %v", err)
	}
	// 先按「今天」追加 5 万元，再补录一笔 2023 年的历史交易
	if _, err := svc.AddPrincipalAtDate(ws, testLedgerID, 5000000, "2026-09-18"); err != nil {
		t.Fatalf("追加本金失败: %v", err)
	}
	trade, err := svc.CreateTrade(ws, testLedgerID, testCode, testName, models.StockTradeOpen, 1000, 10, 1700000000, "", "")
	if err != nil {
		t.Fatalf("补录交易失败: %v", err)
	}

	balanceOf := func(eventType string) int64 {
		t.Helper()
		page, err := svc.ListFundRecords(ws, testLedgerID, 1, 20)
		if err != nil {
			t.Fatalf("查询资金记录失败: %v", err)
		}
		for i := range page.Items {
			if page.Items[i].EventType == eventType {
				return page.Items[i].CashBalance
			}
		}
		t.Fatalf("未找到 %s 资金记录", eventType)
		return 0
	}

	// 追加后现金 150000；买入 10 手 @10.00 = 1000000 + 佣金 500 + 过户费 10
	if got := balanceOf(models.StockEventAddPrincipal); got != 15000000 {
		t.Fatalf("追加本金余额应为 15000000 分, 实际 %d", got)
	}
	if got := balanceOf(models.StockEventBuy); got != 15000000-1000510 {
		t.Fatalf("买入后余额应为 %d 分, 实际 %d", 15000000-1000510, got)
	}

	// 编辑成交（改为 11.00）后重放，追加本金的余额不能被改写
	if _, err := svc.UpdateTradeFill(ws, testLedgerID, trade.ID, 1100, 10, 1700000000); err != nil {
		t.Fatalf("编辑成交失败: %v", err)
	}
	if got := balanceOf(models.StockEventAddPrincipal); got != 15000000 {
		t.Fatalf("重放后追加本金余额应保持 15000000 分, 实际 %d", got)
	}
	// 1100000 + 佣金 500 + 过户费 11 = 1100511
	if got := balanceOf(models.StockEventBuy); got != 15000000-1100511 {
		t.Fatalf("重放后买入余额应为 %d 分, 实际 %d", 15000000-1100511, got)
	}
}
