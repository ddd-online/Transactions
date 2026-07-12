package api

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"

	"github.com/billadm/ai"
)

// POST /api/v1/ai/chat
func (h *Handlers) aiChat(c *gin.Context) {
	if h.ChatService == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "chat service not initialized"})
		return
	}

	var req struct {
		Message    string `json:"message"`
		LedgerName string `json:"ledger_name"`
		RoleName   string `json:"role_name"`
	}
	if err := c.BindJSON(&req); err != nil || req.Message == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "message is required"})
		return
	}
	if len(req.Message) > 4000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "消息过长，最多 4000 字符"})
		return
	}
	if req.RoleName == "" {
		req.RoleName = "financial_assistant"
	}

	ws := ws(c)

	// SSE
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.WriteHeader(http.StatusOK)

	eventCh, err := h.ChatService.Chat(c.Request.Context(), ws, req.RoleName, req.LedgerName, req.Message)
	if err != nil {
		data, _ := json.Marshal(ai.SSEEvent{Type: "error", Message: err.Error()})
		c.Writer.Write([]byte("data: " + string(data) + "\n\n"))
		c.Writer.Flush()
		return
	}

	for event := range eventCh {
		data, _ := json.Marshal(event)
		if _, err := io.WriteString(c.Writer, "data: "+string(data)+"\n\n"); err != nil {
			logrus.Warnf("SSE 写入失败: %v", err)
			return
		}
		c.Writer.Flush()
	}
}
