package dao

import (
	"github.com/billadm/models"
	"github.com/billadm/workspace"
)

type CategoryDao interface {
	QueryByLedger(ws *workspace.Workspace, ledgerID string, trType string) ([]models.Category, error)
	GetMaxSort(ws *workspace.Workspace, ledgerId string, transactionType string) (int, error)
	Create(ws *workspace.Workspace, category *models.Category) error
	Delete(ws *workspace.Workspace, ledgerId string, name string, transactionType string) error
	UpdateSort(ws *workspace.Workspace, ledgerID string, name string, transactionType string, sortOrder int) error
	CountByLedgerId(ws *workspace.Workspace, ledgerID string) (int64, error)
}

var _ CategoryDao = &categoryDaoImpl{}

type categoryDaoImpl struct{}

func NewCategoryDao() CategoryDao {
	return &categoryDaoImpl{}
}

func (d *categoryDaoImpl) QueryByLedger(ws *workspace.Workspace, ledgerID string, trType string) ([]models.Category, error) {
	categories := make([]models.Category, 0)
	db := ws.GetDb().Where("ledger_id = ?", ledgerID)
	if trType != "" && trType != "all" {
		db = db.Where("transaction_type = ?", trType)
	}
	if err := db.Order("sort_order ASC, name DESC").Find(&categories).Error; err != nil {
		return nil, err
	}
	return categories, nil
}

func (d *categoryDaoImpl) GetMaxSort(ws *workspace.Workspace, ledgerId string, transactionType string) (int, error) {
	var maxSortOrder int
	if err := ws.GetDb().Model(&models.Category{}).
		Where("ledger_id = ? AND transaction_type = ?", ledgerId, transactionType).
		Select("COALESCE(MAX(sort_order), 0)").
		Scan(&maxSortOrder).Error; err != nil {
		return 0, err
	}
	return maxSortOrder, nil
}

func (d *categoryDaoImpl) Create(ws *workspace.Workspace, category *models.Category) error {
	return ws.GetDb().Create(category).Error
}

func (d *categoryDaoImpl) Delete(ws *workspace.Workspace, ledgerId string, name string, transactionType string) error {
	return ws.GetDb().
		Where("ledger_id = ? AND name = ? AND transaction_type = ?", ledgerId, name, transactionType).
		Delete(&models.Category{}).Error
}

func (d *categoryDaoImpl) UpdateSort(ws *workspace.Workspace, ledgerID string, name string, transactionType string, sortOrder int) error {
	return ws.GetDb().
		Model(&models.Category{}).
		Where("ledger_id = ? AND name = ? AND transaction_type = ?", ledgerID, name, transactionType).
		Update("sort_order", sortOrder).Error
}

func (d *categoryDaoImpl) CountByLedgerId(ws *workspace.Workspace, ledgerID string) (int64, error) {
	var count int64
	err := ws.GetDb().Model(&models.Category{}).
		Where("ledger_id = ?", ledgerID).
		Count(&count).Error
	return count, err
}
