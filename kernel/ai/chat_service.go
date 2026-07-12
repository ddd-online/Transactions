package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/sirupsen/logrus"

	"github.com/billadm/ai/provider"
	"github.com/billadm/ai/tool"
	"github.com/billadm/dao"
	"github.com/billadm/models"
	"github.com/billadm/workspace"
)

const (
	DefaultSystemPrompt = `你是 Transactions 个人财务助手的 AI 助手。你可以访问用户的财务数据来回答问题。

工具约束：
- **金额单位**：所有金额的单位是以分为单位的整数
- **当前账本**：{{CURRENT_LEDGER}}

你的职责：
- 帮助用户查询和分析交易记录（支出、收入、转账）
- 提供账本信息
- 回答关于分类和标签的问题
- 查询关键事件（人生里程碑）

你的原则：
- 没有用户说明时，仅处理当前账本而不是所有账本
- 所有数据来自用户自己的数据库，你看到的都是真实数据
- 如果数据不足以回答问题，诚实告知用户
- 金额单位是人民币元（¥），回答时保持 2 位小数
- 回答简洁但完整，少用Emoji。先给出结论，再展示细节
- 当用户的问题模糊时，用工具搜索数据后再回答，不要猜测`

	MaxToolCallRounds  = 50
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
	configDao  dao.AiConfigDao
	messageDao dao.AiMessageDao
	registry   *tool.ToolRegistry
}

func NewChatService(configDao dao.AiConfigDao, messageDao dao.AiMessageDao, registry *tool.ToolRegistry) *ChatService {
	return &ChatService{
		configDao:  configDao,
		messageDao: messageDao,
		registry:   registry,
	}
}

// Chat 执行一次对话，返回 SSE 事件 channel。
// ws 用于数据库访问，ledgerName 注入到工具执行 context 中，也用于替换系统提示词中的占位符。
func (s *ChatService) Chat(ctx context.Context, ws *workspace.Workspace, ledgerName string, userMessage string) (<-chan SSEEvent, error) {
	// 带工具执行 workspace 和 ledgerName 的 context
	toolCtx := tool.WithWorkspace(ctx, ws)
	toolCtx = tool.WithLedgerName(toolCtx, ledgerName)

	// 加载配置
	config, err := s.configDao.Get(ws)
	if err != nil {
		return nil, fmt.Errorf("AI 配置未找到，请先在设置中配置: %w", err)
	}
	if config.BaseURL == "" || config.APIKey == "" || config.Model == "" || config.Endpoint == "" {
		return nil, fmt.Errorf("AI 配置不完整，请先在设置中配置 Base URL、端点、API Key 和模型")
	}

	// 选择 provider
	var llmProvider provider.LLMProvider
	switch config.Endpoint {
	case "/v1/messages":
		llmProvider = provider.NewAnthropicProvider(config.BaseURL, config.APIKey, config.Model)
	case "/chat/completions":
		llmProvider = provider.NewOpenAIProvider(config.BaseURL, config.APIKey, config.Model)
	default:
		return nil, fmt.Errorf("不支持的端点: %s", config.Endpoint)
	}

	// 加载历史
	history, err := s.messageDao.ListRecent(ws, "default", MaxHistoryMessages)
	if err != nil {
		return nil, fmt.Errorf("加载对话历史失败: %w", err)
	}

	// 构建消息
	messages := make([]provider.ChatMessage, 0, len(history)+1)
	for _, h := range history {
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
	messages = append(messages, provider.ChatMessage{Role: "user", Content: userMessage})

	// 保存用户消息
	userMsg := &models.AiMessage{
		ID:             uuid.NewString(),
		ConversationID: "default",
		MsgRole:        "user",
		Content:        userMessage,
	}
	_ = s.messageDao.Save(ws, userMsg) // 忽略保存错误，不中断对话

	ch := make(chan SSEEvent, 64)

	go func() {
		defer close(ch)

		round := 0
		for round < MaxToolCallRounds {
			round++
			select {
			case <-ctx.Done():
				return
			default:
			}

			// Use stored system prompt if configured, otherwise fall back to default
			prompt := config.SystemPrompt
			if prompt == "" {
				prompt = DefaultSystemPrompt
			}
			// Replace placeholders with actual values
			prompt = replacePlaceholders(prompt, ledgerName)

			req := provider.ChatRequest{
				SystemPrompt: prompt,
				Messages:     messages,
				Tools:        s.registry.ToDefs(),
			}

			eventCh, err := llmProvider.ChatStream(ctx, req)
			if err != nil {
				ch <- SSEEvent{Type: "error", Message: fmt.Sprintf("调用 AI 失败: %v", err)}
				return
			}

			var assistantContent string
			var toolCalls []provider.ToolCall
			gotToolCalls := false

			for event := range eventCh {
				switch event.Type {
				case "text_delta":
					assistantContent += event.Delta
					ch <- SSEEvent{Type: "text_delta", Delta: event.Delta}
				case "thinking_delta":
					ch <- SSEEvent{Type: "thinking_delta", Delta: event.Delta}
				case "thinking_start":
					ch <- SSEEvent{Type: "thinking_start"}
				case "thinking_done":
					ch <- SSEEvent{Type: "thinking_done"}
				case "tool_call":
					gotToolCalls = true
					toolCalls = append(toolCalls, event.ToolCalls...)
					for _, tc := range event.ToolCalls {
						ch <- SSEEvent{Type: "tool_call", Tool: tc.Name, Args: tc.Arguments}
					}
				case "error":
					ch <- SSEEvent{Type: "error", Message: event.Error.Error()}
					return
				case "done":
					// fall through
				}
			}

			// 如果 AI 没有调用工具，直接结束
			if !gotToolCalls || len(toolCalls) == 0 {
				if assistantContent != "" {
					s.saveMessage(ws, &models.AiMessage{
						ID:             uuid.NewString(),
						ConversationID: "default",
						MsgRole:        "assistant",
						Content:        assistantContent,
					})
				}
				ch <- SSEEvent{Type: "done"}
				return
			}

			// 有工具调用：持久化中间 assistant 消息
			// 供历史加载时 LLM 上下文使用（前端会过滤掉不展示）。
			tcsJSON, _ := json.Marshal(toolCalls)
			s.saveMessage(ws, &models.AiMessage{
				ID:             uuid.NewString(),
				ConversationID: "default",
				MsgRole:        "assistant",
				Content:        assistantContent,
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
					ch <- SSEEvent{Type: "tool_result", Tool: tc.Name, Summary: errMsg}
					messages = append(messages, provider.ChatMessage{
						Role:       "tool",
						Content:    errMsg,
						ToolCallID: tc.ID,
					})
					s.saveMessage(ws, &models.AiMessage{
						ID:             uuid.NewString(),
						ConversationID: "default",
						MsgRole:        "tool",
						Content:        errMsg,
						ToolCallID:     tc.ID,
						ToolName:       tc.Name,
					})
					continue
				}

				result, err := t.Execute(toolCtx, tc.Arguments)
				if err != nil {
					logrus.Errorf("工具 %s 执行失败: %v", tc.Name, err)
					result = fmt.Sprintf("工具执行出错: %v", err)
				}

				// 生成摘要
				summary := summarizeResult(tc.Name, result)

				ch <- SSEEvent{Type: "tool_result", Tool: tc.Name, Summary: summary, Detail: json.RawMessage(result)}

				messages = append(messages, provider.ChatMessage{
					Role:       "tool",
					Content:    result,
					ToolCallID: tc.ID,
				})

				s.saveMessage(ws, &models.AiMessage{
					ID:             uuid.NewString(),
					ConversationID: "default",
					MsgRole:        "tool",
					Content:        result,
					ToolCallID:     tc.ID,
					ToolName:       tc.Name,
				})
			}
		}

		// 超过最大轮次
		ch <- SSEEvent{Type: "done"}
	}()

	return ch, nil
}

func (s *ChatService) saveMessage(ws *workspace.Workspace, msg *models.AiMessage) {
	if err := s.messageDao.Save(ws, msg); err != nil {
		logrus.Errorf("保存 AI 消息失败: %v", err)
	}
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
	}
	return "查询完成"
}

func truncateString(s string) string {
	if len(s) > 100 {
		return s[:100] + "..."
	}
	return s
}

// replacePlaceholders 替换系统提示词中的占位符为实际值。
// 当前支持的占位符：{{CURRENT_LEDGER}} → 当前账本名称。
func replacePlaceholders(prompt string, ledgerName string) string {
	prompt = strings.ReplaceAll(prompt, "{{CURRENT_LEDGER}}", ledgerName)
	return prompt
}
