package service

import (
	"github.com/billadm/dao"
	"github.com/billadm/models"
	"github.com/billadm/workspace"
	"github.com/sirupsen/logrus"
)

func NewTagService(tagDao dao.TagDao, trTagDao dao.TrTagDao) TagService {
	return &tagServiceImpl{
		tagDao:   tagDao,
		trTagDao: trTagDao,
	}
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
	tagDao   dao.TagDao
	trTagDao dao.TrTagDao
}

func (t *tagServiceImpl) QueryTags(ws *workspace.Workspace, ledgerID string, categoryTransactionType string) ([]models.Tag, error) {
	return t.tagDao.QueryByLedger(ws, ledgerID, categoryTransactionType)
}

func (t *tagServiceImpl) CreateTag(ws *workspace.Workspace, ledgerID string, name string, categoryTransactionType string) error {
	maxSortOrder, err := t.tagDao.GetMaxSort(ws, ledgerID, categoryTransactionType)
	if err != nil {
		logrus.Errorf("获取最大排序号失败: %v", err)
		return err
	}

	tag := &models.Tag{
		LedgerID:                ledgerID,
		Name:                    name,
		CategoryTransactionType: categoryTransactionType,
		SortOrder:               maxSortOrder + 1,
	}

	if err := t.tagDao.Create(ws, tag); err != nil {
		logrus.Errorf("创建标签失败: %v", err)
		return err
	}

	return nil
}

func (t *tagServiceImpl) DeleteTagsByCategory(ws *workspace.Workspace, ledgerID string, categoryTransactionType string) error {
	return t.tagDao.DeleteByCategory(ws, ledgerID, categoryTransactionType)
}

func (t *tagServiceImpl) DeleteTag(ws *workspace.Workspace, ledgerId string, name string, categoryTransactionType string) error {
	if err := t.trTagDao.DeleteByTag(ws, ledgerId, name); err != nil {
		logrus.Errorf("删除关联 TrTag 失败: %v", err)
		return err
	}

	if err := t.tagDao.Delete(ws, ledgerId, name, categoryTransactionType); err != nil {
		logrus.Errorf("删除标签失败: %v", err)
		return err
	}

	return nil
}

func (t *tagServiceImpl) UpdateTagSort(ws *workspace.Workspace, ledgerID string, name string, categoryTransactionType string, sortOrder int) error {
	if err := t.tagDao.UpdateSort(ws, ledgerID, name, categoryTransactionType, sortOrder); err != nil {
		logrus.Errorf("更新标签排序失败: %v", err)
		return err
	}

	return nil
}

func (t *tagServiceImpl) CountRecordsByTag(ws *workspace.Workspace, ledgerId string, tag string) (int64, error) {
	return t.tagDao.CountByTag(ws, ledgerId, tag)
}
