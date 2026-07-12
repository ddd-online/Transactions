package models

// DiaryEntry 日记条目 — 工作空间级别，不与账本绑定
type DiaryEntry struct {
	ID        string `gorm:"primaryKey;comment:日记UUID" json:"id"`
	Date      string `gorm:"uniqueIndex;not null;comment:日期 YYYY-MM-DD" json:"date"`
	Content   string `gorm:"type:text;comment:日记正文(Markdown)" json:"content"`
	WordCount int    `gorm:"not null;default:0;comment:字数(Unicode字符数)" json:"wordCount"`
	Mood      string `gorm:"type:varchar(20);default:'';comment:心情标记" json:"mood"`
	CreatedAt int64  `gorm:"autoCreateTime:unix;not null;comment:创建时间" json:"createdAt"`
	UpdatedAt int64  `gorm:"autoUpdateTime:unix;not null;comment:更新时间" json:"updatedAt"`
}

func (d *DiaryEntry) TableName() string {
	return "tbl_billadm_diary_entry"
}

// DiaryDateItem 日记日期列表项（返回给前端构建树）
type DiaryDateItem struct {
	Date      string `json:"date"`
	WordCount int    `json:"wordCount"`
	Mood      string `json:"mood"`
}
