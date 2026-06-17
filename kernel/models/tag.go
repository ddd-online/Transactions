package models

type Tag struct {
	LedgerID                string `gorm:"not null;uniqueIndex:idx_tag_ledger_name_cattype;comment:账本ID" json:"ledger_id"`
	Name                    string `gorm:"not null;uniqueIndex:idx_tag_ledger_name_cattype;comment:标签名称" json:"name"`
	CategoryTransactionType string `gorm:"not null;uniqueIndex:idx_tag_ledger_name_cattype;comment:分类:交易类型" json:"category_transaction_type"`
	SortOrder               int    `gorm:"default:0;comment:排序顺序" json:"sort_order"`
}

func (t *Tag) TableName() string {
	return "tbl_billadm_tag"
}
