package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/sirupsen/logrus"

	"github.com/transactions/ai/provider"
	"github.com/transactions/ai/role"
	"github.com/transactions/ai/tool"
	"github.com/transactions/dao"
	"github.com/transactions/models"
	"github.com/transactions/workspace"
)

const (
	// MaxToolCallRounds 限制单次对话中模型连续调用工具的最大轮数，
	// 防止模型陷入工具调用死循环（如反复查询同一数据）。
	MaxToolCallRounds  = 12
	MaxHistoryMessages = 50
)

type SSEEvent struct {
	Type      string         `json:"type"`
	Delta     string         `json:"delta,omitempty"`
	Tool      string         `json:"tool,omitempty"`
	Args      map[string]any `json:"args,omitempty"`
	Summary   string         `json:"summary,omitempty"`
	Detail    any            `json:"detail,omitempty"`
	TokenUsed int            `json:"total_tokens,omitempty"`
	Message   string         `json:"message,omitempty"`
}

type ChatService struct {
	apiConfigDao    dao.AiApiConfigDao
	configDao       dao.AiConfigDao
	messageDao      dao.AiMessageDao
	conversationDao dao.AiConversationDao
	registry        *tool.ToolRegistry
	roleRegistry    *role.Registry
}

func NewChatService(apiConfigDao dao.AiApiConfigDao, configDao dao.AiConfigDao, messageDao dao.AiMessageDao, conversationDao dao.AiConversationDao, registry *tool.ToolRegistry, roleRegistry *role.Registry) *ChatService {
	return &ChatService{
		apiConfigDao:    apiConfigDao,
		configDao:       configDao,
		messageDao:      messageDao,
		conversationDao: conversationDao,
		registry:        registry,
		roleRegistry:    roleRegistry,
	}
}

// Chat 执行一次对话（默认会话），返回 SSE 事件 channel。
// ws 用于数据库访问，ledgerName 注入到工具执行 context 中，也用于替换系统提示词中的占位符。
func (s *ChatService) Chat(ctx context.Context, ws *workspace.Workspace, roleName string, providerName string, ledgerName string, userMessage string) (<-chan SSEEvent, error) {
	return s.ChatWithConversation(ctx, ws, roleName, providerName, ledgerName, "default", userMessage)
}

// ChatWithConversation 执行一次对话，消息归属于指定会话（conversationID）。
// 加载历史时会先应用上下文压缩：超窗口的最旧消息被摘要替代，避免长对话上下文膨胀。
func (s *ChatService) ChatWithConversation(ctx context.Context, ws *workspace.Workspace, roleName string, providerName string, ledgerName string, conversationID string, userMessage string) (<-chan SSEEvent, error) {
	// 带工具执行 workspace 和 ledgerName 的 context
	toolCtx := tool.WithWorkspace(ctx, ws)
	toolCtx = tool.WithLedgerName(toolCtx, ledgerName)

	// 获取角色定义
	roleDef, ok := s.roleRegistry.Get(roleName)
	if !ok {
		return nil, fmt.Errorf("未知角色: %s", roleName)
	}

	// 构建角色工具名称集合
	roleToolNames := make(map[string]bool)
	for _, name := range roleDef.ToolNames() {
		roleToolNames[name] = true
	}

	// 加载 API 连接配置 — 按供应商名称查询
	if providerName == "" {
		providerName = "deepseek"
	}
	apiConfig, err := s.apiConfigDao.Get(ws, providerName)
	if err != nil {
		return nil, fmt.Errorf("AI API 配置未找到，请先在设置中配置供应商「%s」", providerName)
	}

	// 加载角色配置 — 获取系统提示词
	roleConfig, _ := s.configDao.Get(ws, roleName)
	var systemPrompt string
	if roleConfig != nil {
		systemPrompt = roleConfig.SystemPrompt
	}

	// 选择 provider
	var llmProvider provider.LLMProvider
	switch apiConfig.Endpoint {
	case "/v1/messages":
		llmProvider = provider.NewAnthropicProvider(apiConfig.BaseURL, apiConfig.APIKey, apiConfig.Model)
	case "/chat/completions":
		llmProvider = provider.NewOpenAIProvider(apiConfig.BaseURL, apiConfig.APIKey, apiConfig.Model)
	default:
		return nil, fmt.Errorf("不支持的端点: %s", apiConfig.Endpoint)
	}

	// 加载历史（含摘要过滤：有摘要消息时从摘要起取，避免旧历史撑爆上下文）。
	// 多取一些以便压缩触发判断（历史窗口 50，预取 70，超出后压缩最旧一批）。
	history, err := s.messageDao.ListRecentFiltered(ws, conversationID, roleName, MaxHistoryMessages+20)
	if err != nil {
		return nil, fmt.Errorf("加载对话历史失败: %w", err)
	}

	// 上下文压缩：若非摘要消息超出窗口，将最旧的一批压缩为摘要消息（失败不阻塞）
	summary, err := s.compressHistory(ctx, ws, llmProvider, conversationID, roleName, history)
	if err != nil {
		logrus.Warnf("上下文压缩失败（忽略继续）: %v", err)
	}

	// 构建消息；摘要消息对 LLM 以 system 前缀呈现
	messages := make([]provider.ChatMessage, 0, len(history)+1)
	if summary != "" {
		// 本轮刚生成的新摘要注入一次；历史中的旧摘要不再重复注入
		messages = append(messages, provider.ChatMessage{
			Role:    "system",
			Content: "以下是更早对话的摘要，供你保持上下文：\n" + summary,
		})
	}
	for _, h := range history {
		if h.MsgRole == dao.AiSummaryRole {
			// 历史里已有的摘要消息同样以 system 呈现（ListRecentFiltered 会包含它）
			// 若本轮已生成新摘要则跳过旧的，避免重复
			if summary != "" {
				continue
			}
			messages = append(messages, provider.ChatMessage{
				Role:    "system",
				Content: "以下是更早对话的摘要，供你保持上下文：\n" + h.Content,
			})
			continue
		}
		msg := provider.ChatMessage{
			Role:       h.MsgRole,
			Content:    h.Content,
			ToolCallID: h.ToolCallID,
		}
		if h.ToolCalls != "" {
			var tcs []provider.ToolCall
			json.Unmarshal([]byte(h.ToolCalls), &tcs)
			msg.ToolCalls = tcs
		}
		messages = append(messages, msg)
	}

	messages = filterOrphanedToolResults(messages)

	messages = append(messages, provider.ChatMessage{Role: "user", Content: userMessage})

	// 保存用户消息
	userMsg := &models.AiMessage{
		ID:             uuid.NewString(),
		ConversationID: conversationID,
		MsgRole:        "user",
		AiRole:         roleName,
		Content:        userMessage,
	}
	_ = s.messageDao.Save(ws, userMsg) // 忽略保存错误，不中断对话

	ch := make(chan SSEEvent, 64)

	go func() {
		defer close(ch)
		// 对话结束后更新会话活跃时间（用于会话列表排序）
		defer func() {
			if conversationID != "" {
				if err := s.conversationDao.Touch(ws, conversationID); err != nil {
					logrus.Warnf("更新会话活跃时间失败: %v", err)
				}
			}
		}()

		// send 在 ctx 取消（客户端断开）时立即返回，避免向已无人消费的 channel 写入而永久阻塞泄漏
		send := func(ev SSEEvent) bool {
			select {
			case ch <- ev:
				return true
			case <-ctx.Done():
				return false
			}
		}

		round := 0
		for round < MaxToolCallRounds {
			round++
			select {
			case <-ctx.Done():
				return
			default:
			}

			// Use stored system prompt if configured, otherwise fall back to role default
			prompt := systemPrompt
			if prompt == "" {
				prompt = roleDef.DefaultSystemPrompt()
			}
			// Replace placeholders with actual values
			prompt = replacePlaceholders(prompt, ledgerName)

			req := provider.ChatRequest{
				SystemPrompt:    prompt,
				Messages:        messages,
				Tools:           s.toolDefsForRole(roleToolNames),
				ThinkingEnabled: thinkingEnabledFor(apiConfig.Endpoint, apiConfig.Thinking),
			}

			eventCh, err := llmProvider.ChatStream(ctx, req)
			if err != nil {
				send(SSEEvent{Type: "error", Message: fmt.Sprintf("调用 AI 失败: %v", err)})
				return
			}

			var assistantContent string
			var thinkingContent string
			var toolCalls []provider.ToolCall
			gotToolCalls := false

			for event := range eventCh {
				switch event.Type {
				case "text_delta":
					assistantContent += event.Delta
					if !send(SSEEvent{Type: "text_delta", Delta: event.Delta}) {
						return
					}
				case "thinking_delta":
					thinkingContent += event.Delta
					if !send(SSEEvent{Type: "thinking_delta", Delta: event.Delta}) {
						return
					}
				case "thinking_start":
					if !send(SSEEvent{Type: "thinking_start"}) {
						return
					}
				case "thinking_done":
					if !send(SSEEvent{Type: "thinking_done"}) {
						return
					}
				case "tool_call":
					gotToolCalls = true
					toolCalls = append(toolCalls, event.ToolCalls...)
					for _, tc := range event.ToolCalls {
						if !send(SSEEvent{Type: "tool_call", Tool: tc.Name, Args: tc.Arguments}) {
							return
						}
					}
				case "error":
					send(SSEEvent{Type: "error", Message: event.Error.Error()})
					return
				case "done":
					// fall through
				}
			}

			// 如果 AI 没有调用工具，直接结束
			if !gotToolCalls || len(toolCalls) == 0 {
				if assistantContent != "" || thinkingContent != "" {
					s.saveMessage(ws, &models.AiMessage{
						ID:             uuid.NewString(),
						ConversationID: conversationID,
						MsgRole:        "assistant",
						AiRole:         roleName,
						Content:        assistantContent,
						Thinking:       thinkingContent,
					})
				}
				send(SSEEvent{Type: "done"})
				return
			}

			// 有工具调用：持久化中间 assistant 消息
			// 供历史加载时 LLM 上下文使用（前端会过滤掉不展示，但保留其思考行）。
			tcsJSON, _ := json.Marshal(toolCalls)
			s.saveMessage(ws, &models.AiMessage{
				ID:             uuid.NewString(),
				ConversationID: conversationID,
				MsgRole:        "assistant",
				AiRole:         roleName,
				Content:        assistantContent,
				Thinking:       thinkingContent,
				ToolCalls:      string(tcsJSON),
			})
			messages = append(messages, provider.ChatMessage{
				Role:      "assistant",
				Content:   assistantContent,
				ToolCalls: toolCalls,
			})

			// 执行工具
			for _, tc := range toolCalls {
				t, ok := s.registry.Get(tc.Name)
				if !ok {
					errMsg := fmt.Sprintf("工具 %s 不存在", tc.Name)
					if !send(SSEEvent{Type: "tool_result", Tool: tc.Name, Summary: errMsg}) {
						return
					}
					messages = append(messages, provider.ChatMessage{
						Role:       "tool",
						Content:    errMsg,
						ToolCallID: tc.ID,
					})
					s.saveMessage(ws, &models.AiMessage{
						ID:             uuid.NewString(),
						ConversationID: conversationID,
						MsgRole:        "tool",
						AiRole:         roleName,
						Content:        errMsg,
						ToolCallID:     tc.ID,
						ToolName:       tc.Name,
					})
					continue
				}

				// 执行工具；结果注入前剪枝，避免超大结果撑爆上下文
				prunedResult, err := t.Execute(toolCtx, tc.Arguments)
				if err != nil {
					logrus.Errorf("工具 %s 执行失败: %v", tc.Name, err)
					prunedResult = fmt.Sprintf("工具执行出错: %v", err)
				}
				prunedResult = pruneToolResult(prunedResult)

				// 生成摘要
				summary := summarizeResult(tc.Name, prunedResult)

				if !send(SSEEvent{Type: "tool_result", Tool: tc.Name, Summary: summary, Detail: json.RawMessage(prunedResult)}) {
					return
				}

				messages = append(messages, provider.ChatMessage{
					Role:       "tool",
					Content:    prunedResult,
					ToolCallID: tc.ID,
				})

				s.saveMessage(ws, &models.AiMessage{
					ID:             uuid.NewString(),
					ConversationID: conversationID,
					MsgRole:        "tool",
					AiRole:         roleName,
					Content:        prunedResult,
					ToolCallID:     tc.ID,
					ToolName:       tc.Name,
				})
			}
		}

		// 超过最大轮次（模型仍在调用工具），强制结束并告警
		logrus.Warnf("AI 工具调用达到最大轮数 %d, 强制结束对话", MaxToolCallRounds)
		send(SSEEvent{Type: "done"})
	}()

	return ch, nil
}

func (s *ChatService) saveMessage(ws *workspace.Workspace, msg *models.AiMessage) {
	if err := s.messageDao.Save(ws, msg); err != nil {
		logrus.Errorf("保存 AI 消息失败: %v", err)
	}
}

// compressHistory 在非摘要消息数超过窗口上限时，将最旧的一批消息压缩为一条摘要消息。
// 压缩结果写入数据库（role=summary），返回摘要文本供本次请求注入；失败返回空串不阻塞对话。
// 依赖传入的 history 来自 ListRecentFiltered：其包含已有摘要消息（若有）与之后的全部消息。
func (s *ChatService) compressHistory(ctx context.Context, ws *workspace.Workspace, llmProvider provider.LLMProvider, conversationID string, roleName string, history []*models.AiMessage) (string, error) {
	// 统计非摘要消息
	var realMsgs []*models.AiMessage
	for _, h := range history {
		if h.MsgRole != dao.AiSummaryRole {
			realMsgs = append(realMsgs, h)
		}
	}
	if len(realMsgs) <= MaxHistoryMessages {
		return "", nil // 未超窗口，无需压缩
	}

	// 取最旧的一批（ListRecentFiltered 升序，头部即最旧）
	const compressBatch = 20
	if len(realMsgs) > compressBatch {
		realMsgs = realMsgs[:compressBatch]
	}

	// 拼接待压缩内容
	var sb strings.Builder
	for _, m := range realMsgs {
		role := m.MsgRole
		if role == "tool" {
			role = "工具结果"
		}
		sb.WriteString(fmt.Sprintf("[%s] %s\n", role, truncateString(m.Content)))
	}
	prompt := "请用中文总结以下对话历史的关键信息，保留用户询问过的话题、结论与重要数据，控制在 200 字以内：\n\n" + sb.String()

	summary, err := s.generateSummary(ctx, llmProvider, prompt)
	if err != nil {
		return "", err
	}
	if summary == "" {
		return "", nil
	}

	// 删除旧摘要，写入新摘要（每会话最多保留一条）
	_ = s.messageDao.DeleteSummary(ws, conversationID, roleName)
	_ = s.messageDao.Save(ws, &models.AiMessage{
		ID:             uuid.NewString(),
		ConversationID: conversationID,
		AiRole:         roleName,
		MsgRole:        dao.AiSummaryRole,
		Content:        summary,
	})
	return summary, nil
}

// generateSummary 调用 LLM 生成一段文本摘要（非流式收集，一次性请求）。
func (s *ChatService) generateSummary(ctx context.Context, llmProvider provider.LLMProvider, prompt string) (string, error) {
	req := provider.ChatRequest{
		Messages: []provider.ChatMessage{{Role: "user", Content: prompt}},
	}
	eventCh, err := llmProvider.ChatStream(ctx, req)
	if err != nil {
		return "", err
	}
	var sb strings.Builder
	for event := range eventCh {
		switch event.Type {
		case "text_delta":
			sb.WriteString(event.Delta)
		case "error":
			if event.Error != nil {
				return "", event.Error
			}
		}
	}
	return strings.TrimSpace(sb.String()), nil
}

// maxToolResultLen 工具结果注入 LLM 上下文前的最大长度；超出部分截断，避免撑爆上下文。
const maxToolResultLen = 8000

// pruneToolResult 截断过大的工具结果，保留头部并附截断提示。
func pruneToolResult(result string) string {
	if len(result) <= maxToolResultLen {
		return result
	}
	return result[:maxToolResultLen] + "\n\n（工具结果过长，已截断）"
}

func filterOrphanedToolResults(messages []provider.ChatMessage) []provider.ChatMessage {
	knownToolUseIDs := make(map[string]bool)
	for _, m := range messages {
		for _, tc := range m.ToolCalls {
			knownToolUseIDs[tc.ID] = true
		}
	}
	filtered := messages[:0]
	for _, m := range messages {
		if m.Role == "tool" && m.ToolCallID != "" && !knownToolUseIDs[m.ToolCallID] {
			continue
		}
		filtered = append(filtered, m)
	}
	return filtered
}

// summarizeResult 根据工具名称生成结果摘要。
// 自动检测 JSON 是对象还是数组，分别处理。
func summarizeResult(toolName, result string) string {
	switch toolName {
	case "query_transactions":
		var data map[string]any
		if err := json.Unmarshal([]byte(result), &data); err != nil {
			return truncateString(result)
		}
		if total, ok := data["total"].(float64); ok {
			count := int64(total)
			summary := fmt.Sprintf("找到 %d 条交易记录", count)
			if stats, ok := data["trStatistics"].(map[string]any); ok {
				for k, v := range stats {
					if vf, ok := v.(float64); ok {
						summary += fmt.Sprintf(" · %s: ¥%.2f", k, vf/100)
					}
				}
			}
			return summary
		}
	case "list_ledgers":
		var arr []any
		if err := json.Unmarshal([]byte(result), &arr); err != nil {
			return truncateString(result)
		}
		return fmt.Sprintf("共 %d 个账本", len(arr))
	case "list_categories":
		var arr []any
		if err := json.Unmarshal([]byte(result), &arr); err != nil {
			return truncateString(result)
		}
		return fmt.Sprintf("共 %d 个分类", len(arr))
	case "list_tags":
		var arr []any
		if err := json.Unmarshal([]byte(result), &arr); err != nil {
			return truncateString(result)
		}
		return fmt.Sprintf("共 %d 个标签", len(arr))
	case "get_key_events":
		var arr []any
		if err := json.Unmarshal([]byte(result), &arr); err != nil {
			return truncateString(result)
		}
		return fmt.Sprintf("共 %d 个关键事件", len(arr))
	case "query_diary":
		var arr []any
		if err := json.Unmarshal([]byte(result), &arr); err != nil {
			return "查询完成"
		}
		return fmt.Sprintf("找到 %d 篇日记", len(arr))
	case "write_diary":
		return "日记已保存"
	}
	return "查询完成"
}

func truncateString(s string) string {
	if len(s) > 100 {
		return s[:100] + "..."
	}
	return s
}

// toolDefsForRole filters the tool registry definitions to only include tools in the role's allowed set.
func (s *ChatService) toolDefsForRole(roleToolNames map[string]bool) []provider.ToolDef {
	allDefs := s.registry.ToDefs()
	filtered := make([]provider.ToolDef, 0, len(roleToolNames))
	for _, def := range allDefs {
		if roleToolNames[def.Name] {
			filtered = append(filtered, def)
		}
	}
	return filtered
}

// thinkingEnabledFor 将配置的思考模式翻译为 provider 请求参数开关。
// anthropic 端点：auto/enabled → 发送 thinking:{type:"enabled"}（维持现状）；disabled → 省略该字段。
// openai 兼容端点：enabled → 发送 thinking:{type:"enabled"}（DeepSeek V3.x chat 模型需要显式开启）；
// auto/disabled → 不发送参数（deepseek-reasoner 等模型会自动思考，返回的 reasoning_content 仍会被解析展示）。
func thinkingEnabledFor(endpoint, thinking string) bool {
	switch thinking {
	case "enabled":
		return true
	case "disabled":
		return false
	default: // "auto" 或未知值
		return endpoint == "/v1/messages"
	}
}

// replacePlaceholders 替换系统提示词中的占位符为实际值。
// 当前支持的占位符：{{CURRENT_LEDGER}} → 当前账本名称。
func replacePlaceholders(prompt string, ledgerName string) string {
	prompt = strings.ReplaceAll(prompt, "{{CURRENT_LEDGER}}", ledgerName)
	return prompt
}

// ToolInfo holds tool metadata for API responses.
type ToolInfo struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"input_schema"`
}

// RoleTools returns tools available to the given role.
func (s *ChatService) RoleTools(roleName string) ([]ToolInfo, bool) {
	roleDef, ok := s.roleRegistry.Get(roleName)
	if !ok {
		return nil, false
	}
	var result []ToolInfo
	for _, name := range roleDef.ToolNames() {
		if t, ok := s.registry.Get(name); ok {
			result = append(result, ToolInfo{
				Name:        t.Name(),
				Description: t.Description(),
				InputSchema: t.InputSchema(),
			})
		}
	}
	return result, true
}
