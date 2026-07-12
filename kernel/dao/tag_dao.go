package dao

import (
	"github.com/billadm/models"
	"github.com/billadm/workspace"
)

type TagDao interface {
	QueryByLedger(ws *workspace.Workspace, ledgerID string, categoryTransactionType string) ([]models.Tag, error)
	GetMaxSort(ws *workspace.Workspace, ledgerID string, categoryTransactionType string) (int, error)
	Create(ws *workspace.Workspace, tag *models.Tag) error
	Delete(ws *workspace.Workspace, ledgerId string, name string, categoryTransactionType string) error
	DeleteByCategory(ws *workspace.Workspace, ledgerID string, categoryTransactionType string) error
	UpdateSort(ws *workspace.Workspace, ledgerID string, name string, categoryTransactionType string, sortOrder int) error
	CountByTag(ws *workspace.Workspace, ledgerId string, tag string) (int64, error)
}

var _ TagDao = &tagDaoImpl{}

type tagDaoImpl struct{}

func NewTagDao() TagDao {
	return &tagDaoImpl{}
}

func (d *tagDaoImpl) QueryByLedger(ws *workspace.Workspace, ledgerID string, categoryTransactionType string) ([]models.Tag, error) {
	tags := make([]models.Tag, 0)
	db := ws.GetDb().Where("ledger_id = ?", ledgerID)
	if categoryTransactionType != "" && categoryTransactionType != "all" {
		db = db.Where("category_transaction_type = ?", categoryTransactionType)
	}
	if err := db.Order("sort_order ASC, name DESC").Find(&tags).Error; err != nil {
		return nil, err
	}
	return tags, nil
}

func (d *tagDaoImpl) GetMaxSort(ws *workspace.Workspace, ledgerID string, categoryTransactionType string) (int, error) {
	var maxSortOrder int
	if err := ws.GetDb().Model(&models.Tag{}).
		Where("ledger_id = ? AND category_transaction_type = ?", ledgerID, categoryTransactionType).
		Select("COALESCE(MAX(sort_order), 0)").
		Scan(&maxSortOrder).Error; err != nil {
		return 0, err
	}
	return maxSortOrder, nil
}

func (d *tagDaoImpl) Create(ws *workspace.Workspace, tag *models.Tag) error {
	return ws.GetDb().Create(tag).Error
}

func (d *tagDaoImpl) Delete(ws *workspace.Workspace, ledgerId string, name string, categoryTransactionType string) error {
	return ws.GetDb().
		Where("ledger_id = ? AND name = ? AND category_transaction_type = ?", ledgerId, name, categoryTransactionType).
		Delete(&models.Tag{}).Error
}

func (d *tagDaoImpl) DeleteByCategory(ws *workspace.Workspace, ledgerID string, categoryTransactionType string) error {
	return ws.GetDb().
		Where("ledger_id = ? AND category_transaction_type = ?", ledgerID, categoryTransactionType).
		Delete(&models.Tag{}).Error
}

func (d *tagDaoImpl) UpdateSort(ws *workspace.Workspace, ledgerID string, name string, categoryTransactionType string, sortOrder int) error {
	return ws.GetDb().
		Model(&models.Tag{}).
		Where("ledger_id = ? AND name = ? AND category_transaction_type = ?", ledgerID, name, categoryTransactionType).
		Update("sort_order", sortOrder).Error
}

func (d *tagDaoImpl) CountByTag(ws *workspace.Workspace, ledgerId string, tag string) (int64, error) {
	var count int64
	err := ws.GetDb().Model(&models.TrTag{}).
		Where("ledger_id = ? AND tag = ?", ledgerId, tag).
		Count(&count).Error
	if err != nil {
		return 0, err
	}
	return count, nil
}
