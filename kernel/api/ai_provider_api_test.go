package api

import "testing"

// TestProviderAPIBase 验证模型列表/余额请求的 API 根路径推导：
// 已配置 base_url 优先；DeepSeek 的 anthropic 兼容 base 回退官方根路径；空值兜底官方根路径。
func TestProviderAPIBase(t *testing.T) {
	cases := []struct {
		provider string
		baseURL  string
		want     string
	}{
		// DeepSeek 默认 anthropic 兼容 base → 回退官方根路径（/models 与 /user/balance 在根路径）
		{"deepseek", "https://api.deepseek.com/anthropic", "https://api.deepseek.com"},
		{"deepseek", "https://api.deepseek.com/anthropic/", "https://api.deepseek.com"},
		// DeepSeek 无配置 → 兜底官方根路径
		{"deepseek", "", "https://api.deepseek.com"},
		// 自定义代理 base 保持原样
		{"deepseek", "https://my-proxy.example.com/v1", "https://my-proxy.example.com/v1"},
		// 任意 OpenAI 兼容供应商
		{"", "https://api.openai.com/v1", "https://api.openai.com/v1"},
		{"custom", "https://api.openai.com/v1/", "https://api.openai.com/v1"},
		// 未知供应商且无 base → 兜底 DeepSeek 根路径
		{"custom", "", "https://api.deepseek.com"},
	}
	for _, c := range cases {
		if got := providerAPIBase(c.provider, c.baseURL); got != c.want {
			t.Fatalf("providerAPIBase(%q, %q) = %q, 期望 %q", c.provider, c.baseURL, got, c.want)
		}
	}
}
