<template>
  <div class="ai-chat-view">
    <div class="chat-toolbar">
      <a-button size="small" @click="openToolsModal">查看工具</a-button>
    </div>

    <div class="chat-card">
      <!-- Header -->
      <div class="chat-header">
        <div class="chat-header-left">
          <a-dropdown :trigger="['click']" placement="bottomLeft">
            <button class="chat-role-trigger">
              <RobotOutlined class="chat-role-trigger-icon" />
              <span class="chat-role-trigger-text">{{ currentRoleDisplay }}</span>
              <DownOutlined class="chat-role-trigger-arrow" />
            </button>
            <template #overlay>
              <div class="chat-role-menu">
                <div v-for="role in availableRoles" :key="role.name" class="chat-role-menu-item"
                  :class="{ active: currentRole === role.name }" @click="onRoleChange(role.name)">{{ role.display_name
                  }}</div>
              </div>
            </template>
          </a-dropdown>
          <!-- 会话切换 -->
          <a-dropdown :trigger="['click']" placement="bottomLeft">
            <button class="chat-conv-trigger">
              <span class="chat-conv-trigger-text">{{ currentConversationTitle }}</span>
              <DownOutlined class="chat-role-trigger-arrow" />
            </button>
            <template #overlay>
              <div class="chat-conv-menu">
                <div v-if="conversations.length === 0" class="chat-conv-menu-empty">暂无会话</div>
                <div v-for="conv in conversations" :key="conv.id" class="chat-conv-menu-item"
                  :class="{ active: currentConversationId === conv.id }" @click="onConversationSelect(conv.id)">
                  <span class="chat-conv-menu-title">{{ conv.title }}</span>
                  <button v-if="currentConversationId === conv.id && conv.id !== 'default'" class="chat-conv-menu-del"
                    title="删除会话" @click.stop="onConversationDelete(conv.id)">
                    <DeleteOutlined />
                  </button>
                </div>
                <div class="chat-conv-menu-actions">
                  <a-button size="small" type="text" class="chat-conv-new" @click="onConversationCreate">
                    <template #icon><PlusOutlined /></template>
                    新建会话
                  </a-button>
                </div>
              </div>
            </template>
          </a-dropdown>
        </div>
        <a-button type="text" :disabled="messages.length === 0 && !streaming" @click="clearConversation"
          class="chat-header-clear">
          <template #icon>
            <DeleteOutlined />
          </template>
          清空对话
        </a-button>
      </div>

      <!-- Messages Area -->
      <div class="chat-messages" ref="messageListRef" @scroll="onScroll">
        <div v-if="messages.length === 0 && !streaming" class="chat-empty">
          <p class="chat-empty-greeting">{{ greeting }}</p>
          <div v-if="quickCommands.length > 0" class="chat-empty-chips">
            <button v-for="(cmd, idx) in quickCommands" :key="idx" class="chat-empty-chip"
              @click="fillAndSend(cmd.label)">{{
              cmd.label }}</button>
          </div>
        </div>

        <div v-for="msg in messages" :key="msg.id" class="chat-message" :class="`chat-message--${msg.role}`">
          <!-- User Message -->
          <div v-if="msg.role === 'user'" class="msg-user-row">
            <div class="msg-meta-col">
              <button class="msg-copy-btn" @click.stop="copyMessage(msg.content)" title="复制">
                <CopyOutlined />
              </button>
              <div class="msg-user-time">{{ formatTime(msg.timestamp) }}</div>
            </div>
            <div class="msg-user">
              <div class="msg-user-content">{{ msg.content }}</div>
            </div>
          </div>

          <!-- AI Thinking Row (DSH 风格独立行：思考 → 工具 → 回复) -->
          <div v-else-if="msg.role === 'thinking'" class="chat-message--thinking-row">
            <div class="thinking-row" :class="{ 'thinking-row--active': msg.thinkingActive }">
              <button class="thinking-row-toggle" @click="msg.thinkingCollapsed = !msg.thinkingCollapsed"
                :aria-expanded="!msg.thinkingCollapsed || msg.thinkingActive">
                <span class="thinking-indicator" :class="{ 'thinking-indicator--active': msg.thinkingActive }"></span>
                <span>{{ msg.thinkingActive ? '正在思考...' : '已思考' }}</span>
                <span class="thinking-arrow" :class="{ 'thinking-arrow--open': !msg.thinkingCollapsed || msg.thinkingActive }">▾</span>
              </button>
              <div v-if="!msg.thinkingCollapsed || msg.thinkingActive" class="thinking-row-content">
                {{ msg.content }}<span v-if="msg.thinkingActive" class="streaming-cursor">|</span>
              </div>
            </div>
          </div>

          <!-- AI Text Message -->
          <div v-else-if="msg.role === 'assistant'" class="msg-assistant-row">
            <div class="msg-assistant">
              <div class="msg-assistant-content"><MarkdownViewer :content="msg.content" /></div>
              <span v-if="msg.streaming" class="streaming-cursor">|</span>
            </div>
            <div class="msg-meta-col">
              <button class="msg-copy-btn" @click.stop="copyMessage(msg.content)" title="复制">
                <CopyOutlined />
              </button>
              <div class="msg-assistant-meta">
                <span>{{ formatTime(msg.timestamp) }}</span>
                <span v-if="msg.tokens">&nbsp;·&nbsp;{{ msg.tokens }}tk</span>
              </div>
            </div>
          </div>

          <!-- Tool Card -->
          <AiToolCard v-else-if="msg.role === 'tool'" :msg="msg" :expanded="expandedToolDetails.has(msg.id)"
            @toggle="toggleToolDetail(msg.id)" />
        </div>

        <div ref="scrollAnchorRef"></div>
      </div>

      <!-- Streaming Status Bar -->
      <Transition name="streaming-bar-fade">
        <div v-if="streaming" class="chat-streaming-bar">
          <span class="chat-streaming-ring"></span>
          <span class="chat-streaming-text">AI 正在回复...</span>
        </div>
      </Transition>

      <!-- Input Area -->
      <div class="chat-input-area">
        <div class="chat-divider"></div>
        <div class="chat-input-row">
          <textarea ref="textareaRef" v-model="inputText" class="chat-textarea" :disabled="streaming" maxlength="10000"
            placeholder="输入你的问题...  (Enter 发送 / Shift+Enter 换行)" rows="1" @keydown="onKeydown"
            @input="autoResize"></textarea>
          <button class="chat-send-btn" :class="{ 'chat-send-btn--stop': streaming }"
            :disabled="!streaming && !inputText.trim()" @click="streaming ? stopGeneration() : sendMessage()"
            :title="streaming ? '停止生成' : '发送'">
            <StopOutlined v-if="streaming" />
            <SendOutlined v-else />
          </button>
        </div>
      </div>
    </div>

    <a-modal v-model:open="toolsModalVisible" title="可用工具" :footer="null" centered :width="520">
      <div v-if="toolsLoading" class="tools-loading">加载中...</div>
      <div v-else-if="currentRoleTools.length === 0" class="tools-empty">暂无可用工具</div>
      <div v-else class="tools-list">
        <div v-for="tool in currentRoleTools" :key="tool.name" class="tools-item">
          <div class="tools-item-header" @click="tool._expanded = !tool._expanded">
            <span class="tools-item-name">{{ tool.name }}</span>
            <DownOutlined class="tools-item-arrow" :class="{ 'tools-item-arrow--open': tool._expanded }" />
          </div>
          <div class="tools-item-desc">{{ tool.description }}</div>
          <div v-if="tool._expanded" class="tools-item-schema">
            <pre>{{ JSON.stringify(tool.input_schema, null, 2) }}</pre>
          </div>
        </div>
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { DeleteOutlined, SendOutlined, StopOutlined, CopyOutlined, RobotOutlined, DownOutlined, PlusOutlined } from '@ant-design/icons-vue'
import { useLedgerStore } from '@/stores/ledgerStore'
import MarkdownViewer from '@/components/common/MarkdownViewer.vue'
import AiToolCard from './AiToolCard.vue'
import { message } from 'ant-design-vue'
import { useAiChat } from '@/hooks/useAiChat'
import { aiApi, type AiRole, type QuickCommand, type ToolInfo } from '@/backend/api/ai'

// ---- AiChat composable (deep module) ----
const {
  messages, streaming, currentRole, currentProvider,
  conversations, currentConversationId,
  send, stop, loadHistory, clear, cleanup, switchRole,
  loadConversations, createConversation, switchConversation, deleteConversation,
} = useAiChat()

// ---- Role management ----
const availableRoles = ref<AiRole[]>([])
const rolesLoading = ref(false)

async function fetchRoles() {
  rolesLoading.value = true
  try {
    availableRoles.value = await aiApi.fetchRoles()
  } catch {
    availableRoles.value = [
      { name: 'financial_assistant', display_name: '财务助手' },
      { name: 'diary_assistant', display_name: '日记助手' },
    ]
  } finally {
    rolesLoading.value = false
  }
}

async function loadProvider() {
  try {
    const config = await aiApi.getConfig(currentRole.value)
    currentProvider.value = config.provider || 'deepseek'
  } catch {
    // keep default
  }
}

function onRoleChange(value: string) {
  if (typeof value === 'string') switchRole(value)
}

// ---- Conversation management ----
const currentConversationTitle = computed(() => {
  const conv = conversations.value.find(c => c.id === currentConversationId.value)
  return conv?.title ?? '默认会话'
})

async function onConversationSelect(id: string) {
  if (streaming.value) return
  await switchConversation(id)
}

async function onConversationCreate() {
  if (streaming.value) return
  await createConversation()
}

async function onConversationDelete(id: string) {
  if (streaming.value) return
  message.warning('删除会话将同时删除该会话的全部消息')
  await deleteConversation(id)
}

const currentRoleDisplay = computed(() => {
  const role = availableRoles.value.find(r => r.name === currentRole.value)
  return role?.display_name ?? currentRole.value
})

// ---- Quick Commands ----
const quickCommands = ref<QuickCommand[]>([])

async function loadQuickCommands() {
  try {
    quickCommands.value = await aiApi.getQuickCommands(currentRole.value)
  } catch {
    quickCommands.value = []
  }
}

watch(currentRole, () => {
  loadQuickCommands()
})

// ---- Tools modal ----
interface ToolWithExpanded extends ToolInfo {
  _expanded?: boolean
}

const toolsModalVisible = ref(false)
const currentRoleTools = ref<ToolWithExpanded[]>([])
const toolsLoading = ref(false)

async function openToolsModal() {
  toolsModalVisible.value = true
  toolsLoading.value = true
  try {
    const res = await aiApi.fetchRoleTools(currentRole.value)
    currentRoleTools.value = (res.tools || []).map(t => ({ ...t, _expanded: false }))
  } catch {
    currentRoleTools.value = []
  } finally {
    toolsLoading.value = false
  }
}

// ---- Local state ----
const ledgerStore = useLedgerStore()
const inputText = ref('')
const messageListRef = ref<HTMLElement | null>(null)
const scrollAnchorRef = ref<HTMLElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const expandedToolDetails = ref<Set<string>>(new Set())

let userScrolledUp = false

// ---- Time-aware greeting ----
const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了'
  if (hour < 12) return '早上好'
  if (hour < 18) return '下午好'
  return '晚上好'
})

// ---- API base URL (reuse api-client pattern) ----
async function getApiBaseUrl(): Promise<string> {
  if (window.electronAPI?.getApiServer) {
    try {
      return await window.electronAPI.getApiServer()
    } catch { /* fall through */ }
  }
  return 'http://127.0.0.1:28080'
}

// ---- Fill and send (for example chips) ----
async function fillAndSend(text: string) {
  inputText.value = text
  await sendMessage()
}

// ---- Send message ----
async function sendMessage() {
  const text = inputText.value.trim()
  if (!text || streaming.value) return

  if (!ledgerStore.currentLedgerId) {
    message.warning('请先选择账本')
    return
  }

  inputText.value = ''
  resetTextareaHeight()
  userScrolledUp = false

  await nextTick()
  scrollToBottom()

  const baseUrl = await getApiBaseUrl()
  // Pass scroll callback to composable — respects user scroll position
  await send(text, ledgerStore.currentLedgerId, ledgerStore.currentLedgerName, baseUrl, scrollToBottom)

  await nextTick()
  scrollToBottom()
}

function stopGeneration() {
  stop()
}

// ---- Tool detail ----
function toggleToolDetail(msgId: string) {
  if (expandedToolDetails.value.has(msgId)) {
    expandedToolDetails.value.delete(msgId)
  } else {
    expandedToolDetails.value.add(msgId)
  }
}

// ---- Conversation management ----
async function clearConversation() {
  expandedToolDetails.value = new Set()
  await clear()
}

function copyMessage(text: string) {
  navigator.clipboard.writeText(text)
  message.success('已复制')
}

// ---- Scroll management ----
function scrollToBottom(force = false) {
  if (!force && userScrolledUp) return
  nextTick(() => {
    scrollAnchorRef.value?.scrollIntoView({ behavior: 'smooth' })
  })
}

function onScroll() {
  const el = messageListRef.value
  if (!el) return
  const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
  userScrolledUp = distFromBottom > 60
}

// ---- Input handling ----
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

function autoResize() {
  nextTick(() => {
    const el = textareaRef.value
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  })
}

function resetTextareaHeight() {
  nextTick(() => {
    const el = textareaRef.value
    if (!el) return
    el.style.height = 'auto'
  })
}

// ---- Formatting ----
function formatTime(ts: number): string {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

// ---- Auto-scroll on new messages and when streaming ends ----
watch(
  () => messages.value.length,
  () => { nextTick(() => scrollToBottom()) }
)

watch(
  () => streaming.value,
  (newVal, oldVal) => {
    if (oldVal && !newVal) {
      // Assistant just finished — always scroll to the bottom
      userScrolledUp = false
      nextTick(() => scrollToBottom(true))
    }
  }
)

// ---- Lifecycle ----
onMounted(() => {
  fetchRoles()
  loadHistory()
  loadQuickCommands()
  loadProvider()
  loadConversations()
})

onUnmounted(() => {
  cleanup()
})
</script>

<style scoped lang="scss">
@use '@/styles/mixins' as *;
.ai-chat-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: var(--transactions-space-md) var(--transactions-space-lg);
  background-color: var(--transactions-color-major-warm);
}

.chat-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
  padding: 0 0 var(--transactions-space-md) 0;
  /* Reserve space for Electron frameless window controls (status dot 26px + 3 × 32px + 3 × 6px gaps) */
  margin-right: calc(26px + 3 * 32px + 3 * 6px);
  -webkit-app-region: drag;
}

.chat-toolbar :deep(*) {
  -webkit-app-region: no-drag;
}

.chat-toolbar :deep(.ant-btn) {
  height: 32px;
}

.chat-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--transactions-color-major-background);
  border: 1px solid var(--transactions-color-divider);
  border-radius: var(--transactions-radius-lg);
  box-shadow: var(--transactions-shadow-sm);
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--transactions-size-header-height);
  padding: var(--transactions-space-sm) var(--transactions-space-xl);
  flex-shrink: 0;
  border-bottom: 1px solid var(--transactions-color-divider);
}

.chat-header-left {
  display: flex;
  align-items: center;
  gap: var(--transactions-space-sm);
}

.chat-role-trigger {
  display: flex;
  align-items: center;
  gap: var(--transactions-space-sm);
  height: 32px;
  padding: 0 var(--transactions-space-sm);
  border: none;
  background: none;
  border-radius: var(--transactions-radius-sm);
  cursor: pointer;
  font-family: inherit;
  transition: background var(--transactions-transition-fast);
}

.chat-role-trigger:hover {
  background: var(--transactions-color-hover-bg);
}

.chat-role-trigger-icon {
  font-size: var(--transactions-size-text-title-sm);
  color: var(--transactions-color-primary);
}

.chat-role-trigger-text {
  font-family: var(--transactions-font-display);
  font-size: var(--transactions-size-text-title);
  font-weight: 500;
  color: var(--transactions-color-text-major);
}

.chat-role-trigger-arrow {
  font-size: 10px;
  color: var(--transactions-color-text-secondary);
  transition: transform var(--transactions-transition-fast);
}

.chat-role-menu {
  display: flex;
  flex-direction: column;
  gap: var(--transactions-space-2xs);
  min-width: 140px;
  padding: var(--transactions-space-xs);
  background: var(--transactions-color-major-background);
  border-radius: var(--transactions-radius-md);
  box-shadow: var(--transactions-shadow-lg);
}

.chat-role-menu-item {
  padding: var(--transactions-space-sm) var(--transactions-space-md);
  border-radius: var(--transactions-radius-sm);
  cursor: pointer;
  font-size: var(--transactions-size-text-body-sm);
  color: var(--transactions-color-text-major);
  transition: background var(--transactions-transition-fast);
}

.chat-role-menu-item:hover {
  background: var(--transactions-color-hover-bg);
}

.chat-role-menu-item.active {
  background: var(--transactions-color-active-bg);
  color: var(--transactions-color-primary);
  font-weight: 500;
}

/* ---- 会话切换下拉 ---- */
.chat-conv-trigger {
  display: flex;
  align-items: center;
  gap: var(--transactions-space-xs);
  height: 28px;
  padding: 0 var(--transactions-space-sm);
  border: 1px solid var(--transactions-color-window-border);
  background: none;
  border-radius: var(--transactions-radius-md);
  cursor: pointer;
  font-family: inherit;
  transition: background var(--transactions-transition-fast), border-color var(--transactions-transition-fast);
}

.chat-conv-trigger:hover {
  background: var(--transactions-color-hover-bg);
  border-color: var(--transactions-color-border-l2);
}

.chat-conv-trigger-text {
  font-size: var(--transactions-size-text-body-sm);
  color: var(--transactions-color-text-secondary);
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-conv-menu {
  display: flex;
  flex-direction: column;
  gap: var(--transactions-space-2xs);
  min-width: 220px;
  max-width: 280px;
  padding: var(--transactions-space-xs);
  background: var(--transactions-color-major-background);
  border-radius: var(--transactions-radius-md);
  box-shadow: var(--transactions-shadow-lg);
}

.chat-conv-menu-empty {
  padding: var(--transactions-space-sm) var(--transactions-space-md);
  font-size: var(--transactions-size-text-body-sm);
  color: var(--transactions-color-text-disabled);
}

.chat-conv-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--transactions-space-sm);
  padding: var(--transactions-space-sm) var(--transactions-space-md);
  border-radius: var(--transactions-radius-sm);
  cursor: pointer;
  font-size: var(--transactions-size-text-body-sm);
  color: var(--transactions-color-text-major);
  transition: background var(--transactions-transition-fast);
}

.chat-conv-menu-item:hover {
  background: var(--transactions-color-hover-bg);
}

.chat-conv-menu-item.active {
  background: var(--transactions-color-active-bg);
  color: var(--transactions-color-primary);
  font-weight: 500;
}

.chat-conv-menu-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-conv-menu-del {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: none;
  border-radius: var(--transactions-radius-sm);
  cursor: pointer;
  color: var(--transactions-color-text-secondary);
  font-size: var(--transactions-size-text-caption);
  flex-shrink: 0;
  transition: background var(--transactions-transition-fast), color var(--transactions-transition-fast);
}

.chat-conv-menu-del:hover {
  background: var(--transactions-color-danger-hover-bg);
  color: var(--transactions-color-expense);
}

.chat-conv-menu-actions {
  border-top: 1px solid var(--transactions-color-divider);
  padding-top: var(--transactions-space-xs);
}

.chat-conv-new {
  width: 100%;
  justify-content: flex-start;
  color: var(--transactions-color-primary);
}

.chat-header-clear {
  -webkit-app-region: no-drag;
  color: var(--transactions-color-text-secondary);
  font-size: var(--transactions-size-text-body-sm);
}

.chat-header-clear:hover {
  color: var(--transactions-color-text-major);
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--transactions-space-xl);
  position: relative;

  @include custom-scrollbar;
}

.chat-empty {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
}

.chat-empty-greeting {
  font-family: var(--transactions-font-display);
  font-size: var(--transactions-size-text-display);
  font-weight: 400;
  color: var(--transactions-color-secondary);
  margin: 0 0 var(--transactions-space-sm) 0;
}

.chat-empty-hint {
  font-family: var(--transactions-font-body);
  font-size: var(--transactions-size-text-body);
  color: var(--transactions-color-text-secondary);
  margin: 0 0 var(--transactions-space-xl) 0;
}

.chat-empty-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--transactions-space-sm);
  justify-content: center;
}

.chat-empty-chip {
  font-family: var(--transactions-font-body);
  font-size: var(--transactions-size-text-body-sm);
  color: var(--transactions-color-text-secondary);
  background: var(--transactions-color-minor-background);
  border: 1px solid var(--transactions-color-divider);
  border-radius: var(--transactions-radius-full);
  padding: var(--transactions-space-xs) var(--transactions-space-lg);
  cursor: pointer;
  transition: all var(--transactions-transition-fast);
}

.chat-empty-chip:hover {
  color: var(--transactions-color-primary);
  border-color: var(--transactions-color-primary);
  background: var(--transactions-color-hover-bg);
}

.chat-empty-chip:focus-visible {
  outline: 2px solid var(--transactions-color-primary);
  outline-offset: 2px;
}

.chat-message {
  margin-bottom: var(--transactions-space-lg);
  display: flex;
  flex-direction: column;
}

.chat-message--user {
  align-items: flex-end;
}

.chat-message--assistant {
  align-items: flex-start;
}

.chat-message--tool {
  align-items: flex-start;
}

.chat-message--thinking {
  align-items: flex-start;
}

/* User Message */
.msg-user-row {
  display: flex;
  align-items: stretch;
  justify-content: flex-end;
  gap: var(--transactions-space-xs);
}

.msg-user {
  position: relative;
  max-width: 85%;
  background: var(--transactions-color-bubble);
  color: var(--transactions-color-text-major);
  border-radius: var(--transactions-radius-chat);
  padding: 10px 16px;
}

.msg-user-content {
  font-family: var(--transactions-font-body);
  font-size: var(--transactions-size-text-body);
  line-height: var(--transactions-height-normal);
  white-space: pre-wrap;
  word-break: break-word;
  user-select: text;
  -webkit-user-select: text;
}

.msg-meta-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.msg-user-time {
  font-size: var(--transactions-size-text-caption);
  color: var(--transactions-color-text-secondary);
  white-space: nowrap;
  flex-shrink: 0;
}

/* AI Assistant Message — DSH 风格：透明无气泡，markdown 承载视觉重量 */
.msg-assistant-row {
  display: flex;
  align-items: stretch;
  gap: var(--transactions-space-xs);
}

.msg-assistant {
  position: relative;
  max-width: 90%;
  background: transparent;
  border: none;
  border-radius: 0;
  padding: 0;
}

.msg-assistant-content {
  font-family: var(--transactions-font-body);
  font-size: var(--transactions-size-text-body);
  color: var(--transactions-color-text-major);
  line-height: var(--transactions-height-relaxed);
  user-select: text;
  -webkit-user-select: text;
}

.msg-assistant-content :deep(p) {
  margin: 0 0 var(--transactions-space-sm) 0;
}

.msg-assistant-content :deep(p:last-child) {
  margin-bottom: 0;
}

.msg-assistant-content :deep(code) {
  font-family: var(--transactions-font-mono);
  font-size: 0.9em;
  background: var(--transactions-color-markdown-code-block);
  padding: var(--transactions-space-2xs) var(--transactions-space-xs);
  border-radius: var(--transactions-radius-sm);
}

.msg-assistant-content :deep(pre) {
  margin: var(--transactions-space-sm) 0;
  padding: var(--transactions-space-md);
  background: var(--transactions-color-markdown-code-block);
  border-radius: var(--transactions-radius-md);
  overflow-x: auto;
}

.msg-assistant-content :deep(pre code) {
  background: none;
  padding: 0;
  font-size: var(--transactions-size-text-body-sm);
  line-height: var(--transactions-height-normal);
}

.msg-assistant-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: var(--transactions-space-sm) 0;
  font-size: var(--transactions-size-text-body-sm);
}

.msg-assistant-content :deep(th),
.msg-assistant-content :deep(td) {
  border: 1px solid var(--transactions-color-divider);
  padding: var(--transactions-space-xs) var(--transactions-space-sm);
  text-align: left;
}

.msg-assistant-content :deep(th) {
  background: var(--transactions-color-minor-background);
  font-weight: 600;
}

.msg-assistant-content :deep(ul),
.msg-assistant-content :deep(ol) {
  margin: var(--transactions-space-sm) 0;
  padding-left: var(--transactions-space-xl);
}

.msg-assistant-content :deep(blockquote) {
  margin: var(--transactions-space-sm) 0;
  padding: var(--transactions-space-xs) var(--transactions-space-md);
  background: var(--transactions-color-minor-background);
  border-radius: var(--transactions-radius-sm);
  color: var(--transactions-color-text-secondary);
}

.msg-assistant-content :deep(a) {
  color: var(--transactions-color-primary);
}

.msg-assistant-content :deep(hr) {
  border: none;
  border-top: 1px solid var(--transactions-color-divider);
  margin: var(--transactions-space-md) 0;
}

.msg-assistant-content :deep(strong) {
  font-weight: 600;
}

.msg-assistant-content :deep(h1),
.msg-assistant-content :deep(h2),
.msg-assistant-content :deep(h3) {
  font-family: var(--transactions-font-display);
  margin: var(--transactions-space-md) 0 var(--transactions-space-sm) 0;
  font-weight: 600;
}

.msg-assistant-content :deep(h1) {
  font-size: 1.3em;
}

.msg-assistant-content :deep(h2) {
  font-size: 1.15em;
}

.msg-assistant-content :deep(h3) {
  font-size: 1.05em;
}

.msg-assistant-content :deep(input[type="checkbox"]) {
  margin-right: var(--transactions-space-xs);
}

.msg-assistant-meta {
  font-size: var(--transactions-size-text-small);
  color: var(--transactions-color-text-secondary);
  white-space: nowrap;
  flex-shrink: 0;
}

/* Copy Button */
.msg-copy-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--transactions-radius-sm);
  background: transparent;
  color: var(--transactions-color-text-secondary);
  cursor: pointer;
  font-size: var(--transactions-size-text-body-sm);
  flex-shrink: 0;
  opacity: 0;
  transition: opacity var(--transactions-transition-fast);
}

.chat-message:hover .msg-copy-btn {
  opacity: 1;
}

.msg-copy-btn:hover {
  background: var(--transactions-color-hover-bg);
  color: var(--transactions-color-text-major);
}

.msg-copy-btn:focus-visible {
  outline: 2px solid var(--transactions-color-primary);
  outline-offset: 2px;
  opacity: 1;
}

/* Streaming Cursor */
.streaming-cursor {
  display: inline;
  color: var(--transactions-color-primary);
  font-weight: var(--transactions-weight-bold);
  animation: cursor-blink 0.6s step-end infinite alternate;
}

@keyframes cursor-blink {
  0% {
    opacity: 1;
  }

  100% {
    opacity: 0;
  }
}

/* Streaming Status Bar — DSH turn-status style */
.chat-streaming-bar {
  display: flex;
  align-items: center;
  gap: var(--transactions-space-sm);
  height: 28px;
  padding: 0 var(--transactions-space-xl);
  flex-shrink: 0;
}

.chat-streaming-ring {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: transparent;
  border: 2px solid var(--transactions-color-border-l2);
  border-top-color: var(--transactions-color-primary);
  animation: thinking-spin 0.8s linear infinite;
}

.chat-streaming-text {
  font-family: var(--transactions-font-mono);
  font-size: var(--transactions-size-text-caption);
  font-weight: 500;
  color: var(--transactions-color-primary);
  font-variant-numeric: tabular-nums;
}

.streaming-bar-fade-enter-active {
  transition: opacity 200ms ease;
}

.streaming-bar-fade-leave-active {
  transition: opacity 200ms ease;
}

.streaming-bar-fade-enter-from,
.streaming-bar-fade-leave-to {
  opacity: 0;
}

/* Input Area — DSH composer card */
.chat-input-area {
  padding: 0 var(--transactions-space-xl) var(--transactions-space-md);
  flex-shrink: 0;
}

.chat-divider {
  height: 1px;
  background: var(--transactions-color-divider);
  margin-bottom: var(--transactions-space-md);
}

.chat-input-row {
  display: flex;
  align-items: center;
  gap: var(--transactions-space-sm);
  padding: 6px 6px 6px 16px;
  border: 1px solid var(--transactions-color-window-border);
  border-radius: var(--transactions-radius-chat);
  background: var(--transactions-color-major-background);
  box-shadow: var(--transactions-shadow-sm);
  transition: border-color var(--transactions-transition-fast),
              box-shadow var(--transactions-transition-fast);
}

.chat-input-row:focus-within {
  border-color: var(--transactions-color-primary);
  box-shadow: var(--transactions-shadow-focus);
}

.chat-textarea {
  flex: 1;
  min-height: 34px;
  max-height: 120px;
  padding: var(--transactions-space-xs) 0;
  border: none;
  border-radius: 0;
  background: transparent;
  font-family: var(--transactions-font-body);
  font-size: var(--transactions-size-text-body);
  color: var(--transactions-color-text-major);
  line-height: var(--transactions-height-normal);
  resize: none;
  outline: none;
  transition: background var(--transactions-transition-fast);
}

.chat-textarea:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.chat-textarea::placeholder {
  color: var(--transactions-color-text-tertiary);
}

.chat-send-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--transactions-radius-full);
  border: none;
  background: var(--transactions-color-primary);
  color: var(--transactions-color-text-inverse);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: var(--transactions-size-text-body);
  transition: background var(--transactions-transition-fast);
}

.chat-send-btn:hover:not(:disabled) {
  background: var(--transactions-color-primary-hover);
}

.chat-send-btn:focus-visible {
  outline: 2px solid var(--transactions-color-primary);
  outline-offset: 2px;
}

.chat-send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.chat-send-btn--stop {
  background: var(--transactions-color-expense);
}

.chat-send-btn--stop:hover {
  filter: brightness(0.88);
}

/* Animations */
@keyframes msg-user-enter {
  from {
    opacity: 0;
    transform: translateY(6px) translateX(4px);
  }

  to {
    opacity: 1;
    transform: translateY(0) translateX(0);
  }
}

@keyframes msg-assistant-enter {
  0% {
    opacity: 0;
    transform: translateY(4px);
  }

  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes msg-tool-enter {
  0% {
    opacity: 0;
    transform: translateY(4px);
  }

  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

.chat-message {
  animation-duration: 200ms;
  animation-fill-mode: both;
  animation-timing-function: ease-out;
}

.chat-message--user {
  animation-name: msg-user-enter;
  animation-duration: 150ms;
}

.chat-message--assistant {
  animation-name: msg-assistant-enter;
  animation-duration: 300ms;
}

.chat-message--tool {
  animation-name: msg-tool-enter;
  animation-duration: 200ms;
}

.chat-message--thinking {
  animation-name: msg-tool-enter;
  animation-duration: 200ms;
}

@media (prefers-reduced-motion: reduce) {
  .chat-message {
    animation: none;
  }

  .msg-assistant {
    animation: none;
  }

  .chat-streaming-ring {
    animation: none;
    border-top-color: var(--transactions-color-accent);
  }

  .streaming-cursor {
    animation: none;
  }

  .thinking-indicator--active {
    animation: none;
    border-top-color: var(--transactions-color-accent);
  }

  .streaming-bar-fade-enter-active,
  .streaming-bar-fade-leave-active {
    transition: opacity 0ms;
  }

  .chat-textarea,
  .chat-empty-chip,
  .chat-send-btn,
  .msg-copy-btn,
  .thinking-row-toggle,
  .thinking-arrow,
  .thinking-indicator {
    transition: none;
  }
}

/* Thinking Row — DSH 风格独立行：点指示器 + 可折叠，active 琥珀块 */
.chat-message--thinking-row {
  margin-bottom: var(--transactions-space-md);
}

.thinking-row {
  max-width: 90%;
  border-radius: var(--transactions-radius-sm);
  padding: var(--transactions-space-2xs);
  transition: background var(--transactions-transition-fast);
}

.thinking-row--active {
  background: var(--transactions-color-outlier-tint);
}

.thinking-row-toggle {
  display: flex;
  align-items: center;
  gap: var(--transactions-space-xs);
  border: none;
  background: none;
  padding: var(--transactions-space-xs) var(--transactions-space-sm);
  cursor: pointer;
  font-family: var(--transactions-font-body);
  font-size: var(--transactions-size-text-caption);
  color: var(--transactions-color-text-secondary);
  width: 100%;
  text-align: left;
  border-radius: var(--transactions-radius-sm);
  transition: background var(--transactions-transition-fast);
}

.thinking-row-toggle:hover {
  background: var(--transactions-color-hover-bg);
}

.thinking-row--active .thinking-row-toggle:hover {
  background: transparent;
}

.thinking-row-toggle:focus-visible {
  outline: 2px solid var(--transactions-color-primary);
  outline-offset: 2px;
  border-radius: var(--transactions-radius-sm);
}

.thinking-indicator {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--transactions-color-text-disabled);
  flex-shrink: 0;
  transition: all var(--transactions-transition-fast);
}

.thinking-indicator--active {
  background: transparent;
  border: 2px solid var(--transactions-color-divider);
  border-top-color: var(--transactions-color-accent);
  animation: thinking-spin 0.8s linear infinite;
}

@keyframes thinking-spin {
  to {
    transform: rotate(360deg);
  }
}

.thinking-arrow {
  margin-left: auto;
  transition: transform var(--transactions-transition-fast);
}

.thinking-arrow--open {
  transform: rotate(180deg);
}

.thinking-row-content {
  margin-top: var(--transactions-space-xs);
  padding: 0 var(--transactions-space-sm) var(--transactions-space-xs);
  font-family: var(--transactions-font-body);
  font-size: var(--transactions-size-text-body-sm);
  color: var(--transactions-color-text-secondary);
  line-height: var(--transactions-height-normal);
  white-space: pre-wrap;
  word-break: break-word;
}

/* Tools Modal */
.tools-loading,
.tools-empty {
  text-align: center;
  padding: var(--transactions-space-xl);
  color: var(--transactions-color-text-secondary);
  font-size: var(--transactions-size-text-body-sm);
}

.tools-list {
  display: flex;
  flex-direction: column;
  gap: var(--transactions-space-xs);
}

.tools-item {
  border-bottom: 1px solid var(--transactions-color-divider);
}

.tools-item:last-child {
  border-bottom: none;
}

.tools-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--transactions-space-sm) var(--transactions-space-md);
  cursor: pointer;
  transition: background var(--transactions-transition-fast);
}

.tools-item-header:hover {
  background: var(--transactions-color-hover-bg);
}

.tools-item-name {
  font-family: var(--transactions-font-mono);
  font-size: var(--transactions-size-text-body-sm);
  font-weight: 500;
  color: var(--transactions-color-text-major);
}

.tools-item-arrow {
  font-size: 10px;
  color: var(--transactions-color-text-secondary);
  transition: transform var(--transactions-transition-fast);
}

.tools-item-arrow--open {
  transform: rotate(180deg);
}

.tools-item-desc {
  padding: 0 var(--transactions-space-md) var(--transactions-space-sm);
  font-size: var(--transactions-size-text-caption);
  color: var(--transactions-color-text-secondary);
  line-height: var(--transactions-height-normal);
}

.tools-item-schema {
  padding: 0 var(--transactions-space-md) var(--transactions-space-sm);
}

.tools-item-schema pre {
  margin: 0;
  padding: var(--transactions-space-sm) var(--transactions-space-md);
  background: var(--transactions-color-minor-background);
  border-radius: var(--transactions-radius-sm);
  font-family: var(--transactions-font-mono);
  font-size: var(--transactions-size-text-caption);
  color: var(--transactions-color-text-secondary);
  line-height: var(--transactions-height-normal);
  overflow-x: auto;
  white-space: pre;
}
</style>
