package models

type AiConfig struct {
	ID           int64  `gorm:"primaryKey;autoIncrement" json:"id"`
	Role         string `gorm:"type:text;not null;uniqueIndex" json:"role"`
	SystemPrompt string `gorm:"type:text;not null;default:''" json:"system_prompt"`
	CreatedAt    int64  `gorm:"autoCreateTime:milli" json:"created_at"`
	UpdatedAt    int64  `gorm:"autoUpdateTime:milli" json:"updated_at"`
}

func (AiConfig) TableName() string {
	return "tbl_billadm_ai_config"
}
