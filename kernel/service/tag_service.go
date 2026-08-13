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
	CountRecordsByTags(ws *workspace.Workspace, ledgerId string, names []string) (map[string]int64, error)
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
	err := ws.Transaction(func(tx *workspace.Workspace) error {
		if err := t.trTagDao.DeleteByTag(tx, ledgerId, name); err != nil {
			return err
		}
		if err := t.tagDao.Delete(tx, ledgerId, name, categoryTransactionType); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
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

// CountRecordsByTags 批量统计每个标签名下的关联交易数，避免逐标签 COUNT 的 N+1 查询。
func (t *tagServiceImpl) CountRecordsByTags(ws *workspace.Workspace, ledgerId string, names []string) (map[string]int64, error) {
	result := make(map[string]int64, len(names))
	if len(names) == 0 {
		return result, nil
	}
	type row struct {
		Tag string
		Cnt int64
	}
	var rows []row
	err := ws.GetDb().Model(&models.TrTag{}).
		Select("tag, COUNT(*) AS cnt").
		Where("ledger_id = ? AND tag IN ?", ledgerId, names).
		Group("tag").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, r := range rows {
		result[r.Tag] = r.Cnt
	}
	return result, nil
}
