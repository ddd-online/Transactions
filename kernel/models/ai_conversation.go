package models

// AiConversation 保存 AI 对话会话元数据。
// 每个会话独立持有消息历史（AiMessage.conversation_id 关联），
// 同一角色可拥有多个会话，切换会话互不串扰。
type AiConversation struct {
	ID        string `gorm:"primaryKey;type:text" json:"id"`
	Role      string `gorm:"type:text;not null;default:'financial_assistant';index:idx_conv_role_created,priority:1" json:"role"`
	Title     string `gorm:"type:text;not null;default:'新对话'" json:"title"`
	CreatedAt int64  `gorm:"autoCreateTime:unix;index:idx_conv_role_created,priority:2" json:"created_at"`
	UpdatedAt int64  `gorm:"autoUpdateTime:unix" json:"updated_at"`
}

func (AiConversation) TableName() string {
	return "tbl_billadm_ai_conversation"
}
