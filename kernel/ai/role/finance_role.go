package role

type financeRole struct{}

func NewFinanceRole() Role { return &financeRole{} }

func (r *financeRole) Name() string        { return "financial_assistant" }
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
