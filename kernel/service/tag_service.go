package service

import (
	"sync"

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
			tagDao: dao.GetTagDao(),
		}
	})

	return tagService
}

type TagService interface {
	QueryTags(ws *workspace.Workspace, ledgerID string, categoryTransactionType string) ([]models.Tag, error)
	CreateTag(ws *workspace.Workspace, ledgerID string, name string, categoryTransactionType string) error
	DeleteTag(ws *workspace.Workspace, ledgerId string, name string, categoryTransactionType string) error
	UpdateTagSort(ws *workspace.Workspace, ledgerID string, name string, categoryTransactionType string, sortOrder int) error
	CountRecordsByTag(ws *workspace.Workspace, ledgerId string, tag string) (int64, error)
}

var _ TagService = &tagServiceImpl{}

type tagServiceImpl struct {
	tagDao dao.TagDao
}

func (t *tagServiceImpl) QueryTags(ws *workspace.Workspace, ledgerID string, categoryTransactionType string) ([]models.Tag, error) {
	logrus.Infof("start to query tag, ledger: %s, category: %s", ledgerID, categoryTransactionType)
	tags, err := t.tagDao.QueryTags(ws, ledgerID, categoryTransactionType)
	if err != nil {
		return nil, err
	}

	// Reassign sort_order from 0 based on current order
	for i, tag := range tags {
		if tag.SortOrder != i {
			tag.SortOrder = i
			if err := t.tagDao.UpdateTagSort(ws, ledgerID, tag.Name, tag.CategoryTransactionType, i); err != nil {
				logrus.Errorf("reindex tag sort failed: %v", err)
				return nil, err
			}
		}
	}

	logrus.Infof("query tag success, length: %d", len(tags))
	return tags, nil
}

func (t *tagServiceImpl) CreateTag(ws *workspace.Workspace, ledgerID string, name string, categoryTransactionType string) error {
	logrus.Infof("start to create tag, ledger: %s, name: %s, category: %s", ledgerID, name, categoryTransactionType)

	// Get max sort order for this category
	maxSortOrder, err := t.tagDao.GetMaxSortOrder(ws, ledgerID, categoryTransactionType)
	if err != nil {
		logrus.Errorf("get max sort order failed: %v", err)
		return err
	}

	tag := &models.Tag{
		LedgerID:                ledgerID,
		Name:                    name,
		CategoryTransactionType: categoryTransactionType,
		SortOrder:               maxSortOrder + 1,
	}

	if err := t.tagDao.CreateTag(ws, tag); err != nil {
		logrus.Errorf("create tag failed: %v", err)
		return err
	}

	logrus.Infof("create tag success, name: %s", name)
	return nil
}

func (t *tagServiceImpl) DeleteTag(ws *workspace.Workspace, ledgerId string, name string, categoryTransactionType string) error {
	logrus.Infof("start to delete tag, ledger id: %s, name: %s", ledgerId, name)

	// Delete TrTag entries that use this tag
	trTagDao := dao.GetTrTagDao()
	if err := trTagDao.DeleteTrTagByTag(ws, ledgerId, name); err != nil {
		logrus.Errorf("delete tr tags failed: %v", err)
		return err
	}

	// Delete the tag
	if err := t.tagDao.DeleteTag(ws, ledgerId, name, categoryTransactionType); err != nil {
		logrus.Errorf("delete tag failed: %v", err)
		return err
	}

	logrus.Infof("delete tag success, ledger id: %s, name: %s", ledgerId, name)
	return nil
}

func (t *tagServiceImpl) UpdateTagSort(ws *workspace.Workspace, ledgerID string, name string, categoryTransactionType string, sortOrder int) error {
	logrus.Infof("start to update tag sort, name: %s, category: %s, sortOrder: %d", name, categoryTransactionType, sortOrder)

	if err := t.tagDao.UpdateTagSort(ws, ledgerID, name, categoryTransactionType, sortOrder); err != nil {
		logrus.Errorf("update tag sort failed: %v", err)
		return err
	}

	logrus.Infof("update tag sort success, name: %s", name)
	return nil
}

func (t *tagServiceImpl) CountRecordsByTag(ws *workspace.Workspace, ledgerId string, tag string) (int64, error) {
	return t.tagDao.CountRecordsByTag(ws, ledgerId, tag)
}
