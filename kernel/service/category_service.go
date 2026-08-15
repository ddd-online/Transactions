package service

import (
	"fmt"

	"github.com/transactions/dao"
	"github.com/transactions/models"
	"github.com/transactions/workspace"
	"github.com/sirupsen/logrus"
)

func NewCategoryService(tagService TagService, categoryDao dao.CategoryDao) CategoryService {
	return &categoryServiceImpl{
		tagService:  tagService,
		categoryDao: categoryDao,
	}
}

type CategoryService interface {
	QueryCategory(ws *workspace.Workspace, ledgerID string, trType string) ([]models.Category, error)
	CreateCategory(ws *workspace.Workspace, ledgerId string, name string, transactionType string) error
	DeleteCategory(ws *workspace.Workspace, ledgerId string, name string, transactionType string) error
	UpdateCategorySort(ws *workspace.Workspace, ledgerID string, name string, transactionType string, sortOrder int) error
	CountRecordsByCategory(ws *workspace.Workspace, ledgerId string, category string) (int64, error)
	CountRecordsByCategories(ws *workspace.Workspace, ledgerId string, names []string) (map[string]int64, error)
	InitializeCategories(ws *workspace.Workspace, ledgerID string) (int, int, error)
}

var _ CategoryService = &categoryServiceImpl{}

type categoryServiceImpl struct {
	tagService  TagService
	categoryDao dao.CategoryDao
}

func (c *categoryServiceImpl) QueryCategory(ws *workspace.Workspace, ledgerID string, trType string) ([]models.Category, error) {
	return c.categoryDao.QueryByLedger(ws, ledgerID, trType)
}

func (c *categoryServiceImpl) CreateCategory(ws *workspace.Workspace, ledgerId string, name string, transactionType string) error {
	maxSortOrder, err := c.categoryDao.GetMaxSort(ws, ledgerId, transactionType)
	if err != nil {
		logrus.Errorf("获取最大排序号失败: %v", err)
		return err
	}

	category := &models.Category{
		LedgerID:        ledgerId,
		Name:            name,
		TransactionType: transactionType,
		SortOrder:       maxSortOrder + 1,
	}

	if err := c.categoryDao.Create(ws, category); err != nil {
		logrus.Errorf("创建分类失败: %v", err)
		return err
	}

	return nil
}

func (c *categoryServiceImpl) DeleteCategory(ws *workspace.Workspace, ledgerId string, name string, transactionType string) error {
	categoryTransactionType := fmt.Sprintf("%s:%s", name, transactionType)
	err := ws.Transaction(func(tx *workspace.Workspace) error {
		if err := c.tagService.DeleteTagsByCategory(tx, ledgerId, categoryTransactionType); err != nil {
			return err
		}
		if err := c.categoryDao.Delete(tx, ledgerId, name, transactionType); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		logrus.Errorf("删除分类失败: %v", err)
		return err
	}
	return nil
}

func (c *categoryServiceImpl) UpdateCategorySort(ws *workspace.Workspace, ledgerID string, name string, transactionType string, sortOrder int) error {
	if err := c.categoryDao.UpdateSort(ws, ledgerID, name, transactionType, sortOrder); err != nil {
		logrus.Errorf("更新分类排序失败: %v", err)
		return err
	}

	return nil
}

func (c *categoryServiceImpl) CountRecordsByCategory(ws *workspace.Workspace, ledgerId string, category string) (int64, error) {
	var count int64
	err := ws.GetDb().Model(&models.TransactionRecord{}).
		Where("ledger_id = ? AND category = ?", ledgerId, category).
		Count(&count).Error
	return count, err
}

// CountRecordsByCategories 批量统计每个分类名下的交易记录数，避免逐分类 COUNT 的 N+1 查询。
func (c *categoryServiceImpl) CountRecordsByCategories(ws *workspace.Workspace, ledgerId string, names []string) (map[string]int64, error) {
	result := make(map[string]int64, len(names))
	if len(names) == 0 {
		return result, nil
	}
	type row struct {
		Category string
		Cnt      int64
	}
	var rows []row
	err := ws.GetDb().Model(&models.TransactionRecord{}).
		Select("category, COUNT(*) AS cnt").
		Where("ledger_id = ? AND category IN ?", ledgerId, names).
		Group("category").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, r := range rows {
		result[r.Category] = r.Cnt
	}
	return result, nil
}

func (c *categoryServiceImpl) InitializeCategories(ws *workspace.Workspace, ledgerID string) (int, int, error) {
	logrus.Infof("开始初始化账本 %s 的分类", ledgerID)

	count, err := c.categoryDao.CountByLedgerId(ws, ledgerID)
	if err != nil {
		logrus.Errorf("检查分类是否存在失败: %v", err)
		return 0, 0, err
	}
	if count > 0 {
		return 0, 0, fmt.Errorf("该账本已有分类，无需初始化")
	}

	categoryCount, tagCount, err := workspace.SeedData(ws.GetDb(), ledgerID)
	if err != nil {
		logrus.Errorf("初始化分类失败: %v", err)
		return 0, 0, err
	}

	logrus.Infof("初始化分类成功, 账本: %s, 分类: %d, 标签: %d", ledgerID, categoryCount, tagCount)
	return categoryCount, tagCount, nil
}
