package dto

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/billadm/constant"
	"github.com/billadm/models"
)

type TransactionRecordDto struct {
	LedgerID        string   `json:"ledgerId"`
	TransactionID   string   `json:"transactionId"`
	Price           int64    `json:"price"`
	TransactionType string   `json:"transactionType"`
	Category        string   `json:"category"`
	Description     string   `json:"description"`
	Tags            []string `json:"tags"`
	TransactionAt   int64    `json:"transactionAt"`
	Outlier         bool     `json:"outlier"`
	KeyEventDate    string   `json:"keyEventDate"`
}

func (dto *TransactionRecordDto) Validate() error {
	if strings.TrimSpace(dto.LedgerID) == "" {
		return fmt.Errorf("LedgerID is empty")
	}
	if dto.TransactionType != constant.TransactionTypeIncome &&
		dto.TransactionType != constant.TransactionTypeExpense &&
		dto.TransactionType != constant.TransactionTypeTransfer {
		return fmt.Errorf("invalid TransactionType: %s", dto.TransactionType)
	}
	return nil
}

func (dto *TransactionRecordDto) ToTransactionRecord() *models.TransactionRecord {
	tr := &models.TransactionRecord{}
	tr.TransactionID = dto.TransactionID
	tr.LedgerID = dto.LedgerID
	tr.Price = dto.Price
	tr.TransactionType = dto.TransactionType
	tr.Category = dto.Category
	tr.Description = dto.Description
	tr.TransactionAt = dto.TransactionAt
	flags := models.TransactionRecordFlags{
		Outlier: dto.Outlier,
	}
	flagsStr, err := json.Marshal(flags)
	if err != nil {
		tr.Flags = "{}"
	} else {
		tr.Flags = string(flagsStr)
	}
	return tr
}

func (dto *TransactionRecordDto) FromTransactionRecord(tr *models.TransactionRecord) {
	dto.LedgerID = tr.LedgerID
	dto.TransactionID = tr.TransactionID
	dto.Price = tr.Price
	dto.TransactionType = tr.TransactionType
	dto.Category = tr.Category
	dto.Description = tr.Description
	dto.Tags = make([]string, 0)
	dto.TransactionAt = tr.TransactionAt
	dto.KeyEventDate = tr.KeyEventDate
	flags := models.TransactionRecordFlags{}
	if err := json.Unmarshal([]byte(tr.Flags), &flags); err == nil {
		dto.Outlier = flags.Outlier
	}
}
