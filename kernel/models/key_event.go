package models

type KeyEvent struct {
	ID        string `gorm:"primaryKey;comment:事件UUID" json:"id"`
	Date      string `gorm:"uniqueIndex;not null;comment:日期 YYYY-MM-DD" json:"date"`
	Title     string `gorm:"type:varchar(200);comment:标题" json:"title"`
	Content   string `gorm:"type:text;comment:事件内容" json:"content"`
	Color     string `gorm:"type:varchar(20);comment:颜色标记" json:"color"`
	CreatedAt int64  `gorm:"autoCreateTime:unix;not null;comment:创建时间" json:"createdAt"`
	UpdatedAt int64  `gorm:"autoUpdateTime:unix;not null;comment:更新时间" json:"updatedAt"`
	LedgerID  string `gorm:"index;type:varchar(36);default:'';comment:所属账本ID" json:"ledgerId"`
}

func (k *KeyEvent) TableName() string {
	return "tbl_billadm_key_event"
}

type KeyEventImage struct {
	ID        string `gorm:"primaryKey;comment:图片UUID" json:"id"`
	EventDate string `gorm:"index;not null;comment:关联的关键事件日期" json:"eventDate"`
	FilePath  string `gorm:"type:varchar(500);not null;comment:原图相对路径" json:"filePath"`
	ThumbPath string `gorm:"type:varchar(500);not null;comment:缩略图相对路径" json:"thumbPath"`
	SortOrder int    `gorm:"not null;default:0;comment:排序序号" json:"sortOrder"`
	CreatedAt int64  `gorm:"autoCreateTime:unix;not null;comment:创建时间" json:"createdAt"`
}

func (k *KeyEventImage) TableName() string {
	return "tbl_billadm_key_event_image"
}
