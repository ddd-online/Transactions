package service

import (
	"github.com/billadm/constant"
	"github.com/billadm/models"
	"github.com/billadm/workspace"
	"github.com/sirupsen/logrus"
)

func NewTagService() TagService {
	return &tagServiceImpl{}
}

type TagService interface {
	QueryTags(ws *workspace.Workspace, ledgerID string, categoryTransactionType string) ([]models.Tag, error)
	CreateTag(ws *workspace.Workspace, ledgerID string, name string, categoryTransactionType string) error
	DeleteTag(ws *workspace.Workspace, ledgerId string, name string, categoryTransactionType string) error
	DeleteTagsByCategory(ws *workspace.Workspace, ledgerID string, categoryTransactionType string) error
	UpdateTagSort(ws *workspace.Workspace, ledgerID string, name string, categoryTransactionType string, sortOrder int) error
	CountRecordsByTag(ws *workspace.Workspace, ledgerId string, tag string) (int64, error)
}

var _ TagService = &tagServiceImpl{}

type tagServiceImpl struct{}

func (t *tagServiceImpl) QueryTags(ws *workspace.Workspace, ledgerID string, categoryTransactionType string) ([]models.Tag, error) {
	tags := make([]models.Tag, 0)
	db := ws.GetDb().Where("ledger_id = ?", ledgerID)
	if categoryTransactionType != constant.All {
		db = db.Where("category_transaction_type = ?", categoryTransactionType)
	}
	if err := db.Order("sort_order ASC, name DESC").Find(&tags).Error; err != nil {
		return nil, err
	}

	return tags, nil
}

func (t *tagServiceImpl) CreateTag(ws *workspace.Workspace, ledgerID string, name string, categoryTransactionType string) error {

	// Get max sort order for this category
	var maxSortOrder int
	if err := ws.GetDb().Model(&models.Tag{}).
		Where("ledger_id = ? AND category_transaction_type = ?", ledgerID, categoryTransactionType).
		Select("COALESCE(MAX(sort_order), 0)").
		Scan(&maxSortOrder).Error; err != nil {
		logrus.Errorf("获取最大排序号失败: %v", err)
		return err
	}

	tag := &models.Tag{
		LedgerID:                ledgerID,
		Name:                    name,
		CategoryTransactionType: categoryTransactionType,
		SortOrder:               maxSortOrder + 1,
	}

	if err := ws.GetDb().Create(tag).Error; err != nil {
		logrus.Errorf("创建标签失败: %v", err)
		return err
	}

	return nil
}

func (t *tagServiceImpl) DeleteTagsByCategory(ws *workspace.Workspace, ledgerID string, categoryTransactionType string) error {
	return ws.GetDb().
		Where("ledger_id = ? AND category_transaction_type = ?", ledgerID, categoryTransactionType).
		Delete(&models.Tag{}).Error
}

func (t *tagServiceImpl) DeleteTag(ws *workspace.Workspace, ledgerId string, name string, categoryTransactionType string) error {

	// Delete TrTag entries that use this tag
	if err := deleteTrTagByTag(ws, ledgerId, name); err != nil {
		logrus.Errorf("删除关联 TrTag 失败: %v", err)
		return err
	}

	// Delete the tag
	if err := ws.GetDb().
		Where("ledger_id = ? AND name = ? AND category_transaction_type = ?", ledgerId, name, categoryTransactionType).
		Delete(&models.Tag{}).Error; err != nil {
		logrus.Errorf("删除标签失败: %v", err)
		return err
	}

	return nil
}

func (t *tagServiceImpl) UpdateTagSort(ws *workspace.Workspace, ledgerID string, name string, categoryTransactionType string, sortOrder int) error {

	if err := ws.GetDb().
		Model(&models.Tag{}).
		Where("ledger_id = ? AND name = ? AND category_transaction_type = ?", ledgerID, name, categoryTransactionType).
		Update("sort_order", sortOrder).Error; err != nil {
		logrus.Errorf("更新标签排序失败: %v", err)
		return err
	}

	return nil
}

func (t *tagServiceImpl) CountRecordsByTag(ws *workspace.Workspace, ledgerId string, tag string) (int64, error) {
	var count int64
	err := ws.GetDb().Model(&models.TrTag{}).
		Where("ledger_id = ? AND tag = ?", ledgerId, tag).
		Count(&count).Error
	if err != nil {
		return 0, err
	}
	return count, nil
}
