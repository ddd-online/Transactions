package api

import (
	"fmt"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/transactions/models"
)

// GET /api/v1/ai/conversations?role=financial_assistant
func (h *Handlers) listConversations(c *gin.Context) (any, error) {
	role := c.DefaultQuery("role", "financial_assistant")
	convs, err := h.AiConversationDao.List(ws(c), role)
	if err != nil {
		return nil, err
	}
	if convs == nil {
		convs = make([]*models.AiConversation, 0)
	}
	return convs, nil
}

// POST /api/v1/ai/conversations
func (h *Handlers) createConversation(c *gin.Context) (any, error) {
	var req struct {
		Role  string `json:"role"`
		Title string `json:"title"`
	}
	if err := c.BindJSON(&req); err != nil {
		return nil, fmt.Errorf("invalid request: %w", err)
	}
	if req.Role == "" {
		req.Role = "financial_assistant"
	}
	title := req.Title
	if title == "" {
		title = "新对话"
	}
	conv := &models.AiConversation{
		ID:    uuid.NewString(),
		Role:  req.Role,
		Title: title,
	}
	if err := h.AiConversationDao.Create(ws(c), conv); err != nil {
		return nil, err
	}
	return conv, nil
}

// PUT /api/v1/ai/conversations/:id
// 更新会话标题（发送首条消息后自动生成）。
func (h *Handlers) updateConversation(c *gin.Context) (any, error) {
	id := c.Param("id")
	if id == "" {
		return nil, fmt.Errorf("会话 ID 不能为空")
	}
	var req struct {
		Title string `json:"title"`
	}
	if err := c.BindJSON(&req); err != nil {
		return nil, fmt.Errorf("invalid request: %w", err)
	}
	title := strings.TrimSpace(req.Title)
	if title == "" {
		return nil, fmt.Errorf("标题不能为空")
	}
	conv, err := h.AiConversationDao.Get(ws(c), id)
	if err != nil {
		return nil, fmt.Errorf("会话不存在: %w", err)
	}
	if err := h.AiConversationDao.UpdateTitle(ws(c), id, title); err != nil {
		return nil, err
	}
	conv.Title = title
	return conv, nil
}

// DELETE /api/v1/ai/conversations/:id
// 删除会话及其全部消息。
func (h *Handlers) deleteConversation(c *gin.Context) (any, error) {
	id := c.Param("id")
	if id == "" {
		return nil, fmt.Errorf("会话 ID 不能为空")
	}
	if _, err := h.AiConversationDao.Get(ws(c), id); err != nil {
		return nil, fmt.Errorf("会话不存在: %w", err)
	}
	if err := h.AiMessageDao.DeleteByConversation(ws(c), id); err != nil {
		return nil, err
	}
	if err := h.AiConversationDao.Delete(ws(c), id); err != nil {
		return nil, err
	}
	return nil, nil
}
