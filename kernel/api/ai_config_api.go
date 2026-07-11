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
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	config, err := aiConfigDao.Get(ws(c))
	if err != nil {
		// Return empty config
		config = &models.AiConfig{}
	}
	// Don't return api_key to the frontend
	ret.Data = gin.H{
		"base_url": config.BaseURL,
		"endpoint": config.Endpoint,
		"model":    config.Model,
		"has_key":  config.APIKey != "",
	}
}

// PUT /api/v1/ai/config
func updateAiConfig(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	var req struct {
		BaseURL  string `json:"base_url"`
		Endpoint string `json:"endpoint"`
		APIKey   string `json:"api_key"`
		Model    string `json:"model"`
	}
	if err := c.BindJSON(&req); err != nil {
		ret.Code = -1
		ret.Msg = "invalid request: " + err.Error()
		return
	}

	config := &models.AiConfig{
		BaseURL:  req.BaseURL,
		Endpoint: req.Endpoint,
		APIKey:   req.APIKey,
		Model:    req.Model,
	}

	if err := aiConfigDao.Save(ws(c), config); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
}

// POST /api/v1/ai/config/test
func testAiConnection(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	var req struct {
		BaseURL  string `json:"base_url"`
		Endpoint string `json:"endpoint"`
		APIKey   string `json:"api_key"`
		Model    string `json:"model"`
	}
	if err := c.BindJSON(&req); err != nil {
		ret.Code = -1
		ret.Msg = "invalid request: " + err.Error()
		return
	}

	var p provider.LLMProvider
	switch req.Endpoint {
	case "/v1/messages":
		p = provider.NewAnthropicProvider(req.BaseURL, req.APIKey, req.Model)
	case "/chat/completions":
		p = provider.NewOpenAIProvider(req.BaseURL, req.APIKey, req.Model)
	default:
		ret.Code = -1
		ret.Msg = "不支持的端点"
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
		ret.Code = -1
		ret.Msg = "连接失败: " + err.Error()
		return
	}

	// Consume the first event to verify the connection
	for event := range eventCh {
		if event.Type == "error" {
			ret.Code = -1
			ret.Msg = event.Error.Error()
			return
		}
		if event.Type == "text_delta" || event.Type == "done" {
			ret.Data = gin.H{"message": "连接成功"}
			return
		}
	}

	ret.Data = gin.H{"message": "连接成功"}
}

// DELETE /api/v1/ai/messages
func clearAiMessages(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	messageDao := dao.NewAiMessageDao()
	if err := messageDao.DeleteAll(ws(c), "default"); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
}
