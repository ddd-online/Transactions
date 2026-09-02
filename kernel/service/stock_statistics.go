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

// GetStatistics 返回交易统计：把全部已清仓轮次按清仓时间合成结算序列，
// 自第 1 笔起每结算一笔按累计口径计算一次胜率/平均盈亏/盈亏比/期望值与最大回撤。
//
// 派生口径：
//   - 胜率 = 盈利笔数 ÷ 总笔数（平局计入总笔数，不计胜负）；
//   - 平均盈利/亏损分别只按盈利笔与亏损笔求和取平均，亏损金额取正数；
//   - 实际盈亏比 = 平均盈利 ÷ 平均亏损（无亏损样本时为 null）；
//   - 期望值 = 胜率 × 平均盈利 − (1 − 胜率) × 平均亏损 = 累计盈亏 ÷ 总笔数；
//   - 最大回撤按每笔结算时点的总资产曲线（当时的本金 + 累计已结算盈亏 − 当时累计支取）
//     从高点跌落的幅度计算；本金追加/支取按记录日期参与时序，占本金比例使用当时的本金。
func (s *stockServiceImpl) GetStatistics(ws *workspace.Workspace, ledgerID string) (*dto.StockStatisticsDto, error) {
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

	result := &dto.StockStatisticsDto{
		Principal:  account.Principal,
		RoundCount: int64(len(events)),
		Points:     make([]dto.StockStatisticsPointDto, 0),
	}
	if len(events) == 0 {
		return result, nil
	}

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
		totalCount++
		cumPnl += ev.pnl
		if ev.pnl > 0 {
			winCount++
			winSum += ev.pnl
		} else if ev.pnl < 0 {
			lossCount++
			lossSum += -ev.pnl
		}
		// 当时总资产 = 当时本金 + 累计已结算盈亏 − 当时累计支取
		equity = principalAt + cumPnl - withdrawnAt
		updateDrawdown()
		point := dto.StockStatisticsPointDto{
			Sequence:     totalCount,
			ClosedAt:     ev.round.ClosedAt,
			StockCode:    ev.round.StockCode,
			StockName:    ev.stockName,
			StockRoundNo: ev.round.RoundNo,
			Pnl:          ev.pnl,
			PnlRate:      ev.pnlRate,
			TradeCount:   ev.tradeCount,
			TotalPnl:     cumPnl,
			WinCount:     winCount,
			LossCount:    lossCount,
			MaxDrawdown:  maxDrawdown,
		}
		if totalCount > 0 {
			point.WinRate = math.Round(float64(winCount)/float64(totalCount)*10000) / 100
		}
		if winCount > 0 {
			point.AvgWin = roundToNearestCents(float64(winSum) / float64(winCount))
		}
		if lossCount > 0 {
			point.AvgLoss = roundToNearestCents(float64(lossSum) / float64(lossCount))
			ratio := 0.0
			if point.AvgWin > 0 {
				ratio = float64(point.AvgWin) / float64(point.AvgLoss)
			}
			point.PnlRatio = &ratio
		}
		if totalCount > 0 {
			// 期望值 = 胜率 × 平均盈利 − 亏损率 × 平均亏损 = 累计盈亏 ÷ 总笔数
			point.Expectancy = roundToNearestCents(float64(cumPnl) / float64(totalCount))
		}
		if principalAt > 0 {
			point.MaxDrawdownPct = math.Round(float64(maxDrawdown)/float64(principalAt)*10000) / 100
		}
		result.Points = append(result.Points, point)
	}
	return result, nil
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
