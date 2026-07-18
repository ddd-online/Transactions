<template>
  <SettingsPageWrapper title="智能助手">

    <div class="setting-list">
      <!-- API 连接 -->
      <div class="setting-card setting-card-vertical">
        <div class="setting-header-row">
          <div class="setting-info">
            <span class="setting-title">API 连接</span>
            <span class="setting-desc">配置 AI 服务供应商和连接参数</span>
          </div>
          <a-button @click="handleTestConnection" :loading="testing">测试连接</a-button>
        </div>

        <div class="card-section-divider" />

        <div class="inline-field">
          <div class="setting-info">
            <span class="setting-title">供应商</span>
            <span class="setting-desc">选择 AI 服务供应商</span>
          </div>
          <a-select
            v-model:value="form.provider"
            size="small"
            :options="providerOptions"
            class="setting-input-wide"
            @change="onProviderChange"
          />
        </div>

        <div class="inline-field">
          <div class="setting-info">
            <span class="setting-title">端点</span>
            <span class="setting-desc">选择 AI 服务提供商的 API 端点</span>
          </div>
          <a-select
            v-model:value="form.endpoint"
            size="small"
            :options="endpointOptions"
            class="setting-input-wide"
            @change="onEndpointChange"
          />
        </div>

        <div class="inline-field">
          <div class="setting-info">
            <span class="setting-title">Base URL</span>
            <span class="setting-desc">API 服务的基础地址</span>
          </div>
          <a-input
            v-model:value="form.base_url"
            :placeholder="baseUrlPlaceholder"
            class="setting-input-wide"
          />
        </div>

        <div class="inline-field">
          <div class="setting-info">
            <span class="setting-title">API Key</span>
            <span class="setting-desc">{{ form.has_key ? '已设置' : 'API 访问密钥' }}</span>
          </div>
          <a-input-password
            v-model:value="form.api_key"
            :placeholder="keyPlaceholder ? '••••••••' : '请输入 API Key'"
            class="setting-input-wide"
            @focus="onKeyFieldFocus"
          />
        </div>

        <div class="inline-field">
          <div class="setting-info">
            <span class="setting-title">模型</span>
            <span class="setting-desc">使用的模型名称</span>
          </div>
          <template v-if="form.provider === 'deepseek'">
            <a-select
              v-if="!modelsError"
              v-model:value="form.model"
              size="small"
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
          <a-input
            v-else
            v-model:value="form.model"
            placeholder="例如: claude-sonnet-4-20250514"
            class="setting-input-wide"
          />
        </div>

        <template v-if="form.provider === 'deepseek'">
          <div class="card-section-divider" />
          <div class="balance-section">
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
        </template>
      </div>

      <!-- 角色配置 (系统提示词 + 快捷命令) -->
      <div class="setting-card setting-card-vertical setting-section">
        <div class="setting-header-row">
          <div class="setting-info">
            <span class="setting-title">角色</span>
            <span class="setting-desc">选择智能助手的角色</span>
          </div>
          <a-select
            v-model:value="currentRole"
            size="small"
            :options="availableRoles.map(r => ({ label: r.display_name, value: r.name }))"
            style="width: 140px"
            @change="onRoleChange"
          />
        </div>

        <div class="card-section-divider" />

        <div class="setting-header-row">
          <div class="setting-info">
            <span class="setting-title">系统提示词</span>
            <span class="setting-desc">自定义智能助手的行为和回答风格。留空则使用默认提示词</span>
          </div>
          <a-button size="small" @click="resetSystemPrompt">恢复默认</a-button>
        </div>
        <div class="setting-action setting-action-full">
          <a-textarea
            v-model:value="form.system_prompt"
            :rows="8"
            :maxlength="10000"
            show-count
            placeholder="留空使用默认提示词"
            class="prompt-textarea"
          />
          <div class="placeholder-hint" v-if="currentRole === 'financial_assistant'">
            支持占位符：<code v-pre>{{CURRENT_LEDGER}}</code> = 当前选中的账本名称
          </div>
        </div>

        <div class="card-section-divider" />

        <div class="setting-header-row">
          <div class="setting-info">
            <span class="setting-title">快捷命令</span>
            <span class="setting-desc">在聊天页快捷发送的常用问题，支持拖拽排序</span>
          </div>
          <a-button size="small" @click="addCommand">+ 新增</a-button>
        </div>
        <div class="setting-action setting-action-full">
          <div class="quick-commands-list" ref="commandsListRef">
            <div
              v-for="(cmd, index) in commands"
              :key="cmd.id"
              class="quick-command-item"
            >
              <span class="drag-handle" title="拖动排序">
                <svg viewBox="0 0 16 16" fill="currentColor">
                  <circle cx="5" cy="3" r="1.5" />
                  <circle cx="11" cy="3" r="1.5" />
                  <circle cx="5" cy="8" r="1.5" />
                  <circle cx="11" cy="8" r="1.5" />
                  <circle cx="5" cy="13" r="1.5" />
                  <circle cx="11" cy="13" r="1.5" />
                </svg>
              </span>
              <a-input
                v-model:value="cmd.label"
                size="small"
                placeholder="输入快捷命令"
                :maxlength="200"
                @change="onCommandLabelChange"
              />
              <a-button
                type="text"
                size="small"
                @click="removeCommand(index)"
                class="cmd-delete-btn"
              >
                <template #icon><DeleteOutlined /></template>
              </a-button>
            </div>
            <div v-if="commands.length === 0" class="quick-commands-empty">
              暂无快捷命令
            </div>
          </div>
        </div>
      </div>
    </div>
  </SettingsPageWrapper>
</template>

<script lang="ts" setup>
import { ref, reactive, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { aiApi, type AiConfig, type AiRole, type BalanceResponse, type ModelsResponse } from '@/backend/api/ai'
import NotificationUtil from '@/backend/notification'
import { DeleteOutlined } from '@ant-design/icons-vue'
import Sortable from 'sortablejs'

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
const keyPlaceholder = ref(false)

const loaded = ref(false)
let configSaveTimer: ReturnType<typeof setTimeout> | null = null

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

function onRoleChange(value: unknown) {
  currentRole.value = value as string
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
  loaded.value = false
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
  } finally {
    await nextTick()
    loaded.value = true
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

function autoSaveConfig() {
  if (configSaveTimer) clearTimeout(configSaveTimer)
  configSaveTimer = setTimeout(async () => {
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
      fetchDeepSeekResources()
    } catch (e: any) {
      NotificationUtil.error('自动保存失败', e.message)
    }
  }, 800)
}

watch(
  () => [form.provider, form.base_url, form.endpoint, form.api_key, form.model, form.system_prompt],
  () => {
    if (!loaded.value) return
    autoSaveConfig()
  }
)

function resetSystemPrompt() {
  form.system_prompt = ''
}

// ---- Quick Commands ----
let idCounter = 0
const commands = ref<{ id: number; label: string }[]>([])
const commandsListRef = ref<HTMLElement | null>(null)
let sortable: Sortable | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null

function initSortable() {
  const el = commandsListRef.value
  if (!el || commands.value.length === 0) {
    destroySortable()
    return
  }
  destroySortable()
  sortable = Sortable.create(el, {
    animation: 200,
    handle: '.drag-handle',
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    dragClass: 'sortable-drag',
    onEnd(evt) {
      if (evt.oldIndex !== undefined && evt.newIndex !== undefined && evt.oldIndex !== evt.newIndex && commands.value.length > evt.oldIndex) {
        const item = commands.value.splice(evt.oldIndex, 1)[0]
        if (item) {
          commands.value.splice(evt.newIndex, 0, item)
        }
        nextTick(() => initSortable())
        autoSaveCommands()
      }
    },
  })
}

function destroySortable() {
  if (sortable) {
    sortable.destroy()
    sortable = null
  }
}

async function loadCommands() {
  try {
    const items = await aiApi.getQuickCommands(currentRole.value)
    commands.value = items.map(c => ({ id: idCounter++, label: c.label }))
  } catch {
    commands.value = []
  }
  await nextTick()
  initSortable()
}

function addCommand() {
  commands.value.push({ id: idCounter++, label: '' })
  nextTick(() => initSortable())
}

function removeCommand(index: number) {
  commands.value.splice(index, 1)
  nextTick(() => initSortable())
  autoSaveCommands()
}

function onCommandLabelChange() {
  autoSaveCommands()
}

function autoSaveCommands() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const items = commands.value.map(c => ({ label: c.label })).filter(c => c.label.trim() !== '')
    aiApi.saveQuickCommands(currentRole.value, items).catch(() => {})
  }, 300)
}

watch(currentRole, async () => {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  destroySortable()
  await loadCommands()
})

onMounted(() => {
  fetchRoles()
  loadConfig()
  loadCommands()
})

onUnmounted(() => {
  destroySortable()
  if (saveTimer) clearTimeout(saveTimer)
  if (configSaveTimer) clearTimeout(configSaveTimer)
})
</script>

<style scoped>
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

.inline-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: var(--billadm-space-sm) 0;
}

.inline-field:first-of-type {
  padding-top: 0;
}

.balance-section {
  width: 100%;
}

.setting-card-vertical {
  flex-direction: column;
  align-items: flex-start;
}

.setting-section {
  margin-top: var(--billadm-space-xl);
}

.setting-header-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  width: 100%;
}

.role-selector-row {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-sm);
  width: 100%;
}

.role-selector-label {
  font-size: var(--billadm-size-text-body);
  font-weight: var(--billadm-weight-medium);
  color: var(--billadm-color-text-major);
  flex-shrink: 0;
}

.card-section-divider {
  width: 100%;
  height: 1px;
  background: var(--billadm-color-divider);
  margin: var(--billadm-space-lg) 0;
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
  margin-top: var(--billadm-space-sm);
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

/* Quick Commands */
.quick-commands-list {
  display: flex;
  flex-direction: column;
  gap: var(--billadm-space-xs);
}

.quick-command-item {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-xs);
}

.drag-handle {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  color: var(--billadm-color-text-secondary);
  cursor: grab;
  margin-right: 2px;
}

.drag-handle svg {
  width: 16px;
  height: 16px;
}

.drag-handle:hover {
  color: var(--billadm-color-primary);
}

.drag-handle:active {
  cursor: grabbing;
}

.cmd-delete-btn {
  flex-shrink: 0;
  color: var(--billadm-color-text-secondary);
}

.cmd-delete-btn:hover {
  color: var(--billadm-color-expense);
}

.quick-commands-empty {
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-secondary);
  padding: var(--billadm-space-sm) 0;
}

.sortable-ghost {
  opacity: 0.4;
}

.sortable-chosen {
  background: var(--billadm-color-hover-bg);
  border-radius: var(--billadm-radius-sm);
}

.sortable-drag {
  opacity: 0.8;
  background: var(--billadm-color-major-background);
  box-shadow: var(--billadm-shadow-md);
  border-radius: var(--billadm-radius-sm);
}

@media (prefers-reduced-motion: reduce) {
  .setting-card { transition: none; }
}
</style>
