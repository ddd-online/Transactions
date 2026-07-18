package models

type AiApiConfig struct {
	ID        int64  `gorm:"primaryKey;autoIncrement" json:"id"`
	Provider  string `gorm:"type:text;not null;uniqueIndex" json:"provider"`
	BaseURL   string `gorm:"type:text;not null;default:''" json:"base_url"`
	Endpoint  string `gorm:"type:text;not null;default:''" json:"endpoint"`
	APIKey    string `gorm:"type:text;not null;default:''" json:"api_key"`
	Model     string `gorm:"type:text;not null;default:''" json:"model"`
	CreatedAt int64  `gorm:"autoCreateTime:milli" json:"created_at"`
	UpdatedAt int64  `gorm:"autoUpdateTime:milli" json:"updated_at"`
}

func (AiApiConfig) TableName() string {
	return "tbl_billadm_ai_api_config"
}
