package dao

import (
	"errors"

	"gorm.io/gorm"

	"github.com/transactions/models"
	"github.com/transactions/workspace"
)

// StockDao 股票账户相关数据访问。
type StockDao interface {
	GetAccount(ws *workspace.Workspace, ledgerID string) (*models.StockAccount, error)
	CreateAccount(ws *workspace.Workspace, account *models.StockAccount) error
	UpdateAccountPrincipal(ws *workspace.Workspace, ledgerID string, principal int64) error
	GetFeeSetting(ws *workspace.Workspace, ledgerID string) (*models.StockFeeSetting, error)
	CreateFeeSetting(ws *workspace.Workspace, setting *models.StockFeeSetting) error
	UpdateFeeSetting(ws *workspace.Workspace, setting *models.StockFeeSetting) error
	GetTradeTagSetting(ws *workspace.Workspace, ledgerID string) (*models.StockTradeTagSetting, error)
	CreateTradeTagSetting(ws *workspace.Workspace, setting *models.StockTradeTagSetting) error
	UpdateTradeTagSettingTags(ws *workspace.Workspace, ledgerID string, tagsJSON string) error
	CreateFundRecord(ws *workspace.Workspace, record *models.StockFundRecord) error
	QueryLatestFundRecord(ws *workspace.Workspace, ledgerID string) (*models.StockFundRecord, error)
	QueryFundRecords(ws *workspace.Workspace, ledgerID string, page int, pageSize int) ([]models.StockFundRecord, int64, error)
	SumNetPnl(ws *workspace.Workspace, ledgerID string) (int64, error)
	SumWithdrawn(ws *workspace.Workspace, ledgerID string) (int64, error)
	SumPositionCost(ws *workspace.Workspace, ledgerID string) (int64, error)
	CountFundRecords(ws *workspace.Workspace, ledgerID string) (int64, error)
	GetPosition(ws *workspace.Workspace, ledgerID string, stockCode string) (*models.StockPosition, error)
	CreatePosition(ws *workspace.Workspace, position *models.StockPosition) error
	UpdatePosition(ws *workspace.Workspace, position *models.StockPosition) error
	ListPositions(ws *workspace.Workspace, ledgerID string) ([]models.StockPosition, error)
	CreateTrade(ws *workspace.Workspace, trade *models.StockTrade) error
	ListTrades(ws *workspace.Workspace, ledgerID string, stockCode string) ([]models.StockTrade, error)
	ListTradesAsc(ws *workspace.Workspace, ledgerID string, stockCode string) ([]models.StockTrade, error)
	ListAllTradesAsc(ws *workspace.Workspace, ledgerID string) ([]models.StockTrade, error)
	GetTrade(ws *workspace.Workspace, tradeID string) (*models.StockTrade, error)
	ListTradesByOrder(ws *workspace.Workspace, ledgerID string, orderID string) ([]models.StockTrade, error)
	DeleteTradesByOrder(ws *workspace.Workspace, ledgerID string, orderID string) error
	DeleteTradesByIDs(ws *workspace.Workspace, ids []string) error
	UpdateTrade(ws *workspace.Workspace, trade *models.StockTrade) error
	UpdateTradeSettlement(ws *workspace.Workspace, tradeID string, roundID string, realizedPnl *int64) error
	GetTradeHistory(ws *workspace.Workspace, ledgerID string, stockCode string) (*models.StockTradeHistory, error)
	CreateTradeHistory(ws *workspace.Workspace, history *models.StockTradeHistory) error
	UpdateTradeHistoryName(ws *workspace.Workspace, ledgerID string, stockCode string, stockName string) error
	ListTradeHistories(ws *workspace.Workspace, ledgerID string) ([]models.StockTradeHistory, error)
	DeleteTradeHistoriesByLedger(ws *workspace.Workspace, ledgerID string) error
	ListTradeStocks(ws *workspace.Workspace, ledgerID string) ([]string, error)
	CountTradeRounds(ws *workspace.Workspace, historyID string) (int64, error)
	CreateTradeRound(ws *workspace.Workspace, round *models.StockTradeRound) error
	ListTradeRoundsByStock(ws *workspace.Workspace, ledgerID string, stockCode string) ([]models.StockTradeRound, error)
	ListTradeRounds(ws *workspace.Workspace, ledgerID string) ([]models.StockTradeRound, error)
	DeleteTradeRound(ws *workspace.Workspace, roundID string) error
	UpdateTradeRoundDerived(ws *workspace.Workspace, roundID string, historyID string, openedAt int64, closedAt int64) error
	GetTradeRound(ws *workspace.Workspace, roundID string) (*models.StockTradeRound, error)
	UpdateTradeRoundReview(ws *workspace.Workspace, roundID string, review string) error
	UpdateTradeRoundTag(ws *workspace.Workspace, roundID string, tag string) error
	ListTradesByRound(ws *workspace.Workspace, roundID string) ([]models.StockTrade, error)
	ListFundRecordsInInsertOrder(ws *workspace.Workspace, ledgerID string) ([]models.StockFundRecord, error)
	DeleteTradeFundRecords(ws *workspace.Workspace, ledgerID string) error
	UpdateFundRecordCashBalance(ws *workspace.Workspace, id string, cashBalance int64) error
	MinUnattachedTradeTime(ws *workspace.Workspace, ledgerID string, stockCode string) (int64, error)
	AttachUnattachedTrades(ws *workspace.Workspace, ledgerID string, stockCode string, roundID string) error
	UpdateTradesRoundID(ws *workspace.Workspace, roundID string, ids []string) error
	QueryStockName(ws *workspace.Workspace, stockCode string) (string, error)
	DeleteByLedgerId(ws *workspace.Workspace, ledgerID string) error
	ResetByLedgerId(ws *workspace.Workspace, ledgerID string) error
}

var _ StockDao = &stockDaoImpl{}

type stockDaoImpl struct{}

func NewStockDao() StockDao {
	return &stockDaoImpl{}
}

func (d *stockDaoImpl) GetAccount(ws *workspace.Workspace, ledgerID string) (*models.StockAccount, error) {
	var account models.StockAccount
	err := ws.GetDb().Where("ledger_id = ?", ledgerID).First(&account).Error
	if err != nil {
		return nil, err
	}
	return &account, nil
}

func (d *stockDaoImpl) CreateAccount(ws *workspace.Workspace, account *models.StockAccount) error {
	return ws.GetDb().Create(account).Error
}

func (d *stockDaoImpl) UpdateAccountPrincipal(ws *workspace.Workspace, ledgerID string, principal int64) error {
	return ws.GetDb().Model(&models.StockAccount{}).
		Where("ledger_id = ?", ledgerID).
		Update("principal", principal).Error
}

func (d *stockDaoImpl) GetFeeSetting(ws *workspace.Workspace, ledgerID string) (*models.StockFeeSetting, error) {
	var setting models.StockFeeSetting
	err := ws.GetDb().Where("ledger_id = ?", ledgerID).First(&setting).Error
	if err != nil {
		return nil, err
	}
	return &setting, nil
}

func (d *stockDaoImpl) CreateFeeSetting(ws *workspace.Workspace, setting *models.StockFeeSetting) error {
	return ws.GetDb().Create(setting).Error
}

func (d *stockDaoImpl) UpdateFeeSetting(ws *workspace.Workspace, setting *models.StockFeeSetting) error {
	return ws.GetDb().Model(&models.StockFeeSetting{}).
		Where("ledger_id = ?", setting.LedgerID).
		Updates(map[string]any{
			"commission_rate":   setting.CommissionRate,
			"min_commission":    setting.MinCommission,
			"stamp_duty_rate":   setting.StampDutyRate,
			"transfer_fee_rate": setting.TransferFeeRate,
		}).Error
}

func (d *stockDaoImpl) GetTradeTagSetting(ws *workspace.Workspace, ledgerID string) (*models.StockTradeTagSetting, error) {
	var setting models.StockTradeTagSetting
	err := ws.GetDb().Where("ledger_id = ?", ledgerID).First(&setting).Error
	if err != nil {
		return nil, err
	}
	return &setting, nil
}

func (d *stockDaoImpl) CreateTradeTagSetting(ws *workspace.Workspace, setting *models.StockTradeTagSetting) error {
	return ws.GetDb().Create(setting).Error
}

func (d *stockDaoImpl) UpdateTradeTagSettingTags(ws *workspace.Workspace, ledgerID string, tagsJSON string) error {
	return ws.GetDb().Model(&models.StockTradeTagSetting{}).
		Where("ledger_id = ?", ledgerID).
		Update("tags", tagsJSON).Error
}

func (d *stockDaoImpl) CreateFundRecord(ws *workspace.Workspace, record *models.StockFundRecord) error {
	return ws.GetDb().Create(record).Error
}

func (d *stockDaoImpl) QueryLatestFundRecord(ws *workspace.Workspace, ledgerID string) (*models.StockFundRecord, error) {
	var record models.StockFundRecord
	err := ws.GetDb().Where("ledger_id = ?", ledgerID).
		Order("record_date DESC, created_at DESC, id DESC").
		First(&record).Error
	if err != nil {
		return nil, err
	}
	return &record, nil
}

func (d *stockDaoImpl) QueryFundRecords(ws *workspace.Workspace, ledgerID string, page int, pageSize int) ([]models.StockFundRecord, int64, error) {
	var total int64
	if err := ws.GetDb().Model(&models.StockFundRecord{}).
		Where("ledger_id = ?", ledgerID).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	records := make([]models.StockFundRecord, 0)
	err := ws.GetDb().Where("ledger_id = ?", ledgerID).
		Order("record_date DESC, created_at DESC, id DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&records).Error
	return records, total, err
}

func (d *stockDaoImpl) SumNetPnl(ws *workspace.Workspace, ledgerID string) (int64, error) {
	var sum int64
	err := ws.GetDb().Model(&models.StockFundRecord{}).
		Select("COALESCE(SUM(net_pnl), 0)").
		Where("ledger_id = ?", ledgerID).
		Scan(&sum).Error
	return sum, err
}

// SumWithdrawn 累计支取金额（amount_change 存储为负数，取反求和）。
func (d *stockDaoImpl) SumWithdrawn(ws *workspace.Workspace, ledgerID string) (int64, error) {
	var sum int64
	err := ws.GetDb().Model(&models.StockFundRecord{}).
		Select("COALESCE(SUM(-amount_change), 0)").
		Where("ledger_id = ? AND event_type = ?", ledgerID, models.StockEventWithdraw).
		Scan(&sum).Error
	return sum, err
}

// SumPositionCost 当前持仓成本：Σ 持仓中股票的总成本（已清仓的 quantity=0，不计入）。
func (d *stockDaoImpl) SumPositionCost(ws *workspace.Workspace, ledgerID string) (int64, error) {
	var sum int64
	err := ws.GetDb().Model(&models.StockPosition{}).
		Select("COALESCE(SUM(total_cost), 0)").
		Where("ledger_id = ? AND quantity > 0", ledgerID).
		Scan(&sum).Error
	return sum, err
}

func (d *stockDaoImpl) CountFundRecords(ws *workspace.Workspace, ledgerID string) (int64, error) {
	var total int64
	err := ws.GetDb().Model(&models.StockFundRecord{}).
		Where("ledger_id = ?", ledgerID).Count(&total).Error
	return total, err
}

func (d *stockDaoImpl) GetPosition(ws *workspace.Workspace, ledgerID string, stockCode string) (*models.StockPosition, error) {
	var position models.StockPosition
	err := ws.GetDb().Where("ledger_id = ? AND stock_code = ?", ledgerID, stockCode).First(&position).Error
	if err != nil {
		return nil, err
	}
	return &position, nil
}

func (d *stockDaoImpl) CreatePosition(ws *workspace.Workspace, position *models.StockPosition) error {
	return ws.GetDb().Create(position).Error
}

func (d *stockDaoImpl) UpdatePosition(ws *workspace.Workspace, position *models.StockPosition) error {
	return ws.GetDb().Model(position).
		Select("quantity", "total_cost", "realized_pnl", "stock_name", "review").
		Updates(map[string]any{
			"quantity":     position.Quantity,
			"total_cost":   position.TotalCost,
			"realized_pnl": position.RealizedPnl,
			"stock_name":   position.StockName,
			"review":       position.Review,
		}).Error
}

func (d *stockDaoImpl) ListPositions(ws *workspace.Workspace, ledgerID string) ([]models.StockPosition, error) {
	positions := make([]models.StockPosition, 0)
	err := ws.GetDb().Where("ledger_id = ?", ledgerID).
		Order("quantity DESC, created_at ASC").
		Find(&positions).Error
	return positions, err
}

func (d *stockDaoImpl) CreateTrade(ws *workspace.Workspace, trade *models.StockTrade) error {
	return ws.GetDb().Create(trade).Error
}

func (d *stockDaoImpl) ListTrades(ws *workspace.Workspace, ledgerID string, stockCode string) ([]models.StockTrade, error) {
	trades := make([]models.StockTrade, 0)
	err := ws.GetDb().Where("ledger_id = ? AND stock_code = ?", ledgerID, stockCode).
		Order("trade_time DESC, created_at DESC").
		Find(&trades).Error
	return trades, err
}

// ListTradesAsc 按成交时间升序返回某只股票的全部交易（历史回填/轮次归并使用）。
func (d *stockDaoImpl) ListTradesAsc(ws *workspace.Workspace, ledgerID string, stockCode string) ([]models.StockTrade, error) {
	trades := make([]models.StockTrade, 0)
	err := ws.GetDb().Where("ledger_id = ? AND stock_code = ?", ledgerID, stockCode).
		Order("trade_time ASC, created_at ASC, id ASC").
		Find(&trades).Error
	return trades, err
}

// ListAllTradesAsc 按成交时间升序返回整个账本的全部交易（重放重建使用）。
// 同一委托内的多笔成交按 order_seq 排序，保证重放顺序确定。
func (d *stockDaoImpl) ListAllTradesAsc(ws *workspace.Workspace, ledgerID string) ([]models.StockTrade, error) {
	trades := make([]models.StockTrade, 0)
	err := ws.GetDb().Where("ledger_id = ?", ledgerID).
		Order("trade_time ASC, created_at ASC, order_seq ASC, id ASC").
		Find(&trades).Error
	return trades, err
}

func (d *stockDaoImpl) GetTrade(ws *workspace.Workspace, tradeID string) (*models.StockTrade, error) {
	var trade models.StockTrade
	if err := ws.GetDb().Where("id = ?", tradeID).First(&trade).Error; err != nil {
		return nil, err
	}
	return &trade, nil
}

// ListTradesByOrder 返回同一委托下的全部成交明细，按 order_seq 升序。
func (d *stockDaoImpl) ListTradesByOrder(ws *workspace.Workspace, ledgerID string, orderID string) ([]models.StockTrade, error) {
	trades := make([]models.StockTrade, 0)
	err := ws.GetDb().Where("ledger_id = ? AND order_id = ?", ledgerID, orderID).
		Order("order_seq ASC, created_at ASC, id ASC").
		Find(&trades).Error
	return trades, err
}

func (d *stockDaoImpl) DeleteTradesByOrder(ws *workspace.Workspace, ledgerID string, orderID string) error {
	return ws.GetDb().Where("ledger_id = ? AND order_id = ?", ledgerID, orderID).
		Delete(&models.StockTrade{}).Error
}

func (d *stockDaoImpl) DeleteTradesByIDs(ws *workspace.Workspace, ids []string) error {
	if len(ids) == 0 {
		return nil
	}
	return ws.GetDb().Where("id IN ?", ids).Delete(&models.StockTrade{}).Error
}

func (d *stockDaoImpl) UpdateTrade(ws *workspace.Workspace, trade *models.StockTrade) error {
	return ws.GetDb().Model(&models.StockTrade{}).Where("id = ?", trade.ID).Updates(map[string]any{
		"trade_type":   trade.TradeType,
		"round_id":     trade.RoundID,
		"order_id":     trade.OrderID,
		"order_seq":    trade.OrderSeq,
		"price":        trade.Price,
		"lots":         trade.Lots,
		"shares":       trade.Shares,
		"amount":       trade.Amount,
		"fee":          trade.Fee,
		"commission":   trade.Commission,
		"stamp_duty":   trade.StampDuty,
		"transfer_fee": trade.TransferFee,
		"realized_pnl": trade.RealizedPnl,
		"trade_time":   trade.TradeTime,
	}).Error
}

// UpdateTradeSettlement 只回写重放派生字段（轮次挂接与已实现盈亏），不触碰成交本身。
func (d *stockDaoImpl) UpdateTradeSettlement(ws *workspace.Workspace, tradeID string, roundID string, realizedPnl *int64) error {
	return ws.GetDb().Model(&models.StockTrade{}).Where("id = ?", tradeID).Updates(map[string]any{
		"round_id":     roundID,
		"realized_pnl": realizedPnl,
	}).Error
}

func (d *stockDaoImpl) GetTradeHistory(ws *workspace.Workspace, ledgerID string, stockCode string) (*models.StockTradeHistory, error) {
	var history models.StockTradeHistory
	err := ws.GetDb().Where("ledger_id = ? AND stock_code = ?", ledgerID, stockCode).First(&history).Error
	if err != nil {
		return nil, err
	}
	return &history, nil
}

func (d *stockDaoImpl) CreateTradeHistory(ws *workspace.Workspace, history *models.StockTradeHistory) error {
	return ws.GetDb().Create(history).Error
}

// DeleteTradeHistoriesByLedger 清空账本的历史集合（重放重建时按交易流重新生成）。
func (d *stockDaoImpl) DeleteTradeHistoriesByLedger(ws *workspace.Workspace, ledgerID string) error {
	return ws.GetDb().Where("ledger_id = ?", ledgerID).Delete(&models.StockTradeHistory{}).Error
}

// ListFundRecordsInInsertOrder 按录入顺序（创建时间 → ID）返回全部资金记录，
// 用于重放时复刻「每条记录取当时日期最大一条的余额」这一既有的现金链条规则。
func (d *stockDaoImpl) ListFundRecordsInInsertOrder(ws *workspace.Workspace, ledgerID string) ([]models.StockFundRecord, error) {
	records := make([]models.StockFundRecord, 0)
	err := ws.GetDb().Where("ledger_id = ?", ledgerID).
		Order("created_at ASC, id ASC").
		Find(&records).Error
	return records, err
}

// DeleteTradeFundRecords 清空买卖产生的资金记录，保留本金/追加/支取记录。
func (d *stockDaoImpl) DeleteTradeFundRecords(ws *workspace.Workspace, ledgerID string) error {
	return ws.GetDb().Where("ledger_id = ? AND event_type IN ?", ledgerID,
		[]string{models.StockEventBuy, models.StockEventSell}).
		Delete(&models.StockFundRecord{}).Error
}

// UpdateFundRecordCashBalance 只回写资金记录的现金余额（重算链条使用）。
func (d *stockDaoImpl) UpdateFundRecordCashBalance(ws *workspace.Workspace, id string, cashBalance int64) error {
	return ws.GetDb().Model(&models.StockFundRecord{}).Where("id = ?", id).
		Update("cash_balance", cashBalance).Error
}

func (d *stockDaoImpl) UpdateTradeHistoryName(ws *workspace.Workspace, ledgerID string, stockCode string, stockName string) error {
	return ws.GetDb().Model(&models.StockTradeHistory{}).
		Where("ledger_id = ? AND stock_code = ?", ledgerID, stockCode).
		Update("stock_name", stockName).Error
}

func (d *stockDaoImpl) ListTradeHistories(ws *workspace.Workspace, ledgerID string) ([]models.StockTradeHistory, error) {
	histories := make([]models.StockTradeHistory, 0)
	err := ws.GetDb().Where("ledger_id = ?", ledgerID).
		Order("updated_at DESC, created_at DESC").
		Find(&histories).Error
	return histories, err
}

// ListTradeStocks 返回存在交易记录的股票代码列表（历史回填使用）。
func (d *stockDaoImpl) ListTradeStocks(ws *workspace.Workspace, ledgerID string) ([]string, error) {
	codes := make([]string, 0)
	err := ws.GetDb().Model(&models.StockTrade{}).
		Where("ledger_id = ?", ledgerID).
		Distinct().
		Pluck("stock_code", &codes).Error
	return codes, err
}

func (d *stockDaoImpl) CountTradeRounds(ws *workspace.Workspace, historyID string) (int64, error) {
	var count int64
	err := ws.GetDb().Model(&models.StockTradeRound{}).
		Where("history_id = ?", historyID).Count(&count).Error
	return count, err
}

func (d *stockDaoImpl) CreateTradeRound(ws *workspace.Workspace, round *models.StockTradeRound) error {
	return ws.GetDb().Create(round).Error
}

func (d *stockDaoImpl) ListTradeRoundsByStock(ws *workspace.Workspace, ledgerID string, stockCode string) ([]models.StockTradeRound, error) {
	rounds := make([]models.StockTradeRound, 0)
	err := ws.GetDb().Where("ledger_id = ? AND stock_code = ?", ledgerID, stockCode).
		Order("round_no ASC").
		Find(&rounds).Error
	return rounds, err
}

// ListTradeRounds 返回整个账本的全部轮次（重放重建时用于保留标签与复盘）。
func (d *stockDaoImpl) ListTradeRounds(ws *workspace.Workspace, ledgerID string) ([]models.StockTradeRound, error) {
	rounds := make([]models.StockTradeRound, 0)
	err := ws.GetDb().Where("ledger_id = ?", ledgerID).
		Order("stock_code ASC, round_no ASC").
		Find(&rounds).Error
	return rounds, err
}

func (d *stockDaoImpl) DeleteTradeRound(ws *workspace.Workspace, roundID string) error {
	return ws.GetDb().Where("id = ?", roundID).Delete(&models.StockTradeRound{}).Error
}

// UpdateTradeRoundDerived 回写轮次的派生字段（历史集合与起止时间），标签与复盘保持不变。
func (d *stockDaoImpl) UpdateTradeRoundDerived(ws *workspace.Workspace, roundID string, historyID string, openedAt int64, closedAt int64) error {
	return ws.GetDb().Model(&models.StockTradeRound{}).Where("id = ?", roundID).Updates(map[string]any{
		"history_id": historyID,
		"opened_at":  openedAt,
		"closed_at":  closedAt,
	}).Error
}

func (d *stockDaoImpl) GetTradeRound(ws *workspace.Workspace, roundID string) (*models.StockTradeRound, error) {
	var round models.StockTradeRound
	err := ws.GetDb().Where("id = ?", roundID).First(&round).Error
	if err != nil {
		return nil, err
	}
	return &round, nil
}

func (d *stockDaoImpl) UpdateTradeRoundReview(ws *workspace.Workspace, roundID string, review string) error {
	return ws.GetDb().Model(&models.StockTradeRound{}).
		Where("id = ?", roundID).
		Update("review", review).Error
}

func (d *stockDaoImpl) UpdateTradeRoundTag(ws *workspace.Workspace, roundID string, tag string) error {
	return ws.GetDb().Model(&models.StockTradeRound{}).
		Where("id = ?", roundID).
		Update("tag", tag).Error
}

func (d *stockDaoImpl) ListTradesByRound(ws *workspace.Workspace, roundID string) ([]models.StockTrade, error) {
	trades := make([]models.StockTrade, 0)
	err := ws.GetDb().Where("round_id = ?", roundID).
		Order("trade_time ASC, created_at ASC, id ASC").
		Find(&trades).Error
	return trades, err
}

// MinUnattachedTradeTime 返回某股尚未挂接轮次的最小成交时间；全部已挂接时返回 0。
func (d *stockDaoImpl) MinUnattachedTradeTime(ws *workspace.Workspace, ledgerID string, stockCode string) (int64, error) {
	var minTime int64
	err := ws.GetDb().Model(&models.StockTrade{}).
		Select("COALESCE(MIN(trade_time), 0)").
		Where("ledger_id = ? AND stock_code = ? AND (round_id = '' OR round_id IS NULL)", ledgerID, stockCode).
		Scan(&minTime).Error
	return minTime, err
}

// AttachUnattachedTrades 把某股全部未挂接的交易挂到指定轮次（清仓时收尾）。
func (d *stockDaoImpl) AttachUnattachedTrades(ws *workspace.Workspace, ledgerID string, stockCode string, roundID string) error {
	return ws.GetDb().Model(&models.StockTrade{}).
		Where("ledger_id = ? AND stock_code = ? AND (round_id = '' OR round_id IS NULL)", ledgerID, stockCode).
		Update("round_id", roundID).Error
}

// UpdateTradesRoundID 批量把指定交易挂到轮次（历史回填使用）。
func (d *stockDaoImpl) UpdateTradesRoundID(ws *workspace.Workspace, roundID string, ids []string) error {
	if len(ids) == 0 {
		return nil
	}
	return ws.GetDb().Model(&models.StockTrade{}).
		Where("id IN ?", ids).
		Update("round_id", roundID).Error
}

// QueryStockName 从已有交易记录查询股票名称（跨账本，按最近成交优先）。
func (d *stockDaoImpl) QueryStockName(ws *workspace.Workspace, stockCode string) (string, error) {
	var name string
	if err := ws.GetDb().Model(&models.StockTrade{}).
		Where("stock_code = ?", stockCode).
		Order("created_at DESC, id DESC").
		Limit(1).
		Pluck("stock_name", &name).Error; err != nil {
		return "", err
	}
	if name == "" {
		return "", gorm.ErrRecordNotFound
	}
	return name, nil
}

func (d *stockDaoImpl) DeleteByLedgerId(ws *workspace.Workspace, ledgerID string) error {
	if err := ws.GetDb().Where("ledger_id = ?", ledgerID).Delete(&models.StockFundRecord{}).Error; err != nil {
		return err
	}
	if err := ws.GetDb().Where("ledger_id = ?", ledgerID).Delete(&models.StockFeeSetting{}).Error; err != nil {
		return err
	}
	if err := ws.GetDb().Where("ledger_id = ?", ledgerID).Delete(&models.StockTradeTagSetting{}).Error; err != nil {
		return err
	}
	if err := ws.GetDb().Where("ledger_id = ?", ledgerID).Delete(&models.StockTrade{}).Error; err != nil {
		return err
	}
	if err := ws.GetDb().Where("ledger_id = ?", ledgerID).Delete(&models.StockTradeRound{}).Error; err != nil {
		return err
	}
	if err := ws.GetDb().Where("ledger_id = ?", ledgerID).Delete(&models.StockTradeHistory{}).Error; err != nil {
		return err
	}
	if err := ws.GetDb().Where("ledger_id = ?", ledgerID).Delete(&models.StockPosition{}).Error; err != nil {
		return err
	}
	return ws.GetDb().Where("ledger_id = ?", ledgerID).Delete(&models.StockAccount{}).Error
}

// ResetByLedgerId 清空指定账本的全部股票交易数据（账户、持仓、交易、资金记录、费用设置），用于设置页「重置」。
// 历史工作空间可能残留已下线功能的日志表，存在则一并清空。
func (d *stockDaoImpl) ResetByLedgerId(ws *workspace.Workspace, ledgerID string) error {
	return ws.Transaction(func(tx *workspace.Workspace) error {
		tables := []string{
			"tbl_billadm_stock_fund_record",
			"tbl_billadm_stock_fee_setting",
			"tbl_billadm_stock_trade_tag_setting",
			"tbl_billadm_stock_trade",
			"tbl_billadm_stock_trade_round",
			"tbl_billadm_stock_trade_history",
			"tbl_billadm_stock_position",
			"tbl_billadm_stock_account",
		}
		for _, table := range tables {
			if err := tx.GetDb().Exec("DELETE FROM "+table+" WHERE ledger_id = ?", ledgerID).Error; err != nil {
				return err
			}
		}
		if tx.GetDb().Migrator().HasTable("tbl_billadm_stock_journal") {
			if err := tx.GetDb().Exec("DELETE FROM tbl_billadm_stock_journal WHERE ledger_id = ?", ledgerID).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// IsNotFound 判断 GORM 查询错误是否为"记录不存在"。
func IsNotFound(err error) bool {
	return errors.Is(err, gorm.ErrRecordNotFound)
}
