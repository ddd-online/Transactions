package dao

import (
	"time"

	"github.com/transactions/models"
	"github.com/transactions/workspace"
)

func NewAiConversationDao() AiConversationDao {
	return &aiConversationDaoImpl{}
}

type AiConversationDao interface {
	Create(ws *workspace.Workspace, conv *models.AiConversation) error
	List(ws *workspace.Workspace, role string) ([]*models.AiConversation, error)
	Get(ws *workspace.Workspace, id string) (*models.AiConversation, error)
	Delete(ws *workspace.Workspace, id string) error
	Touch(ws *workspace.Workspace, id string) error
}

var _ AiConversationDao = &aiConversationDaoImpl{}

type aiConversationDaoImpl struct{}

func (d *aiConversationDaoImpl) Create(ws *workspace.Workspace, conv *models.AiConversation) error {
	return ws.GetDb().Create(conv).Error
}

func (d *aiConversationDaoImpl) List(ws *workspace.Workspace, role string) ([]*models.AiConversation, error) {
	var convs []*models.AiConversation
	err := ws.GetDb().
		Where("role = ?", role).
		Order("updated_at DESC").
		Find(&convs).Error
	if err != nil {
		return nil, err
	}
	return convs, nil
}

func (d *aiConversationDaoImpl) Get(ws *workspace.Workspace, id string) (*models.AiConversation, error) {
	var conv models.AiConversation
	if err := ws.GetDb().Where("id = ?", id).First(&conv).Error; err != nil {
		return nil, err
	}
	return &conv, nil
}

func (d *aiConversationDaoImpl) Delete(ws *workspace.Workspace, id string) error {
	return ws.GetDb().Delete(&models.AiConversation{}, "id = ?", id).Error
}

func (d *aiConversationDaoImpl) Touch(ws *workspace.Workspace, id string) error {
	return ws.GetDb().Model(&models.AiConversation{}).
		Where("id = ?", id).
		Update("updated_at", time.Now().Unix()).Error
}
