package models

type Category struct {
	LedgerID        string `gorm:"not null;default:'';uniqueIndex:idx_category_ledger_name_type;comment:账本ID" json:"ledger_id"`
	Name            string `gorm:"not null;uniqueIndex:idx_category_ledger_name_type;comment:消费类型" json:"name"`
	TransactionType string `gorm:"not null;uniqueIndex:idx_category_ledger_name_type;comment:交易类型" json:"transaction_type"`
	SortOrder       int    `gorm:"default:0;comment:排序顺序" json:"sort_order"`
}

func (c *Category) TableName() string {
	return "tbl_billadm_category"
}
