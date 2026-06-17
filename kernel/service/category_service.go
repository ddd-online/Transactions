package service

import (
	"fmt"
	"sync"

	"github.com/billadm/dao"
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
			categoryDao: dao.GetCategoryDao(),
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
	categoryDao dao.CategoryDao
}

func (c *categoryServiceImpl) QueryCategory(ws *workspace.Workspace, ledgerID string, trType string) ([]models.Category, error) {
	logrus.Infof("start to query category by %s, ledger: %s", trType, ledgerID)
	categories, err := c.categoryDao.QueryCategory(ws, ledgerID, trType)
	if err != nil {
		return nil, err
	}

	// Reassign sort_order from 0 based on current order
	for i, cat := range categories {
		if cat.SortOrder != i {
			cat.SortOrder = i
			if err := c.categoryDao.UpdateCategorySort(ws, ledgerID, cat.Name, cat.TransactionType, i); err != nil {
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
	maxSortOrder, err := c.categoryDao.GetMaxSortOrder(ws, ledgerId, transactionType)
	if err != nil {
		logrus.Errorf("get max sort order failed: %v", err)
		return err
	}

	category := &models.Category{
		LedgerID:        ledgerId,
		Name:            name,
		TransactionType: transactionType,
		SortOrder:       maxSortOrder + 1,
	}

	if err := c.categoryDao.CreateCategory(ws, category); err != nil {
		logrus.Errorf("create category failed: %v", err)
		return err
	}

	logrus.Infof("create category success, ledger id: %s, name: %s", ledgerId, name)
	return nil
}

func (c *categoryServiceImpl) DeleteCategory(ws *workspace.Workspace, ledgerId string, name string, transactionType string) error {
	logrus.Infof("start to delete category, ledger id: %s, name: %s", ledgerId, name)

	// Check if category is in use
	inUse, err := c.categoryDao.IsCategoryInUse(ws, ledgerId, name)
	if err != nil {
		logrus.Errorf("check category usage failed: %v", err)
		return err
	}
	if inUse {
		logrus.Warnf("category is in use, cannot delete: %s", name)
		return fmt.Errorf("分类已被使用，无法删除")
	}

	// Delete all tags under this category
	categoryTransactionType := fmt.Sprintf("%s:%s", name, transactionType)
	tagDao := dao.GetTagDao()
	if err := tagDao.DeleteTagsByCategory(ws, ledgerId, categoryTransactionType); err != nil {
		logrus.Errorf("delete category tags failed: %v", err)
		return err
	}

	// Delete the category
	if err := c.categoryDao.DeleteCategory(ws, ledgerId, name, transactionType); err != nil {
		logrus.Errorf("delete category failed: %v", err)
		return err
	}

	logrus.Infof("delete category success, ledger id: %s, name: %s", ledgerId, name)
	return nil
}

func (c *categoryServiceImpl) UpdateCategorySort(ws *workspace.Workspace, ledgerID string, name string, transactionType string, sortOrder int) error {
	logrus.Infof("start to update category sort, name: %s, type: %s, sortOrder: %d", name, transactionType, sortOrder)

	if err := c.categoryDao.UpdateCategorySort(ws, ledgerID, name, transactionType, sortOrder); err != nil {
		logrus.Errorf("update category sort failed: %v", err)
		return err
	}

	logrus.Infof("update category sort success, name: %s", name)
	return nil
}

func (c *categoryServiceImpl) CountRecordsByCategory(ws *workspace.Workspace, ledgerId string, category string) (int64, error) {
	return c.categoryDao.CountRecordsByCategory(ws, ledgerId, category)
}

func (c *categoryServiceImpl) InitializeCategories(ws *workspace.Workspace, ledgerID string) (int, int, error) {
	logrus.Infof("start to initialize categories for ledger: %s", ledgerID)

	hasCategories, err := c.categoryDao.HasCategories(ws, ledgerID)
	if err != nil {
		logrus.Errorf("check has categories failed: %v", err)
		return 0, 0, err
	}
	if hasCategories {
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
