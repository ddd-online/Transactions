package dao

import (
	"github.com/billadm/util/set"

	"github.com/billadm/models"
	"github.com/billadm/models/dto"
	"github.com/billadm/workspace"
	"gorm.io/gorm"
)

func NewTransactionRecordDao() TransactionRecordDao {
	return &transactionRecordDaoImpl{}
}

type TransactionRecordDao interface {
	CreateTr(ws *workspace.Workspace, record *models.TransactionRecord) error
	ListAllTrByLedgerId(ws *workspace.Workspace, ledgerId string) ([]*models.TransactionRecord, error)
	QueryTrsOnCondition(ws *workspace.Workspace, condition *dto.TrQueryCondition) ([]*models.TransactionRecord, error)
	QueryById(ws *workspace.Workspace, trId string) (*models.TransactionRecord, error)
	DeleteTrById(ws *workspace.Workspace, trId string) error
	CountTrByLedgerId(ws *workspace.Workspace, ledgerId string) (int64, error)
	DeleteAllTrByLedgerId(ws *workspace.Workspace, ledgerId string) error
	UpdateKeyEventDate(ws *workspace.Workspace, trId string, date string) error
	QueryByKeyEventDate(ws *workspace.Workspace, date string) ([]*models.TransactionRecord, error)
}

var _ TransactionRecordDao = &transactionRecordDaoImpl{}

type transactionRecordDaoImpl struct{}

func (t *transactionRecordDaoImpl) CreateTr(ws *workspace.Workspace, record *models.TransactionRecord) error {
	if err := ws.GetDb().Create(record).Error; err != nil {
		return err
	}

	return nil
}

func (t *transactionRecordDaoImpl) ListAllTrByLedgerId(ws *workspace.Workspace, ledgerId string) ([]*models.TransactionRecord, error) {
	trs := make([]*models.TransactionRecord, 0)
	if err := ws.GetDb().
		Where("ledger_id = ?", ledgerId).
		Order("transaction_at desc, category desc").
		Find(&trs).Error; err != nil {
		return nil, err
	}

	return trs, nil
}

func (t *transactionRecordDaoImpl) QueryTrsOnCondition(ws *workspace.Workspace, condition *dto.TrQueryCondition) ([]*models.TransactionRecord, error) {
	trs := make([]*models.TransactionRecord, 0)
	db := ws.GetDb().Where("ledger_id = ?", condition.LedgerID)
	db = db.Order("transaction_at desc, transaction_type asc, category desc, price desc")
	if len(condition.TsRange) == 2 {
		db = db.Where("transaction_at >= ?", condition.TsRange[0]).Where("transaction_at <= ?", condition.TsRange[1])
	}
	ttSet := set.New[string]()
	for _, item := range condition.Items {
		ttSet.Add(item.TransactionType)
	}
	if ttSet.Size() > 0 {
		db = db.Where("transaction_type IN (?)", ttSet.Values())
	}
	db = db.Find(&trs)
	if err := db.Error; err != nil {
		return nil, err
	}
	return trs, nil
}

func (t *transactionRecordDaoImpl) QueryById(ws *workspace.Workspace, trId string) (*models.TransactionRecord, error) {
	var tr models.TransactionRecord
	if err := ws.GetDb().
		Where("transaction_id = ?", trId).
		First(&tr).Error; err != nil {
		return nil, err
	}
	return &tr, nil
}

func (t *transactionRecordDaoImpl) DeleteTrById(ws *workspace.Workspace, trId string) error {
	if err := ws.GetDb().
		Where("transaction_id = ?", trId).
		Delete(&models.TransactionRecord{}).Error; err != nil {
		return err
	}
	return nil
}

func (t *transactionRecordDaoImpl) CountTrByLedgerId(ws *workspace.Workspace, ledgerId string) (int64, error) {
	var count int64
	err := ws.GetDb().Model(&models.TransactionRecord{}).Where("ledger_id = ?", ledgerId).Count(&count).Error
	if err != nil {
		return -1, err
	}
	return count, nil
}

func (t *transactionRecordDaoImpl) DeleteAllTrByLedgerId(ws *workspace.Workspace, ledgerId string) error {
	if err := ws.GetDb().Where("ledger_id = ?", ledgerId).Delete(&models.TransactionRecord{}).Error; err != nil {
		return err
	}
	return nil
}

func (t *transactionRecordDaoImpl) UpdateKeyEventDate(ws *workspace.Workspace, trId string, date string) error {
	result := ws.GetDb().
		Model(&models.TransactionRecord{}).
		Where("transaction_id = ?", trId).
		Update("key_event_date", date)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (t *transactionRecordDaoImpl) QueryByKeyEventDate(ws *workspace.Workspace, date string) ([]*models.TransactionRecord, error) {
	trs := make([]*models.TransactionRecord, 0)
	err := ws.GetDb().
		Where("key_event_date = ?", date).
		Order("transaction_at desc").
		Find(&trs).Error
	return trs, err
}
