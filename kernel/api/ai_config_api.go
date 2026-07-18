package api

import (
	"context"
	"fmt"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"

	"github.com/billadm/ai"
	"github.com/billadm/ai/provider"
	"github.com/billadm/models"
)

// GET /api/v1/ai/config
func (h *Handlers) getAiConfig(c *gin.Context) (any, error) {
	role := c.DefaultQuery("role", "financial_assistant")
	provider := c.DefaultQuery("provider", "deepseek")

	roleConfig, _ := h.AiConfigDao.Get(ws(c), role)
	apiConfig, err := h.AiApiConfigDao.Get(ws(c), provider)

	systemPrompt := ""
	if roleConfig != nil {
		systemPrompt = roleConfig.SystemPrompt
	}
	if systemPrompt == "" {
		if roleDef, ok := h.RoleRegistry.Get(role); ok {
			systemPrompt = roleDef.DefaultSystemPrompt()
		}
	}

	baseURL := ""
	endpoint := ""
	model := ""
	hasKey := false
	providerName := provider
	if err == nil {
		baseURL = apiConfig.BaseURL
		endpoint = apiConfig.Endpoint
		model = apiConfig.Model
		hasKey = apiConfig.APIKey != ""
		providerName = apiConfig.Provider
	}

	return gin.H{
		"base_url":      baseURL,
		"endpoint":      endpoint,
		"model":         model,
		"has_key":       hasKey,
		"system_prompt": systemPrompt,
		"provider":      providerName,
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
	if req.Provider == "" {
		req.Provider = "deepseek"
	}
	if utf8.RuneCountInString(req.SystemPrompt) > 10000 {
		return nil, fmt.Errorf("系统提示词不能超过 10000 个字符")
	}

	// 保存 API 连接配置（按供应商）
	apiConfig := &models.AiApiConfig{
		Provider: req.Provider,
		BaseURL:  req.BaseURL,
		Endpoint: req.Endpoint,
		Model:    req.Model,
	}
	if req.APIKey != "" {
		apiConfig.APIKey = req.APIKey
	} else {
		existing, err := h.AiApiConfigDao.Get(ws(c), req.Provider)
		if err == nil {
			apiConfig.APIKey = existing.APIKey
		}
	}
	if err := h.AiApiConfigDao.Save(ws(c), apiConfig); err != nil {
		return nil, err
	}

	// 保存角色配置（系统提示词）
	roleConfig := &models.AiConfig{
		Role:         req.Role,
		SystemPrompt: req.SystemPrompt,
	}
	if err := h.AiConfigDao.Save(ws(c), roleConfig); err != nil {
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
		Provider string `json:"provider"`
	}
	if err := c.BindJSON(&req); err != nil {
		return nil, fmt.Errorf("invalid request: %w", err)
	}

	apiKey := req.APIKey
	if apiKey == "" {
		provider := req.Provider
		if provider == "" {
			provider = "deepseek"
		}
		existing, err := h.AiApiConfigDao.Get(ws(c), provider)
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

// GET /api/v1/ai/roles
func (h *Handlers) listRoles(c *gin.Context) (any, error) {
	roles := h.RoleRegistry.List()
	result := make([]gin.H, 0, len(roles))
	for _, r := range roles {
		result = append(result, gin.H{
			"name":         r.Name(),
			"display_name": r.DisplayName(),
		})
	}
	return result, nil
}

// DELETE /api/v1/ai/messages
func (h *Handlers) clearAiMessages(c *gin.Context) (any, error) {
	role := c.DefaultQuery("role", "financial_assistant")
	if err := h.AiMessageDao.DeleteAll(ws(c), "default", role); err != nil {
		return nil, err
	}
	return nil, nil
}

// GET /api/v1/ai/roles/tools
func (h *Handlers) roleTools(c *gin.Context) (any, error) {
	role := c.DefaultQuery("role", "financial_assistant")
	tools, ok := h.ChatService.RoleTools(role)
	if !ok {
		return nil, fmt.Errorf("角色不存在: %s", role)
	}
	if tools == nil {
		tools = make([]ai.ToolInfo, 0)
	}
	return gin.H{
		"role":  role,
		"tools": tools,
	}, nil
}
