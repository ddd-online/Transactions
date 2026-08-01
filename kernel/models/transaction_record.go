package models

// Transaction types are defined in constant package.
// Use constant.TransactionTypeIncome, constant.TransactionTypeExpense, constant.TransactionTypeTransfer

// TransactionRecord 消费记录结构体
type TransactionRecord struct {
	TransactionID string `gorm:"primaryKey;comment:交易UUID" json:"transaction_id"`
	LedgerID      string `gorm:"not null;index:idx_tr_ledger_at,priority:1;comment:关联账本ID" json:"ledger_id"`

	// 交易核心信息
	Price           int64  `gorm:"not null;comment:交易金额" json:"price"`
	TransactionType string `gorm:"not null;comment:交易类型" json:"transaction_type"`

	// 分类与描述
	Category    string `gorm:"not null;comment:分类ID" json:"category"`
	Description string `gorm:"comment:交易描述" json:"description"`

	// 标记
	Flags string `gorm:"comment:标记集" json:"flags"`

	// 关联关键事件日期
	KeyEventDate string `gorm:"type:varchar(10);default:'';index:idx_tr_key_event_date;comment:关联关键事件日期" json:"key_event_date"`

	// 时间信息
	TransactionAt int64 `gorm:"not null;index:idx_tr_ledger_at,priority:2;comment:交易时间" json:"transaction_at"`
	CreatedAt     int64 `gorm:"autoCreateTime:unix;not null;comment:创建时间" json:"created_at"`
	UpdatedAt     int64 `gorm:"autoUpdateTime:unix;not null;comment:更新时间" json:"updated_at"`
}

func (tr *TransactionRecord) TableName() string {
	return "tbl_billadm_transaction_record"
}
