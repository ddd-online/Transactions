package dao

import (
	"github.com/billadm/models"
	"github.com/billadm/workspace"
)

func NewTrTagDao() TrTagDao {
	return &trTagDaoImpl{}
}

type TrTagDao interface {
	CreateTrTags(ws *workspace.Workspace, tags []*models.TrTag) error
	DeleteTrTagByLedgerId(ws *workspace.Workspace, ledgerId string) error
	DeleteTrTagByTrId(ws *workspace.Workspace, trId string) error
	DeleteTrTagByTag(ws *workspace.Workspace, ledgerId string, tag string) error
	QueryTrTagsByTrId(ws *workspace.Workspace, trId string) ([]*models.TrTag, error)
	QueryTrTagsByTrIds(ws *workspace.Workspace, trIds []string) (map[string][]*models.TrTag, error)
}

var _ TrTagDao = &trTagDaoImpl{}

type trTagDaoImpl struct{}

func (t *trTagDaoImpl) CreateTrTags(ws *workspace.Workspace, tags []*models.TrTag) error {
	if len(tags) <= 0 {
		return nil
	}
	if err := ws.GetDb().Create(tags).Error; err != nil {
		return err
	}
	return nil
}

func (t *trTagDaoImpl) DeleteTrTagByLedgerId(ws *workspace.Workspace, ledgerId string) error {
	if err := ws.GetDb().Delete(&models.TrTag{}, "ledger_id = ?", ledgerId).Error; err != nil {
		return err
	}
	return nil
}

func (t *trTagDaoImpl) DeleteTrTagByTrId(ws *workspace.Workspace, trId string) error {
	if err := ws.GetDb().Delete(&models.TrTag{}, "transaction_id = ?", trId).Error; err != nil {
		return err
	}
	return nil
}

func (t *trTagDaoImpl) DeleteTrTagByTag(ws *workspace.Workspace, ledgerId string, tag string) error {
	if err := ws.GetDb().
		Where("ledger_id = ? AND tag = ?", ledgerId, tag).
		Delete(&models.TrTag{}).Error; err != nil {
		return err
	}
	return nil
}

func (t *trTagDaoImpl) QueryTrTagsByTrId(ws *workspace.Workspace, trId string) ([]*models.TrTag, error) {
	trTags := make([]*models.TrTag, 0)
	if err := ws.GetDb().Where("transaction_id = ?", trId).Find(&trTags).Error; err != nil {
		return nil, err
	}
	return trTags, nil
}

// QueryTrTagsByTrIds batch queries tags for multiple transaction IDs in a single query.
func (t *trTagDaoImpl) QueryTrTagsByTrIds(ws *workspace.Workspace, trIds []string) (map[string][]*models.TrTag, error) {
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
