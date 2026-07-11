<template>
  <div class="ai-chat-view">
    <!-- 顶部工具栏（拖拽区域） -->
    <div class="chat-toolbar"></div>

    <!-- 主体卡片 -->
    <div class="chat-card">
      <!-- Header -->
      <div class="chat-header">
        <h2 class="chat-header-title">AI 助手</h2>
        <a-button
          type="text"
          :disabled="messages.length === 0 && !streaming"
          @click="clearConversation"
          class="chat-header-clear"
        >
          <template #icon><DeleteOutlined /></template>
          清空对话
        </a-button>
      </div>

      <!-- Messages Area -->
      <div class="chat-messages" ref="messageListRef" @scroll="onScroll">
        <!-- Empty State -->
        <div v-if="messages.length === 0 && !streaming" class="chat-empty">
          <p class="chat-empty-greeting">下午好</p>
          <p class="chat-empty-hint">询问你的财务数据</p>
        </div>

        <!-- Messages -->
        <div
          v-for="msg in messages"
          :key="msg.id"
          class="chat-message"
          :class="`chat-message--${msg.role}`"
        >
          <!-- User Message -->
          <div v-if="msg.role === 'user'" class="msg-user-row">
            <div class="msg-meta-col">
              <button
                class="msg-copy-btn"
                @click.stop="copyMessage(msg.content)"
                title="复制"
              >
                <CopyOutlined />
              </button>
              <div class="msg-user-time">{{ formatTime(msg.timestamp) }}</div>
            </div>
            <div class="msg-user">
              <div class="msg-user-content">{{ msg.content }}</div>
            </div>
          </div>

          <!-- Thinking Block -->
          <div v-else-if="msg.role === 'thinking'" class="msg-thinking-row">
            <div class="msg-thinking">
              <button
                class="thinking-toggle"
                @click="msg.thinkingCollapsed = !msg.thinkingCollapsed"
              >
                <span class="thinking-dot" :class="{ 'thinking-dot--active': msg.thinkingActive }"></span>
                <span>{{ msg.thinkingActive ? '正在思考...' : '已思考' }}</span>
                <span class="thinking-arrow" :class="{ 'thinking-arrow--open': !msg.thinkingCollapsed && !msg.thinkingActive }">▾</span>
              </button>
              <div
                v-if="msg.content && (!msg.thinkingCollapsed || msg.thinkingActive)"
                class="thinking-content"
              >{{ msg.content }}<span v-if="msg.thinkingActive" class="streaming-cursor">|</span></div>
            </div>
          </div>

          <!-- AI Text Message -->
          <div v-else-if="msg.role === 'assistant'" class="msg-assistant-row">
            <div class="msg-assistant">
              <div class="msg-assistant-content" v-html="renderMarkdown(msg.content)"></div>
              <span v-if="msg.streaming" class="streaming-cursor">|</span>
            </div>
            <div class="msg-meta-col">
              <button
                class="msg-copy-btn"
                @click.stop="copyMessage(msg.content)"
                title="复制"
              >
                <CopyOutlined />
              </button>
              <div class="msg-assistant-meta">
                <span>{{ formatTime(msg.timestamp) }}</span>
                <span v-if="msg.tokens">&nbsp;·&nbsp;{{ msg.tokens }}tk</span>
              </div>
            </div>
          </div>

          <!-- Tool Card -->
          <div
            v-else-if="msg.role === 'tool'"
            class="msg-tool"
            :class="{ 'msg-tool--done': msg.toolDone }"
          >
            <div class="msg-tool-header">
              <span class="msg-tool-indicator" :class="{ 'msg-tool-indicator--pulse': !msg.toolDone }"></span>
              <span class="msg-tool-name">{{ msg.toolName }}</span>
            </div>
            <div v-if="msg.toolArgs && Object.keys(msg.toolArgs).length > 0" class="msg-tool-args">
              <div v-for="(val, key) in msg.toolArgs" :key="key" class="msg-tool-arg">
                <span class="msg-tool-arg-key">{{ key }}</span>
                <span class="msg-tool-arg-val">{{ formatArgValue(val) }}</span>
              </div>
            </div>
            <div v-if="msg.toolDone && msg.toolResult" class="msg-tool-summary">
              {{ msg.toolResult }}
            </div>
            <div v-if="msg.toolDone && msg.toolDetail" class="msg-tool-detail">
              <a-button
                type="link"
                size="small"
                @click="toggleToolDetail(msg.id)"
                class="msg-tool-detail-toggle"
              >
                {{ expandedToolDetails.has(msg.id) ? '收起详情' : '查看详情' }}
              </a-button>
              <pre v-if="expandedToolDetails.has(msg.id)" class="msg-tool-detail-json">{{
                JSON.stringify(msg.toolDetail, null, 2)
              }}</pre>
            </div>
          </div>
        </div>

        <!-- Bottom anchor for auto-scroll -->
        <div ref="scrollAnchorRef"></div>
      </div>

      <!-- Input Area -->
      <div class="chat-input-area">
        <div class="chat-divider"></div>
        <div class="chat-input-row">
          <textarea
            ref="textareaRef"
            v-model="inputText"
            class="chat-textarea"
            :disabled="streaming"
            placeholder="输入你的问题...  (Enter 发送 / Shift+Enter 换行)"
            rows="1"
            @keydown="onKeydown"
            @input="autoResize"
          ></textarea>
          <button
            class="chat-send-btn"
            :class="{ 'chat-send-btn--stop': streaming }"
            :disabled="!streaming && !inputText.trim()"
            @click="streaming ? stopGeneration() : sendMessage()"
            :title="streaming ? '停止生成' : '发送'"
          >
            <PauseOutlined v-if="streaming" />
            <SendOutlined v-else />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted } from 'vue'
import { DeleteOutlined, SendOutlined, PauseOutlined, CopyOutlined } from '@ant-design/icons-vue'
import { useLedgerStore } from '@/stores/ledgerStore'
import { aiApi, type AiMessage as AiMessageApi } from '@/backend/api/ai'
import { renderMarkdown } from '@/utils/markdown'
import { message } from 'ant-design-vue'

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

interface SSEEvent {
  type: 'text_delta' | 'thinking_start' | 'thinking_delta' | 'thinking_done' | 'tool_call' | 'tool_result' | 'done' | 'error'
  delta?: string
  tool?: string
  args?: Record<string, any>
  summary?: string
  detail?: any
  total_tokens?: number
  error?: string
  message?: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool' | 'thinking'
  content: string
  toolName?: string
  toolArgs?: Record<string, any>
  toolResult?: string
  toolDetail?: any
  toolDone?: boolean
  timestamp: number
  tokens?: number
  streaming?: boolean
  thinking?: string
  thinkingActive?: boolean
  thinkingCollapsed?: boolean
}

// ----------------------------------------------------------------
// State
// ----------------------------------------------------------------

const ledgerStore = useLedgerStore()
const messages = ref<ChatMessage[]>([])
const inputText = ref('')
const streaming = ref(false)
const messageListRef = ref<HTMLElement | null>(null)
const scrollAnchorRef = ref<HTMLElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const expandedToolDetails = ref<Set<string>>(new Set())

let abortController: AbortController | null = null
let userScrolledUp = false
let msgIdCounter = 0

// ----------------------------------------------------------------
// API helpers
// ----------------------------------------------------------------

async function getApiBaseUrl(): Promise<string> {
  if (window.electronAPI?.getApiServer) {
    try {
      const server = await window.electronAPI.getApiServer()
      return server
    } catch {
      // fall through
    }
  }
  return 'http://127.0.0.1:28080'
}

// ----------------------------------------------------------------
// Core: send message via SSE
// ----------------------------------------------------------------

function nextMsgId(): string {
  msgIdCounter++
  return `msg-${Date.now()}-${msgIdCounter}`
}

async function sendMessage() {
  const text = inputText.value.trim()
  if (!text || streaming.value) return

  // Validate ledger
  if (!ledgerStore.currentLedgerId) {
    message.warning('请先选择账本')
    return
  }

  // Add user message
  const userMsg: ChatMessage = {
    id: nextMsgId(),
    role: 'user',
    content: text,
    timestamp: Date.now(),
  }
  messages.value.push(userMsg)
  inputText.value = ''
  resetTextareaHeight()

  // Assistant message is created lazily on first text_delta,
  // so tool_call events (if any) appear before the assistant bubble.
  // Thinking message is also created lazily on first thinking_delta,
  // so it appears before tool cards and assistant text.
  const assistantMsgRef: { current: ChatMessage | null } = { current: null }
  const thinkingMsgRef: { current: ChatMessage | null } = { current: null }
  streaming.value = true
  userScrolledUp = false

  await nextTick()
  scrollToBottom()

  // Prepare SSE fetch
  abortController = new AbortController()
  const baseUrl = await getApiBaseUrl()

  try {
    const response = await fetch(`${baseUrl}/api/v1/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        ledger_id: ledgerStore.currentLedgerId,
      }),
      signal: abortController.signal,
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`)
    }

    if (!response.body) {
      throw new Error('不支持流式响应')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Parse SSE lines: "data: {...}\n\n"
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      let currentData = ''
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          currentData += line.slice(6)
        } else if (line === '' && currentData) {
          // End of event
          try {
            const event: SSEEvent = JSON.parse(currentData)
            handleSSEEvent(event, assistantMsgRef, thinkingMsgRef)
          } catch {
            // skip malformed JSON
          }
          currentData = ''
        }
      }
    }

    // Handle any remaining data in buffer
    if (buffer.startsWith('data: ')) {
      const remaining = buffer.slice(6).trim()
      if (remaining) {
        try {
          const event: SSEEvent = JSON.parse(remaining)
          handleSSEEvent(event, assistantMsgRef, thinkingMsgRef)
        } catch {
          // skip
        }
      }
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      if (assistantMsgRef.current) {
        assistantMsgRef.current.content += ' [已停止]'
      }
    } else {
      if (!assistantMsgRef.current) {
        messages.value.push({
          id: nextMsgId(),
          role: 'assistant',
          content: `错误: ${err.message || '请求失败'}`,
          timestamp: Date.now(),
        })
      } else if (!assistantMsgRef.current.content) {
        assistantMsgRef.current.content = `错误: ${err.message || '请求失败'}`
      } else {
        assistantMsgRef.current.content += `\n\n[错误: ${err.message || '请求失败'}]`
      }
      console.error('AI chat error:', err)
    }
  } finally {
    streaming.value = false
    abortController = null
    if (assistantMsgRef.current) {
      assistantMsgRef.current.streaming = false
    }
    if (thinkingMsgRef.current) {
      thinkingMsgRef.current.streaming = false
      thinkingMsgRef.current.thinkingActive = false
    }
    await nextTick()
    scrollToBottom()
  }
}

function handleSSEEvent(event: SSEEvent, assistantMsgRef: { current: ChatMessage | null }, thinkingMsgRef: { current: ChatMessage | null }) {
  const ensureThinking = (): ChatMessage => {
    if (!thinkingMsgRef.current) {
      thinkingMsgRef.current = {
        id: nextMsgId(),
        role: 'thinking',
        content: '',
        timestamp: Date.now(),
        streaming: true,
        thinkingActive: true,
        thinkingCollapsed: false,
      }
      messages.value.push(thinkingMsgRef.current)
    }
    return thinkingMsgRef.current
  }

  const ensureAssistant = (): ChatMessage => {
    if (!assistantMsgRef.current) {
      assistantMsgRef.current = {
        id: nextMsgId(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        streaming: true,
      }
      messages.value.push(assistantMsgRef.current)
    }
    return assistantMsgRef.current
  }

  switch (event.type) {
    case 'thinking_start':
      ensureThinking()
      break

    case 'thinking_delta': {
      const msg = ensureThinking()
      msg.thinkingActive = true
      msg.content += event.delta || ''
      msg.thinkingCollapsed = false
      scrollToBottom()
      break
    }

    case 'thinking_done':
      if (thinkingMsgRef.current) {
        thinkingMsgRef.current.thinkingActive = false
        thinkingMsgRef.current.thinkingCollapsed = true
        thinkingMsgRef.current.streaming = false
      }
      break

    case 'text_delta': {
      const msg = ensureAssistant()
      msg.content += event.delta || ''
      scrollToBottom()
      break
    }

    case 'tool_call': {
      // Create a tool card in "executing" state
      const toolMsg: ChatMessage = {
        id: nextMsgId(),
        role: 'tool',
        content: '',
        toolName: event.tool || '',
        toolArgs: event.args || {},
        toolDone: false,
        timestamp: Date.now(),
      }
      messages.value.push(toolMsg)
      scrollToBottom()
      break
    }

    case 'tool_result': {
      // Find the last tool card with matching name that's not done yet
      const toolMsg = findLastUndoneToolCard(event.tool || '')
      if (toolMsg) {
        toolMsg.toolDone = true
        toolMsg.toolResult = event.summary || ''
        toolMsg.toolDetail = event.detail || null
      }
      scrollToBottom()
      break
    }

    case 'done':
      if (assistantMsgRef.current) {
        assistantMsgRef.current.tokens = event.total_tokens
      }
      break

    case 'error': {
      const msg = ensureAssistant()
      msg.content += event.message || event.error || '未知错误'
      break
    }
  }
}

function findLastUndoneToolCard(toolName: string): ChatMessage | null {
  for (let i = messages.value.length - 1; i >= 0; i--) {
    const msg = messages.value[i]
    if (msg && msg.role === 'tool' && msg.toolName === toolName && !msg.toolDone) {
      return msg
    }
  }
  return null
}

function stopGeneration() {
  if (abortController) {
    abortController.abort()
    abortController = null
  }
}

// ----------------------------------------------------------------
// Clear conversation
// ----------------------------------------------------------------

function copyMessage(text: string) {
  navigator.clipboard.writeText(text)
  message.success('已复制')
}

async function loadHistory() {
  try {
    const apiMessages = await aiApi.getMessages()
    if (!apiMessages || apiMessages.length === 0) return

    messages.value = apiMessages
      // Skip intermediate assistant messages that only contain tool_calls
      .filter((m: AiMessageApi) => !(m.role === 'assistant' && m.tool_calls))
      .map((m: AiMessageApi): ChatMessage => {
        const base: ChatMessage = {
          id: m.id,
          role: m.role as ChatMessage['role'],
          content: m.content,
          timestamp: m.created_at,
        }
        if (m.role === 'tool') {
        base.toolName = m.tool_name
        base.toolDone = true
        base.toolResult = m.content.length > 200
          ? m.content.substring(0, 200) + '...'
          : m.content
        if (m.content) {
          try { base.toolDetail = JSON.parse(m.content) } catch { /* not JSON */ }
        }
      }
      return base
    })

    // Scroll to bottom after loading
    await nextTick()
    scrollToBottom()
  } catch {
    // non-critical: show empty state if history can't be loaded
  }
}

async function clearConversation() {
  messages.value = []
  expandedToolDetails.value = new Set()
  try {
    await aiApi.clearMessages()
  } catch {
    // non-critical
  }
}

// ----------------------------------------------------------------
// Tool detail toggle
// ----------------------------------------------------------------

function toggleToolDetail(msgId: string) {
  if (expandedToolDetails.value.has(msgId)) {
    expandedToolDetails.value.delete(msgId)
  } else {
    expandedToolDetails.value.add(msgId)
  }
}

function formatArgValue(val: any): string {
  if (typeof val === 'string') return val
  if (typeof val === 'number') return String(val)
  if (typeof val === 'boolean') return val ? '是' : '否'
  if (val === null || val === undefined) return '—'
  return JSON.stringify(val)
}

// ----------------------------------------------------------------
// Scroll management
// ----------------------------------------------------------------

function scrollToBottom() {
  if (userScrolledUp) return
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

// ----------------------------------------------------------------
// Input handling
// ----------------------------------------------------------------

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

// ----------------------------------------------------------------
// Time formatting
// ----------------------------------------------------------------

function formatTime(ts: number): string {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

// ----------------------------------------------------------------
// Cleanup
// ----------------------------------------------------------------

onMounted(() => {
  loadHistory()
})

onUnmounted(() => {
  if (abortController) {
    abortController.abort()
  }
})
</script>

<style scoped>
/* ========================================
   Layout
   ======================================== */

.ai-chat-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: var(--billadm-space-md) var(--billadm-space-lg);
  background-color: var(--billadm-color-major-warm);
}

/* ========================================
   Toolbar (drag region, follows BilladmPageLayout)
   ======================================== */

.chat-toolbar {
  flex-shrink: 0;
  height: var(--billadm-size-header-height);
  margin-right: calc(3 * 32px + 2 * 6px);
  -webkit-app-region: drag;
}

/* ========================================
   Card Container
   ======================================== */

.chat-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--billadm-color-major-background);
  border: 1px solid var(--billadm-color-divider);
  border-radius: var(--billadm-radius-lg);
  box-shadow: var(--billadm-shadow-sm);
}

/* ========================================
   Header
   ======================================== */

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--billadm-size-header-height);
  padding: 0 var(--billadm-space-xl);
  flex-shrink: 0;
  border-bottom: 1px solid var(--billadm-color-divider);
}

.chat-header-title {
  font-family: var(--billadm-font-display);
  font-size: var(--billadm-size-text-title);
  font-weight: 500;
  color: var(--billadm-color-text-major);
  margin: 0;
}

.chat-header-clear {
  -webkit-app-region: no-drag;
  color: var(--billadm-color-text-secondary);
  font-size: var(--billadm-size-text-body-sm);
}

.chat-header-clear:hover {
  color: var(--billadm-color-text-major);
}

/* ========================================
   Messages Area
   ======================================== */

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--billadm-space-xl);
  position: relative;
}

/* ========================================
   Empty State
   ======================================== */

.chat-empty {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
}

.chat-empty-greeting {
  font-family: var(--billadm-font-display);
  font-size: var(--billadm-size-text-display);
  font-weight: 400;
  color: var(--billadm-color-text-disabled);
  margin: 0 0 var(--billadm-space-sm) 0;
}

.chat-empty-hint {
  font-family: var(--billadm-font-body);
  font-size: var(--billadm-size-text-body);
  color: var(--billadm-color-text-disabled);
  margin: 0;
}

/* ========================================
   Message Wrapper
   ======================================== */

.chat-message {
  margin-bottom: var(--billadm-space-lg);
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

/* ========================================
   User Message Bubble
   ======================================== */

.msg-user-row {
  display: flex;
  align-items: stretch;
  justify-content: flex-end;
  gap: var(--billadm-space-xs);
}

.msg-user {
  position: relative;
  max-width: 90%;
  background: var(--billadm-color-primary);
  color: var(--billadm-color-text-inverse);
  border-radius: var(--billadm-radius-md);
  padding: var(--billadm-space-sm) var(--billadm-space-md);
}

.msg-user-content {
  font-family: var(--billadm-font-body);
  font-size: var(--billadm-size-text-body);
  line-height: var(--billadm-height-normal);
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
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-disabled);
  white-space: nowrap;
  flex-shrink: 0;
}

/* ========================================
   AI Assistant Message
   ======================================== */

.msg-assistant-row {
  display: flex;
  align-items: stretch;
  gap: var(--billadm-space-xs);
}

.msg-assistant {
  position: relative;
  max-width: 90%;
  background: rgba(74, 140, 111, 0.06);
  border: 1px solid var(--billadm-color-divider);
  border-left: 3px solid var(--billadm-color-primary);
  border-radius: var(--billadm-radius-md);
  padding: var(--billadm-space-md);
}

.msg-assistant-content {
  font-family: var(--billadm-font-body);
  font-size: var(--billadm-size-text-body);
  color: var(--billadm-color-text-major);
  line-height: var(--billadm-height-relaxed);
  user-select: text;
  -webkit-user-select: text;
}

.msg-assistant-content :deep(p) {
  margin: 0 0 var(--billadm-space-sm) 0;
}
.msg-assistant-content :deep(p:last-child) {
  margin-bottom: 0;
}

.msg-assistant-content :deep(code) {
  font-family: var(--billadm-font-mono);
  font-size: 0.9em;
  background: var(--billadm-color-minor-background);
  padding: 2px 5px;
  border-radius: 3px;
}

.msg-assistant-content :deep(pre) {
  margin: var(--billadm-space-sm) 0;
  padding: var(--billadm-space-md);
  background: var(--billadm-color-minor-background);
  border-radius: var(--billadm-radius-sm);
  overflow-x: auto;
}
.msg-assistant-content :deep(pre code) {
  background: none;
  padding: 0;
  font-size: var(--billadm-size-text-body-sm);
  line-height: var(--billadm-height-normal);
}

.msg-assistant-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: var(--billadm-space-sm) 0;
  font-size: var(--billadm-size-text-body-sm);
}
.msg-assistant-content :deep(th),
.msg-assistant-content :deep(td) {
  border: 1px solid var(--billadm-color-divider);
  padding: var(--billadm-space-xs) var(--billadm-space-sm);
  text-align: left;
}
.msg-assistant-content :deep(th) {
  background: var(--billadm-color-minor-background);
  font-weight: 600;
}

.msg-assistant-content :deep(ul),
.msg-assistant-content :deep(ol) {
  margin: var(--billadm-space-sm) 0;
  padding-left: var(--billadm-space-xl);
}

.msg-assistant-content :deep(blockquote) {
  margin: var(--billadm-space-sm) 0;
  padding: var(--billadm-space-xs) var(--billadm-space-md);
  border-left: 3px solid var(--billadm-color-divider);
  color: var(--billadm-color-text-secondary);
}

.msg-assistant-content :deep(a) {
  color: var(--billadm-color-primary);
}

.msg-assistant-content :deep(hr) {
  border: none;
  border-top: 1px solid var(--billadm-color-divider);
  margin: var(--billadm-space-md) 0;
}

.msg-assistant-content :deep(strong) {
  font-weight: 600;
}

.msg-assistant-content :deep(h1),
.msg-assistant-content :deep(h2),
.msg-assistant-content :deep(h3) {
  font-family: var(--billadm-font-display);
  margin: var(--billadm-space-md) 0 var(--billadm-space-sm) 0;
  font-weight: 600;
}
.msg-assistant-content :deep(h1) { font-size: 1.3em; }
.msg-assistant-content :deep(h2) { font-size: 1.15em; }
.msg-assistant-content :deep(h3) { font-size: 1.05em; }

.msg-assistant-content :deep(input[type="checkbox"]) {
  margin-right: var(--billadm-space-xs);
}

.msg-assistant-meta {
  font-size: var(--billadm-size-text-small);
  color: var(--billadm-color-text-disabled);
  white-space: nowrap;
  flex-shrink: 0;
}

/* ========================================
   Copy Button
   ======================================== */

.msg-copy-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--billadm-radius-sm);
  background: transparent;
  color: var(--billadm-color-text-disabled);
  cursor: pointer;
  font-size: 13px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity var(--billadm-transition-fast);
}

.chat-message:hover .msg-copy-btn {
  opacity: 1;
}

.msg-copy-btn:hover {
  background: var(--billadm-color-hover-bg);
  color: var(--billadm-color-text-major);
}

/* ========================================
   Streaming Cursor
   ======================================== */

.streaming-cursor {
  display: inline;
  color: var(--billadm-color-primary);
  font-weight: var(--billadm-weight-bold);
  animation: cursor-blink 0.6s step-end infinite alternate;
}

@keyframes cursor-blink {
  0% { opacity: 1; }
  100% { opacity: 0; }
}

/* ========================================
   Tool Card
   ======================================== */

.msg-tool {
  max-width: 90%;
  background: transparent;
  border-left: 3px solid var(--billadm-color-accent);
  padding: var(--billadm-space-xs) var(--billadm-space-md);
  margin-bottom: var(--billadm-space-xs);
  transition: border-color var(--billadm-transition-normal);
}

.msg-tool--done {
  border-left-color: var(--billadm-color-success);
}

.msg-tool-header {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-sm);
  font-family: var(--billadm-font-body);
  font-size: var(--billadm-size-text-body-sm);
  color: var(--billadm-color-text-secondary);
}

.msg-tool-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--billadm-color-accent);
  flex-shrink: 0;
}

.msg-tool-indicator--pulse {
  animation: pulse-scale 1s ease-in-out infinite;
}

@keyframes pulse-scale {
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.3); opacity: 0.6; }
  100% { transform: scale(1); opacity: 1; }
}

.msg-tool--done .msg-tool-indicator {
  background: var(--billadm-color-success);
  animation: none;
}

.msg-tool-name {
  font-family: var(--billadm-font-mono);
  font-size: var(--billadm-size-text-body-sm);
  color: var(--billadm-color-text-major);
  font-weight: 500;
}

.msg-tool-action {
  font-family: var(--billadm-font-body);
  font-size: var(--billadm-size-text-body-sm);
}

/* ========================================
   Tool Args Display
   ======================================== */

.msg-tool-args {
  margin-top: var(--billadm-space-xs);
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.msg-tool-arg {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: var(--billadm-color-minor-background);
  border: 1px solid var(--billadm-color-divider);
  border-radius: var(--billadm-radius-sm);
  padding: 1px 6px;
  font-size: var(--billadm-size-text-caption);
  line-height: 1.6;
}

.msg-tool-arg-key {
  color: var(--billadm-color-text-disabled);
  font-family: var(--billadm-font-body);
}

.msg-tool-arg-key::after {
  content: ':';
}

.msg-tool-arg-val {
  color: var(--billadm-color-text-major);
  font-family: var(--billadm-font-mono);
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.msg-tool-summary {
  margin-top: var(--billadm-space-sm);
  font-family: var(--billadm-font-body);
  font-size: var(--billadm-size-text-body);
  color: var(--billadm-color-text-major);
  line-height: var(--billadm-height-normal);
}

.msg-tool-detail {
  margin-top: var(--billadm-space-sm);
}

.msg-tool-detail-toggle {
  font-size: var(--billadm-size-text-caption);
  padding: 0;
  height: auto;
  color: var(--billadm-color-primary);
}

.msg-tool-detail-json {
  margin-top: var(--billadm-space-sm);
  padding: var(--billadm-space-sm) var(--billadm-space-md);
  background: var(--billadm-color-minor-background);
  border-radius: var(--billadm-radius-sm);
  font-family: var(--billadm-font-mono);
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-secondary);
  line-height: var(--billadm-height-normal);
  overflow-x: auto;
  white-space: pre;
}

/* ========================================
   Input Area
   ======================================== */

.chat-input-area {
  padding: 0 var(--billadm-space-xl) var(--billadm-space-md);
  flex-shrink: 0;
}

.chat-divider {
  height: 1px;
  background: var(--billadm-color-divider);
  margin-bottom: var(--billadm-space-md);
}

.chat-input-row {
  display: flex;
  align-items: flex-end;
  gap: var(--billadm-space-sm);
}

.chat-textarea {
  flex: 1;
  min-height: 44px;
  max-height: 120px;
  padding: var(--billadm-space-sm) var(--billadm-space-md);
  border: 1px solid var(--billadm-color-window-border);
  border-radius: var(--billadm-radius-lg);
  background: var(--billadm-color-minor-background);
  font-family: var(--billadm-font-body);
  font-size: var(--billadm-size-text-body);
  color: var(--billadm-color-text-major);
  line-height: var(--billadm-height-normal);
  resize: none;
  outline: none;
  transition: all var(--billadm-transition-fast);
}

.chat-textarea:focus {
  background: var(--billadm-color-major-background);
  box-shadow: 0 0 0 2px rgba(74, 140, 111, 0.15);
  border-color: var(--billadm-color-primary);
}

.chat-textarea:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.chat-textarea::placeholder {
  color: var(--billadm-color-text-disabled);
}

/* Send / Stop Button */

.chat-send-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: var(--billadm-color-primary);
  color: var(--billadm-color-text-inverse);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 16px;
  transition: background var(--billadm-transition-fast);
}

.chat-send-btn:hover:not(:disabled) {
  background: var(--billadm-color-primary-light);
}

.chat-send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.chat-send-btn--stop {
  background: var(--billadm-color-expense);
}

.chat-send-btn--stop:hover {
  background: #c4624e;
}


/* ========================================
   Message Entrance Animations
   ======================================== */

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

@keyframes msg-assistant-border-glow {
  0% {
    border-left-color: var(--billadm-color-primary-light);
    box-shadow: inset 3px 0 8px rgba(74, 140, 111, 0.15);
  }
  100% {
    border-left-color: var(--billadm-color-primary);
    box-shadow: inset 3px 0 0 transparent;
  }
}

@keyframes msg-tool-enter {
  0% {
    opacity: 0;
    border-left-color: transparent;
  }
  100% {
    opacity: 1;
    border-left-color: var(--billadm-color-accent);
  }
}

@keyframes msg-tool-dot-pop {
  0% { transform: scale(0); }
  60% { transform: scale(1.4); }
  100% { transform: scale(1); }
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

.chat-message--assistant .msg-assistant {
  animation: msg-assistant-border-glow 400ms ease-out both;
}

.chat-message--tool {
  animation-name: msg-tool-enter;
  animation-duration: 200ms;
}

.chat-message--tool .msg-tool-indicator {
  animation: msg-tool-dot-pop 300ms ease-out both;
}

/* Respect reduced motion preference */
@media (prefers-reduced-motion: reduce) {
  .chat-message {
    animation: none;
  }
  .msg-assistant {
    animation: none;
  }
  .msg-tool-indicator {
    animation: none;
  }
}

@keyframes msg-thinking-enter {
  0% {
    opacity: 0;
    border-left-color: transparent;
  }
  100% {
    opacity: 1;
    border-left-color: var(--billadm-color-divider);
  }
}

.chat-message--thinking {
  animation-name: msg-thinking-enter;
  animation-duration: 200ms;
}

/* ========================================
   Thinking Block (standalone message)
   ======================================== */

.msg-thinking-row {
  display: flex;
  align-items: stretch;
  gap: var(--billadm-space-xs);
}

.msg-thinking {
  max-width: 90%;
  background: transparent;
  border-left: 3px solid var(--billadm-color-divider);
  border-radius: var(--billadm-radius-sm);
  padding: var(--billadm-space-xs) var(--billadm-space-md);
  overflow: hidden;
}

.thinking-toggle {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-xs);
  border: none;
  background: none;
  padding: 2px 0;
  cursor: pointer;
  font-family: var(--billadm-font-body);
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-disabled);
  width: 100%;
  text-align: left;
}

.thinking-toggle:hover {
  color: var(--billadm-color-text-secondary);
}

.thinking-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--billadm-color-text-disabled);
  flex-shrink: 0;
}

.thinking-dot--active {
  background: var(--billadm-color-accent);
  animation: pulse-scale 1s ease-in-out infinite;
}

.thinking-arrow {
  margin-left: auto;
  transition: transform var(--billadm-transition-fast);
}

.thinking-arrow--open {
  transform: rotate(180deg);
}

.thinking-content {
  margin-top: var(--billadm-space-xs);
  padding: var(--billadm-space-sm) var(--billadm-space-md);
  background: var(--billadm-color-minor-background);
  border-radius: var(--billadm-radius-sm);
  font-family: var(--billadm-font-body);
  font-size: var(--billadm-size-text-body-sm);
  color: var(--billadm-color-text-secondary);
  line-height: var(--billadm-height-normal);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
