package dao

import (
	"sync"

	"github.com/billadm/constant"
	"github.com/billadm/models"
	"github.com/billadm/workspace"
)

var (
	categoryDao     CategoryDao
	categoryDaoOnce sync.Once
)

func GetCategoryDao() CategoryDao {
	if categoryDao != nil {
		return categoryDao
	}
	categoryDaoOnce.Do(func() {
		categoryDao = &categoryDaoImpl{}
	})
	return categoryDao
}

type CategoryDao interface {
	QueryCategory(ws *workspace.Workspace, ledgerID string, trType string) ([]models.Category, error)
	CreateCategory(ws *workspace.Workspace, category *models.Category) error
	DeleteCategory(ws *workspace.Workspace, ledgerID string, name string, transactionType string) error
	IsCategoryInUse(ws *workspace.Workspace, ledgerID string, category string) (bool, error)
	UpdateCategorySort(ws *workspace.Workspace, ledgerID string, name string, transactionType string, sortOrder int) error
	GetMaxSortOrder(ws *workspace.Workspace, ledgerID string, transactionType string) (int, error)
	CountRecordsByCategory(ws *workspace.Workspace, ledgerID string, category string) (int64, error)
	HasCategories(ws *workspace.Workspace, ledgerID string) (bool, error)
}

var _ CategoryDao = &categoryDaoImpl{}

type categoryDaoImpl struct{}

func (c *categoryDaoImpl) QueryCategory(ws *workspace.Workspace, ledgerID string, trType string) ([]models.Category, error) {
	categories := make([]models.Category, 0)
	db := ws.GetDb().Where("ledger_id = ?", ledgerID)
	if trType != constant.All {
		db = db.Where("transaction_type = ?", trType)
	}
	if err := db.Order("sort_order ASC, name DESC").Find(&categories).Error; err != nil {
		return nil, err
	}
	return categories, nil
}

func (c *categoryDaoImpl) CreateCategory(ws *workspace.Workspace, category *models.Category) error {
	return ws.GetDb().Create(category).Error
}

func (c *categoryDaoImpl) DeleteCategory(ws *workspace.Workspace, ledgerID string, name string, transactionType string) error {
	return ws.GetDb().
		Where("ledger_id = ? AND name = ? AND transaction_type = ?", ledgerID, name, transactionType).
		Delete(&models.Category{}).Error
}

func (c *categoryDaoImpl) IsCategoryInUse(ws *workspace.Workspace, ledgerID string, category string) (bool, error) {
	var count int64
	err := ws.GetDb().Model(&models.TransactionRecord{}).
		Where("ledger_id = ? AND category = ?", ledgerID, category).
		Count(&count).Error
	return count > 0, err
}

func (c *categoryDaoImpl) UpdateCategorySort(ws *workspace.Workspace, ledgerID string, name string, transactionType string, sortOrder int) error {
	return ws.GetDb().
		Model(&models.Category{}).
		Where("ledger_id = ? AND name = ? AND transaction_type = ?", ledgerID, name, transactionType).
		Update("sort_order", sortOrder).Error
}

func (c *categoryDaoImpl) GetMaxSortOrder(ws *workspace.Workspace, ledgerID string, transactionType string) (int, error) {
	var maxSortOrder int
	err := ws.GetDb().Model(&models.Category{}).
		Where("ledger_id = ? AND transaction_type = ?", ledgerID, transactionType).
		Select("COALESCE(MAX(sort_order), 0)").
		Scan(&maxSortOrder).Error
	return maxSortOrder, err
}

func (c *categoryDaoImpl) CountRecordsByCategory(ws *workspace.Workspace, ledgerID string, category string) (int64, error) {
	var count int64
	err := ws.GetDb().Model(&models.TransactionRecord{}).
		Where("ledger_id = ? AND category = ?", ledgerID, category).
		Count(&count).Error
	return count, err
}

func (c *categoryDaoImpl) HasCategories(ws *workspace.Workspace, ledgerID string) (bool, error) {
	var count int64
	err := ws.GetDb().Model(&models.Category{}).
		Where("ledger_id = ?", ledgerID).
		Count(&count).Error
	return count > 0, err
}
