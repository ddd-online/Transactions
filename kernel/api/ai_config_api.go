package api

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/billadm/ai/provider"
	"github.com/billadm/dao"
	"github.com/billadm/models"
)

var aiConfigDao dao.AiConfigDao

// SetAiConfigDao is called by wire.go.
func SetAiConfigDao(d dao.AiConfigDao) {
	aiConfigDao = d
}

// GET /api/v1/ai/config
func getAiConfig(c *gin.Context) {
	config, err := aiConfigDao.Get(ws(c))
	if err != nil {
		// Return empty config
		config = &models.AiConfig{}
	}
	// Don't return api_key to the frontend
	c.JSON(http.StatusOK, gin.H{
		"base_url": config.BaseURL,
		"endpoint": config.Endpoint,
		"model":    config.Model,
		"has_key":  config.APIKey != "",
	})
}

// PUT /api/v1/ai/config
func updateAiConfig(c *gin.Context) {
	var req struct {
		BaseURL  string `json:"base_url"`
		Endpoint string `json:"endpoint"`
		APIKey   string `json:"api_key"`
		Model    string `json:"model"`
	}
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	config := &models.AiConfig{
		BaseURL:  req.BaseURL,
		Endpoint: req.Endpoint,
		APIKey:   req.APIKey,
		Model:    req.Model,
	}

	if err := aiConfigDao.Save(ws(c), config); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}

// POST /api/v1/ai/config/test
func testAiConnection(c *gin.Context) {
	var req struct {
		BaseURL  string `json:"base_url"`
		Endpoint string `json:"endpoint"`
		APIKey   string `json:"api_key"`
		Model    string `json:"model"`
	}
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	var p provider.LLMProvider
	switch req.Endpoint {
	case "/v1/messages":
		p = provider.NewAnthropicProvider(req.BaseURL, req.APIKey, req.Model)
	case "/chat/completions":
		p = provider.NewOpenAIProvider(req.BaseURL, req.APIKey, req.Model)
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "不支持的端点"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	eventCh, err := p.ChatStream(ctx, provider.ChatRequest{
		Messages: []provider.ChatMessage{
			{Role: "user", Content: "hi"},
		},
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "连接失败: " + err.Error()})
		return
	}

	// Consume the first event to verify the connection
	for event := range eventCh {
		if event.Type == "error" {
			c.JSON(http.StatusBadRequest, gin.H{"error": event.Error.Error()})
			return
		}
		if event.Type == "text_delta" || event.Type == "done" {
			c.JSON(http.StatusOK, gin.H{"message": "连接成功"})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "连接成功"})
}

// DELETE /api/v1/ai/messages
func clearAiMessages(c *gin.Context) {
	messageDao := dao.NewAiMessageDao()
	if err := messageDao.DeleteAll(ws(c), "default"); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已清空"})
}
