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

func (d *stockDaoImpl) DeleteByLedgerId(ws *workspace.Workspace, ledgerID string) error {
	if err := ws.GetDb().Where("ledger_id = ?", ledgerID).Delete(&models.StockFundRecord{}).Error; err != nil {
		return err
	}
	if err := ws.GetDb().Where("ledger_id = ?", ledgerID).Delete(&models.StockFeeSetting{}).Error; err != nil {
		return err
	}
	return ws.GetDb().Where("ledger_id = ?", ledgerID).Delete(&models.StockAccount{}).Error
}

// IsNotFound 判断 GORM 查询错误是否为"记录不存在"。
func IsNotFound(err error) bool {
	return errors.Is(err, gorm.ErrRecordNotFound)
}
