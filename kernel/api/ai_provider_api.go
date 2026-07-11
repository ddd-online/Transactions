package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// POST /api/v1/ai/provider/fetch
func (h *Handlers) fetchProvider(c *gin.Context) (any, error) {
	var req struct {
		Action   string `json:"action"`
		APIKey   string `json:"api_key"`
		Provider string `json:"provider"` // 前端传入，优先使用
	}
	if err := c.BindJSON(&req); err != nil {
		return nil, fmt.Errorf("invalid request: %w", err)
	}

	// 确定 API Key：优先使用前端传入的，否则从 DB 读取
	apiKey := req.APIKey
	if apiKey == "" {
		config, err := h.AiConfigDao.Get(ws(c))
		if err != nil {
			return nil, fmt.Errorf("未找到 AI 配置，请先保存配置")
		}
		apiKey = config.APIKey
	}
	if apiKey == "" {
		return nil, fmt.Errorf("API Key 未设置")
	}

	// 确定 Provider：优先使用前端传入的，否则从 DB 读取
	provider := req.Provider
	if provider == "" {
		config, err := h.AiConfigDao.Get(ws(c))
		if err == nil {
			provider = config.Provider
		}
	}

	switch provider {
	case "deepseek":
		return fetchDeepSeek(req.Action, apiKey)
	default:
		return nil, fmt.Errorf("当前供应商不支持此操作")
	}
}

// ---- DeepSeek API 调用 ----

const deepseekAPIBase = "https://api.deepseek.com"

type deepSeekBalanceResponse struct {
	IsAvailable  bool `json:"is_available"`
	BalanceInfos []struct {
		Currency        string `json:"currency"`
		TotalBalance    string `json:"total_balance"`
		GrantedBalance  string `json:"granted_balance"`
		ToppedUpBalance string `json:"topped_up_balance"`
	} `json:"balance_infos"`
}

type deepSeekModelsResponse struct {
	Data []struct {
		ID      string `json:"id"`
		Object  string `json:"object"`
		OwnedBy string `json:"owned_by"`
	} `json:"data"`
}

func fetchDeepSeek(action, apiKey string) (any, error) {
	client := &http.Client{Timeout: 10 * time.Second}

	switch action {
	case "balance":
		return fetchDeepSeekBalance(client, apiKey)
	case "models":
		return fetchDeepSeekModels(client, apiKey)
	default:
		return nil, fmt.Errorf("不支持的操作: %s", action)
	}
}

func fetchDeepSeekBalance(client *http.Client, apiKey string) (any, error) {
	req, err := http.NewRequest("GET", deepseekAPIBase+"/user/balance", nil)
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求余额失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("DeepSeek API 返回 %d: %s", resp.StatusCode, string(body))
	}

	var result deepSeekBalanceResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("解析余额响应失败: %w", err)
	}
	return gin.H{
		"is_available":  result.IsAvailable,
		"balance_infos": result.BalanceInfos,
	}, nil
}

func fetchDeepSeekModels(client *http.Client, apiKey string) (any, error) {
	req, err := http.NewRequest("GET", deepseekAPIBase+"/models", nil)
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求模型列表失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("DeepSeek API 返回 %d: %s", resp.StatusCode, string(body))
	}

	var result deepSeekModelsResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("解析模型列表响应失败: %w", err)
	}

	models := make([]gin.H, 0, len(result.Data))
	for _, m := range result.Data {
		models = append(models, gin.H{"id": m.ID})
	}
	return gin.H{"models": models}, nil
}
