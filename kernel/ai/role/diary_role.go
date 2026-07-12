package role

type diaryRole struct{}

func NewDiaryRole() Role { return &diaryRole{} }

func (r *diaryRole) Name() string        { return "diary_assistant" }
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
