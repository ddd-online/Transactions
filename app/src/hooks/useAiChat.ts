import { ref } from 'vue'
import { aiApi, type AiMessage as AiMessageApi, type AiConversation } from '@/backend/api/ai'
import { getErrorMessage } from '@/backend/errorHandler'

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

export interface SSEEvent {
  type: 'text_delta' | 'thinking_start' | 'thinking_delta' | 'thinking_done' | 'tool_call' | 'tool_result' | 'done' | 'error'
  delta?: string
  tool?: string
  args?: Record<string, unknown>
  summary?: string
  detail?: unknown
  total_tokens?: number
  error?: string
  message?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool' | 'thinking'
  content: string
  toolName?: string
  toolArgs?: Record<string, unknown>
  toolResult?: string
  toolDetail?: unknown
  toolDone?: boolean
  timestamp: number
  tokens?: number
  streaming?: boolean
  thinkingContent?: string
  thinkingActive?: boolean
  thinkingCollapsed?: boolean
}

// ----------------------------------------------------------------
// useAiChat — deep module: ~300 lines of implementation behind 5 methods
// ----------------------------------------------------------------

export function useAiChat() {
  const messages = ref<ChatMessage[]>([])
  const streaming = ref(false)
  const currentRole = ref<string>('financial_assistant')
  const currentProvider = ref<string>('deepseek')
  const conversations = ref<AiConversation[]>([])
  const currentConversationId = ref<string>('default')

  let abortController: AbortController | null = null
  let msgIdCounter = 0

  function nextMsgId(): string {
    msgIdCounter++
    return `msg-${Date.now()}-${msgIdCounter}`
  }

  // ---- SSE stream parsing ----

  function parseSSEStream(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    decoder: TextDecoder,
    onEvent: (event: SSEEvent) => void
  ): Promise<void> {
    return new Promise<void>(async (resolve, reject) => {
      let buffer = ''
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          let currentData = ''
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              currentData += line.slice(6)
            } else if (line === '' && currentData) {
              try {
                onEvent(JSON.parse(currentData))
              } catch { /* skip malformed JSON */ }
              currentData = ''
            }
          }
        }

        // Flush remaining
        if (buffer.startsWith('data: ')) {
          const remaining = buffer.slice(6).trim()
          if (remaining) {
            try {
              onEvent(JSON.parse(remaining))
            } catch { /* skip */ }
          }
        }
        resolve()
      } catch (err) {
        reject(err)
      }
    })
  }

  // ---- SSE event routing ----

  function createEventRouter(onChange: () => void) {
    const assistantMsgRef: { current: ChatMessage | null } = { current: null }

    // Insert tool cards right before the current turn's assistant.
    // If the current turn's assistant hasn't been created yet, append to the end.
    const insertBeforeAssistant = (msg: ChatMessage) => {
      if (assistantMsgRef.current) {
        const asstIdx = messages.value.findIndex(m => m.id === assistantMsgRef.current!.id)
        if (asstIdx >= 0) {
          messages.value.splice(asstIdx, 0, msg)
          return
        }
      }
      messages.value.push(msg)
    }

    const ensureAssistant = (): ChatMessage => {
      let msg = assistantMsgRef.current
        ? messages.value.find(m => m.id === assistantMsgRef.current!.id)
        : undefined
      if (!msg) {
        msg = {
          id: nextMsgId(),
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          streaming: true,
          thinkingCollapsed: false,
        }
        // Assistant always goes at the end
        messages.value.push(msg)
        assistantMsgRef.current = msg
      }
      return msg
    }

    const findLastUndoneTool = (toolName: string): ChatMessage | null => {
      for (let i = messages.value.length - 1; i >= 0; i--) {
        const msg = messages.value[i]
        if (msg && msg.role === 'tool' && msg.toolName === toolName && !msg.toolDone) {
          return msg
        }
      }
      return null
    }

    const handleEvent = (event: SSEEvent) => {
      switch (event.type) {
        case 'thinking_start': {
          const msg = ensureAssistant()
          msg.thinkingActive = true
          msg.thinkingCollapsed = false
          onChange()
          break
        }

        case 'thinking_delta': {
          const msg = ensureAssistant()
          msg.thinkingActive = true
          msg.thinkingContent = (msg.thinkingContent || '') + (event.delta || '')
          msg.thinkingCollapsed = false
          onChange()
          break
        }

        case 'thinking_done': {
          const msg = assistantMsgRef.current
            ? messages.value.find(m => m.id === assistantMsgRef.current!.id)
            : undefined
          if (msg) {
            msg.thinkingActive = false
          }
          break
        }

        case 'text_delta': {
          const msg = ensureAssistant()
          msg.content += event.delta || ''
          onChange()
          break
        }

        case 'tool_call': {
          const toolMsg: ChatMessage = {
            id: nextMsgId(),
            role: 'tool',
            content: '',
            toolName: event.tool || '',
            toolArgs: event.args || {},
            toolDone: false,
            timestamp: Date.now(),
          }
          // Insert before assistant so tool cards always appear above the reply
          insertBeforeAssistant(toolMsg)
          onChange()
          break
        }

        case 'tool_result': {
          const toolMsg = findLastUndoneTool(event.tool || '')
          if (toolMsg) {
            toolMsg.toolDone = true
            toolMsg.toolResult = event.summary || ''
            toolMsg.toolDetail = event.detail || null
          }
          onChange()
          break
        }

        case 'done':
          if (assistantMsgRef.current) {
            const msg = messages.value.find(m => m.id === assistantMsgRef.current!.id)
            if (msg) msg.tokens = event.total_tokens
          }
          break

        case 'error': {
          const msg = ensureAssistant()
          msg.content += event.message || event.error || '未知错误'
          onChange()
          break
        }
      }
    }

    const finalize = () => {
      const assistantMsg = assistantMsgRef.current
        ? messages.value.find(m => m.id === assistantMsgRef.current!.id)
        : undefined
      if (assistantMsg) {
        assistantMsg.streaming = false
        assistantMsg.thinkingActive = false
        assistantMsg.thinkingCollapsed = true
      }
    }

    return { handleEvent, finalize }
  }

  // ---- Public API ----

  async function send(text: string, ledgerId: string, ledgerName: string, apiBaseUrl: string, onChange: () => void): Promise<void> {
    if (streaming.value) return

    // Add user message
    const userMsg: ChatMessage = {
      id: nextMsgId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }
    messages.value.push(userMsg)
    streaming.value = true

    abortController = new AbortController()
    const { handleEvent, finalize } = createEventRouter(onChange)

    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, ledger_id: ledgerId, ledger_name: ledgerName, role: currentRole.value, provider: currentProvider.value, conversation_id: currentConversationId.value }),
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
      await parseSSEStream(reader, decoder, handleEvent)
    } catch (err) {
      const errName = (err as { name?: string } | null)?.name
      if (errName === 'AbortError') {
        // Add stop marker to assistant message
        const lastAssistant = [...messages.value].reverse().find(m => m.role === 'assistant')
        if (lastAssistant) {
          lastAssistant.content += ' [已停止]'
        }
      } else {
        const lastAssistant = [...messages.value].reverse().find(m => m.role === 'assistant')
        const errorMsg = getErrorMessage(err) || '请求失败'
        if (!lastAssistant) {
          messages.value.push({
            id: nextMsgId(),
            role: 'assistant',
            content: `错误: ${errorMsg}`,
            timestamp: Date.now(),
          })
        } else if (!lastAssistant.content) {
          lastAssistant.content = `错误: ${errorMsg}`
        } else {
          lastAssistant.content += `\n\n[错误: ${errorMsg}]`
        }
        console.error('AI chat error:', err)
      }
      onChange()
    } finally {
      streaming.value = false
      abortController = null
      finalize()
      onChange()
    }
  }

  function stop() {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
  }

  async function loadHistory(): Promise<void> {
    try {
      const apiMessages = await aiApi.getMessages(currentRole.value, currentConversationId.value)
      if (!apiMessages || apiMessages.length === 0) return

      messages.value = apiMessages
        // 过滤掉上下文摘要消息（role=summary，不展示给用户）
        .filter((m: AiMessageApi) => m.role !== 'summary')
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
    } catch {
      // non-critical: show empty state
    }
  }

  async function clear(): Promise<void> {
    messages.value = []
    try {
      await aiApi.clearMessages(currentRole.value, currentConversationId.value)
    } catch {
      // non-critical
    }
  }

  // ---- Conversation management ----

  async function loadConversations(): Promise<void> {
    try {
      conversations.value = await aiApi.listConversations(currentRole.value)
    } catch {
      conversations.value = []
    }
  }

  async function createConversation(): Promise<void> {
    try {
      const conv = await aiApi.createConversation(currentRole.value)
      conversations.value.unshift(conv)
      currentConversationId.value = conv.id
      messages.value = []
      loadHistory()
    } catch {
      // non-critical
    }
  }

  async function switchConversation(id: string): Promise<void> {
    if (currentConversationId.value === id) return
    currentConversationId.value = id
    messages.value = []
    await loadHistory()
  }

  async function deleteConversation(id: string): Promise<void> {
    try {
      await aiApi.deleteConversation(id)
      conversations.value = conversations.value.filter(c => c.id !== id)
      if (currentConversationId.value === id) {
        // 删除当前会话后回到默认会话
        currentConversationId.value = 'default'
        messages.value = []
        await loadConversations()
        await loadHistory()
      }
    } catch {
      // non-critical
    }
  }

  function switchRole(role: string) {
    if (currentRole.value === role) return
    currentRole.value = role
    messages.value = []
    currentConversationId.value = 'default'
    loadConversations()
    loadHistory()
  }

  function cleanup() {
    if (abortController) {
      abortController.abort()
    }
  }

  return {
    messages, streaming, currentRole, currentProvider,
    conversations, currentConversationId,
    send, stop, loadHistory, clear, cleanup, switchRole,
    loadConversations, createConversation, switchConversation, deleteConversation,
  }
}
