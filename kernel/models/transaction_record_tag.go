package models

type TrTag struct {
	LedgerID      string `gorm:"not null;index:idx_tr_tag_ledger;comment:账本ID" json:"ledger_id"`
	TransactionID string `gorm:"not null;index:idx_tr_tag_transaction;comment:交易ID" json:"transaction_id"`
	Tag           string `gorm:"not null;comment:标签名称" json:"tag"`
}

func (tr *TrTag) TableName() string {
	return "tbl_billadm_transaction_record_tag"
}
