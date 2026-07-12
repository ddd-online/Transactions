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
            class="setting-input-wide"
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
            class="setting-input-wide"
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
            class="setting-input-wide"
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
            class="setting-input-wide"
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
          <!-- DeepSeek: 正常时下拉框，加载失败时降级为输入框 + 重试 -->
          <template v-if="form.provider === 'deepseek'">
            <a-select
              v-if="!modelsError"
              v-model:value="form.model"
              :loading="modelsLoading"
              :options="modelOptions"
              placeholder="请选择模型"
              class="setting-input-wide"
            />
            <div v-else class="model-error-inline">
              <a-input
                v-model:value="form.model"
                placeholder="加载失败，请手动输入模型名"
                style="width: 280px"
              />
              <a-button type="link" size="small" @click="fetchModels">重试</a-button>
            </div>
          </template>
          <!-- 自定义: 文本输入框 -->
          <a-input
            v-else
            v-model:value="form.model"
            placeholder="例如: claude-sonnet-4-20250514"
            class="setting-input-wide"
          />
        </div>
      </div>

      <!-- 系统提示词 -->
      <div class="setting-card setting-card-vertical">
        <div class="setting-header-row">
          <div class="setting-info">
            <span class="setting-title">系统提示词</span>
            <span class="setting-desc">自定义 AI 助手的行为和回答风格。留空则使用默认提示词</span>
          </div>
        </div>
        <div class="prompt-controls">
          <span class="prompt-role-label">角色</span>
          <a-select
            v-model:value="currentRole"
            :options="availableRoles.map(r => ({ label: r.display_name, value: r.name }))"
            size="small"
            style="width: 110px"
            @change="onRoleChange"
          />
          <span class="prompt-controls-spacer"></span>
          <a-button size="small" @click="resetSystemPrompt">恢复默认</a-button>
        </div>
        <div class="setting-action setting-action-full">
          <a-textarea
            v-model:value="form.system_prompt"
            :rows="8"
            :maxlength="4000"
            show-count
            placeholder="留空使用默认提示词"
            class="prompt-textarea"
          />
          <div class="placeholder-hint" v-if="currentRole === 'financial_assistant'">
            支持占位符：<code v-pre>{{CURRENT_LEDGER}}</code> = 当前选中的账本名称
          </div>
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

<script lang="ts" setup>
import { ref, reactive, onMounted } from 'vue'
import BilladmPageHeader from '@/components/common/BilladmPageHeader.vue'
import { aiApi, type AiConfig, type AiRole, type BalanceResponse, type ModelsResponse } from '@/backend/api/ai'
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

const availableRoles = ref<AiRole[]>([])
const currentRole = ref<string>('financial_assistant')

async function fetchRoles() {
  try {
    availableRoles.value = await aiApi.fetchRoles()
  } catch {
    availableRoles.value = [
      { name: 'financial_assistant', display_name: '财务助手' },
      { name: 'diary_assistant', display_name: '日记助手' },
    ]
  }
}

function onRoleChange(role: any) {
  currentRole.value = role as string
  loadConfig()
}

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

function onProviderChange(value: unknown) {
  const provider = (value as string) || ''
  switch (provider) {
    case 'deepseek':
      baseUrlPlaceholder.value = 'https://api.deepseek.com/anthropic'
      form.endpoint = '/v1/messages'
      break
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
    const config = await aiApi.getConfig(currentRole.value)
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
      role: currentRole.value,
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
      role: currentRole.value,
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
  fetchRoles()
  loadConfig()
})
</script>

<style scoped>
.ai-setting {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.setting-list {
  display: flex;
  flex-direction: column;
  gap: var(--billadm-space-sm);
}

.setting-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--billadm-space-md) var(--billadm-space-lg);
  background-color: var(--billadm-color-major-background);
  border: 1px solid var(--billadm-color-divider);
  border-radius: var(--billadm-radius-md);
  transition: background-color var(--billadm-transition-fast);
}

.setting-card:hover {
  background-color: var(--billadm-color-hover-bg);
}

.setting-info {
  display: flex;
  flex-direction: column;
  gap: var(--billadm-space-2xs);
  min-width: 0;
}

.setting-title {
  font-size: var(--billadm-size-text-body);
  font-weight: var(--billadm-weight-medium);
  color: var(--billadm-color-text-major);
}

.setting-desc {
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.setting-action {
  flex-shrink: 0;
  margin-left: var(--billadm-space-lg);
}

.setting-input-wide { width: 360px; }
.setting-input-small { width: 200px; }

.setting-action-row {
  display: flex;
  gap: var(--billadm-space-sm);
}

.setting-card-vertical {
  flex-direction: column;
  align-items: flex-start;
}

.setting-header-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  width: 100%;
}

.setting-header-actions {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-sm);
  flex-shrink: 0;
  margin-left: var(--billadm-space-lg);
}

.prompt-controls {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-sm);
  width: 100%;
  margin-top: var(--billadm-space-sm);
}

.prompt-role-label {
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-secondary);
  flex-shrink: 0;
}

.prompt-controls-spacer {
  flex: 1;
}

.prompt-textarea {
  width: 100%;
  font-family: var(--billadm-font-mono);
  font-size: var(--billadm-size-text-body-sm);
  line-height: var(--billadm-height-normal);
  color: var(--billadm-color-text-major);
  background: var(--billadm-color-minor-background);
  border-color: var(--billadm-color-divider);
  resize: vertical;
}

.prompt-textarea:focus {
  background: var(--billadm-color-major-background);
  border-color: var(--billadm-color-primary);
  box-shadow: 0 0 0 2px rgba(74, 142, 112, 0.12);
}

.setting-action-full {
  margin-left: 0;
  margin-top: var(--billadm-space-md);
  width: 100%;
}

.balance-hint {
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-secondary);
}

.model-error-inline {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-xs);
}

.balance-error {
  color: var(--billadm-color-expense);
}

.balance-info {
  display: flex;
  flex-direction: column;
  gap: var(--billadm-space-xs);
}

.balance-status {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-xs);
  font-size: var(--billadm-size-text-body);
  color: var(--billadm-color-text-major);
}

.balance-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.dot-available {
  background-color: var(--billadm-color-success);
}

.dot-unavailable {
  background-color: var(--billadm-color-expense);
}

.balance-row {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-sm);
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-secondary);
}

.balance-currency {
  font-weight: var(--billadm-weight-semibold);
  min-width: 36px;
}

.balance-value {
  display: flex;
  gap: var(--billadm-space-sm);
}

.balance-sub {
  color: var(--billadm-color-text-secondary);
}

.placeholder-hint {
  margin-top: var(--billadm-space-xs);
  color: var(--billadm-color-text-secondary);
  font-size: var(--billadm-size-text-caption);
}

.placeholder-hint code {
  background: var(--billadm-color-minor-background);
  padding: var(--billadm-space-2xs) var(--billadm-space-xs);
  border-radius: var(--billadm-radius-sm);
  font-family: var(--billadm-font-mono);
  font-size: inherit;
}

.prompt-textarea :deep(textarea) {
  &::-webkit-scrollbar { width: 5px; }
  &::-webkit-scrollbar-track { background: transparent; margin-block: var(--billadm-space-xs); }
  &::-webkit-scrollbar-thumb { background: rgba(141, 127, 111, 0.18); border-radius: 8px; }
  &:hover::-webkit-scrollbar-thumb { background: rgba(141, 127, 111, 0.40); }
}

@media (prefers-reduced-motion: reduce) {
  .setting-card { transition: none; }
}
</style>
