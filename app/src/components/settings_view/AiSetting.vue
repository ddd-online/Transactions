<template>
  <div class="ai-setting">
    <BilladmPageHeader title="AI 助手" />

    <div class="setting-list">
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
            style="width: 220px"
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
          <a-input
            v-model:value="form.model"
            placeholder="例如: claude-sonnet-4-20250514"
            style="width: 360px"
          />
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
import { aiApi, type AiConfig } from '@/backend/api/ai'
import NotificationUtil from '@/backend/notification'

const endpointOptions = [
  { label: 'Anthropic (/v1/messages)', value: '/v1/messages' },
  { label: 'OpenAI 兼容 (/chat/completions)', value: '/chat/completions' },
]

const baseUrlPlaceholder = ref('https://api.anthropic.com')

interface FormState extends AiConfig {
  has_key: boolean
}

const form = reactive<FormState>({
  base_url: '',
  endpoint: '/v1/messages',
  api_key: '',
  model: '',
  has_key: false,
})

const testing = ref(false)
const saving = ref(false)
const keyPlaceholder = ref(false)

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

async function loadConfig() {
  try {
    const config = await aiApi.getConfig()
    form.base_url = config.base_url || ''
    form.endpoint = config.endpoint || '/v1/messages'
    form.model = config.model || ''
    form.has_key = config.has_key
    if (config.has_key) {
      form.api_key = '••••••••'
      keyPlaceholder.value = true
    }
    onEndpointChange(form.endpoint)
  } catch {
    // 加载失败时保持默认值
  }
}

async function handleTestConnection() {
  testing.value = true
  try {
    await aiApi.testConnection({
      base_url: form.base_url,
      endpoint: form.endpoint,
      api_key: form.api_key,
      model: form.model,
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
      base_url: form.base_url,
      endpoint: form.endpoint,
      api_key: keyToSave,
      model: form.model,
    })
    if (keyToSave) {
      form.has_key = true
      keyPlaceholder.value = false
    } else if (!keyPlaceholder.value) {
      // 用户主动清空了密钥
      form.has_key = false
    }
    // keyPlaceholder 为 true 时 has_key 不变
    NotificationUtil.success('AI 配置已保存')
  } catch (e: any) {
    NotificationUtil.error('保存失败', e.message)
  } finally {
    saving.value = false
  }
}

onMounted(() => {
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
  gap: var(--billadm-space-xs);
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
  gap: 2px;
  min-width: 0;
}

.setting-title {
  font-size: var(--billadm-size-text-body);
  font-weight: 500;
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

.setting-action-row {
  display: flex;
  gap: var(--billadm-space-sm);
}
</style>
