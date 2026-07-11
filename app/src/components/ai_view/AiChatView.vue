<template>
  <div class="ai-chat-view">
    <div class="chat-toolbar"></div>

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
        <div v-if="messages.length === 0 && !streaming" class="chat-empty">
          <p class="chat-empty-greeting">{{ greeting }}</p>
          <p class="chat-empty-hint">询问你的财务数据</p>
          <div class="chat-empty-chips">
            <button class="chat-empty-chip" @click="fillAndSend('本月支出汇总')">本月支出汇总</button>
            <button class="chat-empty-chip" @click="fillAndSend('和上月相比支出变化')">环比支出变化</button>
            <button class="chat-empty-chip" @click="fillAndSend('餐饮类消费趋势')">餐饮消费趋势</button>
          </div>
        </div>

        <div v-for="msg in messages" :key="msg.id" class="chat-message" :class="`chat-message--${msg.role}`">
          <!-- User Message -->
          <div v-if="msg.role === 'user'" class="msg-user-row">
            <div class="msg-meta-col">
              <button class="msg-copy-btn" @click.stop="copyMessage(msg.content)" title="复制"><CopyOutlined /></button>
              <div class="msg-user-time">{{ formatTime(msg.timestamp) }}</div>
            </div>
            <div class="msg-user"><div class="msg-user-content">{{ msg.content }}</div></div>
          </div>

          <!-- AI Text Message -->
          <div v-else-if="msg.role === 'assistant'" class="msg-assistant-row">
            <div class="msg-assistant">
              <!-- Inline Thinking -->
              <div v-if="msg.thinkingContent" class="assistant-thinking">
                <button
                  class="assistant-thinking-toggle"
                  @click="msg.thinkingCollapsed = !msg.thinkingCollapsed"
                  :aria-expanded="!msg.thinkingCollapsed || msg.thinkingActive"
                >
                  <span class="thinking-indicator" :class="{ 'thinking-indicator--active': msg.thinkingActive }"></span>
                  <span>{{ msg.thinkingActive ? '正在思考...' : '已思考' }}</span>
                  <span class="thinking-arrow" :class="{ 'thinking-arrow--open': !msg.thinkingCollapsed || msg.thinkingActive }">▾</span>
                </button>
                <div v-if="!msg.thinkingCollapsed || msg.thinkingActive" class="assistant-thinking-content">
                  {{ msg.thinkingContent }}<span v-if="msg.thinkingActive" class="streaming-cursor">|</span>
                </div>
              </div>
              <div class="msg-assistant-content" v-html="renderMarkdown(msg.content)"></div>
              <span v-if="msg.streaming" class="streaming-cursor">|</span>
            </div>
            <div class="msg-meta-col">
              <button class="msg-copy-btn" @click.stop="copyMessage(msg.content)" title="复制"><CopyOutlined /></button>
              <div class="msg-assistant-meta">
                <span>{{ formatTime(msg.timestamp) }}</span>
                <span v-if="msg.tokens">&nbsp;·&nbsp;{{ msg.tokens }}tk</span>
              </div>
            </div>
          </div>

          <!-- Tool Card -->
          <div v-else-if="msg.role === 'tool'" class="msg-tool" :class="{ 'msg-tool--done': msg.toolDone }">
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
            <div v-if="msg.toolDone && msg.toolResult" class="msg-tool-summary">{{ msg.toolResult }}</div>
            <div v-if="msg.toolDone && msg.toolDetail" class="msg-tool-detail">
              <a-button type="link" size="small" @click="toggleToolDetail(msg.id)" class="msg-tool-detail-toggle">
                {{ expandedToolDetails.has(msg.id) ? '收起详情' : '查看详情' }}
              </a-button>
              <pre v-if="expandedToolDetails.has(msg.id)" class="msg-tool-detail-json">{{ JSON.stringify(msg.toolDetail, null, 2) }}</pre>
            </div>
          </div>
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
            <StopOutlined v-if="streaming" />
            <SendOutlined v-else />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { DeleteOutlined, SendOutlined, StopOutlined, CopyOutlined } from '@ant-design/icons-vue'
import { useLedgerStore } from '@/stores/ledgerStore'
import { renderMarkdown } from '@/utils/markdown'
import { message } from 'ant-design-vue'
import { useAiChat } from '@/hooks/useAiChat'

// ---- AiChat composable (deep module) ----
const { messages, streaming, send, stop, loadHistory, clear, cleanup } = useAiChat()

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

function formatArgValue(val: any): string {
  if (typeof val === 'string') return val
  if (typeof val === 'number') return String(val)
  if (typeof val === 'boolean') return val ? '是' : '否'
  if (val === null || val === undefined) return '—'
  return JSON.stringify(val)
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
  loadHistory()
})

onUnmounted(() => {
  cleanup()
})
</script>

<style scoped>
.ai-chat-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: var(--billadm-space-md) var(--billadm-space-lg);
  background-color: var(--billadm-color-major-warm);
}

.chat-toolbar {
  flex-shrink: 0;
  height: var(--billadm-size-header-height);
  margin-right: calc(3 * 32px + 2 * 6px);
  -webkit-app-region: drag;
}

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

.chat-header-clear:hover { color: var(--billadm-color-text-major); }

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--billadm-space-xl);
  position: relative;
}

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
  margin: 0 0 var(--billadm-space-xl) 0;
}

.chat-empty-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--billadm-space-sm);
  justify-content: center;
}

.chat-empty-chip {
  font-family: var(--billadm-font-body);
  font-size: var(--billadm-size-text-body-sm);
  color: var(--billadm-color-text-secondary);
  background: var(--billadm-color-minor-background);
  border: 1px solid var(--billadm-color-divider);
  border-radius: var(--billadm-radius-full);
  padding: var(--billadm-space-xs) var(--billadm-space-lg);
  cursor: pointer;
  transition: all var(--billadm-transition-fast);
}

.chat-empty-chip:hover {
  color: var(--billadm-color-primary);
  border-color: var(--billadm-color-primary);
  background: var(--billadm-color-hover-bg);
}

.chat-message {
  margin-bottom: var(--billadm-space-lg);
  display: flex;
  flex-direction: column;
}

.chat-message--user { align-items: flex-end; }
.chat-message--assistant { align-items: flex-start; }
.chat-message--tool { align-items: flex-start; }

/* User Message */
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

/* AI Assistant Message */
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

.msg-assistant-content :deep(p) { margin: 0 0 var(--billadm-space-sm) 0; }
.msg-assistant-content :deep(p:last-child) { margin-bottom: 0; }
.msg-assistant-content :deep(code) { font-family: var(--billadm-font-mono); font-size: 0.9em; background: var(--billadm-color-minor-background); padding: 2px 5px; border-radius: 3px; }
.msg-assistant-content :deep(pre) { margin: var(--billadm-space-sm) 0; padding: var(--billadm-space-md); background: var(--billadm-color-minor-background); border-radius: var(--billadm-radius-sm); overflow-x: auto; }
.msg-assistant-content :deep(pre code) { background: none; padding: 0; font-size: var(--billadm-size-text-body-sm); line-height: var(--billadm-height-normal); }
.msg-assistant-content :deep(table) { width: 100%; border-collapse: collapse; margin: var(--billadm-space-sm) 0; font-size: var(--billadm-size-text-body-sm); }
.msg-assistant-content :deep(th), .msg-assistant-content :deep(td) { border: 1px solid var(--billadm-color-divider); padding: var(--billadm-space-xs) var(--billadm-space-sm); text-align: left; }
.msg-assistant-content :deep(th) { background: var(--billadm-color-minor-background); font-weight: 600; }
.msg-assistant-content :deep(ul), .msg-assistant-content :deep(ol) { margin: var(--billadm-space-sm) 0; padding-left: var(--billadm-space-xl); }
.msg-assistant-content :deep(blockquote) { margin: var(--billadm-space-sm) 0; padding: var(--billadm-space-xs) var(--billadm-space-md); border-left: 3px solid var(--billadm-color-divider); color: var(--billadm-color-text-secondary); }
.msg-assistant-content :deep(a) { color: var(--billadm-color-primary); }
.msg-assistant-content :deep(hr) { border: none; border-top: 1px solid var(--billadm-color-divider); margin: var(--billadm-space-md) 0; }
.msg-assistant-content :deep(strong) { font-weight: 600; }
.msg-assistant-content :deep(h1), .msg-assistant-content :deep(h2), .msg-assistant-content :deep(h3) { font-family: var(--billadm-font-display); margin: var(--billadm-space-md) 0 var(--billadm-space-sm) 0; font-weight: 600; }
.msg-assistant-content :deep(h1) { font-size: 1.3em; }
.msg-assistant-content :deep(h2) { font-size: 1.15em; }
.msg-assistant-content :deep(h3) { font-size: 1.05em; }
.msg-assistant-content :deep(input[type="checkbox"]) { margin-right: var(--billadm-space-xs); }

.msg-assistant-meta {
  font-size: var(--billadm-size-text-small);
  color: var(--billadm-color-text-disabled);
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
  border-radius: var(--billadm-radius-sm);
  background: transparent;
  color: var(--billadm-color-text-disabled);
  cursor: pointer;
  font-size: 13px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity var(--billadm-transition-fast);
}

.chat-message:hover .msg-copy-btn { opacity: 1; }
.msg-copy-btn:hover { background: var(--billadm-color-hover-bg); color: var(--billadm-color-text-major); }

/* Streaming Cursor */
.streaming-cursor {
  display: inline;
  color: var(--billadm-color-primary);
  font-weight: var(--billadm-weight-bold);
  animation: cursor-blink 0.6s step-end infinite alternate;
}

@keyframes cursor-blink { 0% { opacity: 1; } 100% { opacity: 0; } }

/* Tool Card */
.msg-tool {
  max-width: 90%;
  background: transparent;
  border-left: 3px solid var(--billadm-color-accent);
  padding: var(--billadm-space-xs) var(--billadm-space-md);
  margin-bottom: var(--billadm-space-xs);
  transition: border-color var(--billadm-transition-normal);
}

.msg-tool--done { border-left-color: var(--billadm-color-success); }

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

.msg-tool-indicator--pulse { animation: pulse-scale 1s ease-in-out infinite; }

@keyframes pulse-scale {
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.3); opacity: 0.6; }
  100% { transform: scale(1); opacity: 1; }
}

.msg-tool--done .msg-tool-indicator { background: var(--billadm-color-success); animation: none; }

.msg-tool-name {
  font-family: var(--billadm-font-mono);
  font-size: var(--billadm-size-text-body-sm);
  color: var(--billadm-color-text-major);
  font-weight: 500;
}

.msg-tool-args { margin-top: var(--billadm-space-xs); display: flex; flex-wrap: wrap; gap: 4px; }

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

.msg-tool-arg-key { color: var(--billadm-color-text-disabled); font-family: var(--billadm-font-body); }
.msg-tool-arg-key::after { content: ':'; }
.msg-tool-arg-val { color: var(--billadm-color-text-major); font-family: var(--billadm-font-mono); max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.msg-tool-summary {
  margin-top: var(--billadm-space-sm);
  font-family: var(--billadm-font-body);
  font-size: var(--billadm-size-text-body);
  color: var(--billadm-color-text-major);
  line-height: var(--billadm-height-normal);
}

.msg-tool-detail { margin-top: var(--billadm-space-sm); }
.msg-tool-detail-toggle { font-size: var(--billadm-size-text-caption); padding: 0; height: auto; color: var(--billadm-color-primary); }

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

/* Streaming Status Bar */
.chat-streaming-bar {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-sm);
  height: 28px;
  padding: 0 var(--billadm-space-xl);
  flex-shrink: 0;
}

.chat-streaming-ring {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: transparent;
  border: 2px solid var(--billadm-color-divider);
  border-top-color: var(--billadm-color-accent);
  animation: thinking-spin 0.8s linear infinite;
}

.chat-streaming-text {
  font-family: var(--billadm-font-body);
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-secondary);
}

.streaming-bar-fade-enter-active { transition: opacity 200ms ease; }
.streaming-bar-fade-leave-active { transition: opacity 200ms ease; }
.streaming-bar-fade-enter-from,
.streaming-bar-fade-leave-to { opacity: 0; }

/* Input Area */
.chat-input-area { padding: 0 var(--billadm-space-xl) var(--billadm-space-md); flex-shrink: 0; }
.chat-divider { height: 1px; background: var(--billadm-color-divider); margin-bottom: var(--billadm-space-md); }
.chat-input-row { display: flex; align-items: flex-end; gap: var(--billadm-space-sm); }

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

.chat-textarea:disabled { opacity: 0.6; cursor: not-allowed; }
.chat-textarea::placeholder { color: var(--billadm-color-text-disabled); }

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

.chat-send-btn:hover:not(:disabled) { background: var(--billadm-color-primary-light); }
.chat-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.chat-send-btn--stop { background: var(--billadm-color-expense); }
.chat-send-btn--stop:hover { background: #c4624e; }

/* Animations */
@keyframes msg-user-enter { from { opacity: 0; transform: translateY(6px) translateX(4px); } to { opacity: 1; transform: translateY(0) translateX(0); } }
@keyframes msg-assistant-enter { 0% { opacity: 0; transform: translateY(4px); } 100% { opacity: 1; transform: translateY(0); } }
@keyframes msg-assistant-border-glow { 0% { border-left-color: var(--billadm-color-primary-light); box-shadow: inset 3px 0 8px rgba(74, 140, 111, 0.15); } 100% { border-left-color: var(--billadm-color-primary); box-shadow: inset 3px 0 0 transparent; } }
@keyframes msg-tool-enter { 0% { opacity: 0; border-left-color: transparent; } 100% { opacity: 1; border-left-color: var(--billadm-color-accent); } }
@keyframes msg-tool-dot-pop { 0% { transform: scale(0); } 60% { transform: scale(1.4); } 100% { transform: scale(1); } }

.chat-message { animation-duration: 200ms; animation-fill-mode: both; animation-timing-function: ease-out; }
.chat-message--user { animation-name: msg-user-enter; animation-duration: 150ms; }
.chat-message--assistant { animation-name: msg-assistant-enter; animation-duration: 300ms; }
.chat-message--assistant .msg-assistant { animation: msg-assistant-border-glow 400ms ease-out both; }
.chat-message--tool { animation-name: msg-tool-enter; animation-duration: 200ms; }
.chat-message--tool .msg-tool-indicator { animation: msg-tool-dot-pop 300ms ease-out both; }

@media (prefers-reduced-motion: reduce) {
  .chat-message { animation: none; }
  .msg-assistant { animation: none; }
  .msg-tool-indicator { animation: none; }
  .chat-streaming-ring { animation: none; border-top-color: var(--billadm-color-accent); }
  .streaming-bar-fade-enter-active,
  .streaming-bar-fade-leave-active { transition: opacity 0ms; }
}

/* Inline Thinking (inside assistant bubble) */
.assistant-thinking {
  margin-bottom: var(--billadm-space-md);
  padding-bottom: var(--billadm-space-md);
  border-bottom: 1px solid var(--billadm-color-divider);
}

.assistant-thinking-toggle {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-xs);
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  font-family: var(--billadm-font-body);
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-disabled);
  width: 100%;
  text-align: left;
}

.assistant-thinking-toggle:hover { color: var(--billadm-color-text-secondary); }

.thinking-indicator {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--billadm-color-text-disabled);
  flex-shrink: 0;
  transition: all var(--billadm-transition-fast);
}

.thinking-indicator--active {
  background: transparent;
  border: 2px solid var(--billadm-color-divider);
  border-top-color: var(--billadm-color-accent);
  animation: thinking-spin 0.8s linear infinite;
}

@keyframes thinking-spin { to { transform: rotate(360deg); } }

.thinking-arrow { margin-left: auto; transition: transform var(--billadm-transition-fast); }
.thinking-arrow--open { transform: rotate(180deg); }

.assistant-thinking-content {
  margin-top: var(--billadm-space-sm);
  font-family: var(--billadm-font-body);
  font-size: var(--billadm-size-text-body-sm);
  color: var(--billadm-color-text-secondary);
  line-height: var(--billadm-height-normal);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
