package service

import (
	"sync"

	"github.com/billadm/constant"
	"github.com/billadm/dao"
	"github.com/billadm/models"
	"github.com/billadm/workspace"
	"github.com/sirupsen/logrus"
)

var (
	tagService     TagService
	tagServiceOnce sync.Once
)

func GetTagService() TagService {
	if tagService != nil {
		return tagService
	}

	tagServiceOnce.Do(func() {
		tagService = &tagServiceImpl{
			trTagDao: dao.GetTrTagDao(),
		}
	})

	return tagService
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

type tagServiceImpl struct {
	trTagDao dao.TrTagDao
}

func (t *tagServiceImpl) QueryTags(ws *workspace.Workspace, ledgerID string, categoryTransactionType string) ([]models.Tag, error) {
	logrus.Infof("start to query tag, ledger: %s, category: %s", ledgerID, categoryTransactionType)
	tags := make([]models.Tag, 0)
	db := ws.GetDb().Where("ledger_id = ?", ledgerID)
	if categoryTransactionType != constant.All {
		db = db.Where("category_transaction_type = ?", categoryTransactionType)
	}
	if err := db.Order("sort_order ASC, name DESC").Find(&tags).Error; err != nil {
		return nil, err
	}

	logrus.Infof("query tag success, length: %d", len(tags))
	return tags, nil
}

func (t *tagServiceImpl) CreateTag(ws *workspace.Workspace, ledgerID string, name string, categoryTransactionType string) error {
	logrus.Infof("start to create tag, ledger: %s, name: %s, category: %s", ledgerID, name, categoryTransactionType)

	// Get max sort order for this category
	var maxSortOrder int
	if err := ws.GetDb().Model(&models.Tag{}).
		Where("ledger_id = ? AND category_transaction_type = ?", ledgerID, categoryTransactionType).
		Select("COALESCE(MAX(sort_order), 0)").
		Scan(&maxSortOrder).Error; err != nil {
		logrus.Errorf("get max sort order failed: %v", err)
		return err
	}

	tag := &models.Tag{
		LedgerID:                ledgerID,
		Name:                    name,
		CategoryTransactionType: categoryTransactionType,
		SortOrder:               maxSortOrder + 1,
	}

	if err := ws.GetDb().Create(tag).Error; err != nil {
		logrus.Errorf("create tag failed: %v", err)
		return err
	}

	logrus.Infof("create tag success, name: %s", name)
	return nil
}

func (t *tagServiceImpl) DeleteTagsByCategory(ws *workspace.Workspace, ledgerID string, categoryTransactionType string) error {
	return ws.GetDb().
		Where("ledger_id = ? AND category_transaction_type = ?", ledgerID, categoryTransactionType).
		Delete(&models.Tag{}).Error
}

func (t *tagServiceImpl) DeleteTag(ws *workspace.Workspace, ledgerId string, name string, categoryTransactionType string) error {
	logrus.Infof("start to delete tag, ledger id: %s, name: %s", ledgerId, name)

	// Delete TrTag entries that use this tag
	if err := t.trTagDao.DeleteTrTagByTag(ws, ledgerId, name); err != nil {
		logrus.Errorf("delete tr tags failed: %v", err)
		return err
	}

	// Delete the tag
	if err := ws.GetDb().
		Where("ledger_id = ? AND name = ? AND category_transaction_type = ?", ledgerId, name, categoryTransactionType).
		Delete(&models.Tag{}).Error; err != nil {
		logrus.Errorf("delete tag failed: %v", err)
		return err
	}

	logrus.Infof("delete tag success, ledger id: %s, name: %s", ledgerId, name)
	return nil
}

func (t *tagServiceImpl) UpdateTagSort(ws *workspace.Workspace, ledgerID string, name string, categoryTransactionType string, sortOrder int) error {
	logrus.Infof("start to update tag sort, name: %s, category: %s, sortOrder: %d", name, categoryTransactionType, sortOrder)

	if err := ws.GetDb().
		Model(&models.Tag{}).
		Where("ledger_id = ? AND name = ? AND category_transaction_type = ?", ledgerID, name, categoryTransactionType).
		Update("sort_order", sortOrder).Error; err != nil {
		logrus.Errorf("update tag sort failed: %v", err)
		return err
	}

	logrus.Infof("update tag sort success, name: %s", name)
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
