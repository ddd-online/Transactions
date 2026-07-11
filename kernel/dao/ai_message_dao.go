package dao

import (
	"github.com/billadm/models"
	"github.com/billadm/workspace"
)

func NewAiMessageDao() AiMessageDao {
	return &aiMessageDaoImpl{}
}

type AiMessageDao interface {
	Save(ws *workspace.Workspace, msg *models.AiMessage) error
	ListRecent(ws *workspace.Workspace, conversationID string, limit int) ([]*models.AiMessage, error)
	DeleteAll(ws *workspace.Workspace, conversationID string) error
}

var _ AiMessageDao = &aiMessageDaoImpl{}

type aiMessageDaoImpl struct{}

func (d *aiMessageDaoImpl) Save(ws *workspace.Workspace, msg *models.AiMessage) error {
	return ws.GetDb().Create(msg).Error
}

func (d *aiMessageDaoImpl) ListRecent(ws *workspace.Workspace, conversationID string, limit int) ([]*models.AiMessage, error) {
	var msgs []*models.AiMessage
	err := ws.GetDb().
		Where("conversation_id = ?", conversationID).
		Order("created_at DESC").
		Limit(limit).
		Find(&msgs).Error
	if err != nil {
		return nil, err
	}
	// 反转顺序（DB 返回 DESC，需要 ASC 给 LLM）
	for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
		msgs[i], msgs[j] = msgs[j], msgs[i]
	}
	return msgs, nil
}

func (d *aiMessageDaoImpl) DeleteAll(ws *workspace.Workspace, conversationID string) error {
	return ws.GetDb().
		Where("conversation_id = ?", conversationID).
		Delete(&models.AiMessage{}).Error
}
