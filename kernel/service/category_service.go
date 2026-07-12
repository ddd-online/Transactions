package service

import (
	"fmt"

	"github.com/billadm/dao"
	"github.com/billadm/models"
	"github.com/billadm/workspace"
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
	if err := c.tagService.DeleteTagsByCategory(ws, ledgerId, categoryTransactionType); err != nil {
		logrus.Errorf("删除分类下标签失败: %v", err)
		return err
	}

	if err := c.categoryDao.Delete(ws, ledgerId, name, transactionType); err != nil {
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
