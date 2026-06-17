package dto

import "github.com/billadm/models"

type TagDto struct {
	LedgerID                string `json:"ledgerId"`
	Name                    string `json:"name"`
	CategoryTransactionType string `json:"categoryTransactionType"`
	SortOrder               int    `json:"sortOrder"`
	RecordCount             int    `json:"recordCount"`
}

type CreateTagRequest struct {
	LedgerID               string `json:"ledgerId"`
	Name                   string `json:"name"`
	CategoryTransactionType string `json:"categoryTransactionType"`
	SortOrder              int    `json:"sortOrder"`
}

type UpdateTagSortRequest struct {
	LedgerID               string `json:"ledgerId"`
	Name                   string `json:"name"`
	CategoryTransactionType string `json:"categoryTransactionType"`
	SortOrder              int    `json:"sortOrder"`
}

func (dto *TagDto) ToTag() *models.Tag {
	return &models.Tag{
		LedgerID:                dto.LedgerID,
		Name:                    dto.Name,
		CategoryTransactionType: dto.CategoryTransactionType,
		SortOrder:               dto.SortOrder,
	}
}

func (dto *TagDto) FromTag(tag *models.Tag) {
	dto.LedgerID = tag.LedgerID
	dto.Name = tag.Name
	dto.CategoryTransactionType = tag.CategoryTransactionType
	dto.SortOrder = tag.SortOrder
}
