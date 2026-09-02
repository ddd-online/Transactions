package service

import (
	"math"
	"sort"

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
// 从第 2 笔起每结算一笔按累计口径计算一次胜率/平均盈亏/盈亏比/期望值与最大回撤。
//
// 派生口径：
//   - 胜率 = 盈利笔数 ÷ 总笔数（平局计入总笔数，不计胜负）；
//   - 平均盈利/亏损分别只按盈利笔与亏损笔求和取平均，亏损金额取正数；
//   - 实际盈亏比 = 平均盈利 ÷ 平均亏损（无亏损样本时为 null）；
//   - 期望值 = 胜率 × 平均盈利 − (1 − 胜率) × 平均亏损 = 累计盈亏 ÷ 总笔数；
//   - 最大回撤按账户净值曲线（本金 + 累计已结算盈亏）从高点跌落的幅度计算，
//     占本金比例使用当前本金口径，本金为 0 时显示 0。
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

	result := &dto.StockStatisticsDto{
		Principal:  account.Principal,
		RoundCount: int64(len(events)),
		Points:     make([]dto.StockStatisticsPointDto, 0),
	}
	if len(events) < 2 {
		return result, nil
	}

	var (
		totalCount  int64
		winCount    int64
		lossCount   int64
		winSum      int64
		lossSum     int64 // 亏损金额合计（正数）
		cumPnl      int64
		peakPnl     int64
		maxDrawdown int64
	)
	for i := range events {
		ev := &events[i]
		totalCount++
		cumPnl += ev.pnl
		if ev.pnl > 0 {
			winCount++
			winSum += ev.pnl
		} else if ev.pnl < 0 {
			lossCount++
			lossSum += -ev.pnl
		}
		if cumPnl > peakPnl {
			peakPnl = cumPnl
		}
		drawdown := peakPnl - cumPnl
		if drawdown > maxDrawdown {
			maxDrawdown = drawdown
		}
		if totalCount < 2 {
			continue
		}

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
		if account.Principal > 0 {
			point.MaxDrawdownPct = math.Round(float64(maxDrawdown)/float64(account.Principal)*10000) / 100
		}
		result.Points = append(result.Points, point)
	}
	return result, nil
}

// roundToNearestCents 按四舍五入把均值收敛为整数分。
func roundToNearestCents(v float64) int64 {
	return int64(math.Round(v))
}
