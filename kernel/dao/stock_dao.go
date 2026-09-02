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
	GetTradeHistory(ws *workspace.Workspace, ledgerID string, stockCode string) (*models.StockTradeHistory, error)
	CreateTradeHistory(ws *workspace.Workspace, history *models.StockTradeHistory) error
	UpdateTradeHistoryName(ws *workspace.Workspace, ledgerID string, stockCode string, stockName string) error
	ListTradeHistories(ws *workspace.Workspace, ledgerID string) ([]models.StockTradeHistory, error)
	ListTradeStocks(ws *workspace.Workspace, ledgerID string) ([]string, error)
	CountTradeRounds(ws *workspace.Workspace, historyID string) (int64, error)
	CreateTradeRound(ws *workspace.Workspace, round *models.StockTradeRound) error
	ListTradeRoundsByStock(ws *workspace.Workspace, ledgerID string, stockCode string) ([]models.StockTradeRound, error)
	ListTradesByRound(ws *workspace.Workspace, roundID string) ([]models.StockTrade, error)
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
		Select("quantity", "total_cost", "realized_pnl", "stock_name").
		Updates(map[string]any{
			"quantity":     position.Quantity,
			"total_cost":   position.TotalCost,
			"realized_pnl": position.RealizedPnl,
			"stock_name":   position.StockName,
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
