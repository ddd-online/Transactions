package dto

import "github.com/billadm/models"

type CategoryDto struct {
	LedgerID        string `json:"ledgerId"`
	Name            string `json:"name"`
	TransactionType string `json:"transactionType"`
	SortOrder       int    `json:"sortOrder"`
	RecordCount     int    `json:"recordCount"`
}

type CreateCategoryRequest struct {
	LedgerID        string `json:"ledgerId"`
	Name            string `json:"name"`
	TransactionType string `json:"transactionType"`
	SortOrder       int    `json:"sortOrder"`
}

type UpdateCategorySortRequest struct {
	LedgerID        string `json:"ledgerId"`
	Name            string `json:"name"`
	TransactionType string `json:"transactionType"`
	SortOrder       int    `json:"sortOrder"`
}

type InitializeCategoriesResponse struct {
	Categories int `json:"categories"`
	Tags       int `json:"tags"`
}

func (dto *CategoryDto) ToCategory() *models.Category {
	return &models.Category{
		LedgerID:        dto.LedgerID,
		Name:            dto.Name,
		TransactionType: dto.TransactionType,
		SortOrder:       dto.SortOrder,
	}
}

func (dto *CategoryDto) FromCategory(category *models.Category) {
	dto.LedgerID = category.LedgerID
	dto.Name = category.Name
	dto.TransactionType = category.TransactionType
	dto.SortOrder = category.SortOrder
}
