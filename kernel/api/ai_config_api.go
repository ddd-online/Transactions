package api

import (
	"context"
	"fmt"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/billadm/ai"
	"github.com/billadm/ai/provider"
	"github.com/billadm/models"
)

// GET /api/v1/ai/config
func (h *Handlers) getAiConfig(c *gin.Context) (any, error) {
	role := c.DefaultQuery("role", "financial_assistant")
	config, err := h.AiConfigDao.Get(ws(c), role)
	if err != nil {
		config = &models.AiConfig{}
	}
	systemPrompt := config.SystemPrompt
	if systemPrompt == "" {
		systemPrompt = ai.DefaultSystemPrompt
	}
	return gin.H{
		"base_url":      config.BaseURL,
		"endpoint":      config.Endpoint,
		"model":         config.Model,
		"has_key":       config.APIKey != "",
		"system_prompt": systemPrompt,
		"provider":      config.Provider,
		"role":          role,
	}, nil
}

// PUT /api/v1/ai/config
func (h *Handlers) updateAiConfig(c *gin.Context) (any, error) {
	var req struct {
		BaseURL      string `json:"base_url"`
		Endpoint     string `json:"endpoint"`
		APIKey       string `json:"api_key"`
		Model        string `json:"model"`
		SystemPrompt string `json:"system_prompt"`
		Provider     string `json:"provider"`
		Role         string `json:"role"`
	}
	if err := c.BindJSON(&req); err != nil {
		return nil, fmt.Errorf("invalid request: %w", err)
	}
	if req.Role == "" {
		req.Role = "financial_assistant"
	}

	config := &models.AiConfig{
		Role:         req.Role,
		BaseURL:      req.BaseURL,
		Endpoint:     req.Endpoint,
		Model:        req.Model,
		SystemPrompt: req.SystemPrompt,
		Provider:     req.Provider,
	}
	if req.APIKey != "" {
		config.APIKey = req.APIKey
	} else {
		existing, err := h.AiConfigDao.Get(ws(c), req.Role)
		if err == nil {
			config.APIKey = existing.APIKey
		}
	}

	if err := h.AiConfigDao.Save(ws(c), config); err != nil {
		return nil, err
	}
	return nil, nil
}

// POST /api/v1/ai/config/test
func (h *Handlers) testAiConnection(c *gin.Context) (any, error) {
	var req struct {
		BaseURL  string `json:"base_url"`
		Endpoint string `json:"endpoint"`
		APIKey   string `json:"api_key"`
		Model    string `json:"model"`
		Role     string `json:"role"`
	}
	if err := c.BindJSON(&req); err != nil {
		return nil, fmt.Errorf("invalid request: %w", err)
	}

	apiKey := req.APIKey
	if apiKey == "" {
		role := req.Role
		if role == "" {
			role = "financial_assistant"
		}
		existing, err := h.AiConfigDao.Get(ws(c), role)
		if err == nil {
			apiKey = existing.APIKey
		}
	}

	var p provider.LLMProvider
	switch req.Endpoint {
	case "/v1/messages":
		p = provider.NewAnthropicProvider(req.BaseURL, apiKey, req.Model)
	case "/chat/completions":
		p = provider.NewOpenAIProvider(req.BaseURL, apiKey, req.Model)
	default:
		return nil, fmt.Errorf("不支持的端点")
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	eventCh, err := p.ChatStream(ctx, provider.ChatRequest{
		Messages: []provider.ChatMessage{
			{Role: "user", Content: "hi"},
		},
	})
	if err != nil {
		return nil, fmt.Errorf("连接失败: %w", err)
	}

	for event := range eventCh {
		if event.Type == "error" {
			return nil, event.Error
		}
		if event.Type == "text_delta" || event.Type == "done" {
			return gin.H{"message": "连接成功"}, nil
		}
	}

	return gin.H{"message": "连接成功"}, nil
}

// GET /api/v1/ai/messages
func (h *Handlers) listAiMessages(c *gin.Context) (any, error) {
	role := c.DefaultQuery("role", "financial_assistant")
	msgs, err := h.AiMessageDao.ListRecent(ws(c), "default", role, 30)
	if err != nil {
		return nil, err
	}
	if msgs == nil {
		msgs = make([]*models.AiMessage, 0)
	}
	return msgs, nil
}

// DELETE /api/v1/ai/messages
func (h *Handlers) clearAiMessages(c *gin.Context) (any, error) {
	role := c.DefaultQuery("role", "financial_assistant")
	if err := h.AiMessageDao.DeleteAll(ws(c), "default", role); err != nil {
		return nil, err
	}
	return nil, nil
}
