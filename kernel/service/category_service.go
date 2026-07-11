package service

import (
	"fmt"

	"github.com/billadm/constant"
	"github.com/billadm/models"
	"github.com/billadm/workspace"
	"github.com/sirupsen/logrus"
)

func NewCategoryService(tagService TagService) CategoryService {
	return &categoryServiceImpl{
		tagService: tagService,
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
	tagService TagService
}

func (c *categoryServiceImpl) QueryCategory(ws *workspace.Workspace, ledgerID string, trType string) ([]models.Category, error) {

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

func (c *categoryServiceImpl) CreateCategory(ws *workspace.Workspace, ledgerId string, name string, transactionType string) error {

	// Get max sort order for this transaction type
	var maxSortOrder int
	if err := ws.GetDb().Model(&models.Category{}).
		Where("ledger_id = ? AND transaction_type = ?", ledgerId, transactionType).
		Select("COALESCE(MAX(sort_order), 0)").
		Scan(&maxSortOrder).Error; err != nil {
		logrus.Errorf("获取最大排序号失败: %v", err)
		return err
	}

	category := &models.Category{
		LedgerID:        ledgerId,
		Name:            name,
		TransactionType: transactionType,
		SortOrder:       maxSortOrder + 1,
	}

	if err := ws.GetDb().Create(category).Error; err != nil {
		logrus.Errorf("创建分类失败: %v", err)
		return err
	}

	return nil
}

func (c *categoryServiceImpl) DeleteCategory(ws *workspace.Workspace, ledgerId string, name string, transactionType string) error {

	// Check if category is in use
	var count int64
	if err := ws.GetDb().Model(&models.TransactionRecord{}).
		Where("ledger_id = ? AND category = ?", ledgerId, name).
		Count(&count).Error; err != nil {
		logrus.Errorf("检查分类使用情况失败: %v", err)
		return err
	}
	if count > 0 {
		return fmt.Errorf("分类已被使用，无法删除")
	}

	// Delete all tags under this category
	categoryTransactionType := fmt.Sprintf("%s:%s", name, transactionType)
	if err := c.tagService.DeleteTagsByCategory(ws, ledgerId, categoryTransactionType); err != nil {
		logrus.Errorf("删除分类下标签失败: %v", err)
		return err
	}

	// Delete the category
	if err := ws.GetDb().
		Where("ledger_id = ? AND name = ? AND transaction_type = ?", ledgerId, name, transactionType).
		Delete(&models.Category{}).Error; err != nil {
		logrus.Errorf("删除分类失败: %v", err)
		return err
	}

	return nil
}

func (c *categoryServiceImpl) UpdateCategorySort(ws *workspace.Workspace, ledgerID string, name string, transactionType string, sortOrder int) error {

	if err := ws.GetDb().
		Model(&models.Category{}).
		Where("ledger_id = ? AND name = ? AND transaction_type = ?", ledgerID, name, transactionType).
		Update("sort_order", sortOrder).Error; err != nil {
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

	var count int64
	if err := ws.GetDb().Model(&models.Category{}).
		Where("ledger_id = ?", ledgerID).
		Count(&count).Error; err != nil {
		logrus.Errorf("检查分类是否存在失败: %v", err)
		return 0, 0, err
	}
	if count > 0 {
		return 0, 0, fmt.Errorf("该账本已有分类，无需初始化")
	}

	// SeedData 执行 DDL（删表+重建），不能放在事务中
	categoryCount, tagCount, err := workspace.SeedData(ws.GetDb(), ledgerID)
	if err != nil {
		logrus.Errorf("初始化分类失败: %v", err)
		return 0, 0, err
	}

	logrus.Infof("初始化分类成功, 账本: %s, 分类: %d, 标签: %d", ledgerID, categoryCount, tagCount)
	return categoryCount, tagCount, nil
}
