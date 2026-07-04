package service

import (
	"fmt"
	"sync"

	"github.com/billadm/constant"
	"github.com/billadm/models"
	"github.com/billadm/workspace"
	"github.com/sirupsen/logrus"
)

var (
	categoryService     CategoryService
	categoryServiceOnce sync.Once
)

func GetCategoryService() CategoryService {
	if categoryService != nil {
		return categoryService
	}

	categoryServiceOnce.Do(func() {
		categoryService = &categoryServiceImpl{
			tagService: GetTagService(),
		}
	})

	return categoryService
}

type CategoryService interface {
	QueryCategory(ws *workspace.Workspace, ledgerID string, trType string) ([]models.Category, error)
	CreateCategory(ws *workspace.Workspace, ledgerId string, name string, transactionType string) error
	DeleteCategory(ws *workspace.Workspace, ledgerId string, name string, transactionType string) error
	UpdateCategorySort(ws *workspace.Workspace, ledgerID string, name string, transactionType string, sortOrder int) error
	CountRecordsByCategory(ws *workspace.Workspace, ledgerId string, category string) (int64, error)
	InitializeCategories(ws *workspace.Workspace, ledgerID string) (int, int, error)
}

var _ CategoryService = &categoryServiceImpl{}

type categoryServiceImpl struct {
	tagService TagService
}

func (c *categoryServiceImpl) QueryCategory(ws *workspace.Workspace, ledgerID string, trType string) ([]models.Category, error) {
	logrus.Infof("start to query category by %s, ledger: %s", trType, ledgerID)

	categories := make([]models.Category, 0)
	db := ws.GetDb().Where("ledger_id = ?", ledgerID)
	if trType != constant.All {
		db = db.Where("transaction_type = ?", trType)
	}
	if err := db.Order("sort_order ASC, name DESC").Find(&categories).Error; err != nil {
		return nil, err
	}

	// Reassign sort_order from 0 based on current order
	for i, cat := range categories {
		if cat.SortOrder != i {
			cat.SortOrder = i
			if err := ws.GetDb().Model(&models.Category{}).
				Where("ledger_id = ? AND name = ? AND transaction_type = ?", ledgerID, cat.Name, cat.TransactionType).
				Update("sort_order", i).Error; err != nil {
				logrus.Errorf("reindex category sort failed: %v", err)
				return nil, err
			}
		}
	}

	logrus.Infof("query category success, length: %v", len(categories))
	return categories, nil
}

func (c *categoryServiceImpl) CreateCategory(ws *workspace.Workspace, ledgerId string, name string, transactionType string) error {
	logrus.Infof("start to create category, ledger id: %s, name: %s, type: %s", ledgerId, name, transactionType)

	// Get max sort order for this transaction type
	var maxSortOrder int
	if err := ws.GetDb().Model(&models.Category{}).
		Where("ledger_id = ? AND transaction_type = ?", ledgerId, transactionType).
		Select("COALESCE(MAX(sort_order), 0)").
		Scan(&maxSortOrder).Error; err != nil {
		logrus.Errorf("get max sort order failed: %v", err)
		return err
	}

	category := &models.Category{
		LedgerID:        ledgerId,
		Name:            name,
		TransactionType: transactionType,
		SortOrder:       maxSortOrder + 1,
	}

	if err := ws.GetDb().Create(category).Error; err != nil {
		logrus.Errorf("create category failed: %v", err)
		return err
	}

	logrus.Infof("create category success, ledger id: %s, name: %s", ledgerId, name)
	return nil
}

func (c *categoryServiceImpl) DeleteCategory(ws *workspace.Workspace, ledgerId string, name string, transactionType string) error {
	logrus.Infof("start to delete category, ledger id: %s, name: %s", ledgerId, name)

	// Check if category is in use
	var count int64
	if err := ws.GetDb().Model(&models.TransactionRecord{}).
		Where("ledger_id = ? AND category = ?", ledgerId, name).
		Count(&count).Error; err != nil {
		logrus.Errorf("check category usage failed: %v", err)
		return err
	}
	if count > 0 {
		logrus.Warnf("category is in use, cannot delete: %s", name)
		return fmt.Errorf("分类已被使用，无法删除")
	}

	// Delete all tags under this category
	categoryTransactionType := fmt.Sprintf("%s:%s", name, transactionType)
	if err := c.tagService.DeleteTagsByCategory(ws, ledgerId, categoryTransactionType); err != nil {
		logrus.Errorf("delete category tags failed: %v", err)
		return err
	}

	// Delete the category
	if err := ws.GetDb().
		Where("ledger_id = ? AND name = ? AND transaction_type = ?", ledgerId, name, transactionType).
		Delete(&models.Category{}).Error; err != nil {
		logrus.Errorf("delete category failed: %v", err)
		return err
	}

	logrus.Infof("delete category success, ledger id: %s, name: %s", ledgerId, name)
	return nil
}

func (c *categoryServiceImpl) UpdateCategorySort(ws *workspace.Workspace, ledgerID string, name string, transactionType string, sortOrder int) error {
	logrus.Infof("start to update category sort, name: %s, type: %s, sortOrder: %d", name, transactionType, sortOrder)

	if err := ws.GetDb().
		Model(&models.Category{}).
		Where("ledger_id = ? AND name = ? AND transaction_type = ?", ledgerID, name, transactionType).
		Update("sort_order", sortOrder).Error; err != nil {
		logrus.Errorf("update category sort failed: %v", err)
		return err
	}

	logrus.Infof("update category sort success, name: %s", name)
	return nil
}

func (c *categoryServiceImpl) CountRecordsByCategory(ws *workspace.Workspace, ledgerId string, category string) (int64, error) {
	var count int64
	err := ws.GetDb().Model(&models.TransactionRecord{}).
		Where("ledger_id = ? AND category = ?", ledgerId, category).
		Count(&count).Error
	return count, err
}

func (c *categoryServiceImpl) InitializeCategories(ws *workspace.Workspace, ledgerID string) (int, int, error) {
	logrus.Infof("start to initialize categories for ledger: %s", ledgerID)

	var count int64
	if err := ws.GetDb().Model(&models.Category{}).
		Where("ledger_id = ?", ledgerID).
		Count(&count).Error; err != nil {
		logrus.Errorf("check has categories failed: %v", err)
		return 0, 0, err
	}
	if count > 0 {
		return 0, 0, fmt.Errorf("该账本已有分类，无需初始化")
	}

	// SeedData 执行 DDL（删表+重建），不能放在事务中
	categoryCount, tagCount, err := workspace.SeedData(ws.GetDb(), ledgerID)
	if err != nil {
		logrus.Errorf("initialize categories failed: %v", err)
		return 0, 0, err
	}

	logrus.Infof("initialize categories success, ledger: %s, categories: %d, tags: %d", ledgerID, categoryCount, tagCount)
	return categoryCount, tagCount, nil
}
