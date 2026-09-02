package service

import (
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/transactions/models"
	"github.com/transactions/models/dto"
	"github.com/transactions/util"
	"github.com/transactions/workspace"
)

// UpdateTrade 修改一笔交易的时间/价格/手数，并从交易流重建全部派生状态：
// 持仓、资金变化链、轮次归档与交易历史，保证盈亏与统计始终一致。
// 交易类型、股票不变；只允许调整 trade_time / price / lots 三个录入字段。
func (s *stockServiceImpl) UpdateTrade(ws *workspace.Workspace, ledgerID string, tradeID string,
	priceCents int64, lots int64, tradeTime int64) (*dto.StockTradeDto, error) {
	if priceCents <= 0 {
		return nil, models.NewBadRequest("成交价必须大于 0")
	}
	if lots <= 0 {
		return nil, models.NewBadRequest("手数必须大于 0")
	}
	if tradeTime <= 0 {
		return nil, models.NewBadRequest("成交时间必须有效")
	}

	err := ws.Transaction(func(tx *workspace.Workspace) error {
		account, err := s.getOrCreateAccount(tx, ledgerID)
		if err != nil {
			return err
		}
		feeSetting, err := s.getOrCreateFeeSetting(tx, ledgerID)
		if err != nil {
			return err
		}
		capitalRecords, err := s.listCapitalRecords(tx, ledgerID)
		if err != nil {
			return err
		}
		trades, err := s.stockDao.ListAllTradesAsc(tx, ledgerID)
		if err != nil {
			return err
		}
		targetIdx := -1
		for i := range trades {
			if trades[i].ID == tradeID {
				targetIdx = i
				break
			}
		}
		if targetIdx < 0 {
			return models.NewNotFound("该交易不存在")
		}

		target := &trades[targetIdx]
		target.Price = priceCents
		target.Lots = lots
		target.Shares = lots * 100
		target.Amount = priceCents * target.Shares
		target.TradeTime = tradeTime

		// 重建持仓：按成交时间重放，只对被修改的交易重算费用，其余沿用原记录费用
		positions := make(map[string]*models.StockPosition)
		for i := range trades {
			tr := &trades[i]
			isBuy := tr.TradeType == models.StockTradeOpen || tr.TradeType == models.StockTradeAdd
			isSell := tr.TradeType == models.StockTradeReduce || tr.TradeType == models.StockTradeClose
			if !isBuy && !isSell {
				return models.NewBadRequest(fmt.Sprintf("无效的交易类型: %s", tr.TradeType))
			}
			if i == targetIdx {
				isSH := strings.HasPrefix(tr.StockCode, "60") || strings.HasPrefix(tr.StockCode, "68")
				var fee FeeBreakdown
				if isBuy {
					fee = ComputeBuyFee(tr.Amount, isSH, feeSetting)
				} else {
					fee = ComputeSellFee(tr.Amount, isSH, feeSetting)
				}
				tr.Fee = fee.Total
				tr.Commission = fee.Commission
				tr.StampDuty = fee.StampDuty
				tr.TransferFee = fee.TransferFee
			}
			tr.RoundID = ""
			pos := positions[tr.StockCode]
			if pos == nil {
				pos = &models.StockPosition{
					ID:        util.GetUUID(),
					LedgerID:  ledgerID,
					StockCode: tr.StockCode,
					StockName: tr.StockName,
				}
				positions[tr.StockCode] = pos
			}
			if isBuy {
				pos.Quantity += tr.Shares
				pos.TotalCost += tr.Amount + tr.Fee
				tr.RealizedPnl = nil
			} else {
				if tr.Shares > pos.Quantity {
					return models.NewBadRequest(fmt.Sprintf(
						"修改后卖出数量超过持仓（%s 当前 %d 股）", tr.StockName, pos.Quantity))
				}
				costBasis := int64(math.Round(float64(pos.TotalCost) * float64(tr.Shares) / float64(pos.Quantity)))
				realized := tr.Amount - tr.Fee - costBasis
				tr.RealizedPnl = &realized
				pos.Quantity -= tr.Shares
				pos.TotalCost -= costBasis
				pos.RealizedPnl += realized
				if pos.Quantity == 0 {
					pos.TotalCost = 0
				}
			}
		}

		if err := s.stockDao.DeleteStockDerivedByLedger(tx, ledgerID); err != nil {
			return err
		}
		if err := s.stockDao.ClearTradeRoundsByLedger(tx, ledgerID); err != nil {
			return err
		}
		for i := range trades {
			if err := s.stockDao.UpdateTrade(tx, &trades[i]); err != nil {
				return err
			}
		}
		for _, pos := range positions {
			if err := s.stockDao.CreatePosition(tx, pos); err != nil {
				return err
			}
		}

		// 重建资金链：本金追加/支取与买卖按 (记录日期, 创建时间) 重放
		initialCash := account.Principal
		events := make([]rebuildCashEvent, 0, len(capitalRecords)+len(trades))
		for i := range capitalRecords {
			initialCash -= capitalRecords[i].AddAmount
			events = append(events, rebuildCashEvent{
				date:         capitalRecords[i].RecordDate,
				createdAt:    capitalRecords[i].CreatedAt,
				id:           capitalRecords[i].ID,
				eventType:    capitalRecords[i].EventType,
				eventText:    capitalRecords[i].EventText,
				amountChange: capitalRecords[i].AmountChange,
				remark:       capitalRecords[i].Remark,
			})
		}
		for i := range trades {
			tr := &trades[i]
			isBuy := tr.TradeType == models.StockTradeOpen || tr.TradeType == models.StockTradeAdd
			var change int64
			if isBuy {
				change = -(tr.Amount + tr.Fee)
			} else {
				change = tr.Amount - tr.Fee
			}
			events = append(events, rebuildCashEvent{
				date:         time.Unix(tr.TradeTime, 0).Format("2006-01-02"),
				createdAt:    tr.CreatedAt,
				id:           tr.ID,
				eventType:    eventTypeOfTrade(tr),
				eventText:    eventTextOfTrade(tr),
				amountChange: change,
				netPnl:       tr.RealizedPnl,
				remark:       fmt.Sprintf("%s %d手 @ %s", tr.StockName, tr.Lots, centsToYuanStr(tr.Price)),
			})
		}
		sort.SliceStable(events, func(i, j int) bool {
			if events[i].date != events[j].date {
				return events[i].date < events[j].date
			}
			if events[i].createdAt != events[j].createdAt {
				return events[i].createdAt < events[j].createdAt
			}
			return events[i].id < events[j].id
		})

		cash := initialCash
		createdBase := time.Now().Unix()
		for i := range events {
			ev := &events[i]
			if ev.eventType == models.StockEventWithdraw && ev.amountChange < 0 && -ev.amountChange > cash {
				return models.NewBadRequest(fmt.Sprintf(
					"修改后资金链异常：%s 的支取超过当时现金（%s 元）",
					ev.date, centsToYuanStr(cash)))
			}
			cash += ev.amountChange
			record := &models.StockFundRecord{
				ID:           util.GetUUID(),
				LedgerID:     ledgerID,
				RecordDate:   ev.date,
				EventType:    ev.eventType,
				EventText:    ev.eventText,
				AmountChange: ev.amountChange,
				CashBalance:  cash,
				NetPnl:       ev.netPnl,
				Remark:       ev.remark,
				CreatedAt:    createdBase + int64(i),
			}
			if err := s.stockDao.CreateFundRecord(tx, record); err != nil {
				return err
			}
		}

		// 重建轮次与交易历史（幂等回填，把完整轮次挂回 round_id）
		return s.ensureTradeHistoryBackfill(tx, ledgerID)
	})
	if err != nil {
		return nil, err
	}

	updated, err := s.stockDao.GetTradeByID(ws, ledgerID, tradeID)
	if err != nil {
		return nil, err
	}
	item := dto.FromStockTrade(updated)
	return &item, nil
}

// rebuildCashEvent 资金链重建中的一个事件（本金追加/支取或一笔买卖）。
type rebuildCashEvent struct {
	date         string
	createdAt    int64
	id           string
	eventType    string
	eventText    string
	amountChange int64
	netPnl       *int64
	remark       string
}

// capitalRecordSnapshot 重建前捕获的本金追加/支取记录（含展示文案，重建时保留）。
type capitalRecordSnapshot struct {
	ID           string
	RecordDate   string
	CreatedAt    int64
	EventType    string
	EventText    string
	AddAmount    int64 // 追加本金金额（正数），用于反推初始本金
	AmountChange int64
	Remark       string
}

func (s *stockServiceImpl) listCapitalRecords(ws *workspace.Workspace, ledgerID string) ([]capitalRecordSnapshot, error) {
	records := make([]capitalRecordSnapshot, 0)
	page := 1
	for {
		rows, total, err := s.stockDao.QueryFundRecords(ws, ledgerID, page, 100)
		if err != nil {
			return nil, err
		}
		for i := range rows {
			r := &rows[i]
			if r.EventType != models.StockEventAddPrincipal && r.EventType != models.StockEventWithdraw {
				continue
			}
			snapshot := capitalRecordSnapshot{
				ID:           r.ID,
				RecordDate:   r.RecordDate,
				CreatedAt:    r.CreatedAt,
				EventType:    r.EventType,
				EventText:    r.EventText,
				AmountChange: r.AmountChange,
				Remark:       r.Remark,
			}
			if r.EventType == models.StockEventAddPrincipal {
				snapshot.AddAmount = r.AmountChange
			}
			records = append(records, snapshot)
		}
		if page*100 >= int(total) {
			break
		}
		page++
	}
	return records, nil
}

func eventTypeOfTrade(t *models.StockTrade) string {
	if t.TradeType == models.StockTradeOpen || t.TradeType == models.StockTradeAdd {
		return models.StockEventBuy
	}
	return models.StockEventSell
}

func eventTextOfTrade(t *models.StockTrade) string {
	if t.TradeType == models.StockTradeOpen || t.TradeType == models.StockTradeAdd {
		return fmt.Sprintf("买入 %s %d手", t.StockName, t.Lots)
	}
	return fmt.Sprintf("卖出 %s %d手", t.StockName, t.Lots)
}
