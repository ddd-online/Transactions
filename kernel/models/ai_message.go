package models

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

func (AiMessage) TableName() string {
	return "tbl_billadm_ai_message"
}
