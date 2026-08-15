package dao

import (
	"testing"

	"github.com/transactions/models"
)

// TestAiApiConfigDaoThinkingRoundTrip 验证 thinking 字段在更新分支也会被持久化。
// 回归：Save 的 Updates map 曾漏掉 thinking 列，导致修改"思考模式"后重开页面还原为 auto。
func TestAiApiConfigDaoThinkingRoundTrip(t *testing.T) {
	ws := newTestWorkspace(t)
	dao := NewAiApiConfigDao()

	// Create
	cfg := &models.AiApiConfig{
		Provider: "deepseek",
		BaseURL:  "https://api.deepseek.com/anthropic",
		Endpoint: "/v1/messages",
		APIKey:   "sk-test",
		Model:    "deepseek-chat",
		Thinking: "auto",
	}
	if err := dao.Save(ws, cfg); err != nil {
		t.Fatalf("创建配置失败: %v", err)
	}

	// Update：修改 thinking 等字段（走更新分支）
	cfg2 := &models.AiApiConfig{
		Provider: "deepseek",
		BaseURL:  "https://api.deepseek.com/anthropic",
		Endpoint: "/v1/messages",
		APIKey:   "sk-test",
		Model:    "deepseek-reasoner",
		Thinking: "disabled",
	}
	if err := dao.Save(ws, cfg2); err != nil {
		t.Fatalf("更新配置失败: %v", err)
	}

	got, err := dao.Get(ws, "deepseek")
	if err != nil {
		t.Fatalf("读取配置失败: %v", err)
	}
	if got.Thinking != "disabled" {
		t.Fatalf("thinking 应为 disabled（更新分支未持久化）, 实际 %q", got.Thinking)
	}
	if got.Model != "deepseek-reasoner" {
		t.Fatalf("model 应更新为 deepseek-reasoner, 实际 %q", got.Model)
	}
	if got.APIKey != "sk-test" {
		t.Fatalf("api_key 不应丢失, 实际 %q", got.APIKey)
	}
}
