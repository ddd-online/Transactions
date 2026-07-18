package models

type AiQuickCommand struct {
	ID        int64  `gorm:"primaryKey;autoIncrement" json:"id"`
	Role      string `gorm:"type:text;not null;default:'financial_assistant'" json:"role"`
	Label     string `gorm:"type:text;not null;default:''" json:"label"`
	SortOrder int    `gorm:"not null;default:0" json:"sort_order"`
	CreatedAt int64  `gorm:"autoCreateTime:milli" json:"created_at"`
	UpdatedAt int64  `gorm:"autoUpdateTime:milli" json:"updated_at"`
}

func (AiQuickCommand) TableName() string {
	return "tbl_billadm_ai_quick_command"
}
