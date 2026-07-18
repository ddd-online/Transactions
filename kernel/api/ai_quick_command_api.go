package api

import (
	"fmt"

	"github.com/gin-gonic/gin"

	"github.com/billadm/models"
)

// GET /api/v1/ai/quick-commands
func (h *Handlers) listQuickCommands(c *gin.Context) (any, error) {
	role := c.DefaultQuery("role", "financial_assistant")
	commands, err := h.AiQuickCommandDao.List(ws(c), role)
	if err != nil {
		return nil, err
	}
	if commands == nil {
		commands = make([]*models.AiQuickCommand, 0)
	}
	return commands, nil
}

// PUT /api/v1/ai/quick-commands
func (h *Handlers) saveQuickCommands(c *gin.Context) (any, error) {
	var req struct {
		Role     string                    `json:"role"`
		Commands []*models.AiQuickCommand `json:"commands"`
	}
	if err := c.BindJSON(&req); err != nil {
		return nil, fmt.Errorf("invalid request: %w", err)
	}
	if req.Role == "" {
		req.Role = "financial_assistant"
	}
	for i := range req.Commands {
		req.Commands[i].Role = req.Role
		req.Commands[i].SortOrder = i
	}
	if err := h.AiQuickCommandDao.ReplaceAll(ws(c), req.Role, req.Commands); err != nil {
		return nil, err
	}
	return nil, nil
}
