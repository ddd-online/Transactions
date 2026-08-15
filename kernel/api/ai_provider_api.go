package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// deepSeekError maps HTTP status codes to user-friendly messages.
func deepSeekError(statusCode int) string {
	switch statusCode {
	case http.StatusUnauthorized:
		return "API Key 无效"
	case http.StatusForbidden:
		return "API Key 无权访问"
	default:
		return fmt.Sprintf("API 返回 %d", statusCode)
	}
}

// POST /api/v1/ai/provider/fetch
func (h *Handlers) fetchProvider(c *gin.Context) (any, error) {
	var req struct {
		Action   string `json:"action"`
		APIKey   string `json:"api_key"`
		Provider string `json:"provider"`
		Role     string `json:"role"`
		BaseURL  string `json:"base_url"`
	}
	if err := c.BindJSON(&req); err != nil {
		return nil, fmt.Errorf("invalid request: %w", err)
	}

	// 确定 API Key、Provider 与 Base URL：优先使用前端传入的（未保存配置时也可用），
	// 否则从 DB 读取已保存的配置。
	apiKey := req.APIKey
	provider := req.Provider
	if provider == "" {
		provider = "deepseek"
	}
	baseURL := strings.TrimRight(req.BaseURL, "/")

	if apiKey == "" || baseURL == "" {
		cfg, err := h.AiApiConfigDao.Get(ws(c), provider)
		if err == nil {
			if apiKey == "" {
				apiKey = cfg.APIKey
			}
			if baseURL == "" {
				baseURL = strings.TrimRight(cfg.BaseURL, "/")
			}
		}
	}
	baseURL = providerAPIBase(provider, baseURL)

	if apiKey == "" {
		return nil, fmt.Errorf("API Key 未设置")
	}

	client := &http.Client{Timeout: 10 * time.Second}
	switch req.Action {
	case "models":
		return fetchProviderModels(client, baseURL, apiKey)
	case "balance":
		if provider != "deepseek" {
			return nil, fmt.Errorf("当前供应商不支持余额查询")
		}
		return fetchProviderBalance(client, baseURL, apiKey)
	default:
		return nil, fmt.Errorf("不支持的操作: %s", req.Action)
	}
}

// providerAPIBase 计算模型列表/余额请求的 API 根路径：
// 优先使用已配置的 base_url（去除尾部斜杠）；DeepSeek 的 Anthropic 兼容 base（/anthropic 结尾）不提供
// /models 与 /user/balance 端点，需回退官方根路径；两者皆无时兜底 DeepSeek 官方根路径。
func providerAPIBase(provider, baseURL string) string {
	base := strings.TrimRight(baseURL, "/")
	if provider == "deepseek" && strings.HasSuffix(base, "/anthropic") {
		return deepseekAPIBase
	}
	if base == "" {
		return deepseekAPIBase
	}
	return base
}

// ---- 模型列表 / 余额查询（OpenAI 兼容 /models + DeepSeek /user/balance） ----

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

func fetchProviderBalance(client *http.Client, baseURL, apiKey string) (any, error) {
	req, err := http.NewRequest("GET", baseURL+"/user/balance", nil)
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
		return nil, fmt.Errorf("%s", deepSeekError(resp.StatusCode))
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

func fetchProviderModels(client *http.Client, baseURL, apiKey string) (any, error) {
	req, err := http.NewRequest("GET", baseURL+"/models", nil)
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
		return nil, fmt.Errorf("%s", deepSeekError(resp.StatusCode))
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
