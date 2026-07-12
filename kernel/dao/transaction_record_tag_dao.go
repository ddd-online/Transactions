package dao

import (
	"github.com/billadm/models"
	"github.com/billadm/workspace"
)

type TrTagDao interface {
	CreateBatch(ws *workspace.Workspace, tags []*models.TrTag) error
	DeleteByTrId(ws *workspace.Workspace, trId string) error
	DeleteByLedgerId(ws *workspace.Workspace, ledgerId string) error
	DeleteByTag(ws *workspace.Workspace, ledgerId string, tag string) error
	QueryByTrIds(ws *workspace.Workspace, trIds []string) (map[string][]*models.TrTag, error)
}

var _ TrTagDao = &trTagDaoImpl{}

type trTagDaoImpl struct{}

func NewTrTagDao() TrTagDao {
	return &trTagDaoImpl{}
}

func (d *trTagDaoImpl) CreateBatch(ws *workspace.Workspace, tags []*models.TrTag) error {
	if len(tags) <= 0 {
		return nil
	}
	return ws.GetDb().Create(tags).Error
}

func (d *trTagDaoImpl) DeleteByTrId(ws *workspace.Workspace, trId string) error {
	return ws.GetDb().Delete(&models.TrTag{}, "transaction_id = ?", trId).Error
}

func (d *trTagDaoImpl) DeleteByLedgerId(ws *workspace.Workspace, ledgerId string) error {
	return ws.GetDb().Delete(&models.TrTag{}, "ledger_id = ?", ledgerId).Error
}

func (d *trTagDaoImpl) DeleteByTag(ws *workspace.Workspace, ledgerId string, tag string) error {
	return ws.GetDb().
		Where("ledger_id = ? AND tag = ?", ledgerId, tag).
		Delete(&models.TrTag{}).Error
}

func (d *trTagDaoImpl) QueryByTrIds(ws *workspace.Workspace, trIds []string) (map[string][]*models.TrTag, error) {
	if len(trIds) == 0 {
		return make(map[string][]*models.TrTag), nil
	}
	trTags := make([]*models.TrTag, 0)
	if err := ws.GetDb().Where("transaction_id IN ?", trIds).Find(&trTags).Error; err != nil {
		return nil, err
	}
	result := make(map[string][]*models.TrTag)
	for _, tag := range trTags {
		result[tag.TransactionID] = append(result[tag.TransactionID], tag)
	}
	return result, nil
}
