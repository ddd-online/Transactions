package dao

import (
	"errors"

	"gorm.io/gorm"

	"github.com/transactions/models"
	"github.com/transactions/workspace"
)

func NewAiMessageDao() AiMessageDao {
	return &aiMessageDaoImpl{}
}

// AiSummaryRole 标记上下文压缩产生的历史摘要消息。
// 该角色消息不出现在前端，但会作为上下文前缀注入 LLM。
const AiSummaryRole = "summary"

type AiMessageDao interface {
	Save(ws *workspace.Workspace, msg *models.AiMessage) error
	ListRecent(ws *workspace.Workspace, conversationID string, aiRole string, limit int) ([]*models.AiMessage, error)
	// ListRecentFiltered 返回会话消息；若存在摘要消息，则从摘要起取 limit 条（含摘要），
	// 否则等价于 ListRecent。供对话上下文加载使用，避免摘要之前的历史撑爆上下文。
	ListRecentFiltered(ws *workspace.Workspace, conversationID string, aiRole string, limit int) ([]*models.AiMessage, error)
	DeleteAll(ws *workspace.Workspace, conversationID string, aiRole string) error
	// DeleteByConversation 删除某会话的全部消息（会话删除时级联调用）。
	DeleteByConversation(ws *workspace.Workspace, conversationID string) error
	// GetSummary 返回会话最新的摘要消息；不存在返回 (nil, nil)。
	GetSummary(ws *workspace.Workspace, conversationID string, aiRole string) (*models.AiMessage, error)
	// DeleteSummary 删除会话的摘要消息。
	DeleteSummary(ws *workspace.Workspace, conversationID string, aiRole string) error
}

var _ AiMessageDao = &aiMessageDaoImpl{}

type aiMessageDaoImpl struct{}

func (d *aiMessageDaoImpl) Save(ws *workspace.Workspace, msg *models.AiMessage) error {
	return ws.GetDb().Create(msg).Error
}

func (d *aiMessageDaoImpl) ListRecent(ws *workspace.Workspace, conversationID string, aiRole string, limit int) ([]*models.AiMessage, error) {
	var msgs []*models.AiMessage
	err := ws.GetDb().
		Where("conversation_id = ? AND ai_role = ?", conversationID, aiRole).
		Order("created_at DESC").
		Limit(limit).
		Find(&msgs).Error
	if err != nil {
		return nil, err
	}
	return reverseMessages(msgs), nil
}

func (d *aiMessageDaoImpl) ListRecentFiltered(ws *workspace.Workspace, conversationID string, aiRole string, limit int) ([]*models.AiMessage, error) {
	summary, err := d.GetSummary(ws, conversationID, aiRole)
	if err != nil {
		return nil, err
	}
	if summary == nil {
		return d.ListRecent(ws, conversationID, aiRole, limit)
	}
	var msgs []*models.AiMessage
	err = ws.GetDb().
		Where("conversation_id = ? AND ai_role = ? AND created_at >= ?", conversationID, aiRole, summary.CreatedAt).
		Order("created_at ASC").
		Limit(limit).
		Find(&msgs).Error
	if err != nil {
		return nil, err
	}
	return msgs, nil
}

func (d *aiMessageDaoImpl) DeleteAll(ws *workspace.Workspace, conversationID string, aiRole string) error {
	return ws.GetDb().
		Where("conversation_id = ? AND ai_role = ?", conversationID, aiRole).
		Delete(&models.AiMessage{}).Error
}

func (d *aiMessageDaoImpl) DeleteByConversation(ws *workspace.Workspace, conversationID string) error {
	return ws.GetDb().
		Where("conversation_id = ?", conversationID).
		Delete(&models.AiMessage{}).Error
}

func (d *aiMessageDaoImpl) GetSummary(ws *workspace.Workspace, conversationID string, aiRole string) (*models.AiMessage, error) {
	var msg models.AiMessage
	err := ws.GetDb().
		Where("conversation_id = ? AND ai_role = ? AND role = ?", conversationID, aiRole, AiSummaryRole).
		Order("created_at DESC").
		First(&msg).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &msg, nil
}

func (d *aiMessageDaoImpl) DeleteSummary(ws *workspace.Workspace, conversationID string, aiRole string) error {
	return ws.GetDb().
		Where("conversation_id = ? AND ai_role = ? AND role = ?", conversationID, aiRole, AiSummaryRole).
		Delete(&models.AiMessage{}).Error
}

func reverseMessages(msgs []*models.AiMessage) []*models.AiMessage {
	for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
		msgs[i], msgs[j] = msgs[j], msgs[i]
	}
	return msgs
}
