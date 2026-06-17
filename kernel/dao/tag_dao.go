package dao

import (
	"sync"

	"github.com/billadm/constant"
	"github.com/billadm/models"
	"github.com/billadm/workspace"
)

var (
	tagDao     TagDao
	tagDaoOnce sync.Once
)

func GetTagDao() TagDao {
	if tagDao != nil {
		return tagDao
	}
	tagDaoOnce.Do(func() {
		tagDao = &tagDaoImpl{}
	})
	return tagDao
}

type TagDao interface {
	QueryTags(ws *workspace.Workspace, ledgerID string, categoryTransactionType string) ([]models.Tag, error)
	CreateTag(ws *workspace.Workspace, tag *models.Tag) error
	DeleteTag(ws *workspace.Workspace, ledgerID string, name string, categoryTransactionType string) error
	DeleteTagsByCategory(ws *workspace.Workspace, ledgerID string, categoryTransactionType string) error
	UpdateTagSort(ws *workspace.Workspace, ledgerID string, name string, categoryTransactionType string, sortOrder int) error
	GetMaxSortOrder(ws *workspace.Workspace, ledgerID string, categoryTransactionType string) (int, error)
	CountRecordsByTag(ws *workspace.Workspace, ledgerID string, tag string) (int64, error)
}

var _ TagDao = &tagDaoImpl{}

type tagDaoImpl struct{}

func (t *tagDaoImpl) QueryTags(ws *workspace.Workspace, ledgerID string, categoryTransactionType string) ([]models.Tag, error) {
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

func (t *tagDaoImpl) CreateTag(ws *workspace.Workspace, tag *models.Tag) error {
	return ws.GetDb().Create(tag).Error
}

func (t *tagDaoImpl) DeleteTag(ws *workspace.Workspace, ledgerID string, name string, categoryTransactionType string) error {
	return ws.GetDb().
		Where("ledger_id = ? AND name = ? AND category_transaction_type = ?", ledgerID, name, categoryTransactionType).
		Delete(&models.Tag{}).Error
}

func (t *tagDaoImpl) DeleteTagsByCategory(ws *workspace.Workspace, ledgerID string, categoryTransactionType string) error {
	return ws.GetDb().
		Where("ledger_id = ? AND category_transaction_type = ?", ledgerID, categoryTransactionType).
		Delete(&models.Tag{}).Error
}

func (t *tagDaoImpl) UpdateTagSort(ws *workspace.Workspace, ledgerID string, name string, categoryTransactionType string, sortOrder int) error {
	return ws.GetDb().
		Model(&models.Tag{}).
		Where("ledger_id = ? AND name = ? AND category_transaction_type = ?", ledgerID, name, categoryTransactionType).
		Update("sort_order", sortOrder).Error
}

func (t *tagDaoImpl) GetMaxSortOrder(ws *workspace.Workspace, ledgerID string, categoryTransactionType string) (int, error) {
	var maxSortOrder int
	err := ws.GetDb().Model(&models.Tag{}).
		Where("ledger_id = ? AND category_transaction_type = ?", ledgerID, categoryTransactionType).
		Select("COALESCE(MAX(sort_order), 0)").
		Scan(&maxSortOrder).Error
	return maxSortOrder, err
}

func (t *tagDaoImpl) CountRecordsByTag(ws *workspace.Workspace, ledgerID string, tag string) (int64, error) {
	var count int64
	err := ws.GetDb().Model(&models.TrTag{}).
		Where("ledger_id = ? AND tag = ?", ledgerID, tag).
		Count(&count).Error
	if err != nil {
		return 0, err
	}
	return count, nil
}
