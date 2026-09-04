package service

import (
	"math"
	"sort"
	"time"

	"github.com/transactions/models"
	"github.com/transactions/models/dto"
	"github.com/transactions/workspace"
)

// settleEvent 一条已归档的完整结算（一次「建仓 → 清仓」轮次）及其盈亏。
type settleEvent struct {
	round      models.StockTradeRound
	stockName  string
	pnl        int64
	pnlRate    float64
	tradeCount int64
}

// GetStatistics 返回全量逐笔结算统计（自第 1 笔起累计口径）。
// GetStatisticsRange 支持按月份区间或最近 N 笔筛选，区间内按独立口径从第 1 笔重新累计。
//
// 派生口径：
//   - 胜率 = 盈利笔数 ÷ 总笔数（平局计入总笔数，不计胜负）；
//   - 平均盈利/亏损分别只按盈利笔与亏损笔求和取平均，亏损金额取正数；
//   - 实际盈亏比 = 平均盈利 ÷ 平均亏损（无亏损样本时为 null）；
//   - 期望值 = 胜率 × 平均盈利 − (1 − 胜率) × 平均亏损 = 累计盈亏 ÷ 总笔数；
//   - 最大回撤按每笔结算时点的总资产曲线（当时的本金 + 累计已结算盈亏 − 当时累计支取）
//     从高点跌落的幅度计算；本金追加/支取按记录日期参与时序，占本金比例使用当时的本金。
func (s *stockServiceImpl) GetStatistics(ws *workspace.Workspace, ledgerID string) (*dto.StockStatisticsDto, error) {
	return s.statistics(ws, ledgerID, "", "", 0)
}

// GetStatisticsRange 返回区间统计：时间范围（含首尾整月）或最近 N 笔二选一。
// 区间内按独立口径逐笔累计；本金追加/支取仍按记录日期全程重放，用于回撤百分比分母。
func (s *stockServiceImpl) GetStatisticsRange(ws *workspace.Workspace, ledgerID string, startMonth string, endMonth string, recent int64) (*dto.StockStatisticsDto, error) {
	if recent < 0 {
		return nil, models.NewBadRequest("recent 必须为正整数")
	}
	if recent > 0 && (startMonth != "" || endMonth != "") {
		return nil, models.NewBadRequest("时间范围与笔数筛选不能同时使用")
	}
	fromDay, toDay, err := normalizeStatisticsMonthRange(startMonth, endMonth)
	if err != nil {
		return nil, err
	}
	return s.statistics(ws, ledgerID, fromDay, toDay, recent)
}

// statistics 实现结算统计：fromDay/toDay 非空时按清仓日期区间筛选，recent > 0 时取最近 N 笔。
func (s *stockServiceImpl) statistics(ws *workspace.Workspace, ledgerID string, fromDay string, toDay string, recent int64) (*dto.StockStatisticsDto, error) {
	if err := s.ensureTradeHistoryBackfill(ws, ledgerID); err != nil {
		return nil, err
	}
	histories, err := s.stockDao.ListTradeHistories(ws, ledgerID)
	if err != nil {
		return nil, err
	}

	events := make([]settleEvent, 0, len(histories))
	for i := range histories {
		rounds, err := s.stockDao.ListTradeRoundsByStock(ws, ledgerID, histories[i].StockCode)
		if err != nil {
			return nil, err
		}
		for j := range rounds {
			trades, err := s.stockDao.ListTradesByRound(ws, rounds[j].ID)
			if err != nil {
				return nil, err
			}
			pnl, pnlRate, _ := dto.RoundPnl(trades)
			events = append(events, settleEvent{
				round:      rounds[j],
				stockName:  histories[i].StockName,
				pnl:        pnl,
				pnlRate:    pnlRate,
				tradeCount: int64(len(trades)),
			})
		}
	}
	sort.SliceStable(events, func(i, j int) bool {
		if events[i].round.ClosedAt != events[j].round.ClosedAt {
			return events[i].round.ClosedAt < events[j].round.ClosedAt
		}
		if events[i].round.CreatedAt != events[j].round.CreatedAt {
			return events[i].round.CreatedAt < events[j].round.CreatedAt
		}
		return events[i].round.ID < events[j].round.ID
	})

	account, err := s.getOrCreateAccount(ws, ledgerID)
	if err != nil {
		return nil, err
	}
	flows, err := s.listCapitalFlows(ws, ledgerID)
	if err != nil {
		return nil, err
	}
	// 初始本金 = 当前本金 − 全部「追加本金」；本金追加/支取按记录日期参与时序重放
	initialPrincipal := account.Principal
	for i := range flows {
		initialPrincipal -= flows[i].add
	}

	includedTotal := int64(0)
	for i := range events {
		date := time.Unix(events[i].round.ClosedAt, 0).Format("2006-01-02")
		if includeStatisticsEvent(date, i, len(events), fromDay, toDay, recent) {
			includedTotal++
		}
	}

	result := &dto.StockStatisticsDto{
		Principal:  account.Principal,
		RoundCount: includedTotal,
		Points:     make([]dto.StockStatisticsPointDto, 0, includedTotal),
	}
	if includedTotal == 0 {
		return result, nil
	}
	useWindow := fromDay != "" || recent > 0

	// 资金事件与结算事件按日期合成同一条时序，保证本金追加/支取在正确时点影响总资产峰值与回撤
	actions := make([]statAction, 0, len(flows)+len(events))
	for i := range flows {
		actions = append(actions, statAction{date: flows[i].date, order: 0, flowIndex: i, eventIndex: -1})
	}
	for i := range events {
		actions = append(actions, statAction{
			date:       time.Unix(events[i].round.ClosedAt, 0).Format("2006-01-02"),
			order:      1,
			flowIndex:  -1,
			eventIndex: i,
		})
	}
	sort.SliceStable(actions, func(i, j int) bool {
		if actions[i].date != actions[j].date {
			return actions[i].date < actions[j].date
		}
		if actions[i].order != actions[j].order {
			return actions[i].order < actions[j].order
		}
		return actions[i].date < actions[j].date
	})

	var (
		totalCount  int64
		winCount    int64
		lossCount   int64
		winSum      int64
		lossSum     int64 // 亏损金额合计（正数）
		cumPnl      int64
		principalAt int64 = initialPrincipal
		withdrawnAt int64
		equity      = initialPrincipal
		peakEquity  = initialPrincipal
		maxDrawdown int64

		windowCount       int64 // 区间内笔数（区间内从 1 重新编号）
		windowWinCount    int64
		windowLossCount   int64
		windowWinSum      int64
		windowLossSum     int64 // 区间内亏损金额合计（正数）
		windowCumPnl      int64
		windowPeakPnl     int64
		windowMaxDrawdown int64
	)
	updateDrawdown := func() {
		if equity > peakEquity {
			peakEquity = equity
		}
		drawdown := peakEquity - equity
		if drawdown > maxDrawdown {
			maxDrawdown = drawdown
		}
	}
	for _, action := range actions {
		if action.flowIndex >= 0 {
			f := &flows[action.flowIndex]
			principalAt += f.add
			withdrawnAt += f.withdraw
			equity = principalAt + cumPnl - withdrawnAt
			updateDrawdown()
			continue
		}
		ev := &events[action.eventIndex]
		date := time.Unix(ev.round.ClosedAt, 0).Format("2006-01-02")
		if !includeStatisticsEvent(date, action.eventIndex, len(events), fromDay, toDay, recent) {
			continue
		}

		totalCount++
		windowCount++
		cumPnl += ev.pnl
		windowCumPnl += ev.pnl
		if ev.pnl > 0 {
			winCount++
			winSum += ev.pnl
			windowWinCount++
			windowWinSum += ev.pnl
		} else if ev.pnl < 0 {
			lossCount++
			lossSum += -ev.pnl
			windowLossCount++
			windowLossSum += -ev.pnl
		}
		// 区间回撤曲线：从 0 起步逐笔累计区间盈亏，追踪该曲线峰值的最大回落
		if windowCumPnl > windowPeakPnl {
			windowPeakPnl = windowCumPnl
		}
		if windowDrawdown := windowPeakPnl - windowCumPnl; windowDrawdown > windowMaxDrawdown {
			windowMaxDrawdown = windowDrawdown
		}
		// 当时总资产 = 当时本金 + 累计已结算盈亏 − 当时累计支取（全量口径）
		equity = principalAt + cumPnl - withdrawnAt
		updateDrawdown()

		seqNo := totalCount
		statCount := totalCount
		total := cumPnl
		wins := winCount
		losses := lossCount
		winAmountSum, lossAmountSum := winSum, lossSum
		drawdown := maxDrawdown
		if useWindow {
			seqNo = windowCount
			statCount = windowCount
			total = windowCumPnl
			wins = windowWinCount
			losses = windowLossCount
			winAmountSum, lossAmountSum = windowWinSum, windowLossSum
			drawdown = windowMaxDrawdown
		}

		point := dto.StockStatisticsPointDto{
			Sequence:     seqNo,
			ClosedAt:     ev.round.ClosedAt,
			StockCode:    ev.round.StockCode,
			StockName:    ev.stockName,
			StockRoundNo: ev.round.RoundNo,
			Pnl:          ev.pnl,
			PnlRate:      ev.pnlRate,
			TradeCount:   ev.tradeCount,
			TotalPnl:     total,
			WinCount:     wins,
			LossCount:    losses,
			MaxDrawdown:  drawdown,
		}
		if statCount > 0 {
			point.WinRate = math.Round(float64(wins)/float64(statCount)*10000) / 100
		}
		if wins > 0 {
			point.AvgWin = roundToNearestCents(float64(winAmountSum) / float64(wins))
		}
		if losses > 0 {
			point.AvgLoss = roundToNearestCents(float64(lossAmountSum) / float64(losses))
			ratio := 0.0
			if point.AvgWin > 0 {
				ratio = float64(point.AvgWin) / float64(point.AvgLoss)
			}
			point.PnlRatio = &ratio
		}
		if statCount > 0 {
			// 期望值 = 胜率 × 平均盈利 − 亏损率 × 平均亏损 = 累计盈亏 ÷ 总笔数
			point.Expectancy = roundToNearestCents(float64(total) / float64(statCount))
		}
		if principalAt > 0 {
			point.MaxDrawdownPct = math.Round(float64(drawdown)/float64(principalAt)*10000) / 100
		}
		result.Points = append(result.Points, point)
	}
	return result, nil
}

// includeStatisticsEvent 判断某笔结算是否落入当前筛选：
// recent > 0 时取排序后最近 N 笔；fromDay 非空时按清仓日期区间（含首尾日）判断。
func includeStatisticsEvent(date string, idx int, total int, fromDay string, toDay string, recent int64) bool {
	if recent > 0 {
		return int64(idx) >= int64(total)-recent
	}
	if fromDay != "" {
		return date >= fromDay && date <= toDay
	}
	return true
}

// normalizeStatisticsMonthRange 校验起止月份（YYYY-MM）并返回首尾两天的日期边界。
func normalizeStatisticsMonthRange(startMonth string, endMonth string) (string, string, error) {
	if startMonth == "" && endMonth == "" {
		return "", "", nil
	}
	if startMonth == "" || endMonth == "" {
		return "", "", models.NewBadRequest("start_month 与 end_month 需同时提供（格式 YYYY-MM）")
	}
	start, err := time.Parse("2006-01", startMonth)
	if err != nil {
		return "", "", models.NewBadRequest("start_month 格式应为 YYYY-MM")
	}
	end, err := time.Parse("2006-01", endMonth)
	if err != nil {
		return "", "", models.NewBadRequest("end_month 格式应为 YYYY-MM")
	}
	if start.After(end) {
		return "", "", models.NewBadRequest("end_month 不能早于 start_month")
	}
	from := time.Date(start.Year(), start.Month(), 1, 0, 0, 0, 0, time.Local)
	lastDay := time.Date(end.Year(), end.Month()+1, 0, 0, 0, 0, 0, time.Local)
	return from.Format("2006-01-02"), lastDay.Format("2006-01-02"), nil
}

// statAction 结算统计时序中的一步：资金事件（追加本金/支取）或一笔结算。
type statAction struct {
	date       string
	order      int // 0 = 资金事件，1 = 结算事件（同日资金先于结算）
	flowIndex  int // 资金事件时 >= 0
	eventIndex int // 结算事件时 >= 0
}

// capitalFlow 一笔本金追加或支取：按记录日期参与统计时序，withdraw 为正数金额。
type capitalFlow struct {
	date      string
	add       int64
	withdraw  int64
	createdAt int64
	id        string
}

// listCapitalFlows 返回账本全部「追加本金 / 支取」记录，按日期升序（同日按创建时间）。
func (s *stockServiceImpl) listCapitalFlows(ws *workspace.Workspace, ledgerID string) ([]capitalFlow, error) {
	flows := make([]capitalFlow, 0)
	page := 1
	for {
		records, total, err := s.stockDao.QueryFundRecords(ws, ledgerID, page, 100)
		if err != nil {
			return nil, err
		}
		for i := range records {
			r := &records[i]
			switch r.EventType {
			case models.StockEventAddPrincipal:
				flows = append(flows, capitalFlow{
					date:      r.RecordDate,
					add:       r.AmountChange,
					createdAt: r.CreatedAt,
					id:        r.ID,
				})
			case models.StockEventWithdraw:
				flows = append(flows, capitalFlow{
					date:      r.RecordDate,
					withdraw:  -r.AmountChange, // amount_change 为负数
					createdAt: r.CreatedAt,
					id:        r.ID,
				})
			}
		}
		if page*100 >= int(total) {
			break
		}
		page++
	}
	sort.SliceStable(flows, func(i, j int) bool {
		if flows[i].date != flows[j].date {
			return flows[i].date < flows[j].date
		}
		if flows[i].createdAt != flows[j].createdAt {
			return flows[i].createdAt < flows[j].createdAt
		}
		return flows[i].id < flows[j].id
	})
	return flows, nil
}

// roundToNearestCents 按四舍五入把均值收敛为整数分。
func roundToNearestCents(v float64) int64 {
	return int64(math.Round(v))
}
