# AI 助手供应商设置增强 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 AI 助手设置页增加供应商（Provider）概念，支持 DeepSeek 和自定义供应商，DeepSeek 下提供余额查询和模型下拉框功能。

**Architecture:** 后端新增 `provider` 字段到 `AiConfig` 模型和 API，新增 `POST /api/v1/ai/provider/fetch` 代理接口转发 DeepSeek API 调用。前端 AiSetting.vue 新增供应商下拉框并根据选择条件渲染模型控件和余额区域。

**Tech Stack:** Go (Gin, GORM, net/http), Vue 3 + TypeScript (Ant Design Vue, Axios)

## Global Constraints

- 供应商值：`""` = 自定义，`"deepseek"` = DeepSeek
- DeepSeek Base URL 预设：`https://api.deepseek.com/anthropic`
- 余额/模型代理超时：10 秒
- 存量数据 `provider = ""` → 自定义，向后兼容

---

### Task 1: 后端数据模型 — 新增 Provider 字段

**Files:**
- Modify: `kernel/models/ai_config.go`
- Modify: `kernel/dao/ai_config_dao.go`

**Interfaces:**
- Produces: `AiConfig.Provider string` (gorm + json tag), DAO Save 写入 provider 列

- [ ] **Step 1: AiConfig 新增 Provider 字段**

编辑 `kernel/models/ai_config.go`，在 `SystemPrompt` 字段后添加：

```go
// kernel/models/ai_config.go
type AiConfig struct {
	ID           int64  `gorm:"primaryKey;autoIncrement" json:"id"`
	BaseURL      string `gorm:"type:text;not null;default:''" json:"base_url"`
	Endpoint     string `gorm:"type:text;not null;default:''" json:"endpoint"`
	APIKey       string `gorm:"type:text;not null;default:''" json:"api_key"`
	Model        string `gorm:"type:text;not null;default:''" json:"model"`
	SystemPrompt string `gorm:"type:text;not null;default:''" json:"system_prompt"`
	Provider     string `gorm:"type:text;not null;default:''" json:"provider"`  // 新增
	CreatedAt    int64  `gorm:"autoCreateTime:milli" json:"created_at"`
	UpdatedAt    int64  `gorm:"autoUpdateTime:milli" json:"updated_at"`
}
```

- [ ] **Step 2: DAO Save 方法增加 provider 到 Select 列表**

编辑 `kernel/dao/ai_config_dao.go`，修改 `Save` 方法中的 `Select` 调用：

```go
// kernel/dao/ai_config_dao.go — Save 方法内，第 41 行替换
// 原: return ws.GetDb().Model(&existing).Select("base_url", "endpoint", "api_key", "model", "system_prompt").Updates(config).Error
// 改为:
return ws.GetDb().Model(&existing).Select("base_url", "endpoint", "api_key", "model", "system_prompt", "provider").Updates(config).Error
```

- [ ] **Step 3: 编译验证**

```bash
cd kernel && go build -o /dev/null ./...
```

Expected: 编译通过，无报错。

- [ ] **Step 4: Commit**

```bash
git add kernel/models/ai_config.go kernel/dao/ai_config_dao.go
git commit -m "feat: AiConfig 新增 Provider 字段，DAO Save 更新 provider 列"
```

---

### Task 2: 后端 Config API — get/update 处理 provider

**Files:**
- Modify: `kernel/api/ai_config_api.go`

**Interfaces:**
- Consumes: `AiConfig.Provider string` (from Task 1)
- Produces: `GET /api/v1/ai/config` 响应含 `provider`；`PUT /api/v1/ai/config` 接受 `provider`

- [ ] **Step 1: getAiConfig 响应新增 provider**

编辑 `kernel/api/ai_config_api.go`，在 `getAiConfig` 的返回 `gin.H` 中添加 `"provider"` 字段：

```go
// kernel/api/ai_config_api.go — getAiConfig 函数
func (h *Handlers) getAiConfig(c *gin.Context) (any, error) {
	config, err := h.AiConfigDao.Get(ws(c))
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
		"provider":      config.Provider,  // 新增
	}, nil
}
```

- [ ] **Step 2: updateAiConfig 请求体新增 provider**

编辑 `kernel/api/ai_config_api.go`，在 `updateAiConfig` 的请求结构体和 config 构造中添加 `Provider`：

```go
// kernel/api/ai_config_api.go — updateAiConfig 函数
func (h *Handlers) updateAiConfig(c *gin.Context) (any, error) {
	var req struct {
		BaseURL      string `json:"base_url"`
		Endpoint     string `json:"endpoint"`
		APIKey       string `json:"api_key"`
		Model        string `json:"model"`
		SystemPrompt string `json:"system_prompt"`
		Provider     string `json:"provider"`  // 新增
	}
	if err := c.BindJSON(&req); err != nil {
		return nil, fmt.Errorf("invalid request: %w", err)
	}

	config := &models.AiConfig{
		BaseURL:      req.BaseURL,
		Endpoint:     req.Endpoint,
		Model:        req.Model,
		SystemPrompt: req.SystemPrompt,
		Provider:     req.Provider,  // 新增
	}
	if req.APIKey != "" {
		config.APIKey = req.APIKey
	} else {
		existing, err := h.AiConfigDao.Get(ws(c))
		if err == nil {
			config.APIKey = existing.APIKey
		}
	}

	if err := h.AiConfigDao.Save(ws(c), config); err != nil {
		return nil, err
	}
	return nil, nil
}
```

- [ ] **Step 3: 编译验证**

```bash
cd kernel && go build -o /dev/null ./...
```

Expected: 编译通过。

- [ ] **Step 4: Commit**

```bash
git add kernel/api/ai_config_api.go
git commit -m "feat: AI config API get/update 支持 provider 字段"
```

---

### Task 3: 后端 Provider 代理 — 新文件 ai_provider_api.go

**Files:**
- Create: `kernel/api/ai_provider_api.go`

**Interfaces:**
- Consumes: `AiConfigDao.Get(ws)` (获取 provider 和 api_key)
- Produces: `h.fetchProvider` handler — `POST /api/v1/ai/provider/fetch`

- [ ] **Step 1: 创建 ai_provider_api.go**

创建 `kernel/api/ai_provider_api.go`：

```go
package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/billadm/models"
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
```

- [ ] **Step 2: 编译验证**

```bash
cd kernel && go build -o /dev/null ./...
```

Expected: 编译通过。

- [ ] **Step 3: Commit**

```bash
git add kernel/api/ai_provider_api.go
git commit -m "feat: 新增 POST /api/v1/ai/provider/fetch 代理接口"
```

---

### Task 4: 后端路由注册

**Files:**
- Modify: `kernel/api/router.go`

**Interfaces:**
- Consumes: `h.fetchProvider` handler (from Task 3)

- [ ] **Step 1: 注册 provider/fetch 路由**

编辑 `kernel/api/router.go`，在 `/ai` 路由组中添加新路由：

```go
// kernel/api/router.go — 在 ai 路由组内，ai.POST("/config/test", ...) 之后添加:
ai.POST("/provider/fetch", Handle(h.fetchProvider))
```

完整上下文（`/ai` 组变为）：

```go
// AI Chat (requires workspace)
ai := v1.Group("/ai")
{
    ai.POST("/chat", h.aiChat) // SSE — not wrapped in Handle()
    ai.GET("/config", Handle(h.getAiConfig))
    ai.PUT("/config", Handle(h.updateAiConfig))
    ai.POST("/config/test", Handle(h.testAiConnection))
    ai.POST("/provider/fetch", Handle(h.fetchProvider))  // 新增
    ai.GET("/messages", Handle(h.listAiMessages))
    ai.DELETE("/messages", Handle(h.clearAiMessages))
}
```

- [ ] **Step 2: 编译验证**

```bash
cd kernel && go build -o /dev/null ./...
```

Expected: 编译通过。

- [ ] **Step 3: Commit**

```bash
git add kernel/api/router.go
git commit -m "feat: 注册 /api/v1/ai/provider/fetch 路由"
```

---

### Task 5: 前端 TypeScript 类型和 API 方法

**Files:**
- Modify: `app/src/backend/api/ai.ts`

**Interfaces:**
- Produces: `AiConfig.provider`, `AiConfigResponse.provider`, `ProviderFetchRequest`, `BalanceResponse`, `ModelsResponse`, `aiApi.fetchProvider()`

- [ ] **Step 1: 更新 ai.ts 类型定义和 API 方法**

编辑 `app/src/backend/api/ai.ts`：

```typescript
import api from './api-client';

export interface AiConfig {
  base_url: string;
  endpoint: string;
  api_key: string;
  model: string;
  system_prompt: string;
  provider: string;
}

export interface AiConfigResponse {
  base_url: string;
  endpoint: string;
  model: string;
  has_key: boolean;
  system_prompt: string;
  provider: string;
}

export interface ProviderFetchRequest {
  action: 'balance' | 'models';
  api_key?: string;
  provider?: string;
}

export interface BalanceInfo {
  currency: string;
  total_balance: string;
  granted_balance: string;
  topped_up_balance: string;
}

export interface BalanceResponse {
  is_available: boolean;
  balance_infos: BalanceInfo[];
}

export interface ModelsResponse {
  models: { id: string }[];
}

export const aiApi = {
  async getConfig(): Promise<AiConfigResponse> {
    return api.get('/v1/ai/config', '获取AI配置');
  },

  async updateConfig(config: AiConfig): Promise<void> {
    return api.put('/v1/ai/config', config, '保存AI配置');
  },

  async testConnection(config: AiConfig): Promise<void> {
    return api.post('/v1/ai/config/test', config, '测试连接');
  },

  async fetchProvider(action: 'balance' | 'models', apiKey?: string, provider?: string): Promise<any> {
    const body: ProviderFetchRequest = { action };
    if (apiKey) {
      body.api_key = apiKey;
    }
    if (provider) {
      body.provider = provider;
    }
    return api.post('/v1/ai/provider/fetch', body, '获取供应商信息');
  },

  async getMessages(): Promise<AiMessage[]> {
    return api.get('/v1/ai/messages', '获取对话历史');
  },

  async clearMessages(): Promise<void> {
    return api.delete('/v1/ai/messages', '清空对话');
  },
};

export interface AiMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  tool_calls: string;
  tool_call_id: string;
  tool_name: string;
  created_at: number;
}
```

- [ ] **Step 2: TypeScript 类型检查**

```bash
cd app && npx vue-tsc -b --noEmit 2>&1 | head -20
```

Expected: 无新增类型错误（ai.ts 本身无报错）。

- [ ] **Step 3: Commit**

```bash
git add app/src/backend/api/ai.ts
git commit -m "feat: 前端 ai.ts 新增 provider 类型和 fetchProvider API 方法"
```

---

### Task 6: 前端 AiSetting.vue UI 重构

**Files:**
- Modify: `app/src/components/settings_view/AiSetting.vue`

**Interfaces:**
- Consumes: `AiConfigResponse.provider`, `aiApi.fetchProvider()` (from Task 5)
- Produces: 供应商下拉框、条件渲染的模型下拉框/输入框、余额展示区域

- [ ] **Step 1: 替换 AiSetting.vue 模板**

编辑 `app/src/components/settings_view/AiSetting.vue`，完整替换 `<template>` 部分：

```vue
<template>
  <div class="ai-setting">
    <BilladmPageHeader title="AI 助手" />

    <div class="setting-list">
      <!-- 供应商 -->
      <div class="setting-card">
        <div class="setting-info">
          <span class="setting-title">供应商</span>
          <span class="setting-desc">选择 AI 服务供应商</span>
        </div>
        <div class="setting-action">
          <a-select
            v-model:value="form.provider"
            :options="providerOptions"
            style="width: 360px"
            @change="onProviderChange"
          />
        </div>
      </div>

      <!-- 端点 -->
      <div class="setting-card">
        <div class="setting-info">
          <span class="setting-title">端点</span>
          <span class="setting-desc">选择 AI 服务提供商的 API 端点</span>
        </div>
        <div class="setting-action">
          <a-select
            v-model:value="form.endpoint"
            :options="endpointOptions"
            style="width: 360px"
            @change="onEndpointChange"
          />
        </div>
      </div>

      <!-- Base URL -->
      <div class="setting-card">
        <div class="setting-info">
          <span class="setting-title">Base URL</span>
          <span class="setting-desc">API 服务的基础地址</span>
        </div>
        <div class="setting-action">
          <a-input
            v-model:value="form.base_url"
            :placeholder="baseUrlPlaceholder"
            style="width: 360px"
          />
        </div>
      </div>

      <!-- API Key -->
      <div class="setting-card">
        <div class="setting-info">
          <span class="setting-title">API Key</span>
          <span class="setting-desc">{{ form.has_key ? '已设置' : 'API 访问密钥' }}</span>
        </div>
        <div class="setting-action">
          <a-input-password
            v-model:value="form.api_key"
            :placeholder="keyPlaceholder ? '••••••••' : '请输入 API Key'"
            style="width: 360px"
            @focus="onKeyFieldFocus"
          />
        </div>
      </div>

      <!-- 模型 -->
      <div class="setting-card">
        <div class="setting-info">
          <span class="setting-title">模型</span>
          <span class="setting-desc">使用的模型名称</span>
        </div>
        <div class="setting-action">
          <!-- DeepSeek: 下拉框 -->
          <a-select
            v-if="form.provider === 'deepseek'"
            v-model:value="form.model"
            :loading="modelsLoading"
            :options="modelOptions"
            :placeholder="modelsError ? '加载失败，请重试' : '请选择模型'"
            style="width: 360px"
            :not-found-content="modelsError ? modelsError : undefined"
          />
          <!-- 自定义: 文本输入框 -->
          <a-input
            v-else
            v-model:value="form.model"
            placeholder="例如: claude-sonnet-4-20250514"
            style="width: 360px"
          />
        </div>
      </div>

      <!-- 系统提示词 -->
      <div class="setting-card setting-card-vertical">
        <div class="setting-info">
          <span class="setting-title">系统提示词</span>
          <span class="setting-desc">自定义 AI 助手的行为和回答风格。留空则使用默认提示词</span>
        </div>
        <div class="setting-action setting-action-full">
          <a-textarea
            v-model:value="form.system_prompt"
            :rows="6"
            :maxlength="4000"
            show-count
            placeholder="留空使用默认提示词"
            style="width: 100%; font-family: var(--billadm-font-mono); font-size: var(--billadm-size-text-body-sm)"
          />
          <a-button size="small" style="margin-top: 8px" @click="resetSystemPrompt">恢复默认</a-button>
        </div>
      </div>

      <!-- 余额 (仅 DeepSeek) -->
      <div v-if="form.provider === 'deepseek'" class="setting-card setting-card-vertical">
        <div class="setting-info">
          <span class="setting-title">账户余额</span>
          <span class="setting-desc">DeepSeek API 账户余额信息</span>
        </div>
        <div class="setting-action setting-action-full">
          <div v-if="!form.has_key" class="balance-hint">请先设置 API Key</div>
          <div v-else-if="balanceLoading" class="balance-hint">查询中...</div>
          <div v-else-if="balanceError" class="balance-hint balance-error">
            {{ balanceError }}
            <a-button type="link" size="small" @click="fetchBalance">重试</a-button>
          </div>
          <div v-else-if="balance" class="balance-info">
            <div class="balance-status">
              <span class="balance-dot" :class="balance.is_available ? 'dot-available' : 'dot-unavailable'" />
              <span>{{ balance.is_available ? '可用' : '不可用' }}</span>
            </div>
            <div v-for="info in balance.balance_infos" :key="info.currency" class="balance-row">
              <span class="balance-currency">{{ info.currency }}</span>
              <span class="balance-value">
                总额 {{ info.total_balance }}
                <span class="balance-sub">赠金 {{ info.granted_balance }}</span>
                <span class="balance-sub">充值 {{ info.topped_up_balance }}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="setting-card">
        <div class="setting-info">
          <span class="setting-title">连接测试</span>
          <span class="setting-desc">验证配置是否能正常连接 AI 服务</span>
        </div>
        <div class="setting-action setting-action-row">
          <a-button @click="handleTestConnection" :loading="testing">测试连接</a-button>
          <a-button type="primary" @click="handleSave" :loading="saving">保存配置</a-button>
        </div>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 替换 AiSetting.vue 脚本**

完整替换 `<script lang="ts" setup>` 部分：

```typescript
<script lang="ts" setup>
import { ref, reactive, onMounted } from 'vue'
import BilladmPageHeader from '@/components/common/BilladmPageHeader.vue'
import { aiApi, type AiConfig, type BalanceResponse, type ModelsResponse } from '@/backend/api/ai'
import NotificationUtil from '@/backend/notification'

const providerOptions = [
  { label: 'DeepSeek', value: 'deepseek' },
  { label: '自定义', value: '' },
]

const endpointOptions = [
  { label: 'Anthropic (/v1/messages)', value: '/v1/messages' },
  { label: 'OpenAI 兼容 (/chat/completions)', value: '/chat/completions' },
]

const baseUrlPlaceholder = ref('https://api.anthropic.com')

interface FormState extends AiConfig {
  has_key: boolean
}

const form = reactive<FormState>({
  provider: '',
  base_url: '',
  endpoint: '/v1/messages',
  api_key: '',
  model: '',
  system_prompt: '',
  has_key: false,
})

const testing = ref(false)
const saving = ref(false)
const keyPlaceholder = ref(false)

// 模型下拉框状态
const modelsLoading = ref(false)
const modelsError = ref('')
const modelOptions = ref<{ label: string; value: string }[]>([])

// 余额状态
const balanceLoading = ref(false)
const balanceError = ref('')
const balance = ref<BalanceResponse | null>(null)

// 获取当前有效的 API Key（用户输入或使用存储的）
function getEffectiveApiKey(): string {
  return keyPlaceholder.value ? '' : form.api_key
}

function onKeyFieldFocus() {
  if (keyPlaceholder.value) {
    form.api_key = ''
    keyPlaceholder.value = false
  }
}

function onEndpointChange(value: unknown) {
  switch (value) {
    case '/v1/messages':
      baseUrlPlaceholder.value = 'https://api.anthropic.com'
      break
    case '/chat/completions':
      baseUrlPlaceholder.value = 'https://api.openai.com/v1'
      break
    default:
      baseUrlPlaceholder.value = 'https://api.anthropic.com'
  }
}

function onProviderChange(value: string) {
  switch (value) {
    case 'deepseek':
      baseUrlPlaceholder.value = 'https://api.deepseek.com/anthropic'
      form.endpoint = '/v1/messages'
      break
    case '':
    default:
      baseUrlPlaceholder.value = ''
      break
  }
  // 切换后触发查询
  fetchDeepSeekResources()
}

async function fetchModels() {
  modelsLoading.value = true
  modelsError.value = ''
  try {
    const res = await aiApi.fetchProvider('models', getEffectiveApiKey(), form.provider) as ModelsResponse
    modelOptions.value = res.models.map(m => ({ label: m.id, value: m.id }))
  } catch (e: any) {
    modelsError.value = e.message || '加载失败'
  } finally {
    modelsLoading.value = false
  }
}

async function fetchBalance() {
  balanceLoading.value = true
  balanceError.value = ''
  try {
    balance.value = await aiApi.fetchProvider('balance', getEffectiveApiKey(), form.provider) as BalanceResponse
  } catch (e: any) {
    balance.value = null
    balanceError.value = e.message || '加载失败'
  } finally {
    balanceLoading.value = false
  }
}

function fetchDeepSeekResources() {
  if (form.provider !== 'deepseek' || !form.has_key) {
    balance.value = null
    balanceError.value = ''
    modelOptions.value = []
    modelsError.value = ''
    return
  }
  fetchModels()
  fetchBalance()
}

async function loadConfig() {
  try {
    const config = await aiApi.getConfig()
    form.provider = config.provider || ''
    form.base_url = config.base_url || ''
    form.endpoint = config.endpoint || '/v1/messages'
    form.model = config.model || ''
    form.system_prompt = config.system_prompt || ''
    form.has_key = config.has_key
    if (config.has_key) {
      form.api_key = '••••••••'
      keyPlaceholder.value = true
    }
    onEndpointChange(form.endpoint)
    onProviderChange(form.provider)
  } catch {
    // 加载失败时保持默认值
  }
}

async function handleTestConnection() {
  testing.value = true
  try {
    await aiApi.testConnection({
      provider: form.provider,
      base_url: form.base_url,
      endpoint: form.endpoint,
      api_key: keyPlaceholder.value ? '' : form.api_key,
      model: form.model,
      system_prompt: form.system_prompt,
    })
    NotificationUtil.success('连接成功')
  } catch (e: any) {
    NotificationUtil.error('连接失败', e.message)
  } finally {
    testing.value = false
  }
}

async function handleSave() {
  saving.value = true
  try {
    const keyToSave = keyPlaceholder.value ? '' : form.api_key
    await aiApi.updateConfig({
      provider: form.provider,
      base_url: form.base_url,
      endpoint: form.endpoint,
      api_key: keyToSave,
      model: form.model,
      system_prompt: form.system_prompt,
    })
    if (keyToSave) {
      form.has_key = true
      keyPlaceholder.value = false
    } else if (!keyPlaceholder.value) {
      form.has_key = false
    }
    NotificationUtil.success('AI 配置已保存')
    // 保存后重新查询 DeepSeek 资源（可能有新的 API Key）
    fetchDeepSeekResources()
  } catch (e: any) {
    NotificationUtil.error('保存失败', e.message)
  } finally {
    saving.value = false
  }
}

function resetSystemPrompt() {
  form.system_prompt = ''
}

onMounted(() => {
  loadConfig()
})
</script>
```

- [ ] **Step 3: 替换样式部分 — 在现有 `<style scoped>` 末尾添加余额样式**

在 `</style>` 之前添加：

```css
.balance-hint {
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-secondary);
}

.balance-error {
  color: var(--billadm-color-error, #D9705A);
}

.balance-info {
  display: flex;
  flex-direction: column;
  gap: var(--billadm-space-xs);
}

.balance-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--billadm-size-text-body);
  color: var(--billadm-color-text-major);
}

.balance-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.dot-available {
  background-color: var(--billadm-color-success, #3D8C5E);
}

.dot-unavailable {
  background-color: var(--billadm-color-error, #D9705A);
}

.balance-row {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-sm);
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-secondary);
}

.balance-currency {
  font-weight: 600;
  min-width: 36px;
}

.balance-value {
  display: flex;
  gap: var(--billadm-space-sm);
}

.balance-sub {
  color: var(--billadm-color-text-tertiary, #9B9B92);
}
```

- [ ] **Step 4: TypeScript 类型检查**

```bash
cd app && npx vue-tsc -b --noEmit 2>&1 | head -30
```

Expected: 无新增类型错误。

- [ ] **Step 5: Commit**

```bash
git add app/src/components/settings_view/AiSetting.vue
git commit -m "feat: AiSetting.vue 供应商选择、模型下拉框、余额展示"
```

---

### Task 7: 端到端验证

**Files:**
- 无新建文件

**Interfaces:**
- Consumes: 所有前序任务

- [ ] **Step 1: 后端编译 + vet 检查**

```bash
cd kernel && go build -o /dev/null ./... && go vet ./...
```

Expected: 编译通过，无 vet 警告。

- [ ] **Step 2: 前端类型检查**

```bash
cd app && npx vue-tsc -b --noEmit
```

Expected: 无类型错误。

- [ ] **Step 3: 运行后端测试（如果存在）**

```bash
cd kernel && go test ./... 2>&1
```

Expected: 已有测试全部通过。

- [ ] **Step 4: Commit（如有测试修复）**

```bash
git add -A && git commit -m "chore: 端到端验证通过"
```
（仅在有修改时执行）
