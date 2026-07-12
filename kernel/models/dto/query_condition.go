package dto

import (
	"fmt"
)

const (
	Any = "any"
	Not = "not"
)

type TrQueryCondition struct {
	LedgerID   string               `json:"ledgerId"`
	Offset     int                  `json:"offset"`
	Limit      int                  `json:"limit"`
	TsRange    []int64              `json:"tsRange"`
	Items      []QueryConditionItem `json:"items"`
	SortFields []QueryConditionSortField `json:"sortFields"`
}

type QueryConditionSortField struct {
	Field string `json:"field"`
	Order string `json:"order"`
}

func (qc *TrQueryCondition) Validate() error {
	if len(qc.LedgerID) == 0 {
		return fmt.Errorf("账本Id不可为空: %s", qc.LedgerID)
	}
	return nil
}

type QueryConditionItem struct {
	TransactionType string   `json:"transactionType"`
	Category        string   `json:"category"`
	Tags            []string `json:"tags"`
	TagPolicy       string   `json:"tagPolicy"`   // 如何匹配tag列表
	TagNot          bool     `json:"tagNot"`      // 是否对tag匹配策略取反
	Description     string   `json:"description"` // 描述包含的字符
}
