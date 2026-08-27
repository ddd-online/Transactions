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
	CountFundRecords(ws *workspace.Workspace, ledgerID string) (int64, error)
	GetPosition(ws *workspace.Workspace, ledgerID string, stockCode string) (*models.StockPosition, error)
	CreatePosition(ws *workspace.Workspace, position *models.StockPosition) error
	UpdatePosition(ws *workspace.Workspace, position *models.StockPosition) error
	ListPositions(ws *workspace.Workspace, ledgerID string) ([]models.StockPosition, error)
	CreateTrade(ws *workspace.Workspace, trade *models.StockTrade) error
	ListTrades(ws *workspace.Workspace, ledgerID string, stockCode string) ([]models.StockTrade, error)
	GetJournal(ws *workspace.Workspace, ledgerID string, stockCode string) (*models.StockJournal, error)
	CreateJournal(ws *workspace.Workspace, journal *models.StockJournal) error
	UpdateJournal(ws *workspace.Workspace, journal *models.StockJournal) error
	DeleteByLedgerId(ws *workspace.Workspace, ledgerID string) error
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
		Select("quantity", "avg_cost", "total_cost", "realized_pnl", "stock_name").
		Updates(map[string]any{
			"quantity":      position.Quantity,
			"avg_cost":      position.AvgCost,
			"total_cost":    position.TotalCost,
			"realized_pnl":  position.RealizedPnl,
			"stock_name":    position.StockName,
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

func (d *stockDaoImpl) GetJournal(ws *workspace.Workspace, ledgerID string, stockCode string) (*models.StockJournal, error) {
	var journal models.StockJournal
	err := ws.GetDb().Where("ledger_id = ? AND stock_code = ?", ledgerID, stockCode).First(&journal).Error
	if err != nil {
		return nil, err
	}
	return &journal, nil
}

func (d *stockDaoImpl) CreateJournal(ws *workspace.Workspace, journal *models.StockJournal) error {
	return ws.GetDb().Create(journal).Error
}

func (d *stockDaoImpl) UpdateJournal(ws *workspace.Workspace, journal *models.StockJournal) error {
	return ws.GetDb().Model(journal).
		Select("rules", "plan", "review", "stock_name").
		Updates(map[string]any{
			"rules":      journal.Rules,
			"plan":       journal.Plan,
			"review":     journal.Review,
			"stock_name": journal.StockName,
		}).Error
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
	if err := ws.GetDb().Where("ledger_id = ?", ledgerID).Delete(&models.StockPosition{}).Error; err != nil {
		return err
	}
	if err := ws.GetDb().Where("ledger_id = ?", ledgerID).Delete(&models.StockJournal{}).Error; err != nil {
		return err
	}
	return ws.GetDb().Where("ledger_id = ?", ledgerID).Delete(&models.StockAccount{}).Error
}

// IsNotFound 判断 GORM 查询错误是否为"记录不存在"。
func IsNotFound(err error) bool {
	return errors.Is(err, gorm.ErrRecordNotFound)
}
