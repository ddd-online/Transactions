# AI 多角色系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现多角色 AI 助手系统，支持财务助手和日记助手之间切换，每个角色拥有独立的系统提示词、工具集和对话历史。

**Architecture:** 新增 `kernel/ai/role/` 角色注册表包，每个角色自描述（Name + DisplayName + DefaultSystemPrompt + ToolFactories）。ChatService 通过 roleRegistry 获取角色定义，向 LLM 发送该角色对应的工具列表。`ai_config` 表和 `ai_message` 表各加 `role` 字段实现角色级数据隔离。

**Tech Stack:** Go 1.21+ (Gin + GORM/SQLite), Vue 3 + TypeScript (Ant Design Vue + Pinia)

## Global Constraints

- Money is always integer cents — `centsToYuan(cents)` for display, `yuanToCents(str)` for input
- Components are auto-imported — no manual imports for Ant Design Vue or custom components
- Go backend has no hot reload — must restart `go run main.go` after changes
- Use existing patterns: `ws.GetDb()` for DB access, `json.Marshal` for tool results
- DAO interfaces: use constructor pattern `NewXxxDao()`, interface + impl + `var _ XxxDao = &xxxImpl{}`
- Tool pattern: struct + `Name()` `Description()` `InputSchema()` `Execute(ctx, args)` methods
- Keep `DefaultSystemPrompt` constant for backward compatibility; `financial_assistant` role delegates to it

---

### Task 1: 数据模型 — 添加 role 字段并注册 AutoMigrate

**Files:**
- Modify: `kernel/models/ai_config.go:1-17`
- Modify: `kernel/models/ai_message.go:1-16`
- Modify: `kernel/util/database.go:21-33`

**Interfaces:**
- Produces: `AiConfig.Role` (new TEXT field), `AiMessage.Role` (new TEXT field)

- [ ] **Step 1: 在 AiConfig 模型中添加 Role 字段**

```go
// kernel/models/ai_config.go
type AiConfig struct {
	ID           int64  `gorm:"primaryKey;autoIncrement" json:"id"`
	Role         string `gorm:"type:text;not null;default:'financial_assistant'" json:"role"`
	BaseURL      string `gorm:"type:text;not null;default:''" json:"base_url"`
	Endpoint     string `gorm:"type:text;not null;default:''" json:"endpoint"`
	APIKey       string `gorm:"type:text;not null;default:''" json:"api_key"`
	Model        string `gorm:"type:text;not null;default:''" json:"model"`
	SystemPrompt string `gorm:"type:text;not null;default:''" json:"system_prompt"`
	Provider     string `gorm:"type:text;not null;default:''" json:"provider"`
	CreatedAt    int64  `gorm:"autoCreateTime:milli" json:"created_at"`
	UpdatedAt    int64  `gorm:"autoUpdateTime:milli" json:"updated_at"`
}
```

- [ ] **Step 2: 在 AiMessage 模型中添加 Role 字段**

```go
// kernel/models/ai_message.go
type AiMessage struct {
	ID             string `gorm:"primaryKey;type:text" json:"id"`
	ConversationID string `gorm:"type:text;not null;default:'default';index:idx_conv_created,priority:1" json:"conversation_id"`
	AiRole         string `gorm:"column:ai_role;type:text;not null;default:'financial_assistant'" json:"ai_role"`
	MsgRole        string `gorm:"column:role;type:text;not null" json:"role"`
	Content        string `gorm:"type:text;not null;default:''" json:"content"`
	ToolCalls      string `gorm:"type:text" json:"tool_calls,omitempty"`
	ToolCallID     string `gorm:"type:text" json:"tool_call_id,omitempty"`
	ToolName       string `gorm:"type:text" json:"tool_name,omitempty"`
	CreatedAt      int64  `gorm:"autoCreateTime:milli;index:idx_conv_created,priority:2" json:"created_at"`
}
```

**命名说明：**
- `AiRole`（Go 字段） → DB 列 `ai_role`（新增），存 AI 角色名；JSON key `"ai_role"`
- `MsgRole`（Go 字段） → DB 列 `role`（保留已有列），存消息角色 user/assistant/tool；JSON key `"role"`
- 前端解析 `m.role` 仍为消息角色，完全向后兼容

- [ ] **Step 3: 将 AiConfig 和 AiMessage 加入 AutoMigrate 列表**

```go
// kernel/util/database.go — add to AutoMigrate list
if err := db.AutoMigrate(
	&models.Ledger{},
	&models.TransactionRecord{},
	&models.TrTag{},
	&models.Category{},
	&models.Tag{},
	&models.TransactionTemplate{},
	&models.Chart{},
	&models.KeyEvent{},
	&models.KeyEventImage{},
	&models.DiaryEntry{},
	&models.AiConfig{},   // ADD
	&models.AiMessage{},  // ADD
); err != nil {
```

- [ ] **Step 4: 验证编译通过**

Run: `cd kernel && go build ./...`
Expected: 编译成功

- [ ] **Step 5: 验证测试通过**

Run: `cd kernel && go test ./...`
Expected: 所有测试通过

- [ ] **Step 6: Commit**

```bash
git add kernel/models/ai_config.go kernel/models/ai_message.go kernel/util/database.go
git commit -m "feat: add role field to ai_config and ai_message models"
```

---

### Task 2: DAO 层 — 支持角色参数

**Files:**
- Modify: `kernel/dao/ai_config_dao.go:1-42`
- Modify: `kernel/dao/ai_message_dao.go:1-47`

**Interfaces:**
- Consumes: `AiConfig.Role`, `AiMessage.Role` (from Task 1)
- Produces: `AiConfigDao.Get(ws, role)`, `AiConfigDao.Save(ws, config)` with role, `AiMessageDao.ListRecent(ws, conversationID, role, limit)`, `AiMessageDao.DeleteAll(ws, conversationID, role)`

- [ ] **Step 1: 更新 AiConfigDao 接口和实现**

`AiConfig.Role` 的 GORM 默认列名就是 `role`，与 `ai_config` 表已有的列名冲突（旧模型无 Role 字段，但新加的 Role 字段其 GORM 列名就是 `role`）。Go 结构体字段名是 `Role`，GORM 自动推断列名为 `role`，这正是我们需要的 DB 列名。

```go
// kernel/dao/ai_config_dao.go
type AiConfigDao interface {
	Get(ws *workspace.Workspace, role string) (*models.AiConfig, error)
	Save(ws *workspace.Workspace, config *models.AiConfig) error
}

func (d *aiConfigDaoImpl) Get(ws *workspace.Workspace, role string) (*models.AiConfig, error) {
	var config models.AiConfig
	err := ws.GetDb().Where("role = ?", role).First(&config).Error
	if err != nil {
		return nil, err
	}
	return &config, nil
}

func (d *aiConfigDaoImpl) Save(ws *workspace.Workspace, config *models.AiConfig) error {
	var existing models.AiConfig
	err := ws.GetDb().Where("role = ?", config.Role).First(&existing).Error
	if err != nil {
		config.ID = 1
		return ws.GetDb().Create(config).Error
	}
	config.ID = existing.ID
	return ws.GetDb().Model(&existing).Select("base_url", "endpoint", "api_key", "model", "system_prompt", "provider").Updates(config).Error
}
```

- [ ] **Step 2: 更新 AiMessageDao 接口和实现**

```go
// kernel/dao/ai_message_dao.go
type AiMessageDao interface {
	Save(ws *workspace.Workspace, msg *models.AiMessage) error
	ListRecent(ws *workspace.Workspace, conversationID string, aiRole string, limit int) ([]*models.AiMessage, error)
	DeleteAll(ws *workspace.Workspace, conversationID string, aiRole string) error
}

func (d *aiMessageDaoImpl) ListRecent(ws *workspace.Workspace, conversationID string, aiRole string, limit int) ([]*models.AiMessage, error) {
	var msgs []*models.AiMessage
	err := ws.GetDb().
		Where("conversation_id = ? AND ai_role = ?", conversationID, aiRole).
		Order("created_at DESC").
		Limit(limit).
		Find(&msgs).Error
	if err != nil {
		return nil, err
	}
	for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
		msgs[i], msgs[j] = msgs[j], msgs[i]
	}
	return msgs, nil
}

func (d *aiMessageDaoImpl) DeleteAll(ws *workspace.Workspace, conversationID string, aiRole string) error {
	return ws.GetDb().
		Where("conversation_id = ? AND ai_role = ?", conversationID, aiRole).
		Delete(&models.AiMessage{}).Error
}
```

- [ ] **Step 3: 验证编译**

Run: `cd kernel && go build ./...`
Expected: 编译失败 — ChatService 和其他调用方仍使用旧签名，预期行为（将在后续任务修复）

- [ ] **Step 4: Commit**

```bash
git add kernel/dao/ai_config_dao.go kernel/dao/ai_message_dao.go
git commit -m "feat: add role parameter to ai_config_dao and ai_message_dao"
```

---

### Task 3: 日记工具 — query_diary 和 write_diary

**Files:**
- Modify: `kernel/ai/tool/tools.go` (追加两个工具实现)

**Interfaces:**
- Consumes: `service.DiaryService` (existing: ListDates, GetByDate, Upsert)
- Produces: `NewQueryDiaryTool(diarySvc)`, `NewWriteDiaryTool(diarySvc)` both returning `Tool`

- [ ] **Step 1: 添加 query_diary 工具**

在 `kernel/ai/tool/tools.go` 文件末尾追加：

```go
// ---- 8. query_diary ----

type queryDiaryTool struct {
	diarySvc service.DiaryService
}

func NewQueryDiaryTool(diarySvc service.DiaryService) Tool {
	return &queryDiaryTool{diarySvc: diarySvc}
}

func (t *queryDiaryTool) Name() string        { return "query_diary" }
func (t *queryDiaryTool) Description() string { return "查询日记。可按日期、关键词、年份、心情查询。不传参数返回最近日记日期列表。" }

func (t *queryDiaryTool) InputSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"date":    map[string]any{"type": "string", "description": "具体日期 YYYY-MM-DD"},
			"keyword": map[string]any{"type": "string", "description": "关键词搜索（匹配正文内容）"},
			"year":    map[string]any{"type": "integer", "description": "年份，如 2026"},
			"mood":    map[string]any{"type": "string", "description": "心情筛选"},
		},
	}
}

func (t *queryDiaryTool) Execute(ctx context.Context, args map[string]any) (string, error) {
	ws, err := getWS(ctx)
	if err != nil {
		return "", err
	}

	// 按具体日期查询
	if date := getStringArg(args, "date"); date != "" {
		entry, err := t.diarySvc.GetByDate(ws, date)
		if err != nil {
			return "", err
		}
		b, _ := json.Marshal(entry)
		return string(b), nil
	}

	// 列出有日记的日期（用于概览）
	items, err := t.diarySvc.ListDates(ws)
	if err != nil {
		return "", err
	}

	// 关键词筛选（需要加载内容匹配）
	if keyword := getStringArg(args, "keyword"); keyword != "" {
		var filtered []models.DiaryDateItem
		for _, item := range items {
			entry, err := t.diarySvc.GetByDate(ws, item.Date)
			if err != nil {
				continue
			}
			if strings.Contains(entry.Content, keyword) {
				filtered = append(filtered, item)
			}
		}
		items = filtered
	}

	// 年份筛选
	if year := getIntArg(args, "year", 0); year > 0 {
		var filtered []models.DiaryDateItem
		for _, item := range items {
			if strings.HasPrefix(item.Date, fmt.Sprintf("%d-", year)) {
				filtered = append(filtered, item)
			}
		}
		items = filtered
	}

	// 心情筛选
	if mood := getStringArg(args, "mood"); mood != "" {
		var filtered []models.DiaryDateItem
		for _, item := range items {
			if item.Mood == mood {
				filtered = append(filtered, item)
			}
		}
		items = filtered
	}

	b, _ := json.Marshal(items)
	return string(b), nil
}
```

需要在 tools.go 顶部新增 import:
```go
import (
	// ... existing imports ...
	"strings"
	"github.com/billadm/models"
)
```

- [ ] **Step 2: 添加 write_diary 工具**

继续追加：

```go
// ---- 9. write_diary ----

type writeDiaryTool struct {
	diarySvc service.DiaryService
}

func NewWriteDiaryTool(diarySvc service.DiaryService) Tool {
	return &writeDiaryTool{diarySvc: diarySvc}
}

func (t *writeDiaryTool) Name() string        { return "write_diary" }
func (t *writeDiaryTool) Description() string { return "创建或更新指定日期的日记。如果该日期已有日记则覆盖内容。" }

func (t *writeDiaryTool) InputSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"date":    map[string]any{"type": "string", "description": "日期 YYYY-MM-DD（必填）"},
			"content": map[string]any{"type": "string", "description": "日记正文，支持 Markdown（必填）"},
			"mood":    map[string]any{"type": "string", "description": "心情标记，可选值: happy/sad/neutral/excited/anxious/calm/grateful/tired"},
		},
		"required": []string{"date", "content"},
	}
}

func (t *writeDiaryTool) Execute(ctx context.Context, args map[string]any) (string, error) {
	ws, err := getWS(ctx)
	if err != nil {
		return "", err
	}
	date := getStringArg(args, "date")
	content := getStringArg(args, "content")
	mood := getStringArg(args, "mood")

	entry, err := t.diarySvc.Upsert(ws, date, content, mood)
	if err != nil {
		return "", err
	}
	b, _ := json.Marshal(map[string]any{
		"date":      entry.Date,
		"word_count": entry.WordCount,
		"mood":      entry.Mood,
		"message":   "日记已保存",
	})
	return string(b), nil
}
```

- [ ] **Step 3: 添加 summarizeResult 对 query_diary 和 write_diary 的支持**

在 chat_service.go 的 `summarizeResult` 函数中添加：

```go
case "query_diary":
	var arr []any
	if err := json.Unmarshal([]byte(result), &arr); err != nil {
		// 可能是单个 DiaryEntry（按日期查询结果）
		return "查询完成"
	}
	return fmt.Sprintf("找到 %d 篇日记", len(arr))
case "write_diary":
	return "日记已保存"
```

- [ ] **Step 4: 在 wire.go 中注册新工具**

```go
// kernel/server/wire.go — after existing tool registrations
aiToolRegistry.Register(tool.NewQueryDiaryTool(diarySvc))
aiToolRegistry.Register(tool.NewWriteDiaryTool(diarySvc))
```

- [ ] **Step 5: 验证编译和测试**

Run: `cd kernel && go build ./... && go test ./...`
Expected: 编译通过，测试通过

- [ ] **Step 6: Commit**

```bash
git add kernel/ai/tool/tools.go kernel/ai/chat_service.go kernel/server/wire.go
git commit -m "feat: add query_diary and write_diary AI tools"
```

---

### Task 4: 角色注册表 — `kernel/ai/role/` 包

**Files:**
- Create: `kernel/ai/role/role.go`
- Create: `kernel/ai/role/finance_role.go`
- Create: `kernel/ai/role/diary_role.go`

**Interfaces:**
- Consumes: `service.DiaryService` (for diary_role), `tool.ToolFactory` concept
- Produces: `role.Role` interface, `role.Registry`, `role.NewFinanceRole()`, `role.NewDiaryRole(diarySvc)`

- [ ] **Step 1: 创建 `kernel/ai/role/role.go`**

```go
package role

import "github.com/billadm/ai/tool"

type ToolFactory func() tool.Tool

type Role interface {
	Name() string
	DisplayName() string
	DefaultSystemPrompt() string
	ToolFactories() []ToolFactory
}

type Registry struct {
	roles map[string]Role
}

func NewRegistry() *Registry {
	return &Registry{roles: make(map[string]Role)}
}

func (r *Registry) Register(role Role) {
	r.roles[role.Name()] = role
}

func (r *Registry) Get(name string) (Role, bool) {
	role, ok := r.roles[name]
	return role, ok
}

func (r *Registry) List() []Role {
	list := make([]Role, 0, len(r.roles))
	for _, role := range r.roles {
		list = append(list, role)
	}
	return list
}
```

- [ ] **Step 2: 创建 `kernel/ai/role/finance_role.go`**

```go
package role

import "github.com/billadm/ai/tool"

type financeRole struct{}

func NewFinanceRole() Role { return &financeRole{} }

func (r *financeRole) Name() string               { return "financial_assistant" }
func (r *financeRole) DisplayName() string         { return "财务助手" }

func (r *financeRole) DefaultSystemPrompt() string {
	return `你是 Transactions 个人财务助手的 AI 助手。你可以访问用户的财务数据来回答问题。

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
}

func (r *financeRole) ToolFactories() []ToolFactory {
	return []ToolFactory{
		func() tool.Tool { panic("finance_role: ToolFactory not set up — wire in advance") },
	}
}
```

For the finance role ToolFactories, we'll set them up in wire.go by factory injection. Actually, a simpler approach: define them as package-level factories.

Better approach — use `ToolFactories` that wire.go fills in:

```go
// Revised finance_role.go — simpler: factories set in wire.go
type financeRole struct {
	factories []ToolFactory
}

func NewFinanceRole(factories []ToolFactory) Role {
	return &financeRole{factories: factories}
}
```

Actually, let me simplify even further. Since we're registering tools into the global ToolRegistry in wire.go, and the role just needs to know WHICH tool names belong to it, we can use tool names instead of factories:

```go
type Role interface {
	Name() string
	DisplayName() string
	DefaultSystemPrompt() string
	ToolNames() []string  // list of tool.Name() that belong to this role
}
```

This is much simpler. The Role says "I own these tool names", and ChatService filters the ToolRegistry.ToDefs() by the role's tool names. The ToolFactories approach was over-engineered.

Let me redesign.

- [ ] **Step 1 revised: 创建 `kernel/ai/role/role.go`** (with ToolNames() approach)

```go
package role

type Role interface {
	Name() string
	DisplayName() string
	DefaultSystemPrompt() string
	ToolNames() []string
}

type Registry struct {
	roles map[string]Role
}

func NewRegistry() *Registry {
	return &Registry{roles: make(map[string]Role)}
}

func (r *Registry) Register(role Role) {
	r.roles[role.Name()] = role
}

func (r *Registry) Get(name string) (Role, bool) {
	role, ok := r.roles[name]
	return role, ok
}

func (r *Registry) List() []Role {
	list := make([]Role, 0, len(r.roles))
	for _, role := range r.roles {
		list = append(list, role)
	}
	return list
}
```

- [ ] **Step 2 revised: 创建 `kernel/ai/role/finance_role.go`**

```go
package role

type financeRole struct{}

func NewFinanceRole() Role { return &financeRole{} }

func (r *financeRole) Name() string       { return "financial_assistant" }
func (r *financeRole) DisplayName() string { return "财务助手" }

func (r *financeRole) DefaultSystemPrompt() string {
	return `你是 Transactions 个人财务助手的 AI 助手。你可以访问用户的财务数据来回答问题。

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
}

func (r *financeRole) ToolNames() []string {
	return []string{
		"query_transactions",
		"list_ledgers",
		"list_categories",
		"list_tags",
		"get_key_events",
		"get_time",
		"calculate",
	}
}
```

- [ ] **Step 3 revised: 创建 `kernel/ai/role/diary_role.go`**

```go
package role

type diaryRole struct{}

func NewDiaryRole() Role { return &diaryRole{} }

func (r *diaryRole) Name() string       { return "diary_assistant" }
func (r *diaryRole) DisplayName() string { return "日记助手" }

func (r *diaryRole) DefaultSystemPrompt() string {
	return `你是 Transactions 个人日记助手的 AI 助手。你可以访问用户的日记数据。

你的职责：
- 帮助用户查询和回顾过往日记
- 帮助用户撰写、润色或补写日记
- 根据用户的日记内容提供生活洞察

你的原则：
- 尊重用户隐私，日记是非常私人的内容
- 回答简洁但完整，先给出结论再展示细节
- 当用户想要写日记时，先确认内容再保存
- 如果数据不足以回答问题，诚实告知用户
- 避免使用 Emoji`
}

func (r *diaryRole) ToolNames() []string {
	return []string{
		"query_diary",
		"write_diary",
		"get_time",
	}
}
```

- [ ] **Step 4: 验证编译**

Run: `cd kernel && go build ./...`
Expected: 编译通过（此包无外部依赖，独立编译）

- [ ] **Step 5: Commit**

```bash
git add kernel/ai/role/
git commit -m "feat: add role registry with finance and diary roles"
```

---

### Task 5: ChatService 改造 — 支持角色参数

**Files:**
- Modify: `kernel/ai/chat_service.go:1-345`
- Modify: `kernel/server/wire.go:28-42`

**Interfaces:**
- Consumes: `role.Registry`, updated `dao.AiConfigDao.Get(ws, role)`, updated `dao.AiMessageDao.ListRecent(ws, convID, role, limit)`
- Produces: `ChatService.Chat(ctx, ws, roleName, ledgerName, userMessage)` with role param

- [ ] **Step 1: 更新 ChatService 结构体和构造函数**

```go
// kernel/ai/chat_service.go
import (
	// ... existing imports ...
	"github.com/billadm/ai/role"
)

type ChatService struct {
	configDao   dao.AiConfigDao
	messageDao  dao.AiMessageDao
	registry    *tool.ToolRegistry
	roleRegistry *role.Registry   // ADD
}

func NewChatService(
	configDao dao.AiConfigDao,
	messageDao dao.AiMessageDao,
	registry *tool.ToolRegistry,
	roleRegistry *role.Registry,  // ADD
) *ChatService {
	return &ChatService{
		configDao:   configDao,
		messageDao:  messageDao,
		registry:    registry,
		roleRegistry: roleRegistry,
	}
}
```

- [ ] **Step 2: 更新 Chat 方法 — 添加 roleName 参数，按角色加载配置/历史/工具**

```go
func (s *ChatService) Chat(ctx context.Context, ws *workspace.Workspace, roleName string, ledgerName string, userMessage string) (<-chan SSEEvent, error) {
	toolCtx := tool.WithWorkspace(ctx, ws)
	toolCtx = tool.WithLedgerName(toolCtx, ledgerName)

	// 获取角色定义
	roleDef, ok := s.roleRegistry.Get(roleName)
	if !ok {
		return nil, fmt.Errorf("未知角色: %s", roleName)
	}

	// 按角色加载配置
	config, err := s.configDao.Get(ws, roleName)
	if err != nil {
		return nil, fmt.Errorf("%s 的 AI 配置未找到，请先在设置中配置: %w", roleDef.DisplayName(), err)
	}
	if config.BaseURL == "" || config.APIKey == "" || config.Model == "" || config.Endpoint == "" {
		return nil, fmt.Errorf("%s 的 AI 配置不完整", roleDef.DisplayName())
	}

	// ... provider selection (unchanged) ...
	var llmProvider provider.LLMProvider
	switch config.Endpoint {
	case "/v1/messages":
		llmProvider = provider.NewAnthropicProvider(config.BaseURL, config.APIKey, config.Model)
	case "/chat/completions":
		llmProvider = provider.NewOpenAIProvider(config.BaseURL, config.APIKey, config.Model)
	default:
		return nil, fmt.Errorf("不支持的端点: %s", config.Endpoint)
	}

	// 按角色加载历史
	history, err := s.messageDao.ListRecent(ws, "default", roleName, MaxHistoryMessages)
	if err != nil {
		return nil, fmt.Errorf("加载对话历史失败: %w", err)
	}

	// 构建角色工具名称集合（快速查找）
	roleToolNames := make(map[string]bool)
	for _, name := range roleDef.ToolNames() {
		roleToolNames[name] = true
	}

	// 构建消息（不变）
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

	// 保存用户消息（带 role）
	userMsg := &models.AiMessage{
		ID:             uuid.NewString(),
		ConversationID: "default",
		MsgRole:        "user",
		AiRole:         roleName,
		Content:        userMessage,
	}
	_ = s.messageDao.Save(ws, userMsg)

	ch := make(chan SSEEvent, 64)

	go func() {
		defer close(ch)

		round := 0
		for round < MaxToolCallRounds {
			// ... same loop ...
			round++
			select {
			case <-ctx.Done():
				return
			default:
			}

			// 使用角色定义的系统提示词
			prompt := config.SystemPrompt
			if prompt == "" {
				prompt = roleDef.DefaultSystemPrompt()
			}
			prompt = replacePlaceholders(prompt, ledgerName)

			// 过滤该角色的工具
			toolDefs := s.toolDefsForRole(roleToolNames)

			req := provider.ChatRequest{
				SystemPrompt: prompt,
				Messages:     messages,
				Tools:        toolDefs,
			}

			// ... streaming, tool call execution same as before ...
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
				// ... same event handling ...
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
				}
			}

			if !gotToolCalls || len(toolCalls) == 0 {
				if assistantContent != "" {
					s.saveMessage(ws, &models.AiMessage{
						ID:             uuid.NewString(),
						ConversationID: "default",
						MsgRole:        "assistant",
						AiRole:         roleName,
						Content:        assistantContent,
					})
				}
				ch <- SSEEvent{Type: "done"}
				return
			}

			tcsJSON, _ := json.Marshal(toolCalls)
			s.saveMessage(ws, &models.AiMessage{
				ID:             uuid.NewString(),
				ConversationID: "default",
				MsgRole:        "assistant",
				AiRole:         roleName,
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
				t, tok := s.registry.Get(tc.Name)
				if !tok {
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
						MsgRole:    "tool",
						AiRole:           roleName,
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
					MsgRole:    "tool",
					AiRole:         roleName,
					Content:        result,
					ToolCallID:     tc.ID,
					ToolName:       tc.Name,
				})
			}
		}

		ch <- SSEEvent{Type: "done"}
	}()

	return ch, nil
}
```

- [ ] **Step 3: 添加 toolDefsForRole 辅助方法**

```go
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
```

- [ ] **Step 4: 更新 wire.go — 初始化 RoleRegistry 并注入 ChatService**

```go
// kernel/server/wire.go
import (
	// ... existing imports ...
	"github.com/billadm/ai/role"
)

func InitServices() *api.Handlers {
	// ... existing service init ...
	
	// ---- AI module ----
	aiConfigDao := dao.NewAiConfigDao()
	aiMessageDao := dao.NewAiMessageDao()
	aiToolRegistry := tool.NewToolRegistry()

	// Register ALL tools (both roles)
	aiToolRegistry.Register(tool.NewQueryTransactionsTool(trSvc, ledgerSvc))
	aiToolRegistry.Register(tool.NewListLedgersTool(ledgerSvc))
	aiToolRegistry.Register(tool.NewListCategoriesTool(categorySvc, ledgerSvc))
	aiToolRegistry.Register(tool.NewListTagsTool(tagSvc, ledgerSvc))
	aiToolRegistry.Register(tool.NewGetKeyEventsTool(keyEventSvc, ledgerSvc))
	aiToolRegistry.Register(tool.NewGetTimeTool())
	aiToolRegistry.Register(tool.NewCalculateTool())
	aiToolRegistry.Register(tool.NewQueryDiaryTool(diarySvc))
	aiToolRegistry.Register(tool.NewWriteDiaryTool(diarySvc))

	// Role registry
	roleRegistry := role.NewRegistry()
	roleRegistry.Register(role.NewFinanceRole())
	roleRegistry.Register(role.NewDiaryRole())

	aiChatService := ai.NewChatService(aiConfigDao, aiMessageDao, aiToolRegistry, roleRegistry)

	return &api.Handlers{
		// ... existing fields ...
	}
}
```

- [ ] **Step 5: 验证编译**

Run: `cd kernel && go build ./...`
Expected: 编译通过（还有一些调用方需要更新，如 ai_api.go）

- [ ] **Step 6: Commit**

```bash
git add kernel/ai/chat_service.go kernel/server/wire.go
git commit -m "feat: integrate role registry into ChatService"
```

---

### Task 6: API 层 — 更新端点和新增角色列表接口

**Files:**
- Modify: `kernel/api/ai_api.go:1-58`
- Modify: `kernel/api/ai_config_api.go:1-143`
- Modify: `kernel/api/router.go:105-115`
- Modify: `kernel/api/handlers.go` (add RoleRegistry field if needed)

**Interfaces:**
- Consumes: `ChatService.Chat(ctx, ws, roleName, ledgerName, message)`, updated DAO signatures
- Produces: Updated SSE chat endpoint, config by role, messages by role, GET /api/v1/ai/roles

- [ ] **Step 1: 更新 chat 端点**

```go
// kernel/api/ai_api.go
func (h *Handlers) aiChat(c *gin.Context) {
	if h.ChatService == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "chat service not initialized"})
		return
	}

	var req struct {
		Message    string `json:"message"`
		LedgerName string `json:"ledger_name"`
		Role       string `json:"role"`  // ADD
	}
	if err := c.BindJSON(&req); err != nil || req.Message == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "message is required"})
		return
	}
	if len(req.Message) > 4000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "消息过长，最多 4000 字符"})
		return
	}
	if req.Role == "" {
		req.Role = "financial_assistant"  // backward compat
	}

	ws := ws(c)

	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.WriteHeader(http.StatusOK)

	eventCh, err := h.ChatService.Chat(c.Request.Context(), ws, req.Role, req.LedgerName, req.Message)
	// ... rest unchanged ...
}
```

- [ ] **Step 2: 更新 config 端点按角色读写**

```go
// kernel/api/ai_config_api.go

// GET /api/v1/ai/config?role=xxx
func (h *Handlers) getAiConfig(c *gin.Context) (any, error) {
	role := c.Query("role")
	if role == "" {
		role = "financial_assistant"
	}
	config, err := h.AiConfigDao.Get(ws(c), role)
	if err != nil {
		config = &models.AiConfig{}
	}
	systemPrompt := config.SystemPrompt
	if systemPrompt == "" {
		systemPrompt = ai.DefaultSystemPrompt  // keep for backward compat
	}
	return gin.H{
		"role":          role,
		"base_url":      config.BaseURL,
		"endpoint":      config.Endpoint,
		"model":         config.Model,
		"has_key":       config.APIKey != "",
		"system_prompt": systemPrompt,
		"provider":      config.Provider,
	}, nil
}

// PUT /api/v1/ai/config
func (h *Handlers) updateAiConfig(c *gin.Context) (any, error) {
	var req struct {
		Role         string `json:"role"`
		BaseURL      string `json:"base_url"`
		Endpoint     string `json:"endpoint"`
		APIKey       string `json:"api_key"`
		Model        string `json:"model"`
		SystemPrompt string `json:"system_prompt"`
		Provider     string `json:"provider"`
	}
	if err := c.BindJSON(&req); err != nil {
		return nil, fmt.Errorf("invalid request: %w", err)
	}
	if req.Role == "" {
		req.Role = "financial_assistant"
	}

	config := &models.AiConfig{
		Role:         req.Role,
		BaseURL:      req.BaseURL,
		Endpoint:     req.Endpoint,
		Model:        req.Model,
		SystemPrompt: req.SystemPrompt,
		Provider:     req.Provider,
	}
	if req.APIKey != "" {
		config.APIKey = req.APIKey
	} else {
		existing, err := h.AiConfigDao.Get(ws(c), req.Role)
		if err == nil {
			config.APIKey = existing.APIKey
		}
	}

	if err := h.AiConfigDao.Save(ws(c), config); err != nil {
		return nil, err
	}
	return nil, nil
}

// POST /api/v1/ai/config/test
func (h *Handlers) testAiConnection(c *gin.Context) (any, error) {
	var req struct {
		Role     string `json:"role"`
		BaseURL  string `json:"base_url"`
		Endpoint string `json:"endpoint"`
		APIKey   string `json:"api_key"`
		Model    string `json:"model"`
	}
	if err := c.BindJSON(&req); err != nil {
		return nil, fmt.Errorf("invalid request: %w", err)
	}
	if req.Role == "" {
		req.Role = "financial_assistant"
	}

	apiKey := req.APIKey
	if apiKey == "" {
		existing, err := h.AiConfigDao.Get(ws(c), req.Role)
		if err == nil {
			apiKey = existing.APIKey
		}
	}
	// ... provider creation and test call unchanged ...
```

For test connection, add `Role string` to the test request struct and default to "financial_assistant".

- [ ] **Step 3: 更新 messages 端点按角色过滤**

```go
// GET /api/v1/ai/messages?role=xxx
func (h *Handlers) listAiMessages(c *gin.Context) (any, error) {
	role := c.Query("role")
	if role == "" {
		role = "financial_assistant"
	}
	msgs, err := h.AiMessageDao.ListRecent(ws(c), "default", role, 30)
	if err != nil {
		return nil, err
	}
	if msgs == nil {
		msgs = make([]*models.AiMessage, 0)
	}
	return msgs, nil
}

// DELETE /api/v1/ai/messages?role=xxx
func (h *Handlers) clearAiMessages(c *gin.Context) (any, error) {
	role := c.Query("role")
	if role == "" {
		role = "financial_assistant"
	}
	if err := h.AiMessageDao.DeleteAll(ws(c), "default", role); err != nil {
		return nil, err
	}
	return nil, nil
}
```

- [ ] **Step 4: 添加角色列表端点**

在 `ai_config_api.go` 末尾追加：

```go
// GET /api/v1/ai/roles
func (h *Handlers) listRoles(c *gin.Context) (any, error) {
	roles := h.RoleRegistry.List()
	result := make([]gin.H, 0, len(roles))
	for _, r := range roles {
		result = append(result, gin.H{
			"name":         r.Name(),
			"display_name": r.DisplayName(),
		})
	}
	return result, nil
}
```

Handlers 结构体需要新增 `RoleRegistry *role.Registry` 字段。

- [ ] **Step 5: 更新 router.go — 添加 roles 路由**

```go
// kernel/api/router.go
ai := v1.Group("/ai")
{
	ai.POST("/chat", h.aiChat)
	ai.GET("/roles", Handle(h.listRoles))  // ADD
	ai.GET("/config", Handle(h.getAiConfig))
	ai.PUT("/config", Handle(h.updateAiConfig))
	ai.POST("/config/test", Handle(h.testAiConnection))
	ai.POST("/provider/fetch", Handle(h.fetchProvider))
	ai.GET("/messages", Handle(h.listAiMessages))
	ai.DELETE("/messages", Handle(h.clearAiMessages))
}
```

- [ ] **Step 6: 更新 handlers.go — 添加 RoleRegistry 字段**

```go
// kernel/api/handlers.go
import "github.com/billadm/ai/role"

type Handlers struct {
	// ... existing services ...
	
	// AI
	ChatService  *ai.ChatService
	AiConfigDao  dao.AiConfigDao
	AiMessageDao dao.AiMessageDao
	RoleRegistry *role.Registry  // ADD
}
```

- [ ] **Step 7: 更新 wire.go — 注入 RoleRegistry 到 Handlers**

```go
// kernel/server/wire.go — in the return statement
return &api.Handlers{
	// ... existing fields ...
	RoleRegistry: roleRegistry,  // ADD
}
```

- [ ] **Step 8: 验证编译和现有测试**

Run: `cd kernel && go build ./... && go test ./...`
Expected: 编译通过，所有测试通过

- [ ] **Step 9: Commit**

```bash
git add kernel/api/ai_api.go kernel/api/ai_config_api.go kernel/api/router.go kernel/api/handlers.go kernel/server/wire.go
git commit -m "feat: add role-based API endpoints and role list"
```

---

### Task 7: 前端 API 客户端 — 支持角色参数

**Files:**
- Modify: `app/src/backend/api/ai.ts:1-85`

**Interfaces:**
- Consumes: Updated backend API endpoints
- Produces: `fetchRoles()`, updated `getConfig(role)`, `updateConfig(config)`, `getMessages(role)`, `clearMessages(role)`

- [ ] **Step 1: 更新 ai.ts**

```typescript
// app/src/backend/api/ai.ts

export interface AiRole {
  name: string
  display_name: string
}

export const aiApi = {
  async fetchRoles(): Promise<AiRole[]> {
    return api.get('/v1/ai/roles', '获取角色列表')
  },

  async getConfig(role: string = 'financial_assistant'): Promise<AiConfigResponse> {
    return api.get(`/v1/ai/config?role=${encodeURIComponent(role)}`, '获取AI配置')
  },

  async updateConfig(config: AiConfig & { role?: string }): Promise<void> {
    const body = { ...config, role: config.role || 'financial_assistant' }
    return api.put('/v1/ai/config', body, '保存AI配置')
  },

  async testConnection(config: AiConfig & { role?: string }): Promise<void> {
    const body = { ...config, role: config.role || 'financial_assistant' }
    return api.post('/v1/ai/config/test', body, '测试连接')
  },

  async fetchProvider(action: 'balance' | 'models', apiKey?: string, provider?: string): Promise<any> {
    const body: ProviderFetchRequest = { action }
    if (apiKey) body.api_key = apiKey
    if (provider) body.provider = provider
    return api.post('/v1/ai/provider/fetch', body, '获取供应商信息')
  },

  async getMessages(role: string = 'financial_assistant'): Promise<AiMessage[]> {
    return api.get(`/v1/ai/messages?role=${encodeURIComponent(role)}`, '获取对话历史')
  },

  async clearMessages(role: string = 'financial_assistant'): Promise<void> {
    return api.delete(`/v1/ai/messages?role=${encodeURIComponent(role)}`, '清空对话')
  },
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/backend/api/ai.ts
git commit -m "feat: add role parameter to frontend AI API client"
```

---

### Task 8: useAiChat — 添加当前角色状态

**Files:**
- Modify: `app/src/hooks/useAiChat.ts:1-366`

**Interfaces:**
- Consumes: Updated `aiApi` methods, `AiChatView` component
- Produces: `currentRole` ref, updated `send()`, `loadHistory()`, `clear()`, `switchRole()`

- [ ] **Step 1: 添加 currentRole 状态和角色切换方法**

```typescript
// app/src/hooks/useAiChat.ts

export function useAiChat() {
  const messages = ref<ChatMessage[]>([])
  const streaming = ref(false)
  const currentRole = ref<string>('financial_assistant')  // ADD

  // ... existing let declarations ...

  async function send(text: string, ledgerId: string, ledgerName: string, apiBaseUrl: string, onChange: () => void): Promise<void> {
    if (streaming.value) return

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
        body: JSON.stringify({
          message: text,
          ledger_id: ledgerId,
          ledger_name: ledgerName,
          role: currentRole.value,  // ADD
        }),
        signal: abortController.signal,
      })
      // ... rest unchanged ...
    } catch (err: any) {
      // ... unchanged ...
    } finally {
      // ... unchanged ...
    }
  }

  // ... stop() unchanged ...

  async function loadHistory(): Promise<void> {
    try {
      const apiMessages = await aiApi.getMessages(currentRole.value)  // UPDATE
      if (!apiMessages || apiMessages.length === 0) return

      messages.value = apiMessages
        .filter((m: AiMessageApi) => !(m.role === 'assistant' && m.tool_calls))
        .map((m: AiMessageApi): ChatMessage => {
          // ... same mapping logic ...
          const base: ChatMessage = {
            id: m.id,
            role: m.role as ChatMessage['role'],  // message role (user/assistant/tool)
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
              try { base.toolDetail = JSON.parse(m.content) } catch { }
            }
          }
          return base
        })
    } catch {
      // non-critical
    }
  }

  async function clear(): Promise<void> {
    messages.value = []
    try {
      await aiApi.clearMessages(currentRole.value)  // UPDATE
    } catch {
      // non-critical
    }
  }

  function switchRole(role: string) {
    if (currentRole.value === role) return
    currentRole.value = role
    messages.value = []
    loadHistory()
  }

  // ... cleanup unchanged ...

  return { messages, streaming, currentRole, send, stop, loadHistory, clear, cleanup, switchRole }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/hooks/useAiChat.ts
git commit -m "feat: add currentRole state and switchRole to useAiChat"
```

---

### Task 9: AiChatView — 角色选择器和角色化 UI

**Files:**
- Modify: `app/src/components/ai_view/AiChatView.vue:1-836`

**Interfaces:**
- Consumes: `useAiChat().currentRole`, `useAiChat().switchRole()`, `aiApi.fetchRoles()`
- Produces: Role dropdown in header, role-specific welcome messages and example chips

- [ ] **Step 1: 添加角色列表获取和角色选择器**

```vue
<!-- app/src/components/ai_view/AiChatView.vue template changes -->

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { DeleteOutlined, SendOutlined, StopOutlined, CopyOutlined } from '@ant-design/icons-vue'
import { useLedgerStore } from '@/stores/ledgerStore'
import { renderMarkdown } from '@/utils/markdown'
import { message } from 'ant-design-vue'
import { useAiChat } from '@/hooks/useAiChat'
import { aiApi, type AiRole } from '@/backend/api/ai'  // ADD

const { messages, streaming, currentRole, send, stop, loadHistory, clear, cleanup, switchRole } = useAiChat()

// Role management
const availableRoles = ref<AiRole[]>([])
const rolesLoading = ref(false)

async function fetchRoles() {
  rolesLoading.value = true
  try {
    availableRoles.value = await aiApi.fetchRoles()
  } catch {
    // use defaults
    availableRoles.value = [
      { name: 'financial_assistant', display_name: '财务助手' },
      { name: 'diary_assistant', display_name: '日记助手' },
    ]
  } finally {
    rolesLoading.value = false
  }
}

function onRoleChange(role: string) {
  switchRole(role)
}

// Role-specific content
const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了'
  if (hour < 12) return '早上好'
  if (hour < 18) return '下午好'
  return '晚上好'
})

const roleHint = computed(() => {
  return currentRole.value === 'diary_assistant' ? '和日记助手聊聊…' : '询问你的财务数据'
})

const roleChips = computed(() => {
  if (currentRole.value === 'diary_assistant') {
    return ['今天写一篇日记', '帮我回顾这几天的心情', '上周日的日记写了什么']
  }
  return ['本月支出汇总', '和上月相比支出变化', '餐饮消费趋势']
})

const rolePlaceholder = computed(() => {
  return currentRole.value === 'diary_assistant'
    ? '输入你的问题...  (Enter 发送 / Shift+Enter 换行)'
    : '输入你的问题...  (Enter 发送 / Shift+Enter 换行)'
})

onMounted(() => {
  fetchRoles()
  loadHistory()
})

// ... rest unchanged ...
</script>
```

- [ ] **Step 2: 更新模板 — 角色选择器替换固定标题**

```vue
<template>
  <div class="ai-chat-view">
    <div class="chat-toolbar"></div>

    <div class="chat-card">
      <div class="chat-header">
        <div class="chat-header-left">
          <a-select
            v-model:value="currentRole"
            :options="availableRoles.map(r => ({ label: r.display_name, value: r.name }))"
            :loading="rolesLoading"
            class="chat-role-select"
            @change="onRoleChange"
            size="small"
            :bordered="false"
          />
        </div>
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
          <p class="chat-empty-hint">{{ roleHint }}</p>
          <div class="chat-empty-chips">
            <button
              v-for="chip in roleChips"
              :key="chip"
              class="chat-empty-chip"
              @click="fillAndSend(chip)"
            >{{ chip }}</button>
          </div>
        </div>
        <!-- ... rest unchanged ... -->
      </div>
      <!-- ... input area unchanged ... -->
    </div>
  </div>
</template>
```

- [ ] **Step 3: 添加角色选择器样式**

```css
.chat-header-left {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-sm);
}

.chat-role-select {
  font-family: var(--billadm-font-display);
  font-size: var(--billadm-size-text-title);
  font-weight: 500;
  color: var(--billadm-color-text-major);
  min-width: 120px;
}

.chat-role-select :deep(.ant-select-selection-item) {
  font-family: var(--billadm-font-display);
  font-size: var(--billadm-size-text-title);
  font-weight: 500;
  color: var(--billadm-color-text-major);
}
```

- [ ] **Step 4: Commit**

```bash
git add app/src/components/ai_view/AiChatView.vue
git commit -m "feat: add role selector and role-specific UI to AiChatView"
```

---

### Task 10: AiSetting — 角色标签页支持

**Files:**
- Modify: `app/src/components/settings_view/AiSetting.vue:1-546`

**Interfaces:**
- Consumes: Updated `aiApi.getConfig(role)`, `aiApi.updateConfig(config_with_role)`, `fetchRoles()`
- Produces: Role tabs in settings, per-role system prompt

- [ ] **Step 1: 添加角色标签页状态和逻辑**

```vue
<script lang="ts" setup>
import { ref, reactive, onMounted, watch } from 'vue'
import BilladmPageHeader from '@/components/common/BilladmPageHeader.vue'
import { aiApi, type AiConfig, type AiRole, type BalanceResponse, type ModelsResponse } from '@/backend/api/ai'
import NotificationUtil from '@/backend/notification'

// ... existing provider/endpoint options ...

// Role tabs
const availableRoles = ref<AiRole[]>([])
const currentRole = ref<string>('financial_assistant')

const form = reactive<FormState>({
  provider: '',
  base_url: '',
  endpoint: '/v1/messages',
  api_key: '',
  model: '',
  system_prompt: '',
  has_key: false,
})

// ... existing state ...

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

async function handleSave() {
  saving.value = true
  try {
    const keyToSave = keyPlaceholder.value ? '' : form.api_key
    await aiApi.updateConfig({
      role: currentRole.value,  // ADD
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
    fetchDeepSeekResources()
  } catch (e: any) {
    NotificationUtil.error('保存失败', e.message)
  } finally {
    saving.value = false
  }
}

async function handleTestConnection() {
  testing.value = true
  try {
    await aiApi.testConnection({
      role: currentRole.value,  // ADD
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

function onRoleTabChange(role: string) {
  currentRole.value = role
  loadConfig()
}

// Watch for role changes
watch(currentRole, () => {
  loadConfig()
})

onMounted(() => {
  fetchRoles()
  loadConfig()
})
</script>
```

- [ ] **Step 2: 更新模板 — 添加角色标签页**

```vue
<template>
  <div class="ai-setting">
    <BilladmPageHeader title="AI 助手" />

    <div class="setting-list">
      <!-- Role Tabs -->
      <div class="setting-card">
        <div class="setting-info">
          <span class="setting-title">角色</span>
          <span class="setting-desc">为不同角色配置独立的系统提示词</span>
        </div>
        <div class="setting-action">
          <a-radio-group
            v-model:value="currentRole"
            button-style="solid"
            size="small"
            @change="(e: any) => onRoleTabChange(e.target.value)"
          >
            <a-radio-button
              v-for="r in availableRoles"
              :key="r.name"
              :value="r.name"
            >{{ r.display_name }}</a-radio-button>
          </a-radio-group>
        </div>
      </div>

      <!-- 供应商 (shared config — see note below) -->
      <!-- ... same supplier/endpoint/base_url/api_key/model cards ... -->

      <!-- 系统提示词 (per-role) -->
      <div class="setting-card setting-card-vertical">
        <div class="setting-header-row">
          <div class="setting-info">
            <span class="setting-title">系统提示词 — {{ availableRoles.find(r => r.name === currentRole)?.display_name || currentRole }}</span>
            <span class="setting-desc">自定义 AI 助手的行为和回答风格。留空则使用默认提示词</span>
          </div>
          <a-button size="small" @click="resetSystemPrompt">恢复默认</a-button>
        </div>
        <div class="setting-action setting-action-full">
          <a-textarea
            v-model:value="form.system_prompt"
            :rows="6"
            :maxlength="4000"
            show-count
            placeholder="留空使用默认提示词"
            style="width: 100%; font-family: var(--billadm-font-mono); font-size: var(--billadm-size-text-body-sm)"
          />
          <div class="placeholder-hint" v-if="currentRole === 'financial_assistant'">
            支持占位符：<code v-pre>{{CURRENT_LEDGER}}</code> = 当前选中的账本名称
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
```

- [ ] **Step 3: Commit**

```bash
git add app/src/components/settings_view/AiSetting.vue
git commit -m "feat: add role tabs to AiSetting for per-role system prompt"
```

---

### Task 11: 端到端验证 — 编译 + 测试 + 手动检查

**Files:** (none — verification only)

- [ ] **Step 1: Go 后端编译和测试**

Run: `cd kernel && go build ./... && go vet ./... && go test ./...`
Expected: 编译通过，vet 无警告，所有测试通过

- [ ] **Step 2: 前端类型检查**

Run: `cd app && npx vue-tsc -b`
Expected: 无类型错误

- [ ] **Step 3: 启动全栈验证角色切换流程**

启动三个终端：
1. `cd kernel && go run main.go`
2. `cd app && npm run dev`
3. `cd electron && npm run dev`

验证流程：
- 打开 AI 助手页面，确认角色选择器显示"财务助手"
- 确认空状态显示财务相关的示例问题
- 切换到"日记助手"
- 确认空状态显示日记相关的示例问题
- 在日记助手下发一条测试消息
- 确认 AI 可以调用 query_diary 或 write_diary 工具
- 切换到财务助手，确认对话历史切换为财务助手的历史
- 打开设置 → AI 助手，确认角色标签页可用
- 切换标签页，确认系统提示词独立加载

- [ ] **Step 4: 修复发现的问题并 commit**

```bash
git add -A
git commit -m "fix: e2e verification fixes for role system"
```

---

### Task 12: 规范文档更新

**Files:**
- Modify: `.wolf/anatomy.md`
- Modify: `.wolf/cerebrum.md`
- Append: `.wolf/memory.md`

- [ ] **Step 1: 更新 anatomy.md**

新增条目：
```
kernel/ai/role/role.go        | Role interface + Registry (角色注册表) | ~40 行
kernel/ai/role/finance_role.go | 财务助手角色定义 | ~50 行
kernel/ai/role/diary_role.go   | 日记助手角色定义 | ~40 行
```

更新已有条目以反映签名变化。

- [ ] **Step 2: 更新 cerebrum.md**

在 `## Key Learnings` 添加：
- AI 角色系统通过 `kernel/ai/role/` 包实现角色注册表模式
- 每个角色定义 Name + DisplayName + DefaultSystemPrompt + ToolNames
- 工具在全局 ToolRegistry 注册，ChatService 按角色 ToolNames 过滤后发给 LLM

- [ ] **Step 3: 追加 memory.md**

```
| HH:MM | AI 多角色系统实现完成 | 财务助手 + 日记助手切换 | 成功 | ~8000 |
```

- [ ] **Step 4: Commit**

```bash
git add .wolf/anatomy.md .wolf/cerebrum.md .wolf/memory.md
git commit -m "docs: update anatomy, cerebrum, memory after role system implementation"
```
