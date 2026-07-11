package models

type AiConfig struct {
	ID           int64  `gorm:"primaryKey;autoIncrement" json:"id"`
	BaseURL      string `gorm:"type:text;not null;default:''" json:"base_url"`
	Endpoint     string `gorm:"type:text;not null;default:''" json:"endpoint"`
	APIKey       string `gorm:"type:text;not null;default:''" json:"api_key"`
	Model        string `gorm:"type:text;not null;default:''" json:"model"`
	SystemPrompt string `gorm:"type:text;not null;default:''" json:"system_prompt"`
	CreatedAt    int64  `gorm:"autoCreateTime:milli" json:"created_at"`
	UpdatedAt    int64  `gorm:"autoUpdateTime:milli" json:"updated_at"`
}

func (AiConfig) TableName() string {
	return "tbl_billadm_ai_config"
}
