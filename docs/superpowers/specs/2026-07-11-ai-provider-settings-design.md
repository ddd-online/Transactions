# AI 助手供应商设置增强

**日期**: 2026-07-11
**状态**: 已确认

## 概述

为 AI 助手设置页增加"供应商"概念，支持 DeepSeek 和自定义两种供应商。选择 DeepSeek 时提供余额查询和模型下拉框等专属功能。

---

## 1. 数据模型

### 1.1 AiConfig 新增字段

```go
// kernel/models/ai_config.go
type AiConfig struct {
    // ... 现有字段不变 ...
    Provider string `gorm:"type:text;not null;default:''" json:"provider"`
}
```

- `""`（空字符串）= 自定义供应商（存量数据兼容）
- `"deepseek"` = DeepSeek
- 类型为 text，未来新增供应商无需改 schema

### 1.2 DAO 变更

`AiConfigDao.Save()` 的 `Select` 列表增加 `"provider"`，确保更新时写入该字段。

### 1.3 数据库迁移

GORM `autoMigrate` 自动添加 `provider` 列，无需手动迁移脚本。

---

## 2. 后端 API

### 2.1 现有接口变更

**`GET /api/v1/ai/config`** — 响应新增 `provider` 字段：

```json
{
  "base_url": "...",
  "endpoint": "...",
  "model": "...",
  "has_key": true,
  "system_prompt": "...",
  "provider": "deepseek"
}
```

**`PUT /api/v1/ai/config`** — 请求体新增 `provider` 字段。

### 2.2 新增供应商代理接口

**`POST /api/v1/ai/provider/fetch`**

通用代理，后端根据数据库中存储的 provider 和 API Key 转发到对应供应商 API。

请求体：

```json
{
  "action": "balance | models",
  "api_key": "(可选) 前端填写的 Key，未保存时使用"
}
```

- `api_key` 可选：若用户已在前端表单填写但尚未保存，前端可传入；若为空，后端从数据库读取

**action=balance 响应：**

```json
{
  "is_available": true,
  "balance_infos": [
    {
      "currency": "CNY",
      "total_balance": "100.00",
      "granted_balance": "50.00",
      "topped_up_balance": "50.00"
    }
  ]
}
```

**action=models 响应：**

```json
{
  "models": [
    { "id": "deepseek-v4-pro" },
    { "id": "deepseek-v4-flash" }
  ]
}
```

### 2.3 实现位置

新文件 `kernel/api/ai_provider_api.go`，包含：

- `POST /api/v1/ai/provider/fetch` handler
- DeepSeek 的 balance/models 调用逻辑

后端调用 DeepSeek API 时需传 `Authorization: Bearer <api_key>` header。

---

## 3. 前端 UI

### 3.1 布局变更

在 AiSetting.vue 中，在"端点"上方新增"供应商"行作为第一项：

```
供应商   [下拉框: DeepSeek | 自定义]
端点     [下拉框: Anthropic | OpenAI]    ← 保留现有
Base URL [输入框]
API Key  [密码输入框]
模型     [下拉框(DeepSeek) / 输入框(自定义)]
系统提示词 [文本域]                        ← 保留现有

--- 仅 DeepSeek 显示 ---
余额     [自动查询展示区域]
```

### 3.2 供应商切换行为

| 选择 | Base URL placeholder | 端点 | 模型控件 | 余额 |
|------|---------------------|------|----------|------|
| DeepSeek | `https://api.deepseek.com/anthropic` | 自动 `/v1/messages`（可改） | `a-select` 下拉框 | 显示 |
| 自定义 | 无 placeholder | 保持用户上次选择 | `a-input` 文本框 | 隐藏 |

- 切换供应商时保留表单状态（切回 DeepSeek 时恢复之前的模型选择）
- DeepSeek 下的模型下拉框需支持 loading 状态（加载模型列表时）

### 3.3 余额展示

- 进入设置页时，若 `provider === 'deepseek'` 且有 API Key，自动调用 `/provider/fetch`（action=balance）
- 若 `has_key === false`（尚未保存过 Key），显示"请先设置 API Key"
- 展示内容：可用状态（绿点/红点 + 文字）+ 各币种余额
- 加载失败：内联提示"加载失败" + 重试链接

### 3.4 模型下拉框

- 初次加载 DeepSeek 设置时自动调用 `/provider/fetch`（action=models）
- 若当前保存的 model 值在模型列表中，自动选中
- 加载失败：降级为文本输入框 + "加载模型列表失败"提示

### 3.5 TypeScript 类型变更

`app/src/backend/api/ai.ts`：

```typescript
export interface AiConfig {
  base_url: string
  endpoint: string
  api_key: string
  model: string
  system_prompt: string
  provider: string  // 新增
}

export interface AiConfigResponse {
  // ... 现有字段 ...
  provider: string  // 新增
}

// 新增
export interface ProviderFetchRequest {
  action: 'balance' | 'models'
  api_key?: string
}

export interface BalanceInfo {
  currency: string
  total_balance: string
  granted_balance: string
  topped_up_balance: string
}

export interface BalanceResponse {
  is_available: boolean
  balance_infos: BalanceInfo[]
}

export interface ModelsResponse {
  models: { id: string }[]
}

// aiApi 新增方法
fetchProvider(action: 'balance' | 'models', apiKey?: string): Promise<any>
```

---

## 4. 错误处理

| 场景 | 处理方式 |
|------|----------|
| 余额接口调用失败 | 余额区域内联提示"加载失败，点击重试"，不弹 Notification |
| 模型列表加载失败 | 模型区域降级为文本输入框 + 内联错误提示 |
| API Key 未设置（has_key=false） | 余额/模型区域显示"请先设置 API Key" |
| 代理接口超时（10s） | 显示"请求超时，请检查网络" |
| 用户保存配置后 | 若 provider 为 DeepSeek 且有 key，重新触发查询 |

---

## 5. 涉及文件

| 文件 | 变更类型 |
|------|----------|
| `kernel/models/ai_config.go` | 新增 Provider 字段 |
| `kernel/dao/ai_config_dao.go` | Save 的 Select 列表增加 provider |
| `kernel/api/ai_config_api.go` | get/update 响应新增 provider |
| `kernel/api/ai_provider_api.go` | **新文件** — provider/fetch handler |
| `kernel/api/router.go` | 注册新路由 |
| `app/src/backend/api/ai.ts` | 新增类型和方法 |
| `app/src/components/settings_view/AiSetting.vue` | UI 重构 |

---

## 6. 路由注册

```go
// kernel/api/router.go
auth.POST("/ai/provider/fetch", wsMw, h.fetchProvider)
```
