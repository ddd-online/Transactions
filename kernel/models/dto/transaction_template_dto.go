package dto

import (
	"encoding/json"
	"fmt"

	"github.com/gin-gonic/gin"

	"github.com/billadm/constant"
	"github.com/billadm/models"
)

func JsonTransactionTemplateDto(c *gin.Context) (*TransactionTemplateDto, bool) {
	ret := &TransactionTemplateDto{}
	if err := c.BindJSON(ret); nil != err {
		return nil, false
	}
	return ret, true
}

type TransactionTemplateDto struct {
	TemplateID      string   `json:"template_id"`
	LedgerID       string   `json:"ledger_id"`
	TemplateName   string   `json:"template_name"`
	TransactionType string `json:"transaction_type"`
	Category       string   `json:"category"`
	Tags           []string `json:"tags"`
	Flags          string   `json:"flags"`
	Description    string   `json:"description"`
	SortOrder      int      `json:"sort_order"`
}

func (dto *TransactionTemplateDto) Validate() error {
	if dto.TemplateName == "" {
		return fmt.Errorf("模板名称不能为空")
	}
	if dto.TransactionType != constant.TransactionTypeIncome &&
		dto.TransactionType != constant.TransactionTypeExpense &&
		dto.TransactionType != constant.TransactionTypeTransfer {
		return fmt.Errorf("invalid transaction type: %s", dto.TransactionType)
	}
	if dto.Category == "" {
		return fmt.Errorf("分类不能为空")
	}
	return nil
}

func (dto *TransactionTemplateDto) ToTransactionTemplate() *models.TransactionTemplate {
	tt := &models.TransactionTemplate{}
	tt.TemplateID = dto.TemplateID
	tt.LedgerID = dto.LedgerID
	tt.TemplateName = dto.TemplateName
	tt.TransactionType = dto.TransactionType
	tt.Category = dto.Category
	tt.Flags = dto.Flags
	tt.Description = dto.Description
	tagsJson, err := json.Marshal(dto.Tags)
	if err != nil {
		tt.Tags = "[]"
	} else {
		tt.Tags = string(tagsJson)
	}
	return tt
}

func (dto *TransactionTemplateDto) FromTransactionTemplate(tt *models.TransactionTemplate) {
	dto.TemplateID = tt.TemplateID
	dto.LedgerID = tt.LedgerID
	dto.TemplateName = tt.TemplateName
	dto.TransactionType = tt.TransactionType
	dto.Category = tt.Category
	dto.Flags = tt.Flags
	dto.Description = tt.Description
	dto.SortOrder = tt.SortOrder
	if err := json.Unmarshal([]byte(tt.Tags), &dto.Tags); err != nil {
		dto.Tags = make([]string, 0)
	}
}